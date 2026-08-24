import "server-only";

import { ApiError, apiError } from "@/lib/api";
import { encryptAll } from "@/lib/server/ingest/encrypt";
import type { ServiceClient } from "@/lib/supabase/service";

import type { PlannedWorkInput, PlannedWorkRecord } from "./types";

/**
 * FR-87 + FR-88 — the one place a planned `work_item` is written.
 *
 * CR-005 §3.1 gives planned work two creation paths, "parsed from a plan
 * document" and "entered by hand through a form", and says in the same sentence
 * that **both produce ordinary `work_item` rows**. Two paths writing the same
 * row shape is exactly the situation where the two drift: one remembers to
 * encrypt the description and the other does not, one sets `status = 'pending'`
 * and the other leaves the column default `unparsed`, and nothing fails until
 * somebody reads the ledger and believes it. So there is one spelling of that
 * row and it is here.
 *
 * What this module fixes, so that no caller may choose:
 *
 *   * **`execution_mode` is NULL.** FR-87's definition of planned. NULL is not a
 *     fourth mode and i1's migration comment is emphatic that it must never be
 *     rounded to one — "nobody has started this" must never read as "this is in
 *     flight" (FR-91).
 *   * **`status` is `pending`.** Also FR-87. The enum already carried `pending`,
 *     so this is a value choice, not a schema one.
 *   * **`executor_kind` is `unassigned`.** A row nobody has dispatched has
 *     nobody executing it.
 *   * **`description` is encrypted.** §7a classifies `work_item` **sensitive**,
 *     with pgcrypto on `description` and `raw_status`. `encryptAll` throws
 *     rather than degrading, so a failure here abandons the write instead of
 *     landing client prose in the clear.
 *   * **An engagement is required.** FR-87 as amended by the Q14 ruling
 *     2026-08-24: *"a planned row carries an `engagement_id` at creation. There
 *     is no unassigned planned row."* The column is already `not null` in the
 *     schema, so this function's job is not to add a second constraint — it is
 *     to turn the slug the caller has into the id the column wants, and to
 *     refuse in a sentence when there is no such engagement rather than letting
 *     a foreign-key violation surface as a 500.
 *
 * ## This module deliberately carries no `'use server'` and no `requireOperator()`
 *
 * `'use server'` would make every export an individually callable RPC endpoint
 * reachable from the browser, and this primitive has two callers with two
 * different authorities: an operator server action (`/work-items/new`), and
 * i3's plan-document path, which may run under an agent bearer token where
 * `requireOperator()` cannot succeed by construction. Baking one of those two
 * gates in would either close the door on the other caller or leave a writable
 * endpoint open.
 *
 * So the primitive takes an **already-authorised** service client and owns the
 * row shape; the caller owns who may call it. That is the same division
 * `@/lib/server/ingest/persist` already makes. `import "server-only"` keeps a
 * Client Component from reaching it at all — a build error rather than a
 * runtime surprise.
 *
 * **Every caller must gate before calling.** There is no gate inside.
 */

/** Every column this module writes, in the order the row literal states them. */
const COLUMNS =
  "id, engagement_id, unit, plan_ref, work_type, status, execution_mode";

function postgresCode(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as Record<string, unknown>).code;
  return typeof code === "string" ? code : null;
}

/**
 * A database refusal, turned into a sentence written for the operator.
 *
 * The default is the one `@/lib/api/errors` sets and this file does not relax:
 * no mechanism reaches the caller, because a Postgres message names tables,
 * constraints, and sometimes row values — and the row values on this table are
 * `sensitive` client prose. Only the two codes whose meaning the operator can
 * act on get their own sentence.
 */
