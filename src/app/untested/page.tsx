import { EmptyState, Screen } from "@/components/screen";
import {
  AnswerFilterBar,
  EngagementFilter,
} from "@/components/answer-filter-bar";
import {
  RejectedFilters,
  UnknownEngagementNotice,
} from "@/components/answer-notices";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { StateBadge } from "@/components/state-badge";
import { UnparsedBreakdown } from "@/components/unparsed-breakdown";
import { parseUntestedQuery } from "@/lib/answer-query";
import type { SearchParams } from "@/lib/answer-query";
import { readUntested } from "@/lib/answer-load";
import { ANSWER_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";
import { readUnparsedCensus } from "@/lib/unparsed-census";

import { EngagementCoverage } from "./_components/engagement-coverage";

const NAV = ANSWER_ROUTES[3];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * FR-48 / FR-49 / FR-55 — Untested. *What have I not proved?*
 *
 * ## Per engagement, never merged
 *
 * FR-48 is explicitly *per engagement* and this screen keeps it that way. One
 * merged coverage report across every client would produce a single percentage
 * that is true of no engagement, and the engagement whose coverage is bad is
 * exactly the one a merged number hides.
 *
 * ## The evidence legend is on this screen because this is where it decides
 * something
 *
 * FR-43's four scopes — observed live, observed elsewhere, asserted, not
 * verified — are recorded against work items and shown on `/work-items`. What
 * happens *here* is their consequence: a requirement whose only covering test
 * carries `not-verified` lands in FR-49's `unproven` bucket rather than in
 * `covered`. That is the one place the four-way distinction changes an answer
 * Erik acts on, so the four are named here rather than left as a colour he has
 * to remember.
 */
export default async function UntestedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseUntestedQuery(await searchParams);
  const [result, census] = await Promise.all([
    loadForOperator(() => readUntested(query)),
    readUnparsedCensus(),
  ]);

  const answer = result.ok ? result.data : null;

  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={[...NAV.requirements, "FR-43", "FR-47", "FR-58"]}
    >
      <AnswerFilterBar action="/untested" filtered={query.filtered}>
        <EngagementFilter value={query.engagement} />
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

      {answer === null ? null : answer.engagementUnknown ? (
        <UnknownEngagementNotice slug={query.engagement as string} />
      ) : answer.engagements.length === 0 ? (
        // COPY: empty-state headline and detail for the untested screen
        <EmptyState
          headline="No engagement is recorded."
          detail="Coverage is reported per engagement: the requirement count, the test count, what is uncovered, what is unproven, and which tests were certified by the person who wrote the work."
        />
      ) : (
        <div
          data-verify-unit="coverage-engagements"
          data-verify-engagements={answer.engagements.length}
          className="flex flex-col gap-4"
        >
          {answer.engagements.map((coverage) => (
            <EngagementCoverage key={coverage.engagement} coverage={coverage} />
          ))}
        </div>
      )}

      <EvidenceLegend />
    </Screen>
  );
}

/**
 * FR-43's four evidence scopes, side by side.
 *
 * > *"These are distinct states and the system never collapses them."*
 *
 * A checkmark that means all four is the failure this product exists to prevent,
 * so they are shown together — that is the only arrangement in which a reader
 * can see they are four rather than assume they are two. The badges carry a
 * second channel (solid, outline, dashed) as well as hue, so the distinction
 * survives greyscale and colour-blindness, which hue alone across four states
 * does not.
 */
function EvidenceLegend() {
  return (
    <details data-verify-unit="evidence-legend" className="text-sm">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs underline underline-offset-2">
        {/* COPY: the evidence legend expander label */}
        The four evidence scopes, and the two coverage states they produce
      </summary>
      <dl className="text-muted-foreground mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {/* COPY: all eight definitions below. FR-43 and FR-49 in plain language. */}
        <LegendRow state="observed-live">
          Somebody watched this behave correctly in the running deployment.
        </LegendRow>
        <LegendRow state="observed-elsewhere">
          Watched behaving correctly somewhere that is not the deployment — a
          local run, a preview, a different environment.
        </LegendRow>
        <LegendRow state="asserted">
          Stated to be true. Nothing was observed.
        </LegendRow>
        <LegendRow state="not-verified">
          Explicitly recorded as unchecked. This is a fact, not a gap in the
          record.
        </LegendRow>
        <LegendRow state="unproven">
          FR-49: a requirement whose only covering test carries scope
          `not-verified`. A test exists. Nobody checked it.
        </LegendRow>
        <LegendRow state="uncovered">
          FR-49: no passing test names this requirement at all. Distinct from
          unproven, and it calls for a different thing.
        </LegendRow>
      </dl>
    </details>
  );
}

function LegendRow({
  state,
  children,
}: {
  state:
    | "observed-live"
    | "observed-elsewhere"
    | "asserted"
    | "not-verified"
    | "unproven"
    | "uncovered";
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="shrink-0">
        <StateBadge state={state} />
      </dt>
      <dd className="text-xs">{children}</dd>
    </div>
  );
}
