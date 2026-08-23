export const EXECUTION_MODES = ["fleet", "hand", "external"] as const;
export const EXECUTOR_KINDS = [
  "agent", "erik", "erik_gate", "client", "vendor", "unassigned",
] as const;
export const WORK_STATUSES = [
  "pending", "in_flight", "done", "blocked", "superseded",
  "not_dispatched", "unparsed",
] as const;
export const DISPOSITIONS = ["carried", "closed"] as const;
export const REASON_CLASSES = [
  "no-agent-for-stack", "credential-absent", "human-judgment",
  "client-action", "out-of-scope", "budget",
] as const;
export const EVIDENCE_SCOPES = [
  "observed-live", "observed-elsewhere", "asserted", "not-verified",
] as const;

export type ExecutionMode = (typeof EXECUTION_MODES)[number];
export type ExecutorKind = (typeof EXECUTOR_KINDS)[number];
export type WorkStatus = (typeof WORK_STATUSES)[number];
export type Disposition = (typeof DISPOSITIONS)[number];
export type ReasonClass = (typeof REASON_CLASSES)[number];
export type EvidenceScope = (typeof EVIDENCE_SCOPES)[number];

export interface WorkItem {
  id: string;
  engagement: string;
  run: string | null;
  unit: string | null;
  executionMode: ExecutionMode;
  workType: string | null;
  phase: string | null;
  description: string | null;
  executor: string | null;
  executorKind: ExecutorKind;
  status: WorkStatus;
  unautomatedReason: ReasonClass | null;
  unautomatedDisposition: Disposition | null;
  evidenceScope: EvidenceScope | null;
  notVerifiedCount: number;
  dependsOn: string[];
  implements: string[];
  blocker: string | null;
  rawStatus: string | null;
}

export interface Requirement {
  id: string;
  engagement: string;
  ref: string;
  text: string;
}

export interface TestCase {
  id: string;
  engagement: string;
  harness: "vitest" | "playwright" | "db-probe" | "manual";
  file: string;
  title: string;
  covers: string[];
  authoredBy: string | null;
}

export interface TestResult {
  testId: string;
  status: "pass" | "fail" | "not_run";
  evidenceScope: EvidenceScope;
  certifiedBy: string | null;
  runAt: string | null;
}

export interface Blocker {
  id: string;
  engagement: string;
  owner: string;
  description: string;
  disposition: Disposition;
}

export interface Question {
  id: string;
  engagement: string;
  run: string;
  unit: string | null;
  section: string | null;
  question: string | null;
  bestGuess: string | null;
  confidence: string | null;
  blocking: boolean;
  answer: string | null;
  answeredBy: string | null;
  answeredOn: string | null;
  status: "open" | "answered";
}

export interface Milestone {
  id: string;
  engagement: string;
  name: string;
  amount: number | null;
  due: string | null;
  acceptance: string[];
  submitted: string | null;
  paid: string | null;
}

export interface ExternalWait {
  id: string;
  engagement: string;
  label: string;
  owner: string;
  startedAt: string;
  expectedBy: string | null;
  resolvedAt: string | null;
  blocks: string[];
}

const REQUIRED_WORK_ITEM_FIELDS = [
  "id", "engagement", "executionMode", "executorKind", "status",
] as const;

const WORK_ITEM_ENUMS: ReadonlyArray<[string, readonly string[]]> = [
  ["executionMode", EXECUTION_MODES],
  ["executorKind", EXECUTOR_KINDS],
  ["status", WORK_STATUSES],
  ["unautomatedDisposition", DISPOSITIONS],
  ["unautomatedReason", REASON_CLASSES],
  ["evidenceScope", EVIDENCE_SCOPES],
];

