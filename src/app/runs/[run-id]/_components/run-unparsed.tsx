import { AlertTriangle, CircleHelp } from "lucide-react";

import type { RunUnparsed, RunUnparsedGap } from "@/lib/runs-load";
import { unparsedState } from "@/lib/unparsed-display";
import { cn } from "@/lib/utils";

/**
 * FR-94 — this run's own unparsed count.
 *
 * ## It is a different number from the shell badge, and that is not a bug
 *
 * `@/components/unparsed-count` is mounted once in the app shell and reports
 * FR-58's **global** census. FR-94 asks each run row and detail view to state
 * *its own* count, which is a narrower population plus two facts the census
 * cannot hold. On today's data the two disagree outright: the badge reads
 * `0 unparsed` while run `b0952e` reads `1`, because `fleet_run.verdict` is
 * literally the word `unparsed` and the global census counts three tables that
 * do not include `fleet_run`.
 *
 * A bare `1` beside a badge reading `0` looks like a defect in one of them. So
 * this panel states its components — work items, gate outcomes, the run's own
 * verdict — and names the two populations that **cannot** be scoped to a run at
 * all. i1 queued for Erik whether `fleet_run.verdict` should join FR-58's global
 * population; until he rules, the honest thing is to show the arithmetic rather
 * than a number that appears to contradict the header.
 *
 * ## Three states, from the one rule
 *
 * `@/lib/unparsed-display`: **an unknown count must never render as zero.**
 * `total` is `null` when the per-run work-item count could not be read, and a
 * partial sum would understate — an understated unparsed count is
 * indistinguishable from a healthy one. So `unknown` renders with no number at
 * all, in the same dashed `blocked` treatment `UnparsedBreakdown` uses, and
 * `data-verify-total` is absent rather than `0`.
 *
 * The treatment below is `@/components/unparsed-breakdown`'s, reused: same three
 * states, same tokens, same glyphs, same rule that a component which could not
 * be counted renders `—` and never `0`. Nothing here adds a colour.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-unparsed"
 *   data-verify-state           "zero" | "nonzero" | "unknown"
 *   data-verify-total           absent when the state is unknown
 *   data-verify-work-items      the per-run count, or absent when unread
 *   data-verify-gates           this run's unparsed gate outcomes
 *   data-verify-verdict         "true" | "false" — is the verdict itself unparsed
 *   data-verify-unit="run-unparsed-part"
 *   data-verify-part            "workItems" | "gates" | "verdict"
 *   data-verify-count           absent on `workItems` when it could not be read
 *   data-verify-unit="run-unparsed-gap"
 *   data-verify-population      a census population that cannot be run-scoped
 */

const GAP_LABEL: Record<RunUnparsedGap["population"], string> = {
  defect: "defects",
  test_result: "test results",
};

const GAP_REASON: Record<RunUnparsedGap["reason"], string> = {
  no_run_edge:
    "cannot be narrowed to a run — nothing in the schema connects one to a run",
};

export function RunUnparsedPanel({ unparsed }: { unparsed: RunUnparsed }) {
  const state = unparsedState(unparsed.total);

  return (
    <div
      data-verify-unit="run-unparsed"
      data-verify-state={state}
      {...(state === "unknown"
        ? {}
        : { "data-verify-total": unparsed.total as number })}
      {...(unparsed.workItems === null
        ? {}
        : { "data-verify-work-items": unparsed.workItems })}
      data-verify-gates={unparsed.gates}
      data-verify-verdict={unparsed.verdictUnparsed ? "true" : "false"}
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border px-3 py-2 text-xs",
        state === "zero" && "border-border text-muted-foreground",
        state === "nonzero" &&
          "border-state-unparsed/40 bg-state-unparsed/5 text-state-unparsed",
        state === "unknown" &&
          "border-state-blocked/40 bg-state-blocked/5 text-state-blocked border-dashed",
      )}
    >
      <span className="ident inline-flex items-center gap-1.5 font-semibold">
        {state === "nonzero" ? (
          <AlertTriangle aria-hidden className="size-3.5" />
        ) : null}
        {state === "unknown" ? (
          <CircleHelp aria-hidden className="size-3.5" />
        ) : null}
        {state === "unknown"
          ? "unparsed count unavailable"
          : `${unparsed.total as number} unparsed in this run`}
      </span>

      <span className="text-muted-foreground inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <span
          className="ident"
          data-verify-unit="run-unparsed-part"
          data-verify-part="workItems"
          {...(unparsed.workItems === null
            ? {}
            : { "data-verify-count": unparsed.workItems })}
        >
          {/* A component that could not be counted says so. It never reads 0. */}
          {unparsed.workItems === null ? "—" : unparsed.workItems} work units
        </span>
        <span
          className="ident"
          data-verify-unit="run-unparsed-part"
          data-verify-part="gates"
          data-verify-count={unparsed.gates}
        >
          {unparsed.gates} gate outcomes
        </span>
        <span
          className="ident"
          data-verify-unit="run-unparsed-part"
          data-verify-part="verdict"
          data-verify-count={unparsed.verdictUnparsed ? 1 : 0}
        >
          {unparsed.verdictUnparsed
            ? "the run's own verdict"
            : "verdict classified"}
        </span>
      </span>

      {unparsed.gaps.length === 0 ? null : (
        <span className="text-muted-foreground basis-full">
          Not counted here:{" "}
          {unparsed.gaps.map((gap, index) => (
            <span
              key={gap.population}
              data-verify-unit="run-unparsed-gap"
              data-verify-population={gap.population}
            >
              {index === 0 ? "" : "; "}
              {GAP_LABEL[gap.population]} {GAP_REASON[gap.reason]}
            </span>
          ))}
          . Their absence from this total is a limit of the record, not a clean
          result.
        </span>
      )}

      {state === "unknown" ? (
        <span className="text-muted-foreground basis-full">
          The work-unit count could not be read, so no total is stated. Nothing
          here says this run classified everything.
        </span>
      ) : null}
    </div>
  );
}
