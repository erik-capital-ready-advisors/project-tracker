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