/** Returns one error string per problem. An empty array means valid. */
export function validateWorkItem(item: unknown): string[] {
  if (typeof item !== "object" || item === null) return ["work_item: not an object"];
  const record = item as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "<no id>";
  const errors: string[] = [];

  for (const field of REQUIRED_WORK_ITEM_FIELDS) {
    const value = record[field];
    if (value === undefined || value === null || value === "") {
      errors.push(`work_item ${id}: missing ${field}`);
    }
  }
  for (const [field, allowed] of WORK_ITEM_ENUMS) {
    const value = record[field];
    if (value !== undefined && value !== null && !allowed.includes(value as string)) {
      errors.push(
        `work_item ${id}: ${field}=${JSON.stringify(value)} not one of ${allowed.join(", ")}`,
      );
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// CR-001 — defects, releases, regressions. Appended as one block so this file
// merges cleanly against the units building beside this one.
// ---------------------------------------------------------------------------

export const DEFECT_SOURCES = ["qa_agent", "operator", "client", "api"] as const;
export const DEFECT_SEVERITIES = ["critical", "major", "minor", "unparsed"] as const;
export const DEFECT_STATUSES = [
  "open", "fixed", "verified", "wont_fix", "unparsed",
] as const;
export const RELEASE_SOURCES = ["declared", "ingested"] as const;

export type DefectSource = (typeof DEFECT_SOURCES)[number];
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number];
export type DefectStatus = (typeof DEFECT_STATUSES)[number];
export type ReleaseSource = (typeof RELEASE_SOURCES)[number];

/**
 * FR-63. `status` is what was *recorded*; `verified` is never recorded, it is
 * derived by `deriveDefectStatus` in defects.ts. A record arriving with
 * `status: "verified"` is reported as an error rather than trusted.
 *
 * `description` and `wontFixReason` are `bytea` (pgcrypto) in the database.
 * Every function in this package that reads them requires plaintext, so a
 * caller passing decrypted values is doing so deliberately. `title` is clear by
 * CR-001 section 4's stated exception, and `ref` is clear — join by `D-nn`,
 * never by text.
 */
export interface Defect {
  id: string;
  engagement: string;
  /** `D-1`, `D-2`, … Null until the persistence layer allocates one. */
  ref: string | null;
  source: DefectSource;
  severity: DefectSeverity;
  /** The artifact's own severity word, kept verbatim where it differs. */
  rawSeverity: string | null;
  title: string;
  /** Plaintext. Ciphertext at rest. */
  description: string | null;
  status: DefectStatus;
  /** Plaintext. Ciphertext at rest. Required when status is `wont_fix`. */
  wontFixReason: string | null;
  requirementRef: string | null;
  fixingWorkItem: string | null;
  reportedAt: string | null;
  reportedBy: string | null;
}

/** FR-73. */
export interface Release {
  id: string;
  engagement: string;
  identifier: string;
  environment: string;
  url: string | null;
  deployedAt: string | null;
  source: ReleaseSource;
  recordedBy: string | null;
}

/** FR-74. One row per requirement a release ships. */
export interface ReleaseRequirement {
  releaseId: string;
  ref: string;
}

/** FR-68. Only the two fields the reactivation rule needs. */
export interface Engagement {
  id: string;
  slug: string;
  archivedAt: string | null;
}

const DEFECT_ENUMS: ReadonlyArray<[string, readonly string[]]> = [
  ["source", DEFECT_SOURCES],
  ["severity", DEFECT_SEVERITIES],
  ["status", DEFECT_STATUSES],
];

/** Returns one error string per problem. An empty array means valid. */
export function validateDefect(defect: unknown): string[] {
  if (typeof defect !== "object" || defect === null) return ["defect: not an object"];
  const record = defect as Record<string, unknown>;
  const id = typeof record.id === "string" ? record.id : "<no id>";
  const errors: string[] = [];

  for (const field of ["id", "engagement", "source", "severity", "title", "status"]) {
    const value = record[field];
    if (value === undefined || value === null || value === "") {
      errors.push(`defect ${id}: missing ${field}`);
    }
  }
  for (const [field, allowed] of DEFECT_ENUMS) {
    const value = record[field];
    if (value !== undefined && value !== null && !allowed.includes(value as string)) {
      errors.push(
        `defect ${id}: ${field}=${JSON.stringify(value)} not one of ${allowed.join(", ")}`,
      );
    }
  }
  // FR-66: no field sets `verified`. A record that arrives claiming it is
  // asserting a certification nobody checked, which is the one thing this
  // product must never accept quietly.
  if (record.status === "verified") {
    errors.push(`defect ${id}: status=verified is derived under FR-66, never recorded`);
  }
  // FR-67: a decision needs its reason stated, or it is just a gap in disguise.
  if (record.status === "wont_fix") {
    const reason = record.wontFixReason;
    if (typeof reason !== "string" || reason.trim() === "") {
      errors.push(`defect ${id}: status=wont_fix with no stated reason (FR-67)`);
    }
  }
  return errors;
}
