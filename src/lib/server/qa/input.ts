/**
 * Boundary validation for a posted test run (FR-45, FR-46).
 *
 * Pure: no database, no clock, no filesystem. Every problem in the payload is
 * returned at once rather than one per round trip, which is i8's shape for the
 * release endpoint and worth keeping — a caller fixing a batch import should not
 * need six attempts to discover six mistakes.
 *
 * ## What this refuses, and why each refusal is not fussiness
 *
 *   * **An unrecognised `status`** — not defaulted to `unparsed` and not to
 *     `pass`. `unparsed` is a real member of the stored enum with a meaning
 *     ("the harness said something this system could not read"), so silently
 *     mapping a typo onto it would put a *claim* in a column reserved for an
 *     *absence of claim*. The caller is told.
 *   * **An unrecognised `evidence_scope`** — same reasoning, and this one feeds
 *     FR-49 directly: the difference between `asserted` and `not-verified` is the
 *     difference between a requirement reported covered and one reported
 *     unproven.
 *   * **A `certified_by` that is secret-shaped** — FR-78's discipline, applied
 *     to a new free-text actor field. A CI system posting `certifiedBy:
 *     process.env.GITHUB_TOKEN` by mistake would otherwise write a live
 *     credential into an `internal` table that §7a says agents may read.
 */

const TEST_STATUSES = ["pass", "fail", "skipped", "unparsed"] as const;
export type WireTestStatus = (typeof TEST_STATUSES)[number];

const HARNESSES = ["vitest", "playwright", "database_probe"] as const;
export type WireHarness = (typeof HARNESSES)[number];

/**
 * Accepted spellings for `evidence_scope`, mapped to the stored enum.
 *
 * Both the hyphenated domain spelling (FR-43's wording, and what
 * `src/lib/ingest/` uses) and the underscored Postgres spelling are accepted,
 * because a caller reading the spec and a caller reading the schema will each
 * reach for a different one and neither is wrong.
 */
const EVIDENCE_SCOPES: Readonly<Record<string, string>> = {
  "observed-live": "observed_live",
  observed_live: "observed_live",
  "observed-elsewhere": "observed_elsewhere",
  observed_elsewhere: "observed_elsewhere",
  asserted: "asserted",
  "not-verified": "not_verified",
  not_verified: "not_verified",
};

/** Bounds. Mine, not the spec's — an order of magnitude above any real run. */
export const TEST_RUN_LIMITS = {
  results: 5000,
  file: 512,
  title: 1024,
  actor: 200,
  evidenceRef: 2048,
} as const;

export interface WireTestResult {
  file: string;
  title: string;
  harness: WireHarness;
  status: WireTestStatus;
  /** Stored spelling, already mapped. Null when the caller stated none. */
  evidenceScope: string | null;
  evidenceRef: string | null;
  /** FR-46 / FR-47. Who certified this run. */
  certifiedBy: string | null;
  /** FR-46. Who wrote the test. */
  authoredBy: string | null;
  runAt: string | null;
}

export interface ParsedTestRun {
  engagement: string;
  results: WireTestResult[];
  recordedBy: string | null;
}

export interface Problems {
  problems: string[];
}

export function isProblems(value: unknown): value is Problems {
  return typeof value === "object" && value !== null && "problems" in value;
}

/**
 * A value that looks like a credential rather than a name.
 *
 * The same shape-based test FR-78 applies to `engagement`'s identifier columns:
 * long, high-entropy, or carrying a known secret prefix. It is deliberately
 * conservative about what it rejects — an actor label is a person or an agent
 * name, and none of those is forty random characters.
 */
const SECRET_PREFIXES = [
  "sk-",
  "sk_",
  "pk_",
  "dl_",
  "sb_secret",
  "sbp_",
  "ghp_",
  "github_pat_",
  "eyJ",
  "Bearer ",
];

function looksSecret(value: string): boolean {
  if (SECRET_PREFIXES.some((prefix) => value.startsWith(prefix))) return true;
  // A long unbroken run of base64/hex-ish characters with no space is not a name.
  return value.length >= 40 && /^[A-Za-z0-9_\-+/=.]+$/.test(value) && !/\s/.test(value);
}

function requiredString(
  value: unknown,
  label: string,
  max: number,
  problems: string[],
): string | null {
  if (typeof value !== "string" || value.trim() === "") {
    problems.push(`${label} is required and must be a non-empty string.`);
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    problems.push(`${label} is longer than ${max} characters.`);
    return null;
  }
  return trimmed;
}

