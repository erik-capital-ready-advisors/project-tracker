import "server-only";

import { apiError } from "@/lib/api";
import { requireOperator } from "@/lib/api/operator";
import { createServiceClient } from "@/lib/supabase/service";
import type { ServiceClient } from "@/lib/supabase/service";

/**
 * B36 -- FR-18 / FR-81, the `open_question` ledger, listed.
 *
 * ## Why this exists
 *
 * `i1` measured it and the finding is recorded in `spec/prod.md` as B36: **zero
 * foreign keys reference `open_question` and no screen linked to one.** The
 * eight detail views were built because FR-81 names `open_question` among them
 * and `pnpm gate:m27` enumerates all eight -- but a detail view nothing points
 * at is unreachable by navigation, typed uuid aside. This module is the read
 * behind the surface that fixes that: a list at `/questions`, alongside
 * `/waits` and `/work-items`, the only two other entity kinds with a listing
 * screen today (`@/lib/entity-routes`'s own comment says so).
 *
 * ## Only clear columns are selected, on purpose
 *
 * `question`, `best_guess` and `answer` are ciphertext (`question`/`best_guess`
 * under §7a, `answer` under the security baseline -- see the migration comment
 * on `open_question.answer`). Decryption is one `decrypt_field` RPC per value,
 * server-side and opt-in (`withProse` in `@/lib/detail-load`). A list screen
 * that decrypted every row's prose to show a preview would be N RPCs per page
 * load for a screen whose job is to say *which* question to open, not to answer
 * it -- the answer is what `/questions/[id]` is for, and it already does this
 * correctly (`withProse` defaults true there, and only there). So this query
 * never names the three ciphertext columns at all: there is nothing to
 * decrypt, nothing to hold in memory, and nothing that could end up in a
 * `data-verify-*` attribute by mistake.
 *
 * `status` already carries the one bit a list needs from that trio -- whether
 * the question was answered -- so no boolean stand-in for "has an answer" is
 * synthesized here either.
 *
 * ## `confidence` is `low | med | high | null`, never a fourth value
 *
 * `public.question_confidence` is a Postgres enum; `toConfidence` in
 * `@/lib/server/ingest/mapping.ts` already maps an unrecognised wire value (the
 * fleet has emitted `"medium"` and at least one prose sentence) to `NULL` at
 * ingest time rather than rounding it to the nearest label. So a `null` read
 * back here is not "nobody filled this in" and "the classifier couldn't place
 * it" folded into one column value -- it is specifically the second, by
 * construction, every time the source value was present but unrecognised, and
 * indistinguishable from "nobody filled this in" only because the schema has no
 * third state to store. Rendering it is the list screen's job (`ConfidenceCell`
 * in the page's `_components`), not this module's; what this module guarantees
 * is that the value it hands over is never coerced into one of the three
 * labels to make a row "look complete".
 *
 * ## Bounded, with a `truncated` flag -- the same reason `/waits` is
 *
 * An unbounded PostgREST read is silently truncated at 1000 rows with
 * `error === null`, so a truncated read is indistinguishable from a complete
 * one unless the caller checks for it. `OPEN_QUESTION_PAGE_LIMIT` mirrors
 * `WAIT_PAGE_LIMIT`'s shape: a cap comfortably under 1000, and
 * `truncated = rows.length === limit` rather than a second query to find out.
 *
 * ## No `created_at` to sort by -- a real gap, not an oversight here
 *
 * `open_question` carries no timestamp of its own; the migration adds
 * `answered_at` (nullable, only set once) and nothing else. There is no column
 * that says when a question was queued. So the order below is
 * `(status desc, run desc, unit asc)` -- open questions first, then a stable
 * tie-break -- which is a legibility choice, not a chronological one. A reader
 * cannot conclude "the top row is the newest" from this list, and that
 * limitation is worth carrying forward rather than papering over with a sort
 * that implies an ordering the data does not support.
 */

/** Comfortably under PostgREST's silent 1000-row cap. See the header note. */
export const OPEN_QUESTION_PAGE_LIMIT = 500;

