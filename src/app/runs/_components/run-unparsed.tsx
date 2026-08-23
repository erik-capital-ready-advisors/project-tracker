import { AlertTriangle, CircleHelp } from "lucide-react";

import type { RunUnparsed, RunUnparsedGap } from "@/lib/runs-load";
import { unparsedState } from "@/lib/unparsed-display";
import { cn } from "@/lib/utils";

/**
 * FR-94 -- **this run's own** unparsed count, on its own row.
 *
 * ## It borrows the rule, not the component
 *
 * `@/components/unparsed-count` is FR-58's global badge and
 * `work-items/_components/listing-unparsed.tsx` is the per-page one. Neither is
 * reused here and neither should be: the global badge assumes one instance per
 * page, and the per-page one says "on this page", which is a false sentence in a
 * table cell where the number describes a single run. So this takes the *rule*
 * from `@/lib/unparsed-display` -- exactly as `ListingUnparsed`'s own header
 * says it does -- and carries its own `data-verify-unit`, because it answers a
 * narrower question than either.
 *
 * The rule, which is the thing that must not be got wrong: **an unknown count
 * never renders as zero.** Three states, never two.
 *
 *   unknown  the count could not be read. Says so, with a `?` and no number.
 *   zero     nothing in this run went unclassified. A claim, stated deliberately.
 *   nonzero  fuchsia, because fuchsia means `unparsed` and nothing else.
 *
 * ## The breakdown is in the title, and one line of it defuses a real confusion
 *
 * A run's count and the shell's badge are **different populations and they
 * disagree on today's data**: the badge reads `0 unparsed` while run `b0952e`
 * reads `1`, because `fleet_run.verdict` is literally `'unparsed'` and
 * `fleet_run` is not one of the three tables FR-58's census counts. Two numbers
 * in one viewport that disagree, with nothing saying why, is the miniature of
 * the exact failure this product exists to end -- Erik merging two lists in his
 * head. So the title states the components and says plainly that the run's own
 * verdict is counted here and nowhere else.
 *
 * Whether `fleet_run.verdict` should join FR-58's global population is queued
 * for Erik by `i1` rather than decided in a table cell.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-unparsed"
 *   data-verify-state             unknown | zero | nonzero
 *   data-verify-count             the total; ABSENT when the state is unknown,
 *                                 so an assertion can tell unknown from zero
 *                                 without parsing the label
 *   data-verify-work-items        the scoped work-item count, or "unknown"
 *   data-verify-gates             unparsed or unrecognised gate outcomes
 *   data-verify-verdict-unparsed  "true" when the run's own verdict is unparsed
 */

const GAP_POPULATION: Record<RunUnparsedGap["population"], string> = {
  defect: "defects",
  test_result: "test results",
};

const GAP_REASON: Record<RunUnparsedGap["reason"], string> = {
  no_run_edge: "nothing in the schema links one to a run",
};

/**
 * The populations FR-58 counts globally that **cannot be narrowed to a run**,
 * named rather than silently omitted. "This run has no unparsed defects" and
 * "nothing can say which defects this run opened" are different statements and
 * only the second is true.
 */
function gapSentence(gaps: readonly RunUnparsedGap[]): string {
  if (gaps.length === 0) return "";

  const reasons = new Set(gaps.map((gap) => GAP_REASON[gap.reason]));
  const populations = gaps.map((gap) => GAP_POPULATION[gap.population]);
  const listed =
    populations.length === 1
      ? populations[0]
      : `${populations.slice(0, -1).join(", ")} and ${populations[populations.length - 1]}`;

  return (
    ` Unparsed ${listed} are not counted here, because ` +
    `${[...reasons].join("; ")}.`
  );
}

function breakdown(unparsed: RunUnparsed): string {
  const gaps = gapSentence(unparsed.gaps);
  const { total, workItems } = unparsed;

  // `runUnparsed` returns a null total exactly when the work-item count could
  // not be read, so narrowing on both is the same test written honestly rather
  // than a defensive default that would print an unread count as `0`.
  if (total === null || workItems === null) {
    return (
      "This run's unparsed count could not be read, so no total is stated. " +
      "A partial total would understate it, and an understated unparsed count " +
      "is indistinguishable from a healthy one." +
      gaps
    );
  }

  const verdict = unparsed.verdictUnparsed
    ? " and this run's own verdict, which the ingest could not classify. That " +
      "last one is counted here and in no other total: the badge in the header " +
      "counts work items, defects and test results, and a fleet run is none of " +
      "those -- so the two numbers can disagree without either being wrong."
    : ". This run's own verdict was classified, so it adds nothing here.";

  return (
    `${total} unparsed for this run: ` +
    `${workItems} work ${workItems === 1 ? "item" : "items"}, ` +
    `${unparsed.gates} gate ${unparsed.gates === 1 ? "outcome" : "outcomes"}` +
    verdict +
    gaps
  );
}

export function RunUnparsedCell({ unparsed }: { unparsed: RunUnparsed }) {
  const state = unparsedState(unparsed.total);

  return (
    <span
      data-verify-unit="run-unparsed"
      data-verify-state={state}
      {...(state === "unknown"
        ? {}
        : { "data-verify-count": unparsed.total as number })}
      data-verify-work-items={unparsed.workItems ?? "unknown"}
      data-verify-gates={unparsed.gates}
      data-verify-verdict-unparsed={unparsed.verdictUnparsed ? "true" : "false"}
      title={breakdown(unparsed)}
      className={cn(
        "ident inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-xs leading-none whitespace-nowrap",
        state === "zero" && "border-border text-muted-foreground",
        state === "nonzero" &&
          "border-state-unparsed/40 bg-state-unparsed/10 text-state-unparsed font-semibold",
        state === "unknown" &&
          "border-state-blocked/40 bg-state-blocked/10 text-state-blocked border-dashed",
      )}
    >
      {state === "nonzero" ? (
        <AlertTriangle aria-hidden className="size-3.5" />
      ) : null}
      {state === "unknown" ? (
        <CircleHelp aria-hidden className="size-3.5" />
      ) : null}
      {state === "unknown" ? "unparsed ?" : `${unparsed.total as number} unparsed`}
    </span>
  );
}
