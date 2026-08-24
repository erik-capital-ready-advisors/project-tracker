/**
 * Reading the ledger into the domain records the pure rules consume.
 *
 * ## The division of labour this file protects
 *
 * `src/lib/ingest/` holds the rules — FR-47's certifier join, FR-50's invoice
 * gate, FR-69's regression derivation — as pure functions over records. This
 * file's whole job is to hand them records. **It re-derives nothing.** Where a
 * report below looks like it is computing something, it is arranging: turning
 * two tables into one array, resolving a foreign key into the ref the rule joins
 * on.
 *
 * ## Every read is paged, and that is not defensive coding
 *
 * PostgREST answers **HTTP 206 with `error === null`** once a read crosses its
 * `max-rows` setting, so a truncated read is indistinguishable from a complete
 * one at the call site. It has fired twice in this practice on live client work
 * and produced plausible, wrong, load-bearing numbers for months in both cases.
 * Here it would be worse than wrong: a truncated `test_result` read drops the
 * newest rows first (heap order), which means the *latest* result per test goes
 * missing, which means `latestResults` returns a stale pass and FR-50 reports a
 * milestone billable whose covering test is currently red.
 *
 * So every read goes through i8's `fetchAllRows`, which terminates on an exact
 * count rather than on a short page, and every `.in()` list is chunked.
 *
 * ## Decryption is opt-in here, and off by default
 *
 * i3 measured that the whole of Broken and Committed can be computed without
 * decrypting anything, because every join runs on `FR-nn`, `D-nn`, `status`,
 * `severity` and `certifiedBy` — all clear columns per §7a. This file preserves
 * that: `work_item.description`, `work_item.raw_status`, `requirement.text`,
 * `defect.description`, `blocker.description` and `open_question.*` are never
 * selected. The one exception is `contract_milestone.amount`, which FR-54 asks
 * for by name, and it is confined to `loadMilestones` — the operator-only path.
 */

import { decryptAll } from "@/lib/server/ingest/encrypt";
import { isPlannedRow } from "@/lib/server/workitems/planned";
import type { CoverageInput } from "@/lib/ingest/coverage";
import type {
  Defect,
  Milestone,
  Requirement,
  TestCase,
  TestResult,
  WorkItem,
} from "@/lib/ingest/types";

import type { AnswerDb, AnswerQuery } from "./db";
import { IN_CHUNK, chunk, fetchAllRows } from "./db";
import {
  fromDisposition,
  fromEvidenceScope,
  fromExecutionMode,
  fromExecutorKind,
  fromHarness,
  fromNullableEvidenceScope,
  fromReasonClass,
  fromTestStatus,
  fromWorkStatus,
} from "./from-db";

/** A read that failed, named, so a caller reports the failure and not an empty list. */
export class LoadError extends Error {
  constructor(readonly table: string, message: string) {
    super(`could not read ${table}: ${message}`);
    this.name = "LoadError";
  }
}

type Row = Record<string, unknown>;

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function requiredText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Append to a `Map<string, T[]>`, creating the array on first use. */
function push<T>(map: Map<string, T[]>, key: string, value: T): void {
  const existing = map.get(key);
  if (existing === undefined) map.set(key, [value]);
  else existing.push(value);
}

/**
 * Read every row of `table` whose `column` is in `values`, chunked and paged.
 *
 * Chunked because a `.in()` of thousands of uuids is a URL PostgREST refuses on
 * length, and paged because each chunk's response is still subject to the row
 * cap.
 */
