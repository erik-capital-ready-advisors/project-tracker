import Link from "next/link";

import { Absent } from "@/components/answer-chips";
import {
  DetailField,
  DetailFields,
  DetailSection,
} from "@/components/entity-detail";
import { EntityRefList } from "@/components/entity-ref";
import { Screen } from "@/components/screen";
import { isoMinute } from "@/lib/display-format";
import type {
  DetailEngagement,
  DispatchUsage,
  DurationUnknownReason,
  RunDetail,
  RunDuration,
  TestTriple,
} from "@/lib/runs-load";

import { Gap } from "./gap";
import { RunDefects } from "./run-defects";
import { RunGates } from "./run-gates";
import { RunQuestionTable } from "./run-question-table";
import { RunUnparsedPanel } from "./run-unparsed";
import { RunVerdict } from "./run-verdict";
import { RunWorkUnitTable } from "./run-work-unit-table";

/**
 * FR-93 / FR-94 / FR-95 — one fleet run, whole.
 *
 * ## Why this is not `<EntityDetail>`
 *
 * The eight M2.7 detail views share that shell and this one deliberately does
 * not, for a structural reason rather than a stylistic one: `EntityDetail`
 * requires `kind: EntityKind`, and `ENTITY_KINDS` is FR-81's **closed set of
 * eight**, pinned by `tests/entity-routes.test.ts` and `tests/m27-gate.test.ts`.
 * `fleet_run` is not among them and this unit does not add it — `/runs/[run-id]`
 * is keyed by the human run id rather than a uuid, so it was never an
 * `entityHref` destination, and widening a set two gates assert on to gain a
 * heading would be a change made in passing to a rule five views depend on.
 *
 * So the shell is rebuilt from its parts: `Screen` for the title and the
 * question, an identity row in the same shape `EntityDetail` draws, and
 * `DetailSection` / `DetailFields` / `DetailField` below it — all of which are
 * kind-agnostic and are imported rather than copied. Visually this is the ninth
 * detail view; structurally it is the first one that is not an entity.
 *
 * ## Everything this run points at IS one of the eight
 *
 * Work units, questions, defects and requirements all arrive as `DetailRef`,
 * which *is* `<EntityRef>`'s props by definition, so FR-12's dangling treatment
 * and FR-83's never-a-link rule come for free rather than being re-implemented
 * against a run-local link shape.
 *
 * ## Section order answers the question the screen is for
 *
 * Identity and outcome first (what happened), then this run's own unparsed count
 * (what it could not classify), then the gates it reported, then the four
 * populations FR-93 enumerates in its own order: work units, questions, defects,
 * requirements. The counts sit in each section heading so a reader knows the
 * size of a list before scrolling it — 20 units and 96 questions on today's one
 * run, both rendered exhaustively.
 *
 * ## Nothing here introduces a design decision
 *
 * §5a is approved in practice (`spec/prod.md`, 2026-08-22). Every treatment
 * below already exists in this repository: the detail-view field primitives, the
 * work-item chip ladder, `answer-chips`' `Absent`, `StateBadge`'s reserved
 * hatched `unparsed`, and `UnparsedBreakdown`'s three-state box. The one new
 * component is `Gap`, and it is `UnparsedBreakdown`'s `unknown` treatment given
 * a name so three values that would otherwise read as findings can say what they
 * are. No colour, no token and no spacing idiom is new.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-detail"
 *   data-verify-run       the human run id
 *   data-verify-id        the `fleet_run` uuid
 *   data-verify-unit="run-duration"     data-verify-state, data-verify-minutes
 *   data-verify-unit="run-dispatches"   data-verify-state
 *   data-verify-unit="run-tests"        data-verify-state
 *   data-verify-unit="run-requirements" data-verify-count, data-verify-dangling
 *
 * plus the contracts declared in `run-verdict`, `run-gates`, `run-unparsed`,
 * `run-defects`, `run-work-unit-table` and `run-question-table`.
 */

