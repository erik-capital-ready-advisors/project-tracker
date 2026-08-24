import { EngagementScopeNotice } from "@/components/engagement-scope-notice";
import { EmptyState, Screen } from "@/components/screen";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { engagementFilterFrom } from "@/lib/engagement-filter";
import type { SearchParamRecord } from "@/lib/engagement-filter";
import {
  engagementScopeBlocksRows,
  engagementScopeId,
  resolveEngagementFilter,
} from "@/lib/engagement-resolve";
import { OPERATOR_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";
import { readRuns } from "@/lib/runs-load";

import { RunTable } from "./_components/run-table";

/**
 * This screen reads its own nav entry by **href**, not by position (B44).
 *
 * Six pages in this product index `OPERATOR_ROUTES` positionally, `[0]` through
 * `[5]`, which is why B44 is open and why this unit's entry had to be appended
 * at the end. B44's prescribed fix is a lookup by href, and this is that fix
 * applied to the one call site this unit owns -- it adds no seventh positional
 * index and it does not refactor the other six, which are five files no unit in
 * this run owns.
 *
 * The `!` is load-bearing and it is deliberate. If the `/runs` entry is ever
 * deleted or its href changed, this module throws at import and every test that
 * mounts this page fails immediately. That is the point: B43 exists because two
 * of run 29b583's fixes were protected by nothing, and deleting them left the
 * whole suite green at exit 0. A silent `undefined` here would render a screen
 * with no title rather than fail.
 */
const NAV = OPERATOR_ROUTES.find((item) => item.href === "/runs")!;

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * FR-92, FR-94, FR-95 -- the fleet's own run history.
 *
 * ## What this screen is
 *
 * The fleet has been leaving `manifest-*.md` and `checkpoint-*.md` behind on
 * every run since before this product existed, and Mode-1 ingest has been
 * reading them into `fleet_run` for two milestones. Until now nothing rendered
 * that table: a run could be reached only by querying the database. This is the
 * listing that ends it -- every ingested run, across every engagement, newest
 * first, each row stating what that run claimed about itself.
 *
 * Cross-engagement **by default**, which is Q16's ruling from FR-92's own
 * wording and is unchanged. What changed on 2026-08-24 is that FR-96 was
 * approved, so the note that used to stand here -- "FR-96 is DRAFT and not
 * approved, so there is deliberately no filter here however natural one feels" --
 * has been overtaken. The filter is now honoured, it is optional, and the
 * unfiltered list remains what this screen renders when nothing asks otherwise.
 *
 * This is the **first** `searchParams` this screen has read. It was one of the
 * two of eleven that read none (`/registry` was the other), against the resolved
 * spec's claim that all eleven already did -- measured by r1 rather than assumed.
 * The type comes from `@/lib/engagement-filter` rather than being restated,
 * because a fourth spelling of the same `Record` is how the eleven drift.
 *
 * The picker itself is NOT here: FR-96b puts one in the app shell so it is built
 * once rather than eleven times. This screen owns honouring the URL and nothing
 * else about the control.
 *
 * ## Three outcomes, not two
 *
 * The same rule every operator screen in this product follows. A failed read
 * renders `<OperatorLoadNotice>` and **never** an empty state, because a screen
 * that renders "no runs" after a failed query has told Erik the ledger is empty
 * without looking at it -- the same class of mistake as rendering an unknown
 * count as `0`. An empty listing after a *successful* read renders
 * `<EmptyState>`, which says so in words nobody can mistake for a failure.
 *
 * ## Two notes that retire themselves
 *
 * Both notes below render only while the condition that makes them true holds,
 * and disappear on their own once it stops. That is deliberate: a caveat written
 * as permanent copy becomes a false statement the day the data changes, and
 * nobody goes back to delete it.
 *
 *   * The **missing dispatch producer** note renders only while *every* run
 *     reports unknown dispatch usage. Nothing in this product writes
 *     `dispatch_cap` or `dispatches_used` -- FR-92 asks for a number no code
 *     records -- and a column that degrades gracefully on every row forever is
 *     exactly the gap nobody notices. The moment an ingest path records one, the
 *     note stops rendering.
 *   * The **ordering** note renders only while some run has no recorded start.
 *     Those rows are ordered by identifier, which is not a chronology, so
 *     "newest first" is true of the head of this list and not of its tail.
 *     Saying so is cheaper than a sort that implies an order the data cannot
 *     support.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-summary"       data-verify-runs, data-verify-no-verdict,
 *                                         data-verify-no-test-counts,
 *                                         data-verify-unparsed-available
 *   data-verify-unit="dispatch-producer-note"
 *   data-verify-unit="run-order-note"
 *   data-verify-unit="unknown-engagement"            (FR-96c, no rows beneath it)
 *   data-verify-unit="engagement-scope-unavailable"  (the filter could not be resolved)
 *   plus the table's own contracts, documented in `_components/run-table.tsx`.
 */
export default async function RunsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamRecord>;
}) {
  const filter = engagementFilterFrom(await searchParams);

  // Resolved inside the load wrapper so a gated visitor gets one refusal, from
  // the machinery that owns the gate. See `@/lib/engagement-resolve`.
  const result = await loadForOperator(async () => {
    const scope = await resolveEngagementFilter(filter);
    return {
      scope,
      listing: engagementScopeBlocksRows(scope)
        ? null
        : await readRuns(engagementScopeId(scope)),
    };
  });

  const scope = result.ok ? result.data.scope : null;
  const listing = result.ok ? result.data.listing : null;

  const everyDispatchUnknown =
    listing !== null &&
    listing.runs.length > 0 &&
    listing.runs.every((run) => run.dispatches.state === "unknown");

  const someRunHasNoStart =
    listing !== null && listing.runs.some((run) => run.startedAt === null);

  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      <div
        data-verify-unit="run-summary"
        data-verify-runs={listing === null ? "unknown" : listing.runs.length}
        data-verify-no-verdict={
          listing === null ? "unknown" : listing.noVerdictCount
        }
        data-verify-no-test-counts={
          listing === null ? "unknown" : listing.noTestCountsCount
        }
        data-verify-unparsed-available={
          listing === null ? "unknown" : listing.unparsedCountsUnavailable ? "false" : "true"
        }
        className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
      >
        {listing === null ? (
          <span>counts unavailable</span>
        ) : (
          <>
            <span className="ident">
              {listing.runs.length} {listing.runs.length === 1 ? "run" : "runs"}
            </span>

            {listing.noVerdictCount > 0 ? (
              <span className="ident">
                {listing.noVerdictCount} recorded no verdict
              </span>
            ) : null}

            {listing.noTestCountsCount > 0 ? (
              <span className="ident">
                {listing.noTestCountsCount} reported no test counts
              </span>
            ) : null}

            {listing.unparsedCountsUnavailable ? (
              <span className="text-state-blocked">
                Per-run unparsed counts could not be read, so no run states a
                total.
              </span>
            ) : null}
          </>
        )}
      </div>

      {result.ok ? null : (
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={NAV.label}
        />
      )}

      {/* FR-96c. The same `engagementScopeBlocksRows` that nulled the listing
          above is what guarantees no run rows render beneath this. */}
      {scope === null ? null : <EngagementScopeNotice resolution={scope} />}

      {listing === null ? null : listing.runs.length === 0 ? (
        <EmptyState
          headline={
            // Two different facts, and only one of them is about the ledger.
            // "No fleet run has been ingested yet" under a filter would report
            // an empty ledger on a request that only looked at one engagement.
            scope?.kind === "resolved"
              ? // Same claim, narrowed, and "yet" is dropped with the ledger:
                // "yet" is a statement about the product's whole lifetime.
                `No fleet run has been ingested for ${scope.slug}.`
              : "No fleet run has been ingested yet."
          }
          detail="A run appears here once its manifest and checkpoint have been read. Each row states what that run claimed about itself — the verdict it recorded, how long it took, and what nothing could classify."
        />
      ) : (
        <>
          <RunTable runs={listing.runs} />

          {someRunHasNoStart ? (
            <p
              data-verify-unit="run-order-note"
              className="text-muted-foreground text-xs"
            >
              Runs with no recorded start time are listed last, ordered by run
              id. That is a stable order, not a chronology — for those rows,
              higher up does not mean more recent.
            </p>
          ) : null}

          {everyDispatchUnknown ? (
            <p
              data-verify-unit="dispatch-producer-note"
              className="text-muted-foreground text-xs"
            >
              No run records its dispatch count or cap, and none will: the two
              columns exist in the schema and nothing in this product writes
              them. The column reads not recorded rather than 0 of 0, which
              would state a cap no run ran under.
            </p>
          ) : null}
        </>
      )}
    </Screen>
  );
}
