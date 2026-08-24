import type { Database } from "@/lib/database.types";
import type {
  Disposition,
  EvidenceScope,
  ExecutionMode,
  ExecutorKind,
  ReasonClass,
  TestCase,
  WorkStatus,
} from "@/lib/ingest/types";

/**
 * The spelling seam between the pure ingest package and the Postgres enums.
 *
 * The two vocabularies agree on most values and disagree on separators:
 * `src/lib/ingest` writes `not-verified` and `no-agent-for-stack`, Postgres
 * writes `not_verified` and `no_agent_for_stack`, because a hyphen is not legal
 * in an unquoted enum label. Rather than a `.replace(/-/g, "_")` — which would
 * silently invent a label for any value either side later adds — every mapping
 * here is an explicit pair, and anything unmapped returns `null` and is counted.
 *
 * That is the same rule the parsers follow one layer up. A value this seam
 * cannot map is a fact about a disagreement between two modules, and turning it
 * into a plausible enum label is how the disagreement stops being visible.
 */

type Enums = Database["public"]["Enums"];

/** Every mapper returns null rather than guessing. Callers count the nulls. */
export interface Unmappable {
  field: string;
  value: string;
}

/**
 * `unparsed` has no Postgres label, deliberately: `execution_mode` is
 * `fleet | hand | external`, and the sentinel exists only on the **read** side,
 * for a NULL or unreadable column (see `EXECUTION_MODE_UNPARSED`). Leaving it
 * unmapped is what makes it unwritable: `toExecutionMode` answers null and the
 * caller counts the record rather than filing it under a mode nobody recorded.
 *
 * `validateWorkItem` already refuses it from an artifact — `EXECUTION_MODES`,
 * the wire vocabulary, does not contain it — so this gap is unreachable from
 * ingest and is left `Partial` rather than closed anyway, on the same argument
 * as `HARNESS` below.
 */
const EXECUTION_MODE: Partial<Record<ExecutionMode, Enums["execution_mode"]>> = {
  fleet: "fleet",
  hand: "hand",
  external: "external",
};

const EXECUTOR_KIND: Record<ExecutorKind, Enums["executor_kind"]> = {
  agent: "agent",
  erik: "erik",
  erik_gate: "erik_gate",
  client: "client",
  vendor: "vendor",
  unassigned: "unassigned",
};

const WORK_STATUS: Record<WorkStatus, Enums["work_status"]> = {
  pending: "pending",
  in_flight: "in_flight",
  done: "done",
  blocked: "blocked",
  superseded: "superseded",
  not_dispatched: "not_dispatched",
  unparsed: "unparsed",
};

const REASON: Record<ReasonClass, Enums["unautomated_reason"]> = {
  "no-agent-for-stack": "no_agent_for_stack",
  "credential-absent": "credential_absent",
  "human-judgment": "human_judgment",
  "client-action": "client_action",
  "out-of-scope": "out_of_scope",
  budget: "budget",
};

const DISPOSITION: Record<Disposition, Enums["work_disposition"]> = {
  carried: "carried",
  closed: "closed",
};

const EVIDENCE: Record<EvidenceScope, Enums["evidence_scope"]> = {
  "observed-live": "observed_live",
  "observed-elsewhere": "observed_elsewhere",
  asserted: "asserted",
  "not-verified": "not_verified",
};

/**
 * `manual` has no Postgres label, deliberately: `test_harness` is
 * `vitest | playwright | database_probe`. `parseTestTags` only ever emits
 * `vitest` or `playwright`, so this gap is unreachable from the ingest path —
 * but it is left unmapped rather than folded into `database_probe`, so that if a
 * later parser does emit it, the record is counted rather than filed under a
 * harness that never ran it.
 */
const HARNESS: Partial<Record<TestCase["harness"], Enums["test_harness"]>> = {
  vitest: "vitest",
  playwright: "playwright",
  "db-probe": "database_probe",
};

const CONFIDENCE: Record<string, Enums["question_confidence"]> = {
  low: "low",
  med: "med",
  high: "high",
};

export function toExecutionMode(v: ExecutionMode): Enums["execution_mode"] | null {
  return EXECUTION_MODE[v] ?? null;
}

export function toExecutorKind(v: ExecutorKind): Enums["executor_kind"] | null {
  return EXECUTOR_KIND[v] ?? null;
}

export function toWorkStatus(v: WorkStatus): Enums["work_status"] | null {
  return WORK_STATUS[v] ?? null;
}

export function toReason(v: ReasonClass | null): Enums["unautomated_reason"] | null {
  return v === null ? null : REASON[v] ?? null;
}

export function toDisposition(v: Disposition | null): Enums["work_disposition"] | null {
  return v === null ? null : DISPOSITION[v] ?? null;
}

export function toEvidenceScope(v: EvidenceScope | null): Enums["evidence_scope"] | null {
  return v === null ? null : EVIDENCE[v] ?? null;
}

export function toHarness(v: TestCase["harness"]): Enums["test_harness"] | null {
  return HARNESS[v] ?? null;
}

/**
 * `question_confidence` is `low | med | high`. The fleet's JSONL has emitted all
 * three and nothing else, but the field is free text on the wire, so an
 * unrecognised value becomes NULL and is counted rather than rounded to `med`.
 */
export function toConfidence(v: string | null): Enums["question_confidence"] | null {
  return v === null ? null : CONFIDENCE[v.trim().toLowerCase()] ?? null;
}

/**
 * `work_item.phase` is `int` in Postgres and free text in the manifest.
 *
 * A phase cell that is not a plain integer becomes NULL and is counted. It is
 * never coerced with `parseInt`, which would read `2 (deferred)` as `2` and
 * quietly discard the qualifier that was the informative half of the cell.
 */
export function toPhase(v: string | null): number | null {
  if (v === null) return null;
  const trimmed = v.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
}

/**
 * An ISO-8601 timestamp, or null.
 *
 * Postgres would reject a malformed value and fail the whole ingest, so the
 * check happens here where the record can be counted instead. `Date.parse`
 * accepts a great deal — the shape check in front of it is what keeps a
 * manifest's prose out of a timestamptz column.
 */
export function toTimestamp(v: string | null): string | null {
  if (v === null) return null;
  const trimmed = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(trimmed)) return null;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}
