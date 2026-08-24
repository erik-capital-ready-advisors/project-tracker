/**
 * Postgres enum values → the domain vocabulary the pure rules in
 * `src/lib/ingest/` speak.
 *
 * i6's `src/lib/server/ingest/mapping.ts` maps the other direction, domain →
 * database, for the write path. This is the read half. They are separate files
 * because they are separate concerns with different failure modes: an unmapped
 * value on the way *in* is a record that must not be written, and an unmapped
 * value on the way *out* is a record the reader must not silently mis-report.
 *
 * ## The one rule that governs every function here
 *
 * **An unrecognised value never becomes the permissive member of its enum.**
 * Each mapping below states which direction is safe and takes it. That matters
 * far more here than it looks, because these values feed FR-47 coverage and
 * FR-50 billability: a `test_status` this file rounded up to `pass` is a
 * milestone this product tells Erik he may invoice, on the strength of a value
 * nobody could read.
 */

import { EXECUTION_MODE_UNPARSED } from "@/lib/ingest/types";
import type {
  Disposition,
  EvidenceScope,
  ExecutionMode,
  ExecutorKind,
  ReasonClass,
  TestCase,
  TestResult,
  WorkStatus,
} from "@/lib/ingest/types";

/** Postgres spells them with underscores; the domain spells them with hyphens. */
const EVIDENCE_SCOPE: Readonly<Record<string, EvidenceScope>> = {
  observed_live: "observed-live",
  observed_elsewhere: "observed-elsewhere",
  asserted: "asserted",
  not_verified: "not-verified",
};

const REASON_CLASS: Readonly<Record<string, ReasonClass>> = {
  no_agent_for_stack: "no-agent-for-stack",
  credential_absent: "credential-absent",
  human_judgment: "human-judgment",
  client_action: "client-action",
  out_of_scope: "out-of-scope",
  budget: "budget",
};

const HARNESS: Readonly<Record<string, TestCase["harness"]>> = {
  vitest: "vitest",
  playwright: "playwright",
  database_probe: "db-probe",
};

const EXECUTION_MODE: Readonly<Record<string, ExecutionMode>> = {
  fleet: "fleet",
  hand: "hand",
  external: "external",
};

const EXECUTOR_KIND: Readonly<Record<string, ExecutorKind>> = {
  agent: "agent",
  erik: "erik",
  erik_gate: "erik_gate",
  client: "client",
  vendor: "vendor",
  unassigned: "unassigned",
};

const WORK_STATUS: Readonly<Record<string, WorkStatus>> = {
  pending: "pending",
  in_flight: "in_flight",
  done: "done",
  blocked: "blocked",
  superseded: "superseded",
  not_dispatched: "not_dispatched",
  unparsed: "unparsed",
};

const DISPOSITION: Readonly<Record<string, Disposition>> = {
  carried: "carried",
  closed: "closed",
};

/**
 * `work_status`. An unknown value becomes `unparsed`, which is this product's
 * only default and the safe direction here: `unparsed` work is excluded from
 * Next (FR-53), counted by FR-58, and never reported done.
 */
export function fromWorkStatus(value: unknown): WorkStatus {
  return WORK_STATUS[String(value)] ?? "unparsed";
}

/**
 * `execution_mode`. Unknown becomes `unparsed`, the explicit sentinel.
 *
 * **This line was manifest d4000f's D-1 and it read `?? "fleet"`.** The column
 * is nullable — i1 widened it so an FR-87 planned row can exist with no mode
 * set — and `String(null)` is `"null"`, which is not a key of the table above.
 * So every planned row came back as `fleet`: *"nobody has started this"*
 * rendered as *"this is in flight"*, which is precisely the misread FR-91 exists
 * to prevent and the wrong-`done` class this product is built against. Nothing
 * caught it, because these read paths use hand-written row interfaces rather
 * than the generated `Tables<"work_item">`, so `tsc` never saw the widened type.
 *
 * A default reached by `??` that asserts a **positive** fact is a fabrication
 * with no error path. `fromWorkStatus` directly above already had this right;
 * the `unparsed`-only-default discipline simply had not been applied here.
 *
 * Folding SQL NULL together with an unreadable value loses nothing: both mean
 * "no mode was readable", and the FR-87 planned signal — which is *only* the
 * NULL — is decided from the raw column by `isPlannedRow` before this
 * conversion and recorded as its own field. See `@/lib/server/workitems/planned`.
 */
