import { StateBadge } from "@/components/state-badge";
import type { WorkState } from "@/components/state-badge";
import { EXECUTION_MODE_UNPARSED } from "@/lib/ingest/types";
import { cn } from "@/lib/utils";

import type {
  StoredDisposition,
  StoredEvidenceScope,
  StoredExecutionMode,
  StoredExecutorKind,
  StoredWorkStatus,
} from "@/lib/server/workitems/rules";

import {
  DISPOSITION_LABELS,
  EVIDENCE_NOT_RECORDED,
  EVIDENCE_SCOPE_LABELS,
  EXECUTION_MODE_LABELS,
  EXECUTION_MODE_NONE,
  EXECUTION_MODE_UNREADABLE,
  EXECUTOR_KIND_LABELS,
  WORK_STATUS_LABELS,
} from "../_lib/labels";

/**
 * The chips a work-item row is made of.
 *
 * Three rules run through all of them, and each is a spec sentence rather than
 * a taste:
 *
 *   * **The semantic state scale is used only where the state scale means
 *     something.** Spec 5a: the state colours "carry meaning consistently across
 *     every surface". Painting `status = done` with `state-verified` would put
 *     the verification colour on a claim nothing verified -- FR-43's evidence
 *     scope is what says whether anything checked, and it is a different column.
 *     So `WorkStatusChip` reaches for the state scale for exactly two statuses,
 *     `unparsed` and `blocked`, which are states the scale names, and renders
 *     the other five on the neutral ladder.
 *   * **Fuchsia is `unparsed` and nothing else**, so it arrives here only
 *     through `StateBadge`, which is the one component that owns the scale.
 *   * **A missing value is never drawn as a value.** An absent evidence scope
 *     and `not_verified` are different facts and get different chips.
 */

/* ---------------------------------------------------------------------- */

/**
 * The neutral ladder: seven work statuses distinguished by fill and border
 * treatment rather than by hue.
 *
 * Written out literally because Tailwind cannot see a class name assembled at
 * runtime, and exhaustive over the stored union so a status added by a later
 * migration breaks the build instead of rendering as an unstyled word.
 */
const STATUS_CLASS: Record<StoredWorkStatus, string> = {
  pending: "border-border text-muted-foreground bg-transparent",
  in_flight: "border-foreground/25 text-foreground bg-muted",
  done: "border-foreground/40 text-foreground bg-foreground/10 font-medium",
  superseded:
    "border-border text-muted-foreground bg-transparent border-dashed line-through",
  not_dispatched: "border-border/60 text-muted-foreground/80 border-dashed",
  // Both of these are states the semantic scale names, so they are rendered by
  // the component that owns the scale and never reach this map.
  blocked: "",
  unparsed: "",
};

/** The two statuses the semantic state scale genuinely covers. */
const SCALE_STATUS: Partial<Record<StoredWorkStatus, WorkState>> = {
  blocked: "blocked",
  unparsed: "unparsed",
};

export function WorkStatusChip({ status }: { status: StoredWorkStatus }) {
  const scaleState = SCALE_STATUS[status];

  if (scaleState !== undefined) {
    return (
      <span data-verify-unit="work-status" data-verify-status={status}>
        <StateBadge state={scaleState} />
      </span>
    );
  }

  return (
    <span
      data-verify-unit="work-status"
      data-verify-status={status}
      className={cn(
        "ident inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap",
        STATUS_CLASS[status],
      )}
    >
      {WORK_STATUS_LABELS[status]}
    </span>
  );
}

/* ---------------------------------------------------------------------- */

/**
 * FR-43. Four scopes, plus the fifth display state for a scope that was never
 * recorded.
 *
 * The mapping to `WorkState` is a literal table rather than a string transform.
 * `stored.replace("_", "-")` would produce the same four strings today and would
 * silently produce a wrong one the moment a member with two underscores is
 * added -- and a wrong evidence scope is a collapsed evidence scope.
 */
const EVIDENCE_STATE: Record<StoredEvidenceScope, WorkState> = {
  observed_live: "observed-live",
  observed_elsewhere: "observed-elsewhere",
  asserted: "asserted",
  not_verified: "not-verified",
};

export function EvidenceScopeChip({
  scope,
}: {
  scope: StoredEvidenceScope | null;
}) {
  if (scope === null) {
    return (
      <span
        data-verify-unit="evidence-scope"
        data-verify-scope="not-recorded"
        title="No evidence scope was recorded. That is a gap in the record, and it is not the same as a recorded `not verified`."
        className="ident text-muted-foreground/70 inline-flex shrink-0 items-center rounded-md border border-dotted px-1.5 py-0.5 text-xs leading-none whitespace-nowrap"
      >
        {EVIDENCE_NOT_RECORDED}
      </span>
    );
  }

  return (
    <span
      data-verify-unit="evidence-scope"
      data-verify-scope={scope}
      title={EVIDENCE_SCOPE_LABELS[scope]}
    >
      <StateBadge state={EVIDENCE_STATE[scope]} />
    </span>
  );
}

/* ---------------------------------------------------------------------- */

/** FR-30. `carried` and `closed` are distinct, and an unrecorded one is a third thing. */
const DISPOSITION_STATE: Record<StoredDisposition, WorkState> = {
  carried: "carried",
  closed: "closed",
};

