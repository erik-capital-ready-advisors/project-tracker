import { EmptyState, Screen } from "@/components/screen";
import {
  AnswerFilterBar,
  EngagementFilter,
  LimitFilter,
} from "@/components/answer-filter-bar";
import {
  DegradedOrderNotice,
  RejectedFilters,
  SetAsideCounts,
  UnknownEngagementNotice,
} from "@/components/answer-notices";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { UnparsedBreakdown } from "@/components/unparsed-breakdown";
import { parseNextQuery } from "@/lib/answer-query";
import type { SearchParams } from "@/lib/answer-query";
import { readNext } from "@/lib/answer-load";
import {
  buildRefLookup,
  collectRefQueries,
  engagementIdsBySlug,
} from "@/lib/answer-screen-refs";
import { readRefResolution } from "@/lib/detail-load";
import { ANSWER_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";
import { isoToday } from "@/lib/today";
import { listEngagements } from "@/lib/server/registry/engagements";
import { readUnparsedCensus } from "@/lib/unparsed-census";

import { NextTable, nextTableRefEntries } from "./_components/next-table";

const NAV = ANSWER_ROUTES[1];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * FR-53 — Next. *What can I actually start right now?*
 *
 * > Next lists work items whose dependencies are all satisfied and which no open
 * > blocker or wait holds, ordered by the nearest dated milestone they serve.
 *
 * ## The counts under the table are not decoration
 *
 * Three of them explain a short list, and a short list with no explanation reads
 * as a quiet week rather than a blocked one:
 *
 *   * `heldByDependency` — ready except that something upstream is not done;
 *   * `heldByBlocker` — an open blocker or wait holds it;
 *   * `unparsedCandidates` — the status could not be classified, so the item is
 *     **not** claimed to be startable and **is** counted. Dropping it silently
 *     is how a list of three looks like the whole answer.
 *   * `notStartable` — B28. In a status that is not startable at all
 *     (`blocked`, `in_flight`, `done`, `superseded`). Not "held", but not
 *     invisible either: the four counters plus the listed items now account for
 *     every work item the query returned.
 *
 * The last one carries the reserved colour when it is non-zero, because that is
 * exactly what it is.
 *
 * ## The ordering is surfaced whether or not it degraded
 *
 * This screen runs under an operator session, which §7a permits
 * `contract_milestone`, so `ordering` should read `milestone-due-date`. It is
 * read off the payload rather than assumed: if the milestone read ever fails
 * here the way it always does for an agent token, the notice appears and the
 * column's ordering marker disappears. A list sorted by something else under
 * FR-53's heading is a wrong answer Erik would act on.
 */
export default async function NextPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseNextQuery(await searchParams);
  const [result, census] = await Promise.all([
    // FR-80. The engagement read and the resolution sit inside the same
    // `loadForOperator` as the answer: a failed read must render the load
    // notice, never a page of references in FR-12's dangling treatment, which
    // claims something a failed read has not established.
    loadForOperator(async () => {
      const [answer, engagements] = await Promise.all([
        readNext(query),
        listEngagements(),
      ]);
      const engagementIds = engagementIdsBySlug(engagements);
      const resolution = await readRefResolution(
        collectRefQueries(engagementIds, nextTableRefEntries(answer)),
      );
      return { answer, refs: buildRefLookup(engagementIds, resolution) };
    }),
    readUnparsedCensus(),
  ]);

  const loaded = result.ok ? result.data : null;

  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={[...NAV.requirements, "FR-58"]}
    >
      <AnswerFilterBar action="/next" filtered={query.filtered}>
        <EngagementFilter value={query.engagement} />
        <LimitFilter value={query.limit} />
      </AnswerFilterBar>

      <RejectedFilters rejected={query.rejected} />

      <UnparsedBreakdown census={census} />

      {result.ok ? null : (
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={NAV.label}
        />
      )}

      {loaded === null ? null : (
        <>
          {loaded.answer.orderingUnavailableReason === null ? null : (
            <DegradedOrderNotice
              reason={loaded.answer.orderingUnavailableReason}
              what="ordering"
            />
          )}

          {loaded.answer.engagementUnknown ? (
            <UnknownEngagementNotice slug={query.engagement as string} />
          ) : loaded.answer.items.length === 0 ? (
            <EmptyState
              headline={
                query.filtered
                  ? "Nothing is startable under these filters."
                  : "Nothing is startable."
              }
              detail="Work whose dependencies are all done and which no open blocker or wait holds appears here, nearest dated milestone first. The counts below say what was set aside and why."
            />
          ) : (
            <NextTable answer={loaded.answer} refs={loaded.refs} asOf={isoToday()} />
          )}

          {/* Rendered even when the list is empty: an empty Next list with 11
              items held by a dependency is a completely different situation
              from an empty one with nothing held at all, and only these
              numbers tell them apart. */}
          <SetAsideCounts
            counts={[
              { label: "held by a dependency", value: loaded.answer.heldByDependency },
              { label: "held by a blocker or wait", value: loaded.answer.heldByBlocker },
              { label: "not in a startable status", value: loaded.answer.notStartable },
              {
                label: "status could not be classified",
                value: loaded.answer.unparsedCandidates,
                unparsed: true,
              },
            ]}
          />

          {loaded.answer.truncated ? (
            <p
              data-verify-unit="next-truncated"
              className="text-state-carried text-xs"
            >
              More work qualifies than is shown. Raise the row count to see it.
            </p>
          ) : null}
        </>
      )}
    </Screen>
  );
}
