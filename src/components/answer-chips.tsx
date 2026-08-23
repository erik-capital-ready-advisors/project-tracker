import { StateBadge } from "@/components/state-badge";
import type { WorkState } from "@/components/state-badge";
import { cn } from "@/lib/utils";

/**
 * The chips the six answer screens are made of.
 *
 * ## The rule that governs every one of them
 *
 * Spec 5a: the semantic state colours "carry meaning consistently across every
 * surface". Erik approved that scale — sixteen tokens, violet confined to
 * interactive chrome, **fuchsia reserved exclusively for `unparsed`** — and
 * nothing here adds a token, re-tints one, or spends one on a second meaning.
 *
 * The consequence is that a chip reaches for `StateBadge` only when the state it
 * shows is a state the approved scale actually names. Everything else renders on
 * a **neutral ladder**, distinguished by fill, border weight and treatment
 * rather than by hue. That is u4's idiom on `/work-items` and it is kept, for a
 * reason worth stating: a scale that grows a colour per screen stops being a
 * scale, and the first thing it stops being able to say is `unparsed`.
 *
 * ## Where the ladder is used instead of a colour, and why
 *
 * | Chip | Treatment | Why not the scale |
 * |---|---|---|
 * | milestone state (FR-50/51) | ladder | `open`/`fixed` in the scale are *defect* states. A milestone that is not yet billable is not defective. |
 * | shipped (FR-75) | ladder | Shipped is a different axis from covered, and giving it a coverage colour is the collapse FR-75 forbids, in paint. |
 * | executor kind (FR-40) | ladder | `erik_gate` is *who does the work*, not *what condition it is in*. |
 *
 * Three chips do use the scale, because the scale names exactly what they show:
 * coverage (FR-49's `unproven` and `uncovered` are scale tokens), defect status
 * (FR-63/FR-67), and disposition (FR-30).
 *
 * ## Severity is the one place a scale hue is borrowed — flagged, not hidden
 *
 * `critical` renders on `state-blocked` and `major` on `state-carried`. Those
 * tokens keep their hue and their valence (worst, middling), but severity is not
 * one of the five states 5a names, so this is a borrow rather than a mapping. It
 * is called out in the report as a decision Erik has not reviewed: if he wants
 * severity to own a ramp, that is two new tokens and a change to a palette he
 * has already approved, which is his call and not this unit's.
 *
 * `unparsed` severity is **not** a borrow — FR-64 puts an ungraded defect in the
 * `unparsed` population, so it is the fuchsia badge, correctly and by name.
 */

/* ---------------------------------------------------------------------- */
/* The neutral ladder                                                      */
/* ---------------------------------------------------------------------- */

/**
 * Four rungs, written out literally.
 *
 * Tailwind cannot see a class name assembled at runtime, so every utility these
 * components can emit exists as a literal string somewhere in this file.
 */
const RUNG = {
  /** Absent, not-yet, or deliberately quiet. */
  faint: "border-border/60 text-muted-foreground/80 bg-transparent border-dashed",
  /** Present and unremarkable. */
  quiet: "border-border text-muted-foreground bg-transparent",
  /** Present and worth reading. */
  present: "border-foreground/25 text-foreground bg-muted",
  /** The strongest claim on the ladder. */
  strong: "border-foreground/45 text-foreground bg-foreground/10 font-medium",
} as const;

const CHIP =
  "ident inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap";