function optionalActor(
  value: unknown,
  label: string,
  problems: string[],
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "") {
    problems.push(`${label} must be a non-empty string when given.`);
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length > TEST_RUN_LIMITS.actor) {
    problems.push(`${label} is longer than ${TEST_RUN_LIMITS.actor} characters.`);
    return null;
  }
  if (looksSecret(trimmed)) {
    // The offending value is deliberately NOT echoed back: it may be a live
    // credential, and the error body is the one part of this exchange most
    // likely to end up in a CI log.
    problems.push(
      `${label} looks like a credential rather than an actor name. It was ` +
        `refused and is not stored anywhere. Post a name such as ` +
        `"qa-reviewer" or "erik".`,
    );
    return null;
  }
  return trimmed;
}

/**
 * An ISO-8601 timestamp, or a problem.
 *
 * The shape check in front of `Date.parse` is what keeps prose out of a
 * `timestamptz`: `Date.parse` accepts a great deal, including strings that mean
 * nothing like the caller intended. i6 made the same call in `toTimestamp` and
 * this matches it deliberately.
 */
function optionalTimestamp(
  value: unknown,
  label: string,
  problems: string[],
): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(value.trim())) {
    problems.push(`${label} must be an ISO-8601 date or timestamp.`);
    return null;
  }
  const parsed = Date.parse(value.trim());
  if (Number.isNaN(parsed)) {
    problems.push(`${label} is not a date this system can read.`);
    return null;
  }
  return new Date(parsed).toISOString();
}

export function parseTestRun(body: unknown): ParsedTestRun | Problems {
  const problems: string[] = [];

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { problems: ["The request body must be a JSON object."] };
  }
  const record = body as Record<string, unknown>;

  const engagement = requiredString(record.engagement, "engagement", 200, problems);
  const recordedBy = optionalActor(record.recorded_by, "recorded_by", problems);

  const rawResults = record.results;
  if (!Array.isArray(rawResults) || rawResults.length === 0) {
    problems.push("`results` must be a non-empty array.");
    return { problems };
  }
  if (rawResults.length > TEST_RUN_LIMITS.results) {
    problems.push(
      `\`results\` holds ${rawResults.length} entries; the cap is ` +
        `${TEST_RUN_LIMITS.results} per request.`,
    );
    return { problems };
  }

  const results: WireTestResult[] = [];

  rawResults.forEach((raw, index) => {
    const at = `results[${index}]`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      problems.push(`${at} must be an object.`);
      return;
    }
    const one = raw as Record<string, unknown>;

    const file = requiredString(one.file, `${at}.file`, TEST_RUN_LIMITS.file, problems);
    const title = requiredString(
      one.title,
      `${at}.title`,
      TEST_RUN_LIMITS.title,
      problems,
    );

    const harnessRaw = one.harness;
    let harness: WireHarness | null = null;
    if (typeof harnessRaw === "string" && (HARNESSES as readonly string[]).includes(harnessRaw)) {
      harness = harnessRaw as WireHarness;
    } else {
      problems.push(
        `${at}.harness must be one of ${HARNESSES.join(", ")}. FR-46 names ` +
          `these three for Phase 1 and an unrecognised harness is refused ` +
          `rather than guessed at.`,
      );
    }

    const statusRaw = one.status;
    let status: WireTestStatus | null = null;
    if (
      typeof statusRaw === "string" &&
      (TEST_STATUSES as readonly string[]).includes(statusRaw)
    ) {
      status = statusRaw as WireTestStatus;
    } else {
      problems.push(
        `${at}.status must be one of ${TEST_STATUSES.join(", ")}. It is not ` +
          `defaulted — neither to \`pass\`, which would assert evidence, nor to ` +
          `\`unparsed\`, which would claim the harness said something unreadable.`,
      );
    }

    let evidenceScope: string | null = null;
    if (one.evidence_scope !== undefined && one.evidence_scope !== null) {
      const mapped = EVIDENCE_SCOPES[String(one.evidence_scope)];
      if (mapped === undefined) {
        problems.push(
          `${at}.evidence_scope must be one of observed-live, ` +
            `observed-elsewhere, asserted, not-verified (underscores accepted).`,
        );
      } else {
        evidenceScope = mapped;
      }
    }

    let evidenceRef: string | null = null;
    if (one.evidence_ref !== undefined && one.evidence_ref !== null) {
      evidenceRef = requiredString(
        one.evidence_ref,
        `${at}.evidence_ref`,
        TEST_RUN_LIMITS.evidenceRef,
        problems,
      );
    }

    const certifiedBy = optionalActor(one.certified_by, `${at}.certified_by`, problems);
    const authoredBy = optionalActor(one.authored_by, `${at}.authored_by`, problems);
    const runAt = optionalTimestamp(one.run_at, `${at}.run_at`, problems);

    if (file !== null && title !== null && harness !== null && status !== null) {
      results.push({
        file,
        title,
        harness,
        status,
        evidenceScope,
        evidenceRef,
        certifiedBy,
        authoredBy,
        runAt,
      });
    }
  });

  if (problems.length > 0 || engagement === null) return { problems };
  return { engagement, results, recordedBy };
}
