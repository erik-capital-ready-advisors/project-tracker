import type { StackRow, TriggerThresholds } from "@/lib/stacks-load";

/**
 * The `/stacks` screen's formatting, as pure functions over what `i1` already
 * counted.
 *
 * ## Nothing here derives a figure
 *
 * `@/lib/server/stacks/list.ts` counts and `@/lib/server/stacks/rule.ts`
 * decides; both are merged and both have their own tests. This module turns
 * their output into strings and nothing else. There is no second sum, no second
 * threshold comparison and no second engagement count — a screen that
 * re-derives a number it was handed is a screen that can disagree with its own
 * data layer, and the reader has no way to tell which half is wrong.
 *
 * It is a separate module from the components for the reason every parser in
 * this repository is: a pure function over frozen input is testable without a
 * DOM, and these particular strings are the FR-106 sentence and the FR-105
 * hours, which are the two things on this screen that must not be wrong.
 *
 * ## Q26 RULED — the word this module does not use
 *
 * `coverage` is not reused on this surface. The column, the control and every
 * label below say **covering** or **agent**, after `stack.agent_covering`,
 * which is the column's real name.
 */

/**
 * FR-109 — `agent_covering` is `null` because **nobody has said**, not because
 * the product looked and found nothing.
 *
 * The distinction is the whole of FR-109: which stacks the fleet covers is a
 * fact about `~/.claude/agents/`, a directory outside this repository and
 * unreadable from a worktree. A dash here would read as "no agent covers this",
 * which is a claim about that directory. This says who has not spoken instead.
 */
export const NO_AGENT_RECORDED = "nobody has said";

/**
 * FR-105's hours, formatted from the integer minutes the database holds.
 *
 * ## A measured zero is rendered as a zero, loudly
 *
 * `nextjs-supabase` carries a recorded `0` today — `i1` confirmed at the
 * database that the attributed session's `duration_minutes` is `0` and not
 * NULL. Zero hours on a stack the ledger has seen is a **measurement**, and
 * refusing to state it plainly would be the opposite of this product's rule
 * about NULL and zero: both halves of that pair have to be stated, not just the
 * absent one. So `0h` is the answer here, and the "hours may understate" caveat
 * is attached separately, keyed on `sessionsWithoutDuration` rather than on the
 * total being small.
 *
 * Minutes are formatted rather than a rounded hour count for the same reason
 * the comparison in `rule.ts` is made in minutes: `7h 59m` must not read as
 * `8h` on a screen whose whole subject is a threshold at eight.
 */
export function formatHours(minutes: number): string {
  if (!Number.isFinite(minutes)) return "0h";

  const whole = Math.trunc(minutes);
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;

  if (hours === 0) return rest === 0 ? "0h" : `${rest}m`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h ${rest}m`;
}

/** How one row presents FR-106's outcome. Three states, never two. */
export type TriggerPresentation = "actionable" | "settled" | "undetermined";

/**
 * FR-107's three-way split, taken from the row rather than recomputed.
 *
 * `actionable` — earned, and nobody has said an agent covers it. **The one
 *   actionable state on the screen**, and the only one drawn to be noticed.
 * `settled` — earned, and an agent covers it. Nothing to do.
 * `undetermined` — limb one did not fire **and limb two was never evaluated**.
 *   Information, not an instruction, and deliberately not called "unearned":
 *   see {@link triggerRowSentence}.
 *
 * `row.actionable` is `isActionable()`'s answer and is not re-derived here. The
 * second branch reads `trigger.outcome`, which is the same field the register's
 * `stacksEarned` count is built from.
 */
export function triggerPresentation(row: StackRow): TriggerPresentation {
  if (row.actionable) return "actionable";
  return row.trigger.outcome === "earned" ? "settled" : "undetermined";
}

/** The short token in the chip. Never the word "unearned". */
export const TRIGGER_LABEL: Record<TriggerPresentation, string> = {
  actionable: "earned · no agent",
  settled: "earned · covered",
  undetermined: "undetermined",
};

/**
 * FR-106 stated **for this row**, in the units the rule is stated in.
 *
 * FR-106 requires the rule to be on the screen rather than left for the reader
 * to compute, and the screen-level sentence in `trigger-rule.tsx` is only half
 * of that: it says what the threshold is, not where this stack sits against it.
 * This is the other half — both halves of the conjunction, each against its own
 * threshold, on every row whatever the outcome.
 *
 * ## Why an undetermined row does not say "not earned"
 *
 * Q27 RULED that limb two ships visibly unevaluated, so the product cannot
 * assert that a stack has **not** earned a specialist — only that limb one did
 * not fire and that nothing checked limb two. `i1` carried that into the type
 * (`TriggerOutcome` is `'earned' | 'undetermined'`, and `UnevaluatedClause` has
 * no `met` field for a caller to read as false) and this is the same refusal in
 * the visible copy. It is the `unparsed` discipline applied to a trigger rule.
 *
 * An `earned` row says nothing about limb two, and that is correct rather than
 * an omission: limb one fired, so the trigger is satisfied whatever limb two
 * would have said.
 */
export function triggerRowSentence(
  row: StackRow,
  thresholds: TriggerThresholds,
): string {
  const volume =
    `${row.engagements} of ${thresholds.minEngagements} engagements · ` +
    `${formatHours(row.minutes)} of ${thresholds.minHours}h`;

  if (row.trigger.outcome === "earned") return volume;

  return `${volume} — clause 1 not met, clause 2 never evaluated`;
}

/**
 * FR-105's caveat, attached only where it is true.
 *
 * `duration_minutes` is nullable, so a stack's hours understate by exactly its
 * sessions carrying no duration. Zero across the whole ledger today; stated in
 * words on any row where it stops being zero, rather than left as a silent
 * shortfall in a number the trigger is compared against.
 */
export function hoursUnderstatedNote(row: StackRow): string | null {
  if (row.sessionsWithoutDuration === 0) return null;

  const n = row.sessionsWithoutDuration;
  return (
    `${n} ${n === 1 ? "session" : "sessions"} on this stack recorded no ` +
    `duration, so these hours understate by an unknown amount.`
  );
}