export function fromExecutionMode(value: unknown): ExecutionMode {
  return EXECUTION_MODE[String(value)] ?? EXECUTION_MODE_UNPARSED;
}

/**
 * `executor_kind`. Unknown becomes `unassigned`.
 *
 * Safe direction: `unassigned` keeps the row out of Bottleneck (FR-56), which
 * selects `erik` and `erik_gate`. Rounding an unreadable value *into*
 * `erik_gate` would put phantom work on the screen that answers "what is Erik
 * the bottleneck on" — and rounding it into `erik` would do the same. The enum
 * is `not null` in Postgres with a default, so this fallback is a defence
 * against a future enum member this build has not seen, not against a null.
 */
export function fromExecutorKind(value: unknown): ExecutorKind {
  return EXECUTOR_KIND[String(value)] ?? "unassigned";
}

/** `work_disposition`, nullable. Unknown becomes null rather than `carried`. */
export function fromDisposition(value: unknown): Disposition | null {
  return value === null || value === undefined ? null : (DISPOSITION[String(value)] ?? null);
}

/** `unautomated_reason`, nullable. Unknown becomes null. */
export function fromReasonClass(value: unknown): ReasonClass | null {
  return value === null || value === undefined
    ? null
    : (REASON_CLASS[String(value)] ?? null);
}

/**
 * `evidence_scope` on a `test_result`, where the column is **nullable** and the
 * domain type is not.
 *
 * **Null becomes `not-verified`, deliberately, and this is the most consequential
 * line in the file.** `indexCoverage` treats any scope other than `not-verified`
 * as establishing coverage, so mapping null to `asserted` would make a result
 * that never said what it observed count as proof a requirement is covered —
 * and that flows straight into FR-50 billability. Mapping it to `not-verified`
 * puts the requirement in FR-49's `unproven` bucket instead, which is exactly
 * what "there is a passing test but nothing recorded what it checked" means.
 *
 * Queued for Erik. Note the asymmetry that makes proceeding on it safe: this
 * guess can only ever withhold coverage, never grant it.
 */
export function fromEvidenceScope(value: unknown): EvidenceScope {
  return value === null || value === undefined
    ? "not-verified"
    : (EVIDENCE_SCOPE[String(value)] ?? "not-verified");
}

/** `evidence_scope` on a `work_item`, where the domain type is nullable too. */
export function fromNullableEvidenceScope(value: unknown): EvidenceScope | null {
  return value === null || value === undefined
    ? null
    : (EVIDENCE_SCOPE[String(value)] ?? null);
}

/**
 * `test_harness`. Unknown becomes `manual`.
 *
 * `manual` exists in the domain type and not in the Postgres enum, so it cannot
 * collide with a real stored value — which makes it a legible marker for "this
 * row's harness is not one of FR-46's three" rather than a silent mis-attribution
 * to vitest.
 */
export function fromHarness(value: unknown): TestCase["harness"] {
  return HARNESS[String(value)] ?? "manual";
}

/**
 * `test_status` → the domain's three-valued result.
 *
 * The Postgres enum has four members and the domain has three. The mapping is
 * where the safety lives:
 *
 * | Stored     | Domain     | Consequence |
 * |------------|------------|-------------|
 * | `pass`     | `pass`     | establishes coverage under FR-47 |
 * | `fail`     | `fail`     | can be an FR-69 regression |
 * | `skipped`  | `not_run`  | neither |
 * | `unparsed` | `not_run`  | neither |
 *
 * `skipped` and `unparsed` both land on `not_run` because they are neither
 * evidence nor a regression. That is not the same as discarding them: a
 * `not_run` result is still the *latest* result for its test, so it displaces an
 * earlier pass and the requirement loses coverage. A test whose latest run
 * nobody could read stops proving anything, which is the correct behaviour and
 * the reason this mapping does not filter these rows out at the query.
 *
 * This is also why the six Tier-2 corpus tests staying skipped matters: a
 * `skipped` test proves nothing here either, and the system says so.
 */
export function fromTestStatus(value: unknown): TestResult["status"] {
  if (value === "pass") return "pass";
  if (value === "fail") return "fail";
  return "not_run";
}
