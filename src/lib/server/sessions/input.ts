/**
 * FR-24 / FR-27 — the work-session payload, validated at the boundary.
 *
 * Pure. No database, no clock, no environment. It turns untrusted JSON into
 * either a typed record or a list of complaints, and it never guesses.
 *
 * ## The one thing to be careful about in this file
 *
 * `summary` is the field §7a singles out: *"a summary of hand-prompted work,
 * which may quote anything Erik was working on."* That is not this product's
 * data — it is whatever client's codebase the session happened to be in. It is
 * encrypted at rest for that reason, and it follows that **no validation error
 * in this file may echo it**. Errors name the field and the constraint, never
 * the value. The enum fields are the deliberate exception: a rejected enum token
 * is a short word from a closed set, echoing it is what makes the error
 * actionable, and it cannot contain client prose because anything long enough to
 * is rejected before it is quoted.
 */

import {
  DISPOSITION,
  EVIDENCE_SCOPE,
  EXECUTOR_KIND,
  UNAUTOMATED_REASON,
  WORK_STATUS,
} from "@/lib/server/workitems/rules";
import type {
  StoredDisposition,
  StoredEvidenceScope,
  StoredExecutorKind,
  StoredUnautomatedReason,
  StoredWorkStatus,
} from "@/lib/server/workitems/rules";

/** Bounds. Present so a hook bug cannot post a gigabyte into an encrypted column. */
export const LIMITS = {
  workingDirectory: 1024,
  engagementSlug: 128,
  stackName: 96,
  summary: 4000,
  title: 500,
  /** Echoed back in an error message, so short enough to be safe to echo. */
  enumToken: 64,
  counter: 1_000_000,
} as const;

export interface SessionWorkItemInput {
  title: string | null;
  status: StoredWorkStatus;
  executorKind: StoredExecutorKind;
  unautomatedReason: StoredUnautomatedReason | null;
  disposition: StoredDisposition;
  evidenceScope: StoredEvidenceScope | null;
  notVerifiedCount: number;
  dependsOn: string[];
}

export interface SessionInput {
  workingDirectory: string;
  /** An explicit engagement slug, when the caller knows it. */
  engagementSlug: string | null;
  startedAt: string;
  /** Null on a mid-session post (FR-27). */
  endedAt: string | null;
  stackName: string | null;
  filesChanged: number | null;
  commits: number | null;
  /** Plaintext. Encrypted before it reaches Postgres. */
  summary: string | null;
  source: string;
  workItem: SessionWorkItemInput;
}

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** ISO-8601 with an explicit offset or `Z`. A bare local time is ambiguous. */
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;

function readString(
  source: Record<string, unknown>,
  field: string,
  max: number,
  errors: string[],
  { required }: { required: boolean },
): string | null {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === "") {
    if (required) errors.push(`${field}: required`);
    return null;
  }
  if (typeof raw !== "string") {
    errors.push(`${field}: must be a string`);
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    if (required) errors.push(`${field}: required`);
    return null;
  }
  if (trimmed.length > max) {
    // Length only. The value itself is not repeated — see the file header.
    errors.push(`${field}: longer than the ${max}-character limit`);
    return null;
  }
  return trimmed;
}

function readInstant(
  source: Record<string, unknown>,
  field: string,
  errors: string[],
  { required }: { required: boolean },
): string | null {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === "") {
    if (required) errors.push(`${field}: required`);
    return null;
  }
  if (typeof raw !== "string" || !ISO_INSTANT.test(raw)) {
    errors.push(
      `${field}: must be an ISO-8601 instant with an explicit offset, ` +
        `e.g. 2026-08-19T09:00:00Z`,
    );
    return null;
  }
  if (Number.isNaN(Date.parse(raw))) {
    errors.push(`${field}: is not a real date`);
    return null;
  }
  return new Date(raw).toISOString();
}

function readCount(
  source: Record<string, unknown>,
  field: string,
  errors: string[],
): number | null {
  const raw = source[field];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    errors.push(`${field}: must be a whole number`);
    return null;
  }
  if (raw < 0 || raw > LIMITS.counter) {
    errors.push(`${field}: must be between 0 and ${LIMITS.counter}`);
    return null;
  }
  return raw;
}

/**
 * Read a member of a closed set.
 *
 * The `unparsed` rule, applied to input validation: an unrecognised token is an
 * **error**, never a fallback to the most convenient member. Falling back is how
 * `not-verified` silently becomes `asserted`.
 */