async function fetchIn(
  db: AnswerDb,
  table: string,
  columns: string,
  column: string,
  values: readonly string[],
  orderColumn = "id",
): Promise<Row[]> {
  if (values.length === 0) return [];
  const rows: Row[] = [];

  for (const batch of chunk(values, IN_CHUNK)) {
    const result = await fetchAllRows(
      db,
      table,
      columns,
      (query) => (query as AnswerQuery).in(column, batch),
      orderColumn,
    );
    if (result.error) throw new LoadError(table, result.error);
    rows.push(...result.rows);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// engagement
// ---------------------------------------------------------------------------

export interface EngagementRef {
  id: string;
  slug: string;
  clientName: string;
}

/**
 * The engagements in scope.
 *
 * **The projection is `id, slug, client_name` and never `*`.** §7a restricts
 * `engagement` at the column level for agents, and `agentScopedDb` refuses a
 * wildcard outright — but the reason to write it out is that a wildcard silently
 * widens as the schema grows, which is how `repo_path` and `source` would end up
 * in an agent's response the day someone adds a column.
 */
export async function loadEngagements(
  db: AnswerDb,
  slug?: string | null,
): Promise<EngagementRef[]> {
  const result = await fetchAllRows(
    db,
    "engagement",
    "id, slug, client_name",
    (query) => (slug ? query.eq("slug", slug) : query),
    "slug",
  );
  if (result.error) throw new LoadError("engagement", result.error);

  return result.rows.map((row) => ({
    id: requiredText(row.id),
    slug: requiredText(row.slug),
    clientName: requiredText(row.client_name),
  }));
}

// ---------------------------------------------------------------------------
// requirement
// ---------------------------------------------------------------------------

/**
 * Requirements, by `ref` only.
 *
 * `requirement.text` is pgcrypto ciphertext under §7a and it is **not selected
 * here at all** — not selected and then discarded, not selected and left
 * encrypted. §7a states the consequence in terms: "requirements are matched,
 * joined and reported by `FR-nn` and never by text", and every rule downstream
 * of this loader obeys that.
 *
 * The domain type requires a `text` field, so it is filled with the empty
 * string. That is a placeholder for a column this path deliberately never read,
 * **not** an assertion that the requirement has no text. No rule in
 * `src/lib/ingest/` reads it — `untestedReport` and `committedReport` both use
 * `ref` alone — and a screen that wants prose must decrypt at its own edge.
 */
export async function loadRequirements(
  db: AnswerDb,
  engagements: EngagementRef[],
): Promise<Requirement[]> {
  const slugOf = new Map(engagements.map((one) => [one.id, one.slug]));
  const rows = await fetchIn(
    db,
    "requirement",
    "id, engagement_id, ref",
    "engagement_id",
    engagements.map((one) => one.id),
  );

  return rows.map((row) => ({
    id: requiredText(row.id),
    engagement: slugOf.get(requiredText(row.engagement_id)) ?? "",
    ref: requiredText(row.ref),
    text: "",
  }));
}

// ---------------------------------------------------------------------------
// work_item
// ---------------------------------------------------------------------------

/** A work item plus the joined rows the answers need beside it. */
export interface LoadedWorkItem extends WorkItem {
  /** The `engagement.id` uuid. `engagement` carries the slug, for display. */
  engagementId: string;
  /** `work_item.external_wait_id`, or null. The domain type has no field for it. */
  externalWaitId: string | null;
  startedAt: string | null;
  endedAt: string | null;
  /**
   * FR-87 — this row is planned work: `execution_mode IS NULL` and
   * `status = 'pending'`.
   *
   * Recorded here rather than derived by the caller because `executionMode`
   * above has already been through `fromExecutionMode`, which turns a planned
   * row's NULL into `"fleet"`. The signal only exists on the raw column, so it
   * is read from there once, at the only place that still has it.
   */
  planned: boolean;
  /** `work_item.updated_at`. FR-91's staleness timestamp; see `workitems/planned`. */
  updatedAt: string | null;
}

/**
 * Prose is opt-in, and the reason is a round trip per value.
 *
 * `decrypt_field` is one RPC per field — the honest cost of column encryption on
 * a hosted Postgres reached over PostgREST, as `workitems/field-crypto.ts`
 * records. A screen that shows descriptions pays it; one that only needs status
 * and identifiers must not. So the caller asks, rather than every caller paying
 * for the one that needed it.
 *
 * §7a permits this on both surfaces: `work_item` and `blocker` both read
 * "operator, agents, **decrypted server-side**", so the screen and the
 * `answer:read` endpoint behind FR-57 get the same field.
 */
export interface ProseOption {
  /** Decrypt `description`. Costs one RPC per non-null value. */
  withProse?: boolean;
}

const WORK_ITEM_COLUMNS =
  "id, engagement_id, fleet_run_id, unit, execution_mode, work_type, phase, " +
  "executor, executor_kind, status, unautomated_reason, disposition, " +
  "evidence_scope, not_verified_count, blocker_id, external_wait_id, " +
  "started_at, ended_at, updated_at";

/**
 * Work items with their dependency edges and implemented requirement refs.
 *
 * `id` and `dependsOn` carry **database uuids**, not the `engagement:run:unit`
 * keys i2's parsers produce. Both are legitimate identities for a work item and
 * mixing them silently would make FR-53's dependency check compare a uuid
 * against a unit key and conclude every dependency is unsatisfied — which reads
 * as "nothing is ready to start" rather than as an error. Stated here because
 * it is the kind of thing a later caller assumes rather than checks.
 *
 * `rawStatus` is always `null` — a pgcrypto column that nothing has needed yet.
 * `description` is `null` UNLESS the caller passes `withProse`, in which case it
 * is selected and decrypted at a cost of one RPC per non-null value. FR-52,
 * FR-53 and FR-56 each ask what a work item IS, not merely which one it is, so
 * the three screens answering them pass it.
 */
export async function loadWorkItems(
  db: AnswerDb,
  engagements: EngagementRef[],
  options: ProseOption = {},
): Promise<LoadedWorkItem[]> {
  const slugOf = new Map(engagements.map((one) => [one.id, one.slug]));
  const rows = await fetchIn(
    db,
    "work_item",
    options.withProse ? `${WORK_ITEM_COLUMNS}, description` : WORK_ITEM_COLUMNS,
    "engagement_id",
    engagements.map((one) => one.id),
  );

  // One pass, concurrency-limited, and it THROWS on a value that will not
  // decrypt rather than yielding null — an empty description is
  // indistinguishable from one that was never written, and this product does
  // not render an answer it cannot stand behind.
  const prose = options.withProse
    ? await decryptAll(db as never, rows.map((row) => text(row.description)))
    : null;

  const ids = rows.map((row) => requiredText(row.id));

  const [dependencyRows, requirementRows] = await Promise.all([
    fetchIn(
      db,
      "work_item_dependency",
      "id, work_item_id, depends_on_id",
      "work_item_id",
      ids,
    ),
    fetchIn(
      db,
      "work_item_requirement",
      "id, work_item_id, requirement_ref",
      "work_item_id",
      ids,
    ),
  ]);

  const dependsOn = new Map<string, string[]>();
  for (const row of dependencyRows) {
    push(dependsOn, requiredText(row.work_item_id), requiredText(row.depends_on_id));
  }

  const implement = new Map<string, string[]>();
  for (const row of requirementRows) {
    push(implement, requiredText(row.work_item_id), requiredText(row.requirement_ref));
  }

  return rows.map((row, index) => {
    const id = requiredText(row.id);
    const engagementId = requiredText(row.engagement_id);
    return {
      id,
      engagementId,
      engagement: slugOf.get(engagementId) ?? "",
      run: text(row.fleet_run_id),
      unit: text(row.unit),
      executionMode: fromExecutionMode(row.execution_mode),
      workType: text(row.work_type),
      phase: row.phase === null || row.phase === undefined ? null : String(row.phase),
      description: prose === null ? null : prose[index],
      executor: text(row.executor),
      executorKind: fromExecutorKind(row.executor_kind),
      status: fromWorkStatus(row.status),
      unautomatedReason: fromReasonClass(row.unautomated_reason),
      unautomatedDisposition: fromDisposition(row.disposition),
      evidenceScope: fromNullableEvidenceScope(row.evidence_scope),
      notVerifiedCount:
        typeof row.not_verified_count === "number" ? row.not_verified_count : 0,
      dependsOn: dependsOn.get(id) ?? [],
      implements: implement.get(id) ?? [],
      blocker: text(row.blocker_id),
      externalWaitId: text(row.external_wait_id),
      rawStatus: null,
      startedAt: text(row.started_at),
      endedAt: text(row.ended_at),
      planned: isPlannedRow({
        execution_mode: row.execution_mode,
        status: row.status,
      }),
      updatedAt: text(row.updated_at),
    };
  });
}

// ---------------------------------------------------------------------------
// test_case / test_result
// ---------------------------------------------------------------------------

/** A test case plus FR-46's certifier, which the domain `TestCase` does not carry. */
export interface LoadedTestCase extends TestCase {
  /** FR-46. The certifier recorded on the test record itself. */
  certifiedBy: string | null;
}

export async function loadTests(
  db: AnswerDb,
  engagements: EngagementRef[],
): Promise<LoadedTestCase[]> {
  const slugOf = new Map(engagements.map((one) => [one.id, one.slug]));
  const rows = await fetchIn(
    db,
    "test_case",
    "id, engagement_id, harness, file, title, covers, authored_by, certified_by",
    "engagement_id",
    engagements.map((one) => one.id),
  );

  return rows.map((row) => ({
    id: requiredText(row.id),
    engagement: slugOf.get(requiredText(row.engagement_id)) ?? "",
    harness: fromHarness(row.harness),
    file: requiredText(row.file),
    title: requiredText(row.title),
    covers: Array.isArray(row.covers) ? row.covers.map(String) : [],
    authoredBy: text(row.authored_by),
    certifiedBy: text(row.certified_by),
  }));
}

/**
 * Every recorded run of the given tests, **in history order**.
 *
 * `latestResults` takes the last result per test in input order and deliberately
 * does not re-sort — i3's contract, and the reason is that `run_at` being
 * nullable in the domain type means a re-sort would have to invent a position
 * for an undated result. So ordering is this function's job, and it is done
 * twice over:
 *
 *   * **Paged by `id`**, because paging needs a *stable* sort and `run_at` is
 *     not one — two results written in the same transaction share a timestamp,
 *     and successive `.range()` windows over a non-unique order can overlap or
 *     skip rows.
 *   * **Sorted in memory by `(run_at, id)`** afterwards, which is the history
 *     order the rules require and is total because `id` breaks every tie.
 *
 * Doing it in one step by ordering the query on `run_at` would look simpler and
 * would silently corrupt any engagement whose results cross one page.
 */
export async function loadResults(
  db: AnswerDb,
  testIds: readonly string[],
): Promise<TestResult[]> {
  const rows = await fetchIn(
    db,
    "test_result",
    "id, test_case_id, status, evidence_scope, run_at, certified_by",
    "test_case_id",
    testIds,
  );

  const ordered = rows
    .map((row) => ({
      rowId: requiredText(row.id),
      result: {
        testId: requiredText(row.test_case_id),
        status: fromTestStatus(row.status),
        evidenceScope: fromEvidenceScope(row.evidence_scope),
        certifiedBy: text(row.certified_by),
        runAt: text(row.run_at),
      } satisfies TestResult,
    }))
    .sort((a, b) => {
      const left = a.result.runAt ?? "";
      const right = b.result.runAt ?? "";
      return left === right
        ? a.rowId.localeCompare(b.rowId)
        : left.localeCompare(right);
    });

  return ordered.map((one) => one.result);
}

/**
 * Everything FR-47 through FR-51 need, in one call.
 *
 * Declared as its own interface rather than as `CoverageInput & { … }`: an
 * intersection lets `tests` resolve to the narrower `TestCase[]` at a call site,
 * which silently hides FR-46's `certifiedBy` from callers that need it.
 */
export interface LoadedCoverage extends CoverageInput {
  workItems: LoadedWorkItem[];
  tests: LoadedTestCase[];
}

export async function loadCoverageInput(
  db: AnswerDb,
  engagements: EngagementRef[],
): Promise<LoadedCoverage> {
  const [requirements, workItems, tests] = await Promise.all([
    loadRequirements(db, engagements),
    loadWorkItems(db, engagements),
    loadTests(db, engagements),
  ]);
  const results = await loadResults(
    db,
    tests.map((one) => one.id),
  );
  return { requirements, workItems, tests, results };
}

// ---------------------------------------------------------------------------
// defect
// ---------------------------------------------------------------------------

/** A defect plus its fixing work item's uuid, for FR-71's link. */
export interface LoadedDefect extends Defect {
  fixingWorkItemId: string | null;
  engagementId: string;
}

export async function loadDefects(
  db: AnswerDb,
  engagements: EngagementRef[],
): Promise<LoadedDefect[]> {
  const slugOf = new Map(engagements.map((one) => [one.id, one.slug]));
  const rows = await fetchIn(
    db,
    "defect",
    "id, engagement_id, ref, source, severity, title, status, requirement_ref, " +
      "fixing_work_item_id, reported_at, reported_by",
    "engagement_id",
    engagements.map((one) => one.id),
  );

  return rows.map((row) => {
    const engagementId = requiredText(row.engagement_id);
    return {
      id: requiredText(row.id),
      engagementId,
      engagement: slugOf.get(engagementId) ?? "",
      ref: text(row.ref),
      source: requiredText(row.source) as Defect["source"],
      severity: requiredText(row.severity) as Defect["severity"],
      rawSeverity: null,
      // §7a / CR-001 §4 stated exception: `title` is the one clear column on
      // this table and it is the display key on Broken. `description` and
      // `wont_fix_reason` are ciphertext and are not selected.
      title: requiredText(row.title),
      description: null,
      status: requiredText(row.status) as Defect["status"],
      wontFixReason: null,
      requirementRef: text(row.requirement_ref),
      fixingWorkItem: text(row.fixing_work_item_id),
      fixingWorkItemId: text(row.fixing_work_item_id),
      reportedAt: text(row.reported_at),
      reportedBy: text(row.reported_by),
    };
  });
}

// ---------------------------------------------------------------------------
// blocker / external_wait
// ---------------------------------------------------------------------------

export interface LoadedBlocker {
  id: string;
  engagementId: string;
  engagement: string;
  ref: string | null;
  /** Null in the database when nothing stated one. FR-52's grouping key. */
  owner: string | null;
  openedAt: string | null;
  resolvedAt: string | null;
  disposition: "carried" | "closed" | null;
  /** Decrypted only when the caller asked for prose. Null otherwise. */
  description: string | null;
}

/**
 * Blockers. `description` is pgcrypto ciphertext under §7a and is not selected —
 * FR-52 needs the owner, the dates and the disposition, none of which is prose.
 */
export async function loadBlockers(
  db: AnswerDb,
  engagements: EngagementRef[],
  options: ProseOption = {},
): Promise<LoadedBlocker[]> {
  const slugOf = new Map(engagements.map((one) => [one.id, one.slug]));
  const columns = "id, engagement_id, ref, owner, opened_at, resolved_at, disposition";
  const rows = await fetchIn(
    db,
    "blocker",
    options.withProse ? `${columns}, description` : columns,
    "engagement_id",
    engagements.map((one) => one.id),
  );

  const prose = options.withProse
    ? await decryptAll(db as never, rows.map((row) => text(row.description)))
    : null;

  return rows.map((row, index) => {
    const engagementId = requiredText(row.engagement_id);
    return {
      id: requiredText(row.id),
      engagementId,
      engagement: slugOf.get(engagementId) ?? "",
      ref: text(row.ref),
      owner: text(row.owner),
      openedAt: text(row.opened_at),
      resolvedAt: text(row.resolved_at),
      disposition: fromDisposition(row.disposition),
      description: prose === null ? null : prose[index],
    };
  });
}

export interface LoadedWait {
  id: string;
  engagementId: string;
  engagement: string;
  label: string;
  owner: string | null;
  ownerType: string | null;
  reason: string | null;
  startedAt: string | null;
  expectedBy: string | null;
  resolvedAt: string | null;
}

/**
 * External waits. `reason` **is** selected: §7a classes this table `personal`
 * with at-rest `provider default`, and states that leaving `reason` clear is
 * "7a's explicit call for this table, not an omission".
 */
export async function loadWaits(
  db: AnswerDb,
  engagements: EngagementRef[],
): Promise<LoadedWait[]> {
  const slugOf = new Map(engagements.map((one) => [one.id, one.slug]));
  const rows = await fetchIn(
    db,
    "external_wait",
    "id, engagement_id, label, owner, owner_type, reason, started_at, " +
      "expected_by, resolved_at",
    "engagement_id",
    engagements.map((one) => one.id),
  );

  return rows.map((row) => {
    const engagementId = requiredText(row.engagement_id);
    return {
      id: requiredText(row.id),
      engagementId,
      engagement: slugOf.get(engagementId) ?? "",
      label: requiredText(row.label),
      owner: text(row.owner),
      ownerType: text(row.owner_type),
      reason: text(row.reason),
      startedAt: text(row.started_at),
      expectedBy: text(row.expected_by),
      resolvedAt: text(row.resolved_at),
    };
  });
}

// ---------------------------------------------------------------------------
// contract_milestone — operator only
// ---------------------------------------------------------------------------

export interface LoadedMilestone extends Milestone {
  engagementId: string;
  engagementSlug: string;
  clientName: string;
  currency: string;
  /** True when `amount` held ciphertext this path could not read back. */
  amountUnreadable: boolean;
}

/**
 * Contract milestones with their acceptance criteria and decrypted amounts.
 *
 * **Reachable only with an operator client.** §7a: "operator only; agent tokens
 * are refused this table". Called through `ctx.db` it throws `forbidden_table`
 * at the first `from("contract_milestone")`, which is the enforcement working —
 * see `committed.ts` for what that means for `GET /api/answer/committed`.
 *
 * `amount` is pgcrypto ciphertext, so there is no SQL aggregation over money and
 * every total is computed in TypeScript after a per-row decrypt. §7a settles
 * that this is not a performance question at any point in this product's life.
 *
 * A value that decrypts to something that is not a number becomes `null` with
 * `amountUnreadable` set, rather than `0`. A milestone worth `0` and a milestone
 * whose amount could not be read are different claims, and one of them is a
 * number Erik would put in an invoice.
 */
type Decryptable = Parameters<typeof decryptAll>[0];

/**
 * Decrypt the amounts, degrading one row at a time rather than all at once.
 *
 * i6's `decryptAll` throws on the first value that will not decrypt, which is
 * the right behaviour for the ingest path it was written for: a run that cannot
 * read a field it is about to rewrite should abandon rather than write a
 * corruption. **On a read path it is the wrong shape** — one bad ciphertext on
 * one milestone would take down the whole Committed answer for every engagement,
 * and Erik would see a 500 instead of nine perfectly readable milestones and one
 * marked unreadable.
 *
 * So: the batch is attempted first, because that is the fast path and it is what
 * happens every time nothing is wrong. Only if it throws does this fall back to
 * one call per row, isolating the failures. The slow path costs an extra round
 * trip per milestone and runs only when something is already broken.
 *
 * A row that will not decrypt comes back `null`, which `loadMilestones` turns
 * into `amount: null, amountUnreadable: true` — never `0`. A milestone worth
 * nothing and a milestone whose amount could not be read are different claims,
 * and one of them is a number Erik would put in an invoice.
 */
async function decryptAmounts(
  db: AnswerDb,
  ciphertexts: (string | null)[],
): Promise<(string | null)[]> {
  try {
    return await decryptAll(db as unknown as Decryptable, ciphertexts);
  } catch {
    return Promise.all(
      ciphertexts.map(async (ciphertext) => {
        if (ciphertext === null) return null;
        try {
          return (await decryptAll(db as unknown as Decryptable, [ciphertext]))[0];
        } catch {
          // Deliberately swallowed and deliberately not logged: the thrown
          // error's message can quote the offending value, and the offending
          // value here is §7a `sensitive` commercial data.
          return null;
        }
      }),
    );
  }
}

export async function loadMilestones(
  db: AnswerDb,
  engagements: EngagementRef[],
): Promise<LoadedMilestone[]> {
  const byId = new Map(engagements.map((one) => [one.id, one]));
  const rows = await fetchIn(
    db,
    "contract_milestone",
    "id, engagement_id, name, amount, currency, due_date, submitted_at, paid_at",
    "engagement_id",
    engagements.map((one) => one.id),
  );
  if (rows.length === 0) return [];

  const criteria = await fetchIn(
    db,
    "acceptance_criterion",
    "id, milestone_id, requirement_ref",
    "milestone_id",
    rows.map((row) => requiredText(row.id)),
  );

  const acceptance = new Map<string, string[]>();
  for (const row of criteria) {
    push(acceptance, requiredText(row.milestone_id), requiredText(row.requirement_ref));
  }

  const plaintexts = await decryptAmounts(
    db,
    rows.map((row) => text(row.amount)),
  );

  return rows.map((row, index) => {
    const id = requiredText(row.id);
    const engagementId = requiredText(row.engagement_id);
    const engagement = byId.get(engagementId);
    const ciphertext = text(row.amount);
    const plaintext = plaintexts[index];
    const parsed = plaintext === null ? null : Number(plaintext);
    const amount = parsed !== null && Number.isFinite(parsed) ? parsed : null;

    return {
      id,
      engagementId,
      engagement: engagement?.slug ?? "",
      engagementSlug: engagement?.slug ?? "",
      clientName: engagement?.clientName ?? "",
      name: requiredText(row.name),
      amount,
      // Keyed on the CIPHERTEXT being present, not on the plaintext. A row that
      // stored no amount at all and a row whose stored amount could not be read
      // both arrive here as `amount: null`, and only the second one is a
      // problem — flagging the first would put a warning next to every
      // milestone nobody has priced yet.
      amountUnreadable: ciphertext !== null && amount === null,
      currency: requiredText(row.currency) || "USD",
      due: text(row.due_date),
      acceptance: (acceptance.get(id) ?? []).sort(),
      submitted: text(row.submitted_at),
      paid: text(row.paid_at),
    };
  });
}
