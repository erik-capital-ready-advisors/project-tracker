import type { DetailDb } from "@/lib/server/detail/types";

/**
 * The shapes M2.2's register screen is built on (CR-007 §3, FR-104 to FR-109).
 *
 * ## The word this module does not use
 *
 * Q26 RULED: `coverage` is not reused here. `src/lib/ingest/coverage.ts` already
 * means requirement and test coverage (FR-45 to FR-51), and a second meaning for
 * this product's most overloaded word is a defect on its own. The route is
 * `/stacks`, the screen is "Stacks", and the one place the word survives is
 * `stack.agent_covering`, which is the column's real name in a migration nobody
 * is rewriting.
 *
 * ## The database slice is `DetailDb`, not a new interface
 *
 * `releases/db.ts` defines the narrow client slice and the paging discipline,
 * `answers/db.ts` extends it with the PostgREST verbs, and `detail/types.ts`
 * aliases that as `DetailDb`. This layer needs the same verbs and no others.
 * **There is one paging helper in this repository and this unit did not write a
 * second.**
 */
export type StacksDb = DetailDb;

/**
 * FR-106 limb one, as measured for one stack: **two or more engagements and
 * eight or more of Erik's hours**.
 *
 * `evaluated` is a literal `true` rather than a comment, so this arm and
 * {@link UnevaluatedClause} are structurally distinct types. Both halves of the
 * conjunction are reported separately because FR-106 requires the rule to be
 * *stated* rather than left for the reader to compute, and "which half failed"
 * is the part a reader would otherwise have to work out from two numbers.
 */
export interface VolumeClause {
  readonly evaluated: true;
  /** The conjunction. `engagementsMet && hoursMet`. */
  readonly met: boolean;
  readonly engagementsMet: boolean;
  readonly hoursMet: boolean;
}

/**
 * A clause of FR-106 that **nothing checked**.
 *
 * ## Why this type has no `met` field
 *
 * Q27 RULED: limb two — *one engagement's missing agent blocks a dated contract
 * milestone* — is shipped as visibly unmet, not silently evaluated to `false`.
 * A clause that was never evaluated and a clause that evaluated false are
 * different facts, and this product's standing rule is that a wrong `done` is
 * the worst output it can produce.
 *
 * A `met: false` on this arm would be readable as "checked, did not hold". So
 * the field does not exist: a caller cannot read limb two as false, because
 * there is nothing there to read. That is stronger than a discriminated union
 * with a `met` on both arms, and it is what `./rule.test.ts` asserts.
 *
 * The arms are plain objects rather than a `unique symbol` sentinel because the
 * value crosses a React Server Component boundary, and symbols do not survive
 * that serialisation. Measured on run `eb2490`.
 */
export interface UnevaluatedClause {
  readonly evaluated: false;
  /** What would have to exist for this clause to be evaluable. */
  readonly reason: string;
}

/**
 * What the register can say about one stack's trigger.
 *
 * `earned` — limb one fired, so the trigger is satisfied whatever limb two
 * would have said.
 *
 * `undetermined` — limb one did not fire **and limb two was never evaluated**,
 * so the product cannot say this stack has not earned a specialist. It is not
 * the same claim as "unearned" and it must not be rendered as one; the honest
 * sentence is "not earned on the clause this ledger can evaluate."
 */
export type TriggerOutcome = "earned" | "undetermined";

/** FR-106's rule, evaluated for one stack, with its unevaluated clause attached. */
export interface TriggerEvaluation {
  readonly volume: VolumeClause;
  readonly blockingMilestone: UnevaluatedClause;
  readonly outcome: TriggerOutcome;
}

/**
 * The numbers FR-106's rule is stated in.
 *
 * Carried on the register so the sentence the screen renders and the comparison
 * the evaluator made come from one source. Two copies of `8` — one in a
 * conditional, one in a paragraph — are two copies that can disagree, and the
 * one a reader trusts is the paragraph.
 */
export interface TriggerThresholds {
  readonly minEngagements: number;
  readonly minHours: number;
}