function plannedWorkError(error: unknown): ApiError {
  const code = postgresCode(error);

  if (code === "23505") {
    return apiError(
      "invalid_request",
      "A planned work item already carries that plan id in this engagement, " +
        "so nothing was written. Two plan tasks cannot share one reconciliation " +
        "id (FR-90).",
    );
  }

  if (code === "23503") {
    return apiError(
      "invalid_request",
      "That engagement no longer exists, so the planned work item was not " +
        "created. Reload and choose again.",
    );
  }

  return apiError(
    "internal_error",
    "The planned work item was not created and nothing was written. This " +
      "response deliberately carries no database message; check the audit_log " +
      "row for this request.",
  );
}

function trimmedOrNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Refuse an input that cannot become an honest row, before anything is written.
 *
 * Returns the cleaned copy rather than mutating, so the caller's object is
 * never quietly different from what it passed.
 */
function validate(input: PlannedWorkInput, position: number): PlannedWorkInput {
  const description = input.description.trim();

  if (description === "") {
    throw apiError(
      "invalid_request",
      position === 0
        ? "Say what the work is. A planned item with no description tells the " +
            "person reading Next nothing, which is the only reason it is recorded."
        : `Planned item ${position + 1} carries no description, so none of them ` +
            `were written. A planned item with no description tells the person ` +
            `reading Next nothing.`,
    );
  }

  return {
    description,
    workType: trimmedOrNull(input.workType),
    unit: trimmedOrNull(input.unit),
    planRef: trimmedOrNull(input.planRef),
  };
}

/**
 * The engagement id behind a slug, or a refusal.
 *
 * Read with the client it was handed rather than through
 * `@/lib/server/registry/engagements`, whose every export calls
 * `requireOperator()` — see the note at the top of this file about the second
 * caller.
 *
 * **Archived engagements are NOT excluded here.** `readEngagementRoster` already
 * keeps them out of the picker, so a slug naming one can only arrive from a
 * hand-made request or from a plan document, and refusing it would be a rule
 * CR-005 does not state. Queued for Erik rather than decided quietly.
 */
async function resolveEngagement(
  db: ServiceClient,
  slug: string,
): Promise<{ id: string; slug: string }> {
  const trimmed = slug.trim();

  if (trimmed === "") {
    throw apiError(
      "invalid_request",
      "Choose the engagement this work belongs to. There is no unassigned " +
        "planned work item: the unassigned queue holds ingested sessions that " +
        "could not be attributed, and planned work has an owner by the time " +
        "anybody plans it (FR-87, Q14).",
    );
  }

  const { data, error } = await db
    .from("engagement")
    .select("id, slug")
    .eq("slug", trimmed)
    .maybeSingle();

  if (error) throw plannedWorkError(error);

  if (!data) {
    // The slug is echoed because the operator typed or chose it and it is not
    // sensitive — §7a's stated exception is that engagement slug and client
    // name are the display and grouping keys everywhere in this product.
    throw apiError(
      "invalid_request",
      `No engagement is registered under \`${trimmed}\`, so nothing was ` +
        `written. Register it first, or choose one that exists.`,
    );
  }

  return { id: data.id, slug: data.slug };
}

interface Row {
  engagement_id: string;
  unit: string | null;
  plan_ref: string | null;
  work_type: string | null;
  description: string | null;
  execution_mode: null;
  status: "pending";
  executor_kind: "unassigned";
}

function toRecord(row: Record<string, unknown>, engagementSlug: string): PlannedWorkRecord {
  return {
    id: String(row.id),
    engagementId: String(row.engagement_id),
    engagementSlug,
    unit: (row.unit as string | null) ?? null,
    planRef: (row.plan_ref as string | null) ?? null,
    workType: (row.work_type as string | null) ?? null,
    status: "pending",
    executionMode: null,
  };
}