function readEnum<T extends string>(
  source: Record<string, unknown>,
  field: string,
  set: { parse: (raw: unknown) => T | null; wireValues: readonly string[] },
  errors: string[],
  fallback: T | null,
): T | null {
  const raw = source[field];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const parsed = set.parse(raw);
  if (parsed === null) {
    const shown =
      typeof raw === "string" && raw.length <= LIMITS.enumToken
        ? JSON.stringify(raw)
        : "the supplied value";
    errors.push(
      `${field}: ${shown} is not one of ${set.wireValues.join(", ")}`,
    );
    return null;
  }
  return parsed;
}

function readDependsOn(raw: unknown, errors: string[]): string[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push("workItem.dependsOn: must be an array of unit keys");
    return [];
  }
  const units: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string" || entry.trim() === "") {
      errors.push("workItem.dependsOn: every entry must be a non-empty string");
      continue;
    }
    if (entry.length > LIMITS.enumToken) {
      errors.push("workItem.dependsOn: an entry exceeds the unit-key length limit");
      continue;
    }
    units.push(entry.trim());
  }
  return units;
}

/**
 * Validate a posted work session.
 *
 * Collects **every** problem rather than stopping at the first, so a
 * misconfigured hook is fixed in one pass instead of six.
 */
export function parseSessionPayload(body: unknown): ParseResult<SessionInput> {
  const errors: string[] = [];

  if (!isRecord(body)) {
    return { ok: false, errors: ["body: expected a JSON object"] };
  }

  const workingDirectory = readString(
    body,
    "workingDirectory",
    LIMITS.workingDirectory,
    errors,
    { required: true },
  );
  const engagementSlug = readString(
    body,
    "engagement",
    LIMITS.engagementSlug,
    errors,
    { required: false },
  );
  const startedAt = readInstant(body, "startedAt", errors, { required: true });
  const endedAt = readInstant(body, "endedAt", errors, { required: false });
  const stackName = readString(body, "stack", LIMITS.stackName, errors, {
    required: false,
  });
  const summary = readString(body, "summary", LIMITS.summary, errors, {
    required: false,
  });
  const source =
    readString(body, "source", LIMITS.enumToken, errors, { required: false }) ??
    "session-hook";
  const filesChanged = readCount(body, "filesChanged", errors);
  const commits = readCount(body, "commits", errors);

  if (startedAt !== null && endedAt !== null && Date.parse(endedAt) < Date.parse(startedAt)) {
    errors.push("endedAt: is before startedAt");
  }

  const rawWorkItem = body.workItem;
  if (rawWorkItem !== undefined && rawWorkItem !== null && !isRecord(rawWorkItem)) {
    errors.push("workItem: expected an object");
  }
  const workItemSource = isRecord(rawWorkItem) ? rawWorkItem : {};

  const title = readString(workItemSource, "title", LIMITS.title, errors, {
    required: false,
  });
  const unautomatedReason = readEnum(
    workItemSource,
    "unautomatedReason",
    UNAUTOMATED_REASON,
    errors,
    null,
  );
  const disposition =
    readEnum(workItemSource, "disposition", DISPOSITION, errors, "carried") ??
    "carried";
  const evidenceScope = readEnum(
    workItemSource,
    "evidenceScope",
    EVIDENCE_SCOPE,
    errors,
    null,
  );
  const executorKind =
    readEnum(workItemSource, "executorKind", EXECUTOR_KIND, errors, "erik") ??
    "erik";
  /**
   * FR-28 + the unparsed rule. A session that says nothing about status gets
   * `unparsed`, not `done`. A wrong `done` is the worst output this product can
   * produce, and a session hook that fired on a session which changed nothing is
   * exactly the case that would produce one.
   */
  const status =
    readEnum(workItemSource, "status", WORK_STATUS, errors, "unparsed") ??
    "unparsed";
  const notVerifiedCount = readCount(workItemSource, "notVerifiedCount", errors) ?? 0;
  const dependsOn = readDependsOn(workItemSource.dependsOn, errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      // Non-null by construction: `errors` is empty, so every required read
      // returned a value.
      workingDirectory: workingDirectory as string,
      engagementSlug,
      startedAt: startedAt as string,
      endedAt,
      stackName,
      filesChanged,
      commits,
      summary,
      source,
      workItem: {
        title,
        status,
        executorKind,
        unautomatedReason,
        disposition,
        evidenceScope,
        notVerifiedCount,
        dependsOn,
      },
    },
  };
}

/**
 * Minutes between the two instants, or null on a mid-session post.
 *
 * Rounded to the nearest minute rather than floored: a 90-second session is one
 * minute of work, not zero, and FR-31 sums these into the stack-hours figure
 * that decides whether a stack earns its own fleet agent.
 */
export function durationMinutes(
  startedAt: string,
  endedAt: string | null,
): number | null {
  if (endedAt === null) return null;
  const ms = Date.parse(endedAt) - Date.parse(startedAt);
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.round(ms / 60_000);
}
