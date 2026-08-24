/**
 * How the closed sets read on screen.
 *
 * ## Why every map here is a `Record<Stored…, string>` and not an array
 *
 * A `Record` over the stored union is exhaustive: if `i1` adds a member to
 * `executor_kind` or `work_status`, this file stops compiling and someone has to
 * decide what it is called on screen. An array of `{ value, label }` pairs would
 * compile perfectly while quietly omitting the new member from every dropdown,
 * so a filter would exist that the interface could not express -- which is a
 * screen that cannot ask a question the data can answer.
 *
 * The option lists below are derived from the maps for the same reason.
 *
 * ## These are labels, not spellings
 *
 * The wire and stored spellings live in `@/lib/server/workitems/rules` and are
 * not re-declared here. What is declared here is only how a value reads to a
 * human, and the values themselves still travel as the stored spelling.
 */

import type {
  StoredDisposition,
  StoredEvidenceScope,
  StoredExecutionMode,
  StoredExecutorKind,
  StoredUnautomatedReason,
  StoredWorkStatus,
  WorkItemSortColumn,
} from "@/lib/server/workitems/rules";

/**
 * FR-39. Three modes, one table, one list.
 *
 * Stays exactly three members: it is what the filter bar's options are built
 * from (`EXECUTION_MODES` below), and the two display states beneath it are
 * *absences of a mode*, not modes anyone can filter for.
 */
export const EXECUTION_MODE_LABELS: Record<StoredExecutionMode, string> = {
  fleet: "fleet",
  hand: "hand",
  external: "external",
};

/**
 * FR-87. `execution_mode IS NULL` — the row is planned and no run has claimed
 * it, so there is no mode to name yet.
 *
 * A named label rather than an empty chip. Before d4000f's D-1 fix a NULL mode
 * reached `EXECUTION_MODE_LABELS[…]`, came back `undefined`, and rendered as a
 * **blank chip** on `/work-items` — a silent unknown, which this product does
 * not permit. An absence that says it is an absence is the whole point.
 */
export const EXECUTION_MODE_NONE = "no mode yet";

/** An `execution_mode` this build could not read at all. Not the same fact. */
export const EXECUTION_MODE_UNREADABLE = "mode unparsed";

/**
 * FR-39 and FR-40. `erik_gate` reads as its own kind rather than as a decorated
 * `erik`, because FR-40 makes it a first-class executor kind and not a note.
 */
export const EXECUTOR_KIND_LABELS: Record<StoredExecutorKind, string> = {
  agent: "agent",
  erik: "Erik",
  erik_gate: "Erik gate",
  client: "client",
  vendor: "vendor",
  unassigned: "unassigned",
};

export const WORK_STATUS_LABELS: Record<StoredWorkStatus, string> = {
  pending: "pending",
  in_flight: "in flight",
  done: "done",
  blocked: "blocked",
  superseded: "superseded",
  not_dispatched: "not dispatched",
  unparsed: "unparsed",
};

/** FR-30. Both are filterable, and both are named rather than implied. */
export const DISPOSITION_LABELS: Record<StoredDisposition, string> = {
  carried: "carried",
  closed: "closed",
};

/** FR-29's six reason classes. */
export const UNAUTOMATED_REASON_LABELS: Record<StoredUnautomatedReason, string> =
  {
    no_agent_for_stack: "no agent for stack",
    credential_absent: "credential absent",
    human_judgment: "human judgment",
    client_action: "client action",
    out_of_scope: "out of scope",
    budget: "budget",
  };

/**
 * FR-43's four evidence scopes.
 *
 * They stay four. "asserted" means someone wrote it down; "observed live" means
 * someone watched it happen in the running system. Rendering both as a checkmark
 * is the exact failure this product exists to prevent, so each carries its own
 * label and its own badge treatment, and the badge treatment channel means the
 * four survive greyscale.
 */
export const EVIDENCE_SCOPE_LABELS: Record<StoredEvidenceScope, string> = {
  observed_live: "observed live",
  observed_elsewhere: "observed elsewhere",
  asserted: "asserted",
  not_verified: "not verified",
};

/**
 * A **fifth** display state, and the one most at risk of being folded away.
 *
 * `evidence_scope IS NULL` means the artifact recorded no scope at all. That is
 * not the same fact as `not_verified`, which means someone recorded that nobody
 * checked. One is a gap in the record; the other is a statement in the record.
 * The system never collapses them, so this label exists and is deliberately not
 * one of the four.
 */
export const EVIDENCE_NOT_RECORDED = "no scope recorded";

export const SORT_COLUMN_LABELS: Record<WorkItemSortColumn, string> = {
  started_at: "started",
  ended_at: "ended",
  status: "status",
  executor_kind: "executor",
  execution_mode: "mode",
  phase: "phase",
  unit: "unit",
  not_verified_count: "not verified",
};

function keysOf<K extends string>(map: Record<K, string>): K[] {
  return Object.keys(map) as K[];
}

export const EXECUTION_MODES = keysOf(EXECUTION_MODE_LABELS);
export const EXECUTOR_KINDS = keysOf(EXECUTOR_KIND_LABELS);
export const WORK_STATUSES = keysOf(WORK_STATUS_LABELS);
export const DISPOSITIONS = keysOf(DISPOSITION_LABELS);
export const UNAUTOMATED_REASONS = keysOf(UNAUTOMATED_REASON_LABELS);
export const EVIDENCE_SCOPES = keysOf(EVIDENCE_SCOPE_LABELS);