export interface ListedOpenQuestion {
  id: string;
  engagementSlug: string | null;
  engagementClientName: string | null;
  /** The fleet run id as text (`eb2490`), not a uuid. Clear. */
  run: string | null;
  /** The work-unit id the question was queued from. Clear. */
  unit: string | null;
  /** The spec section the question is about. Clear. */
  section: string | null;
  /** `low | med | high`, or `null` -- see the header note. Never a fourth value. */
  confidence: string | null;
  answeredBy: string | null;
  answeredAt: string | null;
  /** `open | answered`. */
  status: string;
}

export interface OpenQuestionListing {
  questions: ListedOpenQuestion[];
  openCount: number;
  answeredCount: number;
  /** Rows on this page whose `confidence` is `null`. Never a guess. */
  unclassifiedConfidenceCount: number;
  truncated: boolean;
}

export interface OpenQuestionFilters {
  /** Default: only open questions. Mirrors `/waits`' `includeResolved`. */
  includeAnswered?: boolean;
  /**
   * FR-96 — narrow to one engagement, by **id** rather than by slug.
   *
   * An id because the slug has already been resolved by the caller
   * (`@/lib/engagement-resolve`), and re-resolving it here would give this
   * module a second opinion about whether an engagement exists. It has none:
   * `null` is the cross-engagement default FR-96 keeps, and a caller that could
   * not resolve its slug does not call this at all.
   */
  engagementId?: string | null;
  limit?: number;
}

interface RawEngagementRef {
  slug: string | null;
  client_name: string | null;
}

interface RawOpenQuestionRow {
  id: string;
  run: string | null;
  unit: string | null;
  section: string | null;
  confidence: string | null;
  answered_by: string | null;
  answered_at: string | null;
  status: string;
  engagement: RawEngagementRef | RawEngagementRef[] | null;
}

/**
 * The gated read. `requireOperator()` is called here, beside the query, per
 * `detail-load.ts`'s rule: a gate that lives in the caller is a gate someone
 * can forget when a second call site is added.
 */
export async function readOpenQuestions(
  filters: OpenQuestionFilters = {},
): Promise<OpenQuestionListing> {
  await requireOperator();
  return listOpenQuestions(createServiceClient(), filters);
}

/**
 * The pure query-and-shape half, taking a client so it is testable against a
 * fake without a database. No rule is computed here beyond the shape of a
 * row -- the "never guess a classification" rule is honoured by not touching
 * `confidence` at all, and every other field is a passthrough.
 */
export async function listOpenQuestions(
  db: ServiceClient,
  filters: OpenQuestionFilters = {},
): Promise<OpenQuestionListing> {
  const limit = Math.min(
    Math.max(1, filters.limit ?? OPEN_QUESTION_PAGE_LIMIT),
    OPEN_QUESTION_PAGE_LIMIT,
  );

  let query = db
    .from("open_question")
    .select(
      "id, run, unit, section, confidence, answered_by, answered_at, status, " +
        "engagement:engagement_id (slug, client_name)",
    )
    .order("status", { ascending: false })
    .order("run", { ascending: false, nullsFirst: false })
    .order("unit", { ascending: true, nullsFirst: false })
    .limit(limit);

  if (filters.includeAnswered !== true) {
    query = query.eq("status", "open");
  }

  // FR-96. `engagement_id` is a clear column, so this filter costs no
  // decryption -- §7a's point about `client_name` and the slug staying
  // unencrypted is exactly what makes an engagement filter cheap here.
  if (filters.engagementId != null) {
    query = query.eq("engagement_id", filters.engagementId);
  }

  const { data, error } = await query;
  if (error) {
    throw apiError("internal_error", "Could not read the open questions.");
  }

  const rows = (data ?? []) as unknown as RawOpenQuestionRow[];

  const questions: ListedOpenQuestion[] = rows.map((row) => {
    const engagement = Array.isArray(row.engagement)
      ? (row.engagement[0] ?? null)
      : row.engagement;

    return {
      id: row.id,
      engagementSlug: engagement?.slug ?? null,
      engagementClientName: engagement?.client_name ?? null,
      run: row.run,
      unit: row.unit,
      section: row.section,
      confidence: row.confidence,
      answeredBy: row.answered_by,
      answeredAt: row.answered_at,
      status: row.status,
    };
  });

  return {
    questions,
    openCount: questions.filter((q) => q.status === "open").length,
    answeredCount: questions.filter((q) => q.status !== "open").length,
    unclassifiedConfidenceCount: questions.filter((q) => q.confidence === null)
      .length,
    truncated: rows.length === limit,
  };
}
