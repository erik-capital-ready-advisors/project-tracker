import { EmptyState, Screen } from "@/components/screen";
import {
  AnswerFilterBar,
  ChoiceFilter,
  EngagementFilter,
} from "@/components/answer-filter-bar";
import {
  RejectedFilters,
  UnknownEngagementNotice,
} from "@/components/answer-notices";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { UnparsedBreakdown } from "@/components/unparsed-breakdown";
import { PARAM, SEVERITIES, parseBrokenQuery } from "@/lib/answer-query";
import type { SearchParams } from "@/lib/answer-query";
import { readBroken } from "@/lib/answer-load";
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

import {
  EngagementBroken,
  engagementBrokenRefEntries,
} from "./_components/engagement-broken";

const NAV = ANSWER_ROUTES[5];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * FR-71 / FR-69 — Broken. *What is defective or has regressed?* CR-001's sixth
 * answer.
 *
 * > Broken lists open defects grouped by severity and current regressions of
 * > both kinds, per engagement, each linked to the requirement, work item and
 * > test it implicates.
 *
 * ## The title convention belongs on this screen
 *
 * §7a keeps `defect.title` in the clear as a **stated exception**, for one
 * reason: it is the display key here, and encrypting it would mean no list
 * without a per-row decrypt. The exception comes with an operator rule, quoted
 * from §7a: *"the title is a short label ('checkout 500s on submit');
 * reproduction detail, data samples and client specifics belong in the encrypted
 * description."*
 *
 * A rule that only lives in a spec document is a rule nobody follows, and the
 * cost of breaking this one is client prose sitting unencrypted in a column that
 * every list reads. So the convention is stated on the screen where those titles
 * are read and written, rather than left in §7a for somebody to find.
 */
export default async function BrokenPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseBrokenQuery(await searchParams);
  const [result, census] = await Promise.all([
    // FR-80. The engagement read and the resolution sit inside the same
    // `loadForOperator` as the answer, so a failed read renders the load
    // notice rather than references in FR-12's dangling treatment — which
    // asserts something a failed read has not established.
    loadForOperator(async () => {
      const [answer, engagements] = await Promise.all([
        readBroken(query),
        listEngagements(),
      ]);
      const engagementIds = engagementIdsBySlug(engagements);
      const resolution = await readRefResolution(
        collectRefQueries(
          engagementIds,
          answer.engagements.flatMap(engagementBrokenRefEntries),
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
      requirements={[...NAV.requirements, "FR-66", "FR-67", "FR-58"]}
    >
      <AnswerFilterBar action="/broken" filtered={query.filtered}>
        <EngagementFilter value={query.engagement} />

        {/* FR-64: `unparsed` is one of the four severities and it is offered
            like the rest. Leaving it out of the control would make an ungraded
            defect unfindable, which is the "diagnostics page" FR-58's second
            sentence rules out. */}
        <ChoiceFilter
          id="filter-severity"
          label="Severity"
          name={PARAM.severity}
          value={query.severity}
          options={SEVERITIES}
        />
      </AnswerFilterBar>

      <RejectedFilters rejected={query.rejected} />

      <UnparsedBreakdown census={census} />

      <TitleConvention />

      {result.ok ? null : (
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={NAV.label}
        />
      )}

      {loaded === null ? null : loaded.answer.engagementUnknown ? (
        <UnknownEngagementNotice slug={query.engagement as string} />
      ) : loaded.answer.engagements.length === 0 ? (
        <EmptyState
          headline={
            query.filtered
              ? "No engagement matches these filters."
              : "No engagement is recorded."
          }
          detail="Defects arrive from a fleet QA report, over the ingest API, or by hand. They appear here grouped by severity, with both kinds of regression: a test that used to pass, and a requirement that used to be covered."
        />
      ) : (
        <div
          data-verify-unit="broken-engagements"
          data-verify-engagements={loaded.answer.engagements.length}
          className="flex flex-col gap-4"
        >
          {loaded.answer.engagements.map((broken) => (
            <EngagementBroken
              key={broken.engagement}
              broken={broken}
              refs={loaded.refs}
            />
          ))}
        </div>
      )}
    </Screen>
  );
}

/**
 * §7a's operator rule for `defect.title`, on the screen where titles are read.
 *
 * Deliberately not a `<details>` like the other two legends: those explain what
 * is on screen, and this one governs what somebody types. A convention behind a
 * disclosure triangle is a convention nobody sees until after they have broken
 * it.
 */
function TitleConvention() {
  return (
    <p
      data-verify-unit="title-convention"
      className="border-border text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-xs"
    >
      A defect title is the only part of a defect stored{" "}
      <strong className="text-foreground">unencrypted</strong>, because it is
      what this list is made of. Keep it a short label{" — "}
      <span className="ident">checkout 500s on submit</span>. Reproduction
      detail, data samples and anything specific to a client belong in the
      description, which is encrypted at rest.
    </p>
  );
}
