import { EmptyState, Screen } from "@/components/screen";
import {
  AnswerFilterBar,
  ChoiceFilter,
  EngagementFilter,
} from "@/components/answer-filter-bar";
import {
  AnswerWarnings,
  RejectedFilters,
  UnknownEngagementNotice,
} from "@/components/answer-notices";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { UnparsedBreakdown } from "@/components/unparsed-breakdown";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/native-select";
import { StateBadge } from "@/components/state-badge";
import {
  MILESTONE_STATES,
  PARAM,
  parseCommittedQuery,
} from "@/lib/answer-query";
import type { SearchParams } from "@/lib/answer-query";
import { readCommitted } from "@/lib/answer-load";
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
  CommittedTable,
  committedTableRefEntries,
} from "./_components/committed-table";
import { CommittedTotalsStrip } from "./_components/committed-totals";

const NAV = ANSWER_ROUTES[2];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * FR-54 / FR-75 — Committed. *What did I promise a client, and can I invoice it?*
 *
 * ## This screen is operator-only, structurally
 *
 * §7a refuses agent tokens `contract_milestone` entirely, and every field here
 * derives from a row in it — so `GET /api/answer/committed` answers
 * `403 forbidden_table` to every agent token with no partial answer. This screen
 * runs under an operator session and is unaffected. **Nothing in this unit
 * implies an agent can read it**, and the honest substitute for an agent wanting
 * requirement-level coverage without commercial figures is `/api/answer/untested`
 * and `/api/answer/broken`.
 *
 * ## The four distinctions this screen exists to keep apart
 *
 *   * **covered vs shipped** (FR-75) — built and deployed are different claims.
 *   * **billable vs claimed** (FR-51) — a review request is not an invoice.
 *   * **billable vs contested** (FR-79) — billable *and flagged*, never clean.
 *   * **amount `null` vs amount `0`** — one of those is a number Erik invoices.
 *
 * Every one of them is two visual elements rather than one, and the legend below
 * the table names them so a reader who has not read the spec still gets the
 * distinction rather than only the colours.
 */
export default async function CommittedPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const query = parseCommittedQuery(await searchParams);
  const [result, census] = await Promise.all([
    // FR-80. Resolution runs inside the same `loadForOperator` as the answer:
    // a failed read renders the load notice, never a screen of references in
    // FR-12's dangling treatment, which asserts something a failed read has
    // not established. FR-86 is untouched — `readRefResolution` decrypts
    // nothing and adds no agent-reachable surface, and `/api/answer/committed`
    // still answers an agent token `403 forbidden_table`.
    loadForOperator(async () => {
      const [answer, engagements] = await Promise.all([
        readCommitted(query),
        listEngagements(),
      ]);
      const engagementIds = engagementIdsBySlug(engagements);
      const resolution = await readRefResolution(
        collectRefQueries(
          engagementIds,
          committedTableRefEntries(answer.milestones),
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
      requirements={[...NAV.requirements, "FR-51", "FR-79", "FR-58"]}
    >
      <AnswerFilterBar action="/committed" filtered={query.filtered}>
        <EngagementFilter value={query.engagement} />

        {/* FR-50/FR-51: all three states are separately selectable. A single
            "invoiceable?" toggle would merge `claimed` into `billable`, which
            is exactly what FR-51 forbids. */}
        <ChoiceFilter
          id="filter-state"
          label="State"
          name={PARAM.state}
          value={query.state}
          options={MILESTONE_STATES}
        />

        {/* FR-75: free text, because the environment vocabulary belongs to
            whatever the release artifacts actually say. Narrowing "shipped" to
            one environment is the caller's choice — the loader keeps the
            environment *set* per requirement rather than a boolean precisely so
            this stays a choice. */}
        <Field id="filter-environment" label="Shipped to" className="w-36">
          <Input
            id="filter-environment"
            name={PARAM.environment}
            defaultValue={query.environment ?? ""}
            placeholder="any release"
            autoComplete="off"
            spellCheck={false}
            className="ident"
          />
        </Field>
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
          {/* A failed shipped-state read reports its requirements as "not
              shipped", which may be wrong. Saying so beats a row that looks
              like a finding. */}
          <AnswerWarnings warnings={loaded.answer.warnings} />

          {loaded.answer.engagementUnknown ? (
            <UnknownEngagementNotice slug={query.engagement as string} />
          ) : loaded.answer.milestones.length === 0 ? (
            <EmptyState
              headline={
                query.filtered
                  ? "No milestone matches these filters."
                  : "No contract milestones are recorded."
              }
              detail="Enter milestones in the Registry. Each appears here with its amount, due date, acceptance criteria, coverage state, shipped state and invoice state."
            />
          ) : (
            <>
              <CommittedTotalsStrip totals={loaded.answer.totals} />
              <CommittedTable
                milestones={loaded.answer.milestones}
                refs={loaded.refs}
              />
              <CommittedLegend />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

/**
 * The legend, and why a dense screen earns one.
 *
 * Spec 5a asks for an instrument panel read in ten-second glances, and an
 * instrument panel's markings are part of the instrument. Four of the
 * distinctions on this table are ones a reader can only act on if they know
 * which of two similar words they are looking at — `claimed` against `billable`
 * is a decision about whether to send an invoice.
 *
 * It is a `<details>`, closed by default, so it costs nothing in the ten-second
 * case and is there in the "wait, which one is this" case.
 */
function CommittedLegend() {
  return (
    <details data-verify-unit="committed-legend" className="text-sm">
      <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs underline underline-offset-2">
        What these states mean
      </summary>
      <dl className="text-muted-foreground mt-2 grid gap-x-4 gap-y-2 sm:grid-cols-2">
        <LegendRow term="open">
          FR-50: not every acceptance requirement is covered. Nothing to send.
        </LegendRow>
        <LegendRow term="claimed">
          Covered only by tests whose certifier executed the work. FR-51: a
          review request and not an invoice.
        </LegendRow>
        <LegendRow term="billable">
          FR-50: every acceptance requirement is covered by a passing test
          somebody other than the builder certified.
        </LegendRow>
        <LegendRow term="contested">
          Billable, and an open critical defect stands against one of its
          acceptance requirements. FR-79: flagged, and never presented as clean.
        </LegendRow>
        <LegendRow term="covered">
          FR-47: a passing test proves the requirement. This says nothing about
          whether it is deployed.
        </LegendRow>
        <LegendRow term="shipped">
          A release names the requirement, in the environments listed. FR-75:
          built and deployed are different claims.
        </LegendRow>
        <LegendRow term="regressed">
          FR-70: this acceptance requirement was covered and is not covered now.
        </LegendRow>
        <LegendRow term="unreadable">
          The stored amount would not decrypt. Excluded from the totals and
          counted — it is not being treated as zero.
        </LegendRow>
        <div className="flex items-baseline gap-2 sm:col-span-2">
          <StateBadge state="unparsed" />
          <span className="text-xs">
            A defect against one of the acceptance requirements whose severity
            the parser could not classify. It cannot trigger FR-79's contested
            state, so it is stated here rather than dropped.
          </span>
        </div>
      </dl>
    </details>
  );
}

function LegendRow({
  term,
  children,
}: {
  term: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="ident text-foreground shrink-0 text-xs font-medium">
        {term}
      </dt>
      <dd className="text-xs">{children}</dd>
    </div>
  );
}
