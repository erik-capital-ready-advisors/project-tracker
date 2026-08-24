import type { TriggerEvaluation, TriggerThresholds, UnevaluatedClause } from "./types";

/**
 * FR-106's trigger rule, as a pure function over already-counted figures.
 *
 * It reads no database and no filesystem, for the reason every parser in this
 * repository is pure: that is what makes it testable against frozen input,
 * separately from the query that produced the input. `./list.ts` counts;
 * this decides.
 */

/** FR-106 limb one, first half: "appears in two or more engagements". */
export const TRIGGER_MIN_ENGAGEMENTS = 2;

/** FR-106 limb one, second half: "carries eight or more of Erik's hours". */
export const TRIGGER_MIN_HOURS = 8;

/**
 * The same threshold in the unit the database stores.
 *
 * The comparison is made in integer minutes and the rule is *stated* in hours,
 * so a stack sitting on 479 minutes cannot be rounded into qualifying by a
 * float. Derived from {@link TRIGGER_MIN_HOURS} rather than written out, so the
 * two cannot drift.
 */
export const TRIGGER_MIN_MINUTES = TRIGGER_MIN_HOURS * 60;

export const TRIGGER_THRESHOLDS: TriggerThresholds = {
  minEngagements: TRIGGER_MIN_ENGAGEMENTS,
  minHours: TRIGGER_MIN_HOURS,
};

/**
 * FR-106 limb two, and the whole of what this product can say about it.
 *
 * Q27 RULED: ship limb one, record limb two as visibly unmet. The clause needs a
 * link from a stack to the blocker stalling a dated contract milestone, and the
 * schema has no such link — `blocker` carries no `stack_id` and `stack` carries
 * no blocker reference. Building one would be new schema on a milestone whose
 * whole shape is a read layer and a screen.
 *
 * So it is not built, not silently dropped, and not worked around with a column.
 * It is a value the screen renders, carried on every evaluation and once on the
 * register itself.
 */
export const BLOCKING_MILESTONE_CLAUSE: UnevaluatedClause = {
  evaluated: false,
  reason:
    "Not evaluated. This clause needs a link from a stack to the blocker that " +
    "stalls a dated contract milestone, and the schema carries no such link. " +
    "It was ruled unmet rather than built (CR-007, Q27), so a stack shown as " +
    "undetermined failed the first clause only — nothing has checked this one.",
};

/** What {@link evaluateTrigger} needs, and nothing else. */
export interface StackTotals {
  /** Summed `work_session.duration_minutes`. Integer. */
  readonly minutes: number;
  /** Distinct engagements the stack's sessions belong to. */
  readonly engagements: number;
}

/**
 * FR-106 for one stack.
 *
 * The outcome is `earned` only when limb one fires. It is **never** `earned`
 * because limb two fired, and it is never a claim that limb two did not: see
 * {@link BLOCKING_MILESTONE_CLAUSE} and `UnevaluatedClause`'s note on why that
 * arm has no `met` field for a caller to read as `false`.
 */
export function evaluateTrigger(totals: StackTotals): TriggerEvaluation {
  const engagementsMet = totals.engagements >= TRIGGER_MIN_ENGAGEMENTS;
  const hoursMet = totals.minutes >= TRIGGER_MIN_MINUTES;
  const met = engagementsMet && hoursMet;

  return {
    volume: { evaluated: true, met, engagementsMet, hoursMet },
    blockingMilestone: BLOCKING_MILESTONE_CLAUSE,
    outcome: met ? "earned" : "undetermined",
  };
}

/**
 * FR-107 — earned, and nobody has said an agent covers it.
 *
 * The one actionable state on the screen. An `undetermined` stack is never
 * actionable however uncovered it is: the product has not established that it
 * earned anything, and asking Erik to act on that would be asking him to act on
 * a clause nothing evaluated.
 */
export function isActionable(
  trigger: TriggerEvaluation,
  agentCovering: string | null,
): boolean {
  return trigger.outcome === "earned" && agentCovering === null;
}
