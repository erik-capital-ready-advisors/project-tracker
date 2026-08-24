import { StateBadge } from "@/components/state-badge";
// The one runtime value this file needs comes from its DEFINITION module rather
// than from `@/lib/runs-load`'s re-export of it. `runs-load` is `server-only`
// and is the module a test replaces wholesale to mount this screen without a
// database -- pulling a constant through it would leave `ORIGIN_LABEL` keyed on
// `undefined` under test while looking perfectly correct in the source. Types
// still come from `runs-load`, the stated boundary, because type imports are
// erased and carry no such hazard.
import { VERDICT_SOURCE_QA_REPORT } from "@/lib/runs-display";
import type {
  RunVerdictModel,
  SoleVerdictReason,
  VerdictSource,
} from "@/lib/runs-load";
import { cn } from "@/lib/utils";

/**
 * FR-95 -- a run's verdict, exactly as the artifact recorded it.
 *
 * ## This component owns no transformation, and that is the whole point
 *
 * FR-95 says "emitted exactly as the artifact recorded it". `@/lib/runs-display`
 * refuses to own a transformation so that a call site cannot inherit one, and
 * this is the call site: the stored string is rendered **byte-for-byte**. Not
 * title-cased, not mapped to a friendlier word, and `unparsed` is never hidden
 * behind a dash. What varies below is the *chrome around* the word -- never the
 * word.
 *
 * ## Four states, because "one source agreed with itself" is not agreement
 *
 * `reconcileVerdicts` distinguishes `none`, `single`, `agreed` and `disagreed`,
 * and flattening the middle two is the failure this component exists to avoid.
 * A run whose single verdict column happens to be readable has not *satisfied*
 * FR-95's corroboration condition -- nothing tested it. So `single` renders the
 * verdict **and says that only one source exists**, which is a weaker claim than
 * `agreed` makes and looks like one.
 *
 * `disagreed` renders **every source, each labelled with its origin**, and picks
 * no winner. `manifest-cd414c.md` marking `u4` pending while
 * `checkpoint-cd414c.md` says it merged is the standing example: the
 * disagreement is the data, not a defect to reconcile away.
 *
 * ## No source is synthesised here to make that branch light up
 *
 * The ledger stores one verdict column per run, so `disagreed` is unreachable
 * from today's data and this component does not manufacture a second source out
 * of the `gates` payload to change that -- a gate outcome is a different kind of
 * fact from a verdict, and a disagreement this product invented would be an
 * artefact of its own modelling rather than something two artifacts said.
 * `runVerdict`'s header states the same refusal on the read side. The branch is
 * live, tested code driven by fabricated two-source input, ready for the day a
 * second source is genuinely recorded.
 *
 * ## Colour
 *
 * `unparsed` reuses the existing hatched fuchsia `<StateBadge>` -- spec 5a
 * requires one colour per state everywhere it appears, and this screen invents
 * no second treatment for it. Every other verdict word rides the neutral ladder,
 * exactly as `question-table.tsx`'s `StatusPill` does, because a QA verdict is
 * not one of 5a's five named semantic states. A word outside `QA_VERDICTS`
 * renders on the `blocked` family so an unrecognised verdict is visibly wrong
 * rather than blending in.
 *
 * **Disagreement carries no colour of its own.** `state-contested` was the
 * tempting reuse and is the wrong one: FR-79 gives it a specific commercial
 * meaning -- a billable milestone flagged by an open critical defect -- and 5a
 * requires a state colour to mean one thing everywhere. The disagreement is
 * carried structurally instead, by one labelled row per source plus a stated
 * line. Recorded in the build report as a choice for Erik if a second source
 * ever lands.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-verdict"          data-verify-agreement,
 *                                            data-verify-source-count,
 *                                            data-verify-distinct-count
 *   data-verify-unit="run-verdict-source"   data-verify-origin,
 *                                            data-verify-verdict (byte-for-byte),
 *                                            data-verify-recognised
 */

