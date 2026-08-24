import {
  dispatchUsage,
  renderGates,
  runDuration,
  runUnparsed,
  runVerdict,
  testTriple,
} from "@/lib/runs-display";
import { IN_CHUNK, chunk, fetchAllRows } from "@/lib/server/answers/db";
import type { AnswerQuery } from "@/lib/server/answers/db";
import { LoadError } from "@/lib/server/answers/load";
import { num, requiredText, text } from "@/lib/server/detail/rows";
import type { Row } from "@/lib/server/detail/rows";
import type { DetailEngagement } from "@/lib/server/detail/types";

import { FLEET_RUN_COLUMNS } from "./columns";
import type { ListedRun, RunListing, RunsDb } from "./types";

/**
 * FR-92 — every ingested fleet run, newest first, across every engagement by
 * default.
 *
 * ## FR-96's filter, and why it did not overturn Q16
 *
 * Cross-engagement is still what this returns when nothing is passed, and that
 * is Q16's ruling from FR-92's own wording rather than an implementation
 * default. What FR-96 adds — approved 2026-08-24, after the note that used to
 * stand here called it DRAFT — is an **optional** narrowing expressed in the
 * URL. The unfiltered view remains the default and no caller becomes
 * engagement-mandatory, which is FR-96's own first sentence.
 *
 * `engagementId`, not a slug: the caller has already resolved it
 * (`@/lib/engagement-resolve`), and giving this module its own slug lookup would
 * give it a second opinion on whether an engagement exists. It has none — `null`
 * means the whole ledger, and a caller whose slug named nothing does not call
 * this at all.
 *
 * ## Ordering, and the claim it does not make
 *
 * `started_at desc`, with rows carrying no `started_at` placed last and then
 * ordered by `run_id` descending so the sequence is stable across reads.
 *
 * The sort is done here rather than in PostgREST because `fetchAllRows` fixes
 * its own ascending `id` ordering to make paging terminate correctly, and
 * re-ordering the assembled array is both cheaper and honest about what it is.
 *
 * **A reader cannot conclude "the top row is the newest" for the tail of this
 * list.** `fleet_run.started_at` is nullable, and `@/lib/server/ingest/plan.ts`
 * fills it from a checkpoint header field that may be absent — so rows without
 * one are ordered by identifier, which is not a chronology.
 * `@/lib/questions-load` carries the same caveat for the same reason, and
 * papering over it with a sort that implies an ordering the data does not
 * support is the failure both notes exist to prevent.
 */
export async function listRuns(
  db: RunsDb,
  engagementId: string | null = null,
): Promise<RunListing> {
  // Filtered in the query rather than over the assembled array. `fetchAllRows`
  // pages to an exact count, so filtering afterwards would page the whole
  // `fleet_run` table to show one engagement's runs — and the `truncated`
  // arithmetic further down would be counting rows nobody asked for.
  const result = await fetchAllRows(db, "fleet_run", FLEET_RUN_COLUMNS, (query) =>
    engagementId === null ? query : query.eq("engagement_id", engagementId),
  );
  if (result.error) throw new LoadError("fleet_run", result.error);

  const rows = result.rows;
  const engagements = await fetchEngagements(
    db,
    rows.map((row) => requiredText(row.engagement_id)),
  );

  const runIds = rows.map((row) => requiredText(row.id));
  const unparsed = await unparsedWorkItemsByRun(db, runIds);

  const runs: ListedRun[] = rows.map((row) => {
    const id = requiredText(row.id);
    const gates = renderGates(row.gates);
    const verdict = text(row.verdict);

    return {
      id,
      runId: requiredText(row.run_id),
      engagement: engagements.get(requiredText(row.engagement_id)) ?? null,
      branch: text(row.branch),
      mode: text(row.mode),
      startedAt: text(row.started_at),
      endedAt: text(row.ended_at),
      verdict: runVerdict({ verdict }),
      duration: runDuration(text(row.started_at), text(row.ended_at)),
      dispatches: dispatchUsage(num(row.dispatches_used), num(row.dispatch_cap)),
      tests: testTriple(
        num(row.tests_passed),
        num(row.tests_failed),
        num(row.tests_skipped),
      ),
      unparsed: runUnparsed({
        unparsedWorkItems: unparsed.counts.get(id) ?? (unparsed.available ? 0 : null),
        gates,
        verdict,
      }),
    };
  });

  runs.sort(newestFirst);

  return {
    runs,
    noVerdictCount: runs.filter((run) => run.verdict.agreement === "none").length,
    noTestCountsCount: runs.filter((run) => run.tests.state === "unknown").length,
    unparsedCountsUnavailable: !unparsed.available,
  };
}

