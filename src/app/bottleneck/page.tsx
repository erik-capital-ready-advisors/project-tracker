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
import { parseBottleneckQuery } from "@/lib/answer-query";
import type { SearchParams } from "@/lib/answer-query";
import { readBottleneck } from "@/lib/answer-load";
import { ANSWER_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";
import { readUnparsedCensus } from "@/lib/unparsed-census";

import { BottleneckTable } from "./_components/bottleneck-table";

const NAV = ANSWER_ROUTES[4];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * FR-56 — Bottleneck. *What is waiting on Erik personally?*
 *
 * ## Why this is a different screen from Blocked and not a filter on it
 *
 * They read the same rows and answer different questions. Blocked asks *whose*
 * problem each stopped thing is, grouped by owner, and its owner defaults to
 * `erik` precisely so his column is separable from a client's. Bottleneck asks
 * the inverse: of everything Erik owns, which one, if he did it today, would
 * move the most other work.
 *
 * The difference is the ranking. Blocked sorts by how long something has been
 * stuck, which is a fact about the past. Bottleneck ranks by how much is waiting
 * behind it, which is a decision about the next hour. An item can be top of one
 * and bottom of the other.
 *
 * ## `unparsedExcluded` is rendered even when it is zero
 *
 * An item whose status could not be classified might be done, so it is not
 * claimed to be a bottleneck — and it is counted, because a short list with
 * eleven unclassifiable rows behind it is not a short list. The count carries
 * the reserved colour when it is non-zero, because that is what it is.
 */
export default async function BottleneckPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseBottleneckQuery(await searchParams);
  const [result, census] = await Promise.all([
    loadForOperator(() => readBottleneck(query)),
    readUnparsedCensus(),
  ]);

  const answer = result.ok ? result.data : null;

  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={[...NAV.requirements, "FR-29", "FR-30", "FR-58"]}
    >
      <AnswerFilterBar action="/bottleneck" filtered={query.filtered}>
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

      {answer === null ? null : (
        <>
          {answer.rankingDegradedReason === null ? null : (
            <DegradedOrderNotice
              reason={answer.rankingDegradedReason}
              what="ranking"
            />
          )}

          {answer.engagementUnknown ? (
            <UnknownEngagementNotice slug={query.engagement as string} />
          ) : answer.items.length === 0 ? (
            // COPY: empty-state headline and detail for the bottleneck screen
            <EmptyState
              headline={
                query.filtered
                  ? "Nothing in this engagement is waiting on Erik."
                  : "Nothing is waiting on Erik."
              }
              detail="Work whose executor is Erik or an Erik-gate appears here, ranked by how much other work it releases and by the nearest milestone at risk."
            />
          ) : (
            <BottleneckTable answer={answer} />
          )}

          <SetAsideCounts
            counts={[
              // COPY: the label for Erik-owned work whose status could not be classified
              {
                label: "Erik-owned items whose status could not be classified",
                value: answer.unparsedExcluded,
                unparsed: true,
              },
            ]}
          />

          {answer.truncated ? (
            <p
              data-verify-unit="bottleneck-truncated"
              className="text-state-carried text-xs"
            >
              {/* COPY: warning that more Erik-owned work exists than is shown */}
              More is waiting on Erik than is shown. Raise the row count to see
              it.
            </p>
          ) : null}
        </>
      )}
    </Screen>
  );
}
