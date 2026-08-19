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
import { ANSWER_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";
import { readUnparsedCensus } from "@/lib/unparsed-census";

import { EngagementBroken } from "./_components/engagement-broken";

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
    loadForOperator(() => readBroken(query)),
    readUnparsedCensus(),
  ]);

  const answer = result.ok ? result.data : null;

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

      {answer === null ? null : answer.engagementUnknown ? (
        <UnknownEngagementNotice slug={query.engagement as string} />
      ) : answer.engagements.length === 0 ? (
        // COPY: empty-state headline and detail for the broken screen
        <EmptyState
          headline="No engagement is recorded."
          detail="Open defects appear here grouped by severity, alongside both kinds of regression — a test that used to pass, and a requirement that used to be covered."
        />
      ) : (
        <div
          data-verify-unit="broken-engagements"
          data-verify-engagements={answer.engagements.length}
          className="flex flex-col gap-4"
        >
          {answer.engagements.map((broken) => (
            <EngagementBroken key={broken.engagement} broken={broken} />
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
      {/* COPY: the defect-title convention. This one is a rule, not a hint —
          it governs what goes into an unencrypted column. */}
      A defect title is a <strong className="text-foreground">short label</strong>
      {" — "}
      <span className="ident">checkout 500s on submit</span>. It is the only part
      of a defect stored unencrypted, because it is what this list is made of.
      Reproduction detail, data samples and anything specific to a client belong
      in the description, which is encrypted at rest.
    </p>
  );
}