/**
 * Newest first, with a stable tie-break.
 *
 * A run with no `started_at` sorts after every run that has one, rather than
 * being treated as the epoch — which would place it at the very bottom by
 * accident and imply it is the oldest.
 */
function newestFirst(a: ListedRun, b: ListedRun): number {
  const aTime = instant(a.startedAt);
  const bTime = instant(b.startedAt);

  if (aTime === null && bTime !== null) return 1;
  if (aTime !== null && bTime === null) return -1;
  if (aTime !== null && bTime !== null && aTime !== bTime) return bTime - aTime;

  // Equal or both-absent timestamps: order by run id, descending, purely so the
  // sequence does not shuffle between reads. This is legibility, not chronology.
  return a.runId < b.runId ? 1 : a.runId > b.runId ? -1 : 0;
}

function instant(value: string | null): number | null {
  if (value === null || value === "") return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * FR-94's per-run component: `work_item.status = 'unparsed'`, grouped by run.
 *
 * ## Why this reads rows rather than asking for a count per run
 *
 * PostgREST has no `GROUP BY`, so the alternatives are one `head`-count request
 * per run — which is N requests for an N-row listing — or one filtered read that
 * returns only the rows that are actually unparsed. The filter is the selective
 * half here: the predicate matches 0 rows across the whole ledger today, and by
 * construction it only ever returns records a reader is meant to go and look at.
 *
 * ## A failed read degrades one column and never invents a zero
 *
 * `available: false` propagates to `unparsed.workItems = null` on every row,
 * which `unparsedState` renders as unknown. Returning `0` on a refused query
 * would state that the system classified everything, on a request where nothing
 * was counted — the one claim `@/lib/server/answers/unparsed` exists to prevent.
 */
async function unparsedWorkItemsByRun(
  db: RunsDb,
  runIds: readonly string[],
): Promise<{ counts: Map<string, number>; available: boolean }> {
  const counts = new Map<string, number>();
  if (runIds.length === 0) return { counts, available: true };

  for (const batch of chunk([...new Set(runIds)], IN_CHUNK)) {
    const result = await fetchAllRows(
      db,
      "work_item",
      "id, fleet_run_id, status",
      (query) =>
        (query as AnswerQuery).in("fleet_run_id", batch).eq("status", "unparsed"),
    );
    if (result.error) return { counts: new Map(), available: false };

    for (const row of result.rows) {
      const runId = text(row.fleet_run_id);
      if (runId === null) continue;
      counts.set(runId, (counts.get(runId) ?? 0) + 1);
    }
  }

  return { counts, available: true };
}

/**
 * The engagements the listed runs belong to, in one read.
 *
 * The projection is written out and never `*`: §7a restricts `engagement` at the
 * column level and a wildcard silently widens the day someone adds a column.
 * `client_name` is §7a's stated unencrypted exception and B6 stays open on it.
 */
export async function fetchEngagements(
  db: RunsDb,
  ids: readonly string[],
): Promise<Map<string, DetailEngagement>> {
  const engagements = new Map<string, DetailEngagement>();
  const unique = [...new Set(ids)].filter((id) => id !== "");
  if (unique.length === 0) return engagements;

  for (const batch of chunk(unique, IN_CHUNK)) {
    const result = await fetchAllRows(
      db,
      "engagement",
      "id, slug, client_name",
      (query) => (query as AnswerQuery).in("id", batch),
    );
    if (result.error) throw new LoadError("engagement", result.error);

    for (const row of result.rows) {
      engagements.set(requiredText(row.id), toEngagement(row));
    }
  }

  return engagements;
}

function toEngagement(row: Row): DetailEngagement {
  return {
    id: requiredText(row.id),
    slug: requiredText(row.slug),
    clientName: requiredText(row.client_name),
  };
}