/** A value that was never recorded. Drawn as absent, never as a value. */
export function Absent({ title }: { title: string }) {
  return (
    <span className="text-muted-foreground/50" title={title}>
      &mdash;
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* FR-50 / FR-51 / FR-79 — milestone state                                 */
/* ---------------------------------------------------------------------- */

export type MilestoneStateValue = "open" | "claimed" | "billable";

const MILESTONE_RUNG: Record<MilestoneStateValue, string> = {
  open: RUNG.faint,
  claimed: RUNG.present,
  billable: RUNG.strong,
};

/**
 * FR-51 in one sentence, carried on the chip itself: *"a review request and not
 * an invoice"*. The title is what a reader gets on hover; the label, the weight
 * and the treatment are what they get at a glance.
 */
const MILESTONE_TITLE: Record<MilestoneStateValue, string> = {
  open: "FR-50: not every acceptance requirement is covered. Nothing to send.",
  claimed:
    "Covered only by self-certified tests — the certifier executed the work. FR-51: this is a review request and not an invoice.",
  billable:
    "Every acceptance requirement is covered by a passing test whose certifier did not execute the work.",
};

export function MilestoneStateChip({ state }: { state: MilestoneStateValue }) {
  return (
    <span
      data-verify-unit="milestone-state"
      data-verify-state={state}
      title={MILESTONE_TITLE[state]}
      className={cn(CHIP, MILESTONE_RUNG[state])}
    >
      {state}
    </span>
  );
}

/**
 * FR-79. Contested rides **beside** the state and never replaces it.
 *
 * That placement is the requirement: a contested milestone is billable *and
 * flagged*, "never presented as clean". A chip that replaced `billable` with
 * `contested` would lose the fact that it is billable; one that replaced
 * `contested` with `billable` would present it as clean. So both are rendered,
 * always, in that order.
 */
export function ContestedChip({ defects }: { defects: number }) {
  return (
    <span
      data-verify-unit="contested"
      data-verify-defects={defects}
      title="An open critical defect stands against one of this milestone's acceptance requirements. FR-79: billable, flagged, and never presented as clean."
    >
      <StateBadge state="contested" />
      {defects > 0 ? (
        <span className="ident text-state-contested ml-1 text-xs">
          &times;{defects}
        </span>
      ) : null}
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* FR-47 / FR-49 — coverage                                                */
/* ---------------------------------------------------------------------- */

/**
 * The three coverage states, which are three and are never summed.
 *
 *   covered    a passing test names it and the certifier did not build it
 *   unproven   a passing test names it, and its evidence scope was
 *              `not-verified` — the test exists and nobody checked it against a
 *              deployment (FR-49)
 *   uncovered  nothing passing names it at all
 *
 * `unproven` and `uncovered` are scale tokens by name. `covered` uses
 * `verified`, which is 5a's own word for a firmly derived state, and it is the
 * only state on this chip that makes a positive claim.
 */
export type CoverageValue = "covered" | "unproven" | "uncovered";

const COVERAGE_STATE: Record<CoverageValue, WorkState> = {
  covered: "verified",
  unproven: "unproven",
  uncovered: "uncovered",
};

const COVERAGE_TITLE: Record<CoverageValue, string> = {
  covered:
    "FR-47: a passing test names this requirement and its certifier did not execute the work that implements it.",
  unproven:
    "FR-49: a passing test names it, but the only covering evidence carries scope `not-verified`. The test exists; nobody checked it against the deployment. Distinct from uncovered.",
  uncovered: "No passing test names this requirement at all.",
};

export function CoverageChip({ value }: { value: CoverageValue }) {
  return (
    <span
      data-verify-unit="coverage"
      data-verify-coverage={value}
      title={COVERAGE_TITLE[value]}
    >
      <StateBadge state={COVERAGE_STATE[value]} />
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* FR-75 — shipped, which is a different question from covered             */
/* ---------------------------------------------------------------------- */

/**
 * *"Built and deployed are different claims and the system never collapses
 * them."*
 *
 * So this chip has its own visual family, carries the environment names rather
 * than a boolean, and never borrows a coverage colour. An empty environment set
 * renders as "not shipped" on the faint rung — absent, not false, because the
 * loader distinguishes "no release names this ref" from "the release table could
 * not be read" and the second case is reported separately as a warning.
 */
export function ShippedChip({ environments }: { environments: readonly string[] }) {
  const shipped = environments.length > 0;

  return (
    <span
      data-verify-unit="shipped"
      data-verify-shipped={shipped ? "true" : "false"}
      data-verify-environments={environments.length}
      title={
        shipped
          ? `Shipped to ${environments.join(", ")}. FR-75: this is a claim about deployment, not about coverage.`
          : "No release names this requirement. Being covered by a passing test is a different claim and is shown separately."
      }
      className={cn(CHIP, shipped ? RUNG.strong : RUNG.faint)}
    >
      {shipped ? environments.join(" · ") : "not shipped"}
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* CR-001 FR-63 / FR-66 / FR-67 — defect severity and status               */
/* ---------------------------------------------------------------------- */

/** Literal class strings; see the severity note in this file's header. */
const SEVERITY_CLASS: Record<string, string> = {
  critical: "border-state-blocked/50 bg-state-blocked/10 text-state-blocked font-semibold",
  major: "border-state-carried/50 bg-state-carried/10 text-state-carried",
  minor: RUNG.quiet,
};

export function DefectSeverityChip({ severity }: { severity: string }) {
  // FR-64: an ungraded defect belongs to the `unparsed` population, so it gets
  // the reserved badge rather than a fourth rung on this ladder.
  if (severity === "unparsed") {
    return (
      <span data-verify-unit="defect-severity" data-verify-severity="unparsed">
        <StateBadge state="unparsed" />
      </span>
    );
  }

  return (
    <span
      data-verify-unit="defect-severity"
      data-verify-severity={severity}
      className={cn(CHIP, SEVERITY_CLASS[severity] ?? RUNG.quiet)}
    >
      {severity}
    </span>
  );
}

/**
 * A defect status, from the approved scale.
 *
 * FR-67's distinction is structural here rather than incidental: `wont_fix` is a
 * *decision* and `verified` is a *proof*, and the scale draws them as dashed
 * grey and solid green respectively. Collapsing them into one "not a problem
 * any more" chip is the failure the requirement names.
 */
const DEFECT_STATE: Record<string, WorkState> = {
  open: "open",
  fixed: "fixed",
  verified: "verified",
  wont_fix: "wont_fix",
  unparsed: "unparsed",
};

export function DefectStatusChip({ status }: { status: string }) {
  const state = DEFECT_STATE[status];

  if (state === undefined) {
    return (
      <span
        data-verify-unit="defect-status"
        data-verify-status={status}
        className={cn(CHIP, RUNG.quiet)}
      >
        {status}
      </span>
    );
  }

  return (
    <span data-verify-unit="defect-status" data-verify-status={status}>
      <StateBadge state={state} />
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* FR-30 — disposition                                                     */
/* ---------------------------------------------------------------------- */

/**
 * `carried` (Erik still owns the gap) versus `closed` (decided against).
 *
 * A third case exists and is drawn as a third thing: no disposition recorded at
 * all. Rendering that as `closed` would report a decision nobody made.
 */
export function DispositionChip({
  disposition,
}: {
  disposition: "carried" | "closed" | null;
}) {
  if (disposition === null) {
    return (
      <span
        data-verify-unit="disposition"
        data-verify-disposition="not-recorded"
        title="No disposition was recorded. That is a gap in the record, not a decision."
      >
        <Absent title="No disposition was recorded." />
      </span>
    );
  }

  return (
    <span
      data-verify-unit="disposition"
      data-verify-disposition={disposition}
      title={
        disposition === "carried"
          ? "FR-30 `carried`: the gap is still owned and still open."
          : "FR-30 `closed`: decided against. Not the same as done."
      }
    >
      <StateBadge state={disposition === "carried" ? "carried" : "closed"} />
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* FR-40 — who does the work                                               */
/* ---------------------------------------------------------------------- */

/**
 * FR-40 makes `erik_gate` a first-class executor kind, and Bottleneck is the
 * screen it exists for, so it carries the strongest rung. It is deliberately
 * given no colour from the state scale: `erik_gate` says who, not what
 * condition.
 */
export function ExecutorChip({
  kind,
  executor,
}: {
  kind: string;
  executor: string | null;
}) {
  const mine = kind === "erik" || kind === "erik_gate";

  return (
    <span
      data-verify-unit="executor"
      data-verify-executor-kind={kind}
      className={cn(CHIP, kind === "erik_gate" ? RUNG.strong : RUNG.quiet)}
      title={
        executor === null ? kind : `${kind} — ${executor}`
      }
    >
      {kind}
      {executor === null || mine ? null : (
        <span className="text-muted-foreground/70">{executor}</span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* FR-52 — what is holding an item                                         */
/* ---------------------------------------------------------------------- */

const HELD_TITLE: Record<string, string> = {
  status: "The item's own status is `blocked`.",
  blocker: "An unresolved blocker row names this item.",
  wait: "An unresolved external wait names this item.",
};

/**
 * `heldBy` is a **list**, and it is rendered as one.
 *
 * An item held by both an internal blocker and an external wait is held by two
 * different things that clear on two different days, and showing only the first
 * would tell Erik the item frees up when it does not.
 */
export function HeldByChips({ heldBy }: { heldBy: readonly string[] }) {
  if (heldBy.length === 0) {
    return <Absent title="Nothing recorded as holding this item." />;
  }

  return (
    <span className="inline-flex flex-wrap gap-1">
      {heldBy.map((reason) => (
        <span
          key={reason}
          data-verify-unit="held-by"
          data-verify-reason={reason}
          title={HELD_TITLE[reason] ?? reason}
          className={cn(CHIP, "border-state-blocked/40 text-state-blocked")}
        >
          {reason}
        </span>
      ))}
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* Requirement and defect references                                       */
/* ---------------------------------------------------------------------- */

/**
 * An `FR-nn` / `D-nn` reference.
 *
 * §7a: `requirement.text` is encrypted and `ref` is clear, "so requirements are
 * matched, joined and reported by `FR-nn` and never by text". Every reference on
 * these screens is therefore a ref and nothing else — there is no requirement
 * prose anywhere in this unit, and that is the security posture rather than a
 * gap in the design.
 *
 * `whitespace-nowrap` is load-bearing: u2 measured identifiers wrapping
 * mid-token, which defeats the column comparison they exist for.
 */
export function Ref({ value }: { value: string }) {
  return (
    <span
      data-verify-unit="ref"
      data-verify-ref={value}
      className="ident bg-muted/60 text-foreground/80 inline-block rounded px-1 py-0.5 text-xs whitespace-nowrap"
    >
      {value}
    </span>
  );
}

/** A list of refs, wrapping between tokens and never inside one. */
export function RefList({
  refs,
  empty,
}: {
  refs: readonly string[];
  empty: string;
}) {
  if (refs.length === 0) return <Absent title={empty} />;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {refs.map((ref) => (
        <Ref key={ref} value={ref} />
      ))}
    </span>
  );
}