export function DispositionChip({
  disposition,
}: {
  disposition: StoredDisposition | null;
}) {
  if (disposition === null) {
    return (
      <span
        data-verify-unit="disposition"
        data-verify-disposition="not-recorded"
        className="text-muted-foreground/60 ident text-xs"
        title="No disposition was recorded."
      >
        &mdash;
      </span>
    );
  }

  return (
    <span
      data-verify-unit="disposition"
      data-verify-disposition={disposition}
      title={DISPOSITION_LABELS[disposition]}
    >
      <StateBadge state={DISPOSITION_STATE[disposition]} />
    </span>
  );
}

/* ---------------------------------------------------------------------- */

/**
 * FR-39 and FR-40 in one chip.
 *
 * `erik_gate` gets its own weight because FR-40 makes it a first-class kind:
 * it is the answer to "what is waiting on Erik personally", and a row that
 * carries it is the Bottleneck screen's raw material. It is deliberately NOT
 * given a colour from the semantic state scale -- `erik_gate` is *who does the
 * work*, not *what condition the work is in*, and borrowing `carried` or
 * `blocked` for it would make the scale mean two things.
 */
export function ExecutorChip({
  kind,
  executor,
}: {
  kind: StoredExecutorKind;
  executor: string | null;
}) {
  const isGate = kind === "erik_gate";

  return (
    <span
      data-verify-unit="executor"
      data-verify-executor-kind={kind}
      className={cn(
        "ident inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap",
        isGate
          ? "border-foreground/45 text-foreground bg-foreground/5 font-semibold"
          : "border-border text-muted-foreground",
      )}
      title={
        executor === null
          ? EXECUTOR_KIND_LABELS[kind]
          : `${EXECUTOR_KIND_LABELS[kind]} — ${executor}`
      }
    >
      {EXECUTOR_KIND_LABELS[kind]}
      {executor === null || kind === "erik" || kind === "erik_gate" ? null : (
        <span className="text-muted-foreground/70">{executor}</span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------- */

/**
 * FR-39's execution mode, and the two ways there can fail to be one.
 *
 * One list, three modes, and the mode is a *column* rather than a tab. This is
 * the visual form of the architecture decision in `CLAUDE.md`: "Splitting them
 * yields three lists Erik has to merge in his head, which is the state this
 * product exists to end."
 *
 * ## Three outcomes, three chips, and none of them blank
 *
 * `work_item.execution_mode` is nullable, so the prop is too, and an absent mode
 * means one of two different things:
 *
 *   * **FR-87 planned work** — no run has claimed the row, so no mode has been
 *     recorded *yet*. Drawn dotted and drained, the same treatment
 *     `EvidenceScopeChip` gives an unrecorded scope, because it is the same kind
 *     of fact: a gap in the record rather than a value.
 *   * **`unparsed`** — the mode is absent and nothing explains why, or the
 *     column held something this build could not read. That is a classification
 *     failure rather than an absence, so it goes to the one component that owns
 *     the semantic scale. Fuchsia is `unparsed` and this IS unparsed; the
 *     state's own colour is the correct one and no new token is introduced.
 *
 * Both used to render as **nothing**: `EXECUTION_MODE_LABELS[null]` is
 * `undefined`, so `/work-items` drew an empty chip and said a planned row had a
 * mode it could not name. A blank chip is a silent unknown, which this product
 * does not permit.
 *
 * ## Why `planned` is a required prop and not the caller's `if`
 *
 * Two read paths reach this chip with the same row in different shapes. The
 * listing passes the raw column, so a planned row arrives as `null`; the domain
 * loaders pass a value that has already been through `fromExecutionMode`, so the
 * same row arrives as `"unparsed"`. Left to the call sites, `/work-items` and
 * `/work-items/<id>` would draw two different chips for one row — which is the
 * inconsistency spec 5a's "one colour everywhere it appears" exists to forbid.
 * So the rule lives here, once, and `planned` is **required** so that no caller
 * can omit it and quietly get the other answer.
 */
export function ExecutionModeChip({
  mode,
  planned,
}: {
  mode: StoredExecutionMode | typeof EXECUTION_MODE_UNPARSED | null;
  /** FR-87, decided from the raw column at load time by `isPlannedRow`. */
  planned: boolean;
}) {
  if (planned) {
    return (
      <span
        data-verify-unit="execution-mode"
        data-verify-mode="none"
        title="No execution mode is recorded. This row is planned work (FR-87) that no run has claimed, which is not the same as fleet work."
        className="ident text-muted-foreground/70 inline-flex shrink-0 items-center rounded-md border border-dotted px-1.5 py-0.5 text-xs leading-none whitespace-nowrap"
      >
        {EXECUTION_MODE_NONE}
      </span>
    );
  }

  if (mode === null || mode === EXECUTION_MODE_UNPARSED) {
    return (
      <span
        data-verify-unit="execution-mode"
        data-verify-mode="unparsed"
        title={`${EXECUTION_MODE_UNREADABLE}: no execution mode was recorded and the row is not planned work, so nothing accounts for the absence.`}
      >
        <StateBadge state="unparsed" />
      </span>
    );
  }

  return (
    <span
      data-verify-unit="execution-mode"
      data-verify-mode={mode}
      className="ident text-muted-foreground inline-flex shrink-0 items-center rounded-md border border-transparent px-1 py-0.5 text-xs leading-none whitespace-nowrap"
    >
      {EXECUTION_MODE_LABELS[mode]}
    </span>
  );
}