/**
 * Create planned work items in one engagement.
 *
 * ## Why two writes rather than one
 *
 * Rows are partitioned on whether they carry a `plan_ref`, and the two halves
 * are written differently **because Postgres treats them differently**:
 *
 *   * **No `plan_ref` — plain `insert`.** i1's unique index on
 *     `(engagement_id, plan_ref)` is NULLS DISTINCT, so two planned rows with no
 *     plan id never collide with each other. Routing them through an upsert
 *     would name a conflict target that can never fire, which reads like
 *     idempotency and is not.
 *   * **With a `plan_ref` — `upsert … on conflict (engagement_id, plan_ref)`
 *     with `ignoreDuplicates`.** This is the FR-90 idempotency i1 built that
 *     index for: re-posting the same plan document writes nothing new and
 *     raises nothing. `ignoreDuplicates` is `ON CONFLICT DO NOTHING`, so an
 *     existing row is **left exactly as it is** — a planned row that has since
 *     been dispatched must not be reset to `pending` by a second read of the
 *     plan it came from. CR-002's append-only posture, applied to a write path
 *     that could otherwise clobber.
 *
 * That index is deliberately PLAIN, not partial: PostgREST's `on_conflict`
 * carries column names and cannot restate a `WHERE`, so a partial one fails
 * `42P10` on the **second** post — the only post that exercises idempotency.
 *
 * ## The returned order is not the input order
 *
 * The two halves are written separately and concatenated. Match a record back
 * to its input by `unit` or `planRef`, never by position. For the single-item
 * form below the distinction does not arise.
 */
export async function createPlannedWorkItems(
  db: ServiceClient,
  engagementSlug: string,
  items: readonly PlannedWorkInput[],
): Promise<PlannedWorkRecord[]> {
  const engagement = await resolveEngagement(db, engagementSlug);

  if (items.length === 0) return [];

  const validated = items.map(validate);

  // Encrypted before anything is written, and the whole batch is abandoned if
  // any one value fails. §7a: `work_item.description` is `sensitive` and holds
  // pgcrypto ciphertext at rest.
  const descriptions = await encryptAll(
    db,
    validated.map((item) => item.description),
  );

  const rows: Row[] = validated.map((item, index) => ({
    engagement_id: engagement.id,
    unit: item.unit,
    plan_ref: item.planRef,
    work_type: item.workType,
    description: descriptions[index],
    execution_mode: null,
    status: "pending",
    executor_kind: "unassigned",
  }));

  const written: PlannedWorkRecord[] = [];

  const withoutPlanRef = rows.filter((row) => row.plan_ref === null);
  if (withoutPlanRef.length > 0) {
    const { data, error } = await db
      .from("work_item")
      .insert(withoutPlanRef)
      .select(COLUMNS);

    if (error) throw plannedWorkError(error);
    for (const row of data ?? []) written.push(toRecord(row, engagement.slug));
  }

  const withPlanRef = rows.filter((row) => row.plan_ref !== null);
  if (withPlanRef.length > 0) {
    const { data, error } = await db
      .from("work_item")
      .upsert(withPlanRef, {
        onConflict: "engagement_id,plan_ref",
        ignoreDuplicates: true,
      })
      .select(COLUMNS);

    if (error) throw plannedWorkError(error);
    for (const row of data ?? []) written.push(toRecord(row, engagement.slug));
  }

  return written;
}

/**
 * One planned work item — the FR-88 hand-entry path.
 *
 * Throws rather than returning `null` when the insert came back with no row.
 * A creation call that reports success without a row is the shape of a silent
 * write failure, and the caller is about to navigate to the id.
 */
export async function createPlannedWorkItem(
  db: ServiceClient,
  engagementSlug: string,
  item: PlannedWorkInput,
): Promise<PlannedWorkRecord> {
  const records = await createPlannedWorkItems(db, engagementSlug, [item]);

  const record = records[0];
  if (record === undefined) {
    throw apiError(
      "internal_error",
      "The planned work item was not created. The database accepted the " +
        "request and returned no row, so nothing can be said about what was " +
        "written; check the audit_log row for this request before retrying.",
    );
  }

  return record;
}