/**
 * Human labels for the origins this product can currently record.
 *
 * An unknown origin falls back to its **machine key** rather than to a guess or
 * a blank. A source whose label nobody wrote is still a source, and dropping it
 * would be the one thing FR-95 forbids.
 */
const ORIGIN_LABEL: Record<string, string> = {
  [VERDICT_SOURCE_QA_REPORT]: "QA report",
};

function originLabel(origin: string): string {
  return ORIGIN_LABEL[origin] ?? origin;
}

/**
 * Why fewer than two sources exist, in the operator's words rather than a code.
 * `@/lib/runs-display` ships the typed reason and deliberately no prose, so the
 * wording lives here, once.
 */
const SOLE_REASON_TITLE: Record<SoleVerdictReason, string> = {
  no_verdict_recorded:
    "No verdict was recorded for this run. This is not a verdict of unparsed -- " +
    "that is a classification the ingest actually made. Here the column held " +
    "nothing at all.",
  one_verdict_column:
    "The ledger stores one verdict per run, so nothing corroborates this one. " +
    "The gates payload beside it records build gates, which are a different " +
    "kind of fact: a passing build is not a verdict on the run.",
};

/** One verdict word, rendered exactly as stored. */
function VerdictToken({ source }: { source: VerdictSource }) {
  if (source.verdict === "unparsed") {
    return <StateBadge state="unparsed" />;
  }

  return (
    <span
      className={cn(
        "ident inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap",
        source.recognised
          ? "border-border text-foreground/80"
          : "border-state-blocked/50 bg-state-blocked/10 text-state-blocked font-semibold",
      )}
      title={
        source.recognised
          ? undefined
          : "This verdict is not one of the words the QA report template can " +
            "emit. It is shown as recorded rather than corrected."
      }
    >
      {source.verdict}
    </span>
  );
}

function SourceRow({
  source,
  showOrigin,
}: {
  source: VerdictSource;
  showOrigin: boolean;
}) {
  return (
    <span
      data-verify-unit="run-verdict-source"
      data-verify-origin={source.origin}
      data-verify-verdict={source.verdict}
      data-verify-recognised={source.recognised ? "true" : "false"}
      className="flex items-center gap-1.5"
    >
      {showOrigin ? (
        <span className="ident text-muted-foreground/85 text-[0.6875rem]">
          {originLabel(source.origin)}
        </span>
      ) : null}
      <VerdictToken source={source} />
    </span>
  );
}

export function RunVerdict({ verdict }: { verdict: RunVerdictModel }) {
  const { agreement, sources, distinct, soleReason } = verdict;

  return (
    <span
      data-verify-unit="run-verdict"
      data-verify-agreement={agreement}
      data-verify-source-count={sources.length}
      data-verify-distinct-count={distinct.length}
      className="flex flex-col items-start gap-1"
    >
      {agreement === "none" ? (
        <span
          className="ident text-muted-foreground text-xs"
          title={SOLE_REASON_TITLE[soleReason ?? "no_verdict_recorded"]}
        >
          not recorded
        </span>
      ) : (
        sources.map((source, index) => (
          <SourceRow
            key={`${source.origin}-${index}`}
            source={source}
            showOrigin={agreement === "disagreed"}
          />
        ))
      )}

      {agreement === "single" ? (
        <span
          className="text-muted-foreground/85 text-[0.6875rem]"
          title={SOLE_REASON_TITLE[soleReason ?? "one_verdict_column"]}
        >
          one source, uncorroborated
        </span>
      ) : null}

      {agreement === "agreed" ? (
        <span className="text-muted-foreground/85 text-[0.6875rem]">
          {sources.length} sources agree
        </span>
      ) : null}

      {agreement === "disagreed" ? (
        <span
          className="text-foreground text-[0.6875rem] font-semibold"
          title="These sources recorded different verdicts for the same run. Both are shown and neither is preferred -- the disagreement is the finding."
        >
          sources disagree
        </span>
      ) : null}
    </span>
  );
}