/** One row of FR-104's register. */
export interface StackRow {
  readonly id: string;
  readonly name: string;
  /** FR-109. Set by the operator, never inferred. `null` means nobody has said. */
  readonly agentCovering: string | null;
  readonly firstSeenAt: string | null;
  readonly lastSeenAt: string | null;
  /**
   * FR-105. Summed from `work_session.duration_minutes`, which is the integer
   * the database holds and therefore the figure that cannot be rounded wrong.
   */
  readonly minutes: number;
  /** `minutes / 60`, unrounded. The screen formats; this does not. */
  readonly hours: number;
  /** Sessions attributed to this stack. Every one of them is Mode 2 capture (Q25). */
  readonly sessions: number;
  /**
   * Sessions on this stack carrying **no** `duration_minutes`.
   *
   * `duration_minutes` is nullable, so hours understate by exactly these rows.
   * Zero across the ledger as measured 2026-08-24 — the one attributed session
   * carries a recorded `0`, which is a different fact from a missing one.
   */
  readonly sessionsWithoutDuration: number;
  /**
   * FR-104. Distinct `work_session.engagement_id` among this stack's sessions.
   * See `./list.ts` for why the count comes from sessions and not work items.
   */
  readonly engagements: number;
  readonly trigger: TriggerEvaluation;
  /**
   * FR-107. Earned **and** uncovered — the one actionable state on the screen.
   *
   * `false` here covers two very different rows: earned-and-covered, which is
   * settled, and undetermined, which is information. `trigger.outcome` and
   * `agentCovering` are both on this row so the screen can tell them apart.
   */
  readonly actionable: boolean;
}

/**
 * FR-108 — what the register has **not** seen.
 *
 * Every figure here is a denominator or a hole in one. None of them is
 * decoration: the register's first true answer on this ledger is "no stack has
 * earned anything, and here is how little I have seen", and these are the
 * numbers that sentence is made of.
 */
export interface RegisterBlindness {
  /**
   * Every `work_session` row. Q25 RULED — no filter by executor, by mode, or by
   * `source`. The day something other than the Mode 2 capture path writes a
   * session, the screen's "all of these are Mode 2 capture" sentence becomes
   * visibly wrong rather than quietly wrong, which is the point of counting all
   * of them.
   */
  readonly sessionsTotal: number;
  readonly sessionsWithStack: number;
  /** Sessions carrying no stack. Counted and shown, never dropped from the total. */
  readonly sessionsWithoutStack: number;
  /**
   * Sessions naming a `stack_id` with no matching `stack` row.
   *
   * The foreign key makes this unreachable today. It is counted rather than
   * assumed away so that the identity `sessionsTotal = sessionsWithStack +
   * sessionsWithoutStack` and `sessionsWithStack = Σ row.sessions +
   * sessionsOnUnknownStack` both hold by construction — a session this layer
   * cannot place is a session it says it cannot place.
   */
  readonly sessionsOnUnknownStack: number;
  /** Sessions with a stack but no recorded duration. Hours understate by these. */
  readonly sessionsWithoutDuration: number;
  readonly stacksTotal: number;
  readonly stacksCovered: number;
  /** Stacks whose limb one fired. Zero on this ledger, and that is the answer. */
  readonly stacksEarned: number;
  /** FR-107's actionable set. Zero on this ledger, and that is also the answer. */
  readonly stacksActionable: number;
}

/**
 * FR-108's three distinguishable claims.
 *
 * An empty register and a register reporting "no stack has earned a specialist"
 * are different claims, and only one of them is an answer. So is the third
 * state, which this ledger could reach tomorrow: sessions captured, none of them
 * naming a stack.
 *
 * `no-sessions` — nothing has been captured. The register has no data because
 *   there is none, and it says so instead of rendering an empty table.
 * `no-stacks` — sessions exist and not one carries a stack. The register has
 *   seen work and can attribute none of it.
 * `observed` — at least one stack is in the register. Every other figure on
 *   {@link RegisterBlindness} is then a measurement rather than an absence.
 */
export type RegisterState = "no-sessions" | "no-stacks" | "observed";

/** FR-104's register. */
export interface StackRegister {
  /**
   * Ordered by name, ascending.
   *
   * The order carries **no claim**. Sorting by hours would imply "most used
   * first" on a ledger where every stack holds zero minutes, and sorting the
   * actionable rows to the top would make FR-107's distinction depend on
   * position rather than on the treatment FR-107 actually asks for.
   */
  readonly stacks: readonly StackRow[];
  readonly blindness: RegisterBlindness;
  readonly state: RegisterState;
  /** The numbers FR-106's sentence and FR-106's comparison must share. */
  readonly thresholds: TriggerThresholds;
  /** FR-106 limb two, once, for the notice the screen carries. */
  readonly blockingMilestone: UnevaluatedClause;
}

/** What FR-109's write path hands back. Never a whole row — see `./set-covering.ts`. */
export interface StackCoveringUpdate {
  readonly id: string;
  readonly name: string;
  readonly agentCovering: string | null;
}