/**
 * The engagement, as a plain `next/link` and deliberately not an `<EntityRef>`.
 *
 * `engagement` is not one of FR-81's eight kinds and `tests/m27-gate.test.ts`
 * asserts `ENTITY_KINDS` equals exactly those eight, so an
 * `<EntityRef kind="engagement">` would turn a passing gate red. FR-80 is met in
 * substance by linking `/registry/<slug>`, which has been the engagement's
 * detail view since M1.3. This is the same treatment the three Wave C detail
 * views use, in the same words.
 */
function EngagementLink({ engagement }: { engagement: DetailEngagement | null }) {
  if (engagement === null) {
    return (
      <Absent title="This run is not attached to an engagement. That is a gap in the record." />
    );
  }

  return (
    <Link
      href={`/registry/${engagement.slug}`}
      data-verify-unit="detail-engagement"
      data-verify-slug={engagement.slug}
      className="inline-flex flex-wrap items-baseline gap-2 rounded-sm underline-offset-2 hover:underline"
    >
      <span className="text-foreground">{engagement.clientName}</span>
      <span className="ident text-muted-foreground text-xs">
        {engagement.slug}
      </span>
    </Link>
  );
}

/** One mono fact that is not a reference and never becomes a link. */
function Fact({ value }: { value: string | null }) {
  return value === null ? null : (
    <span className="ident text-xs break-all">{value}</span>
  );
}

const DURATION_UNKNOWN: Record<DurationUnknownReason, string> = {
  no_start:
    "No start was recorded for this run, so there is no duration to compute. That is different from a run that took no time.",
  no_end:
    "No end was recorded for this run. Either it has not finished or nothing wrote the timestamp; the ledger cannot tell those apart.",
  ends_before_start:
    "This run's recorded end precedes its recorded start. The value is reported rather than clamped to zero — a nonsense timestamp turned into a clean-looking `0m` is a wrong answer that looks checked.",
};

/**
 * FR-92's duration, and the distinction D3 exists for.
 *
 * A measured zero renders `0m`, because two equal timestamps are data: run
 * `b0952e` carries `started_at = ended_at` and genuinely took no recorded time.
 * A missing timestamp renders as a stated gap and never as `0m`. Collapsing the
 * two would let "we did not record when this finished" read as "this finished
 * instantly".
 */
function Duration({ duration }: { duration: RunDuration }) {
  if (duration.state === "unknown") {
    return (
      <span
        data-verify-unit="run-duration"
        data-verify-state="unknown"
        data-verify-reason={duration.reason}
      >
        <Gap
          field="duration"
          headline="not recorded"
          detail={DURATION_UNKNOWN[duration.reason]}
          inline
        />
      </span>
    );
  }

  return (
    <span
      data-verify-unit="run-duration"
      data-verify-state="known"
      data-verify-minutes={duration.minutes}
      className="ident text-xs tabular-nums"
      title={
        duration.minutes === 0
          ? "The recorded start and end are the same instant. This is a measured zero, not a missing value."
          : undefined
      }
    >
      {duration.label}
    </span>
  );
}

/**
 * FR-92's "dispatches used against cap", and the finding it must not hide.
 *
 * `dispatch_cap` and `dispatches_used` have **no producer anywhere in this
 * product** — nothing writes either column. So `unknown` is not a degraded
 * branch this component falls back to; it is the only branch that will ever run
 * until an ingest path starts writing them, and it would look correct forever.
 * `0 of 0` would be a sentence nothing in the ledger supports, so it says the
 * columns are unwritten instead of inventing a number for them.
 */
