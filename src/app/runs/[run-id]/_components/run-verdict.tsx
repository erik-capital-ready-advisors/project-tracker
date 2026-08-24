import { StateBadge } from "@/components/state-badge";
import { VERDICT_SOURCE_QA_REPORT } from "@/lib/runs-load";
import type {
  RunVerdictModel,
  SoleVerdictReason,
  VerdictAgreement,
  VerdictSource,
} from "@/lib/runs-load";
import { cn } from "@/lib/utils";

import { Gap } from "./gap";

/**
 * FR-95 — a run's verdict, emitted exactly as the artifact recorded it.
 *
 * ## Nothing here transforms the value
 *
 * No title-casing, no mapping `unparsed` to a friendlier word, no hiding it
 * behind a dash. `i1`'s `runVerdict` passes the stored string through untrimmed
 * and this component prints it. The one branch that does not print a raw string
 * is `unparsed`, and that is not a transformation: `StateBadge` renders the
 * literal word `unparsed` in the reserved hatched fuchsia, which is the same
 * treatment that word carries on every other surface in this product. A verdict
 * spelled with surrounding whitespace is not equal to `"unparsed"` and falls
 * through to the mono text, still byte-for-byte.
 *
 * ## "Both are shown" — and saying so when there is only one
 *
 * FR-95's clause is *where the manifest and the checkpoint disagree, both are
 * shown*. Against this schema there is one `verdict` column, so `agreement` is
 * `single` on every run in the ledger today and the `agreed` / `disagreed`
 * branches are unreachable from real data.
 *
 * Two things follow, and both are deliberate:
 *
 *   * **No second source is synthesised to make the branch light up.** The
 *     `gates` payload is a build gate, not a verdict on the run — D1 is explicit
 *     — and a disagreement this product manufactured out of its own modelling
 *     would be exactly the regex-widening failure wearing a different hat.
 *   * **`single` does not render as `agreed`.** One source that agrees with
 *     itself has not tested FR-95's condition; it has only met it vacuously. The
 *     screen says which of the two it is, because a corroborated verdict and an
 *     uncorroborated one are different claims about how much this ledger knows.
 *
 * `disagreed` lists every source, labelled, and picks no winner. That is the
 * standing rule `manifest-cd414c.md` marking `u4` pending while
 * `checkpoint-cd414c.md` says it merged is the example of: the disagreement is
 * the data.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-verdict"
 *   data-verify-agreement  "none" | "single" | "agreed" | "disagreed"
 *   data-verify-sources    how many sources recorded one
 *   data-verify-distinct   how many distinct strings they recorded
 *   data-verify-unit="run-verdict-source"
 *   data-verify-origin      the source's machine key
 *   data-verify-verdict     the stored string, byte-for-byte
 *   data-verify-recognised  "true" | "false"
 */

/** The human name for each source this product can enumerate. */
const ORIGIN_LABEL: Record<string, string> = {
  [VERDICT_SOURCE_QA_REPORT]: "QA report status line",
};

/**
 * What a reader is being told about corroboration, in the house voice.
 *
 * `single` is the sentence that matters: it is the one an inattentive reading
 * would take for agreement.
 */
const AGREEMENT_NOTE: Record<VerdictAgreement, string | null> = {
  none: null,
  single: null,
  agreed: "Every source recorded the same word.",
  disagreed:
    "The sources recorded different words. Both are shown and neither is preferred — the disagreement is the record, not a fault to reconcile.",
};

const SOLE_REASON_NOTE: Record<SoleVerdictReason, string> = {
  no_verdict_recorded:
    "No source recorded a verdict for this run. That is not a passing run and not a failing one; it is a run whose grade was never written down.",
  one_verdict_column:
    "One source recorded it, and one is all this ledger holds — `fleet_run` carries a single verdict column. Nothing here corroborates the word and nothing contradicts it, so FR-95's cross-check is untested rather than satisfied.",
};

/** The verdict string itself, unaltered. */
function VerdictWord({ source }: { source: VerdictSource }) {
  const body =
    source.verdict === "unparsed" ? (
      <StateBadge state="unparsed" />
    ) : (
      <span
        className={cn(
          "ident inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap",
          source.recognised
            ? "border-foreground/40 bg-foreground/10 text-foreground font-medium"
            : "border-state-blocked/50 bg-state-blocked/10 text-state-blocked font-semibold",
        )}
        title={
          source.recognised
            ? undefined
            : "This is not one of the words a QA report's status line can emit. It is shown exactly as stored rather than corrected — an unrecognised verdict is a finding about the artifact, not a value to repair."
        }
      >
        {source.verdict}
      </span>
    );

  return (
    <span
      data-verify-unit="run-verdict-source"
      data-verify-origin={source.origin}
      data-verify-verdict={source.verdict}
      data-verify-recognised={source.recognised ? "true" : "false"}
      className="inline-flex flex-wrap items-center gap-1.5"
    >
      {body}
      <span className="text-muted-foreground text-xs">
        {ORIGIN_LABEL[source.origin] ?? source.origin}
      </span>
    </span>
  );
}

export function RunVerdict({ verdict }: { verdict: RunVerdictModel }) {
  // `none` states its reason inside the `Gap` below, so it takes no second copy
  // of the same sentence underneath it.
  const note =
    verdict.agreement === "none"
      ? null
      : (AGREEMENT_NOTE[verdict.agreement] ??
        (verdict.soleReason === null
          ? null
          : SOLE_REASON_NOTE[verdict.soleReason]));

  return (
    <div
      data-verify-unit="run-verdict"
      data-verify-agreement={verdict.agreement}
      data-verify-sources={verdict.sources.length}
      data-verify-distinct={verdict.distinct.length}
      className="flex flex-col gap-1.5"
    >
      {verdict.agreement === "none" ? (
        <Gap
          field="verdict"
          headline="no verdict recorded"
          detail={SOLE_REASON_NOTE.no_verdict_recorded}
          inline
        />
      ) : (
        <div className="flex flex-col gap-1.5">
          {verdict.sources.map((source) => (
            <VerdictWord key={source.origin} source={source} />
          ))}
        </div>
      )}

      {note === null ? null : (
        <p className="text-muted-foreground max-w-2xl text-xs">{note}</p>
      )}
    </div>
  );
}
