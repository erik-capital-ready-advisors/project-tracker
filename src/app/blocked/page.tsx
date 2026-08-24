import { EmptyState, Screen } from "@/components/screen";
import {
  AnswerFilterBar,
  ChoiceFilter,
  EngagementFilter,
} from "@/components/answer-filter-bar";
import {
  RejectedFilters,
  SetAsideCounts,
  UnknownEngagementNotice,
} from "@/components/answer-notices";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { UnparsedBreakdown } from "@/components/unparsed-breakdown";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/native-select";
import { DISPOSITIONS, PARAM, parseBlockedQuery } from "@/lib/answer-query";
import type { SearchParams } from "@/lib/answer-query";
import { readBlocked } from "@/lib/answer-load";
import {
  buildRefLookup,
  collectRefQueries,
  engagementIdsBySlug,
} from "@/lib/answer-screen-refs";
import { readRefResolution } from "@/lib/detail-load";
import { ANSWER_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";
import { listEngagements } from "@/lib/server/registry/engagements";
import { readUnparsedCensus } from "@/lib/unparsed-census";

import { BlockedGroup, blockedGroupRefEntries } from "./_components/blocked-group";

const NAV = ANSWER_ROUTES[0];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * FR-52 — Blocked. *What is stopped, who owns it, and for how long?*
 *
 * > Blocked lists every blocked work item and open external wait, grouped by
 * > owner, with elapsed time and disposition.
 *
 * ## Owner is the axis, and the default is `erik`
 *
 * `blocker.owner` defaults to `"erik"` and is never inferred from prose
 * (`DEFAULT_BLOCKER_OWNER`). That default is what makes this screen and
 * Bottleneck answer different questions from the same rows: Blocked asks *whose*
 * problem each stopped thing is, Bottleneck asks what Erik personally is holding
 * up. If the default were `client`, this screen would quietly move Erik's own
 * backlog into somebody else's column.
 *
 * ## Three things this page refuses to do
 *
 *   * It does not render an empty state after a failed read. `loadForOperator`
 *     returns a failure that renders as a failure — "Nothing is blocked." after
 *     a refused query is a clean-ledger claim nobody checked.
 *   * It does not silently drop a filter value it could not parse.
 *   * It does not report `0 unparsed` when the count was not read. The census is
 *     `null` in that case and `null` renders "unavailable".
 */
export default async function BlockedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseBlockedQuery(await searchParams);
  const [result, census] = await Promise.all([
    // FR-80. The engagement read and the resolution run INSIDE the same
    // `loadForOperator` as the answer, deliberately: a failed engagement read
    // must not leave the screen rendering references in FR-12's dangling
    // treatment, because that treatment claims "no such row has been ingested"
    // and a read that failed has established no such thing. One failure, one
    // load notice, no data — the same rule as the empty state.
    loadForOperator(async () => {
      const [answer, engagements] = await Promise.all([
        readBlocked(query),
        listEngagements(),
      ]);
      const engagementIds = engagementIdsBySlug(engagements);
      const resolution = await readRefResolution(
        collectRefQueries(
          engagementIds,
          answer.groups.flatMap(blockedGroupRefEntries),
        ),
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
      requirements={[...NAV.requirements, "FR-30", "FR-58"]}
    >
      <AnswerFilterBar action="/blocked" filtered={query.filtered}>
        <EngagementFilter value={query.engagement} />

        {/* Owner is free text on purpose. §7a leaves the owner vocabulary open
            and `external_wait.owner_type` is one of the four fields the spec
            keeps as free text, so a dropdown here would invent an enum the
            database does not have. */}
        <Field id="filter-owner" label="Owner" className="w-40">
          <Input
            id="filter-owner"
            name={PARAM.owner}
            defaultValue={query.owner ?? ""}
            placeholder="every owner"
            autoComplete="off"
            spellCheck={false}
            className="ident"
          />
        </Field>

        {/* FR-30: both dispositions are separately selectable, because
            `carried` and `closed` are different answers and a single
            "resolved?" toggle would be the collapse the requirement forbids. */}
        <ChoiceFilter
          id="filter-disposition"
          label="Disposition"
          name={PARAM.disposition}
          value={query.disposition}
          options={DISPOSITIONS}
        />
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

      {loaded === null ? null : loaded.answer.engagementUnknown ? (
        <UnknownEngagementNotice slug={query.engagement as string} />
      ) : loaded.answer.groups.length === 0 ? (
        <EmptyState
          headline={
            query.filtered
              ? "Nothing blocked matches these filters."
              : "Nothing is blocked."
          }
          detail={
            query.filtered
              ? "The read succeeded and returned nothing. Clear the filters to see every owner."
              : "Blocked work items and open external waits appear here with elapsed time and disposition, grouped by owner so Erik's rows sit apart from a client's or a vendor's."
          }
        />
      ) : (
        <>
          <SetAsideCounts
            counts={[
              { label: "blocked work items", value: loaded.answer.itemCount },
              { label: "open waits", value: loaded.answer.waitCount },
              { label: "owners", value: loaded.answer.groups.length },
            ]}
          />

          <div
            data-verify-unit="blocked-groups"
            data-verify-groups={loaded.answer.groups.length}
            className="flex flex-col gap-4"
          >
            {loaded.answer.groups.map((group) => (
              <BlockedGroup
                key={group.owner}
                group={group}
                refs={loaded.refs}
              />
            ))}
          </div>
        </>
      )}
    </Screen>
  );
}