function Dispatches({ dispatches }: { dispatches: DispatchUsage }) {
  if (dispatches.state === "unknown") {
    return (
      <span data-verify-unit="run-dispatches" data-verify-state="unknown">
        <Gap
          field="dispatches"
          headline="never recorded"
          detail="Neither the dispatch cap nor the number used was written for this run. No ingest path in this product writes either column, so this is the state of every run in the ledger — it is not a run that used no dispatches."
          inline
        />
      </span>
    );
  }

  if (dispatches.state === "partial") {
    return (
      <span
        data-verify-unit="run-dispatches"
        data-verify-state="partial"
        {...(dispatches.used === null
          ? {}
          : { "data-verify-used": dispatches.used })}
        {...(dispatches.cap === null ? {} : { "data-verify-cap": dispatches.cap })}
        className="inline-flex flex-wrap items-center gap-2"
      >
        <span className="ident text-xs tabular-nums">
          {dispatches.used ?? "—"} of {dispatches.cap ?? "—"}
        </span>
        <Gap
          field="dispatches-partial"
          headline={dispatches.used === null ? "used not recorded" : "cap not recorded"}
          detail="Only one half of this pair was written. The missing half stays missing rather than being filled from a manifest budget — a cap this product inferred is not a cap the run ran under."
          inline
        />
      </span>
    );
  }

  return (
    <span
      data-verify-unit="run-dispatches"
      data-verify-state="known"
      data-verify-used={dispatches.used}
      data-verify-cap={dispatches.cap}
      className="ident text-xs tabular-nums"
    >
      {dispatches.label}
    </span>
  );
}

/**
 * FR-92's test triple — a claim the run's own report made, never an observation
 * this product performed.
 *
 * All three are NULL on the only run in the ledger. `0 / 0 / 0` would assert
 * that a suite ran and found nothing, which is a different and false statement.
 */
function Tests({ tests }: { tests: TestTriple }) {
  if (tests.state === "unknown") {
    return (
      <span data-verify-unit="run-tests" data-verify-state="unknown">
        <Gap
          field="tests"
          headline="no counts stated"
          detail="This run's report stated no test counts at all, so none were stored. That is different from a suite that ran and found nothing — and these are counts the artifact claimed, never counts this product observed."
          inline
        />
      </span>
    );
  }

  return (
    <span
      data-verify-unit="run-tests"
      data-verify-state={tests.state}
      {...(tests.passed === null ? {} : { "data-verify-passed": tests.passed })}
      {...(tests.failed === null ? {} : { "data-verify-failed": tests.failed })}
      {...(tests.skipped === null
        ? {}
        : { "data-verify-skipped": tests.skipped })}
      className="ident inline-flex flex-wrap items-center gap-x-2 text-xs tabular-nums"
      title="Counts this run's own report claimed. Nothing in this product observed them."
    >
      {tests.label ?? (
        <>
          <span>{tests.passed ?? "—"} passed</span>
          <span>{tests.failed ?? "—"} failed</span>
          <span>{tests.skipped ?? "—"} skipped</span>
        </>
      )}
    </span>
  );
}

/** A section heading's count, in the same mono the identifiers use. */
function Count({ n, noun }: { n: number; noun: string }) {
  return (
    <span className="ident text-muted-foreground text-xs">
      {n} {noun}
      {n === 1 ? "" : "s"}
    </span>
  );
}

export function RunDetailView({
  run,
  asOf,
}: {
  run: RunDetail;
  /** `YYYY-MM-DD`. FR-91 reference date, read once at the page. */
  asOf: string;
}) {
  return (
    <Screen
      title={run.runId}
      question="Everything one fleet run recorded: the units it dispatched, the questions it queued, the requirements it touched, and the gates it reported."
      requirements={["FR-93", "FR-94", "FR-95"]}
    >
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2"
        data-verify-unit="run-detail"
        data-verify-run={run.runId}
        data-verify-id={run.id}
      >
        <span className="ident text-muted-foreground text-xs">{run.runId}</span>
        <span className="text-muted-foreground text-xs">fleet run</span>
        <div className="ml-auto flex gap-2">
          <Link
            href="/runs"
            data-verify-unit="detail-back"
            className="text-muted-foreground text-xs underline underline-offset-2"
          >
            ← All runs
          </Link>
        </div>
      </div>

      {/* FR-94. This run's own count, which is a different population from the
          shell badge's global census — see `run-unparsed.tsx`. */}
      <RunUnparsedPanel unparsed={run.unparsed} />

      <div className="flex flex-col gap-4">
        <DetailSection
          heading="Run"
          requirements={["FR-92", "FR-95"]}
          verifyUnit="run-identity"
        >
          <DetailFields>
            <DetailField label="Engagement" absent="No engagement is recorded.">
              <EngagementLink engagement={run.engagement} />
            </DetailField>

            <DetailField label="Branch" absent="No branch was recorded." mono>
              <Fact value={run.branch} />
            </DetailField>

            <DetailField label="Mode" absent="No mode was recorded." mono>
              <Fact value={run.mode} />
            </DetailField>

            <DetailField
              label="Verdict"
              absent="No verdict was recorded for this run."
            >
              <RunVerdict verdict={run.verdict} />
            </DetailField>

            <DetailField label="Started" absent="No start was recorded." mono>
              <Fact value={isoMinute(run.startedAt)} />
            </DetailField>

            <DetailField label="Ended" absent="No end was recorded." mono>
              <Fact value={isoMinute(run.endedAt)} />
            </DetailField>

            <DetailField label="Duration" absent="No duration could be computed.">
              <Duration duration={run.duration} />
            </DetailField>

            <DetailField
              label="Dispatches"
              absent="Neither the cap nor the number used was recorded."
            >
              <Dispatches dispatches={run.dispatches} />
            </DetailField>

            <DetailField
              label="Tests reported"
              absent="This run's report stated no test counts."
            >
              <Tests tests={run.tests} />
            </DetailField>
          </DetailFields>
        </DetailSection>

        {/* FR-93 — rendered rather than dumped. */}
        <DetailSection heading="Gates" requirements={["FR-93"]} verifyUnit="run-gates-section">
          <RunGates gates={run.gates} />
        </DetailSection>

        <DetailSection
          heading="Work units"
          requirements={["FR-93"]}
          verifyUnit="run-work-units"
        >
          <div className="px-4 py-2.5">
            <Count n={run.workUnits.length} noun="work unit" />
            <span className="text-muted-foreground ml-2 text-xs">
              every unit this run dispatched, listed in full
            </span>
          </div>
          {run.workUnits.length === 0 ? (
            <p className="text-muted-foreground border-border max-w-2xl border-t px-4 py-3 text-xs">
              No work item in the ledger names this run. The edge exists and was
              queried; nothing carries it.
            </p>
          ) : (
            <RunWorkUnitTable units={run.workUnits} asOf={asOf} />
          )}
        </DetailSection>

        <DetailSection
          heading="Questions queued"
          requirements={["FR-93"]}
          verifyUnit="run-questions"
        >
          <div className="px-4 py-2.5">
            <Count n={run.questions.length} noun="question" />
            <span className="text-muted-foreground ml-2 text-xs">
              listed in full and never truncated; each opens where it was answered
            </span>
          </div>
          {run.questions.length === 0 ? (
            <p className="text-muted-foreground border-border max-w-2xl border-t px-4 py-3 text-xs">
              No open question in the ledger names this run. The column was
              queried and matched nothing.
            </p>
          ) : (
            <RunQuestionTable questions={run.questions} />
          )}
        </DetailSection>

        <DetailSection
          heading="Defects"
          requirements={["FR-93"]}
          verifyUnit="run-defects-section"
        >
          <RunDefects defects={run.defects} />
        </DetailSection>

        <DetailSection
          heading="Requirements touched"
          requirements={["FR-93", "FR-83"]}
          verifyUnit="run-requirements"
        >
          <div
            data-verify-unit="run-requirements-refs"
            data-verify-count={run.requirements.refs.length}
            data-verify-dangling={run.requirements.danglingCount}
            className="flex flex-col gap-2 px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Count n={run.requirements.refs.length} noun="requirement" />
              {run.requirements.danglingCount === 0 ? (
                <span className="text-muted-foreground text-xs">
                  every one resolves to a stored requirement
                </span>
              ) : (
                <span className="text-state-blocked ident text-xs font-semibold">
                  {run.requirements.danglingCount} resolve to nothing
                </span>
              )}
            </div>

            <div className="text-xs">
              <EntityRefList
                refs={run.requirements.refs}
                empty="No work item in this run claims to implement a requirement."
              />
            </div>

            <p className="text-muted-foreground max-w-2xl text-xs">
              Distinct refs reached through this run&rsquo;s work items.
              Requirement text is encrypted and its ref is not, so a requirement
              is named here by <span className="ident">FR-nn</span> and never by
              what it says.
            </p>
          </div>
        </DetailSection>
      </div>
    </Screen>
  );
}
