import { requirementRefs } from "@/lib/ingest/refs";

/**
 * The boundary between untrusted wire text and the release persistence layer.
 *
 * This module reads no filesystem, touches no database and imports nothing from
 * Supabase. It is a pure function over a parsed JSON value, which is what makes
 * every rule below testable against a frozen object — the same discipline
 * `src/lib/ingest/` follows for artifact text.
 *
 * Three rules it encodes, none of them stylistic:
 *
 *   1. **`unparsed` is the only default.** A `requirement_refs` entry that names
 *      no `FR-nn` is reported as unparsed and stored nowhere. It is never
 *      guessed at, and the regex that reads it is `requirementRefs` from i2 —
 *      unchanged, because widening it to swallow a stubborn entry is exactly the
 *      failure FR-58 exists to prevent.
 *   2. **FR-78 — an identifier field refuses a secret-shaped value.** A
 *      credential pasted where a deploy reference belongs is a credential in the
 *      database. Postgres enforces this on `engagement`'s five identifier
 *      columns via `app.reject_secret_shaped_identifiers()`; `release` carries no
 *      such trigger, so the check lives here and is stated as an application
 *      control rather than a database one.
 *   3. **A deploy URL carrying a bypass token is a credential, not a URL.**
 *      Vercel's protection-bypass parameter travels in the query string of
 *      exactly the URL a `devops` unit would paste. Those parameters are
 *      stripped and the removal is reported to the caller, so the release row
 *      records where the deploy is and never how to get past its protection.
 */

/** Hard bounds, applied before anything is stored. Baseline §5. */
export const RELEASE_INPUT_LIMITS = {
  /** Bytes of request body accepted before the JSON is even parsed. */
  bodyBytes: 64 * 1024,
  identifier: 200,
  environment: 64,
  url: 2048,
  recordedBy: 200,
  /** Entries in `requirement_refs`. */
  refEntries: 500,
  /** Characters in one `requirement_refs` entry. */
  refEntryLength: 2000,
  /**
   * Distinct `FR-nn` values one request may expand to.
   *
   * `FR-1 to FR-999999` is a valid FR-19 range and `requirementRefs` expands it
   * faithfully to a million strings. Without this cap that is one POST that
   * writes a million rows — an abuse control the spec does not ask for and the
   * baseline does.
   */
  expandedRefs: 2000,
} as const;

/**
 * A TypeScript port of `app.looks_like_secret(text)` from
 * `20260819144026_foundation.sql`, with one deliberate difference recorded
 * below.
 *
 * Kept in step with the SQL by hand, which is a coupling worth naming: if that
 * function gains a prefix, this one must gain it too. It is duplicated rather
 * than called because `app.*` is not reachable through PostgREST — only the six
 * `public` wrappers are — and adding a seventh wrapper to run a regex would put
 * a new function in `public` for no gain.
 *
 * ## The one difference
 *
 * The SQL's last rule refuses any value of 40+ characters drawn only from
 * `[A-Za-z0-9+/=_-]`. On `engagement.db_project_ref` that floor cannot collide,
 * because a Supabase project ref is 20 characters. On `release.identifier` it
 * collides immediately: **a full git commit SHA is exactly 40 hex characters**,
 * and FR-73 says the identifier may be "a version or a deploy reference".
 *
 * So a value matching a git object-id shape — lowercase hex, 7 / 8 / 40 / 64
 * characters — is exempt from that final entropy rule **and from that rule
 * only**. The JWT, prefix and PEM rules still apply to it, and none of them can
 * match a lowercase-hex string anyway except `AKIA`/`AIza`-style prefixes, which
 * are not lowercase hex. Queued for Erik.
 */
const SECRET_PATTERNS: readonly RegExp[] = [
  // JWT structure: three base64url segments separated by dots.
  /^[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}$/,
  // A base64 payload starting with `{"` — a JWT header, dots or not.
  /^ey[A-Za-z0-9_-]{20,}/,
  // Known credential prefixes.
  /^(sb_secret_|sbp_|sk-|sk_live_|sk_test_|rk_live_|ghp_|gho_|ghs_|github_pat_|glpat-|xox[abprs]-|AKIA|ASIA|AIza|npm_|hf_|dop_v1_|shpat_|bearer\s)/i,
  // PEM private key material.
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

/** Long opaque high-entropy blob: no separator an identifier would carry. */
const OPAQUE_BLOB = /^[A-Za-z0-9+/=_-]{40,}$/;

/** `deadbeef`, a short SHA, a full SHA-1, a SHA-256. Lowercase hex only. */
const GIT_OBJECT_ID = /^[0-9a-f]{7}$|^[0-9a-f]{8}$|^[0-9a-f]{40}$|^[0-9a-f]{64}$/;

export function looksLikeSecret(value: string): boolean {
  if (SECRET_PATTERNS.some((pattern) => pattern.test(value))) return true;
  if (GIT_OBJECT_ID.test(value)) return false;
  return OPAQUE_BLOB.test(value);
}

/**
 * Query parameters whose presence means the URL carries a credential.
 *
 * `x-vercel-protection-bypass` is the one that matters for FR-76's real caller:
 * a `devops` unit deploying to a protected preview holds it, and it is the
 * difference between a URL and a key. The rest are the generic shapes that turn
 * up in copy-pasted links.
 */
const CREDENTIAL_PARAM_NAMES = new Set([
  "access_token",
  "api_key",
  "apikey",
  "auth",
  "bypass",
  "credential",
  "id_token",
  "key",
  "password",
  "refresh_token",
  "secret",
  "sig",
  "signature",
  "token",
  "x-vercel-protection-bypass",
  "x-vercel-set-bypass-cookie",
]);

export interface SanitizedUrl {
  url: string;
  /** Parameter names removed because they carried, or looked like, a credential. */
  stripped: string[];
}

/**
 * Reduce a submitted URL to something safe to store, or say why it is not.
 *
 * Refuses outright (rather than sanitising) for anything that is not an https
 * URL, and for userinfo — `https://user:pass@host` puts the credential in the
 * authority, where stripping it would silently change which host the release
 * claims to be at.
 */
export function sanitizeReleaseUrl(raw: string): SanitizedUrl | { error: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { error: "`url` is not a URL." };
  }

  if (parsed.protocol !== "https:") {
    // Baseline §1 and the `release_url_https` check constraint both say https.
    // Refusing here means a clean 400 rather than a Postgres check violation
    // surfacing as a 500.
    return { error: "`url` must be https. A deploy reachable over http is not one this ledger records." };
  }

  if (parsed.username !== "" || parsed.password !== "") {
    return {
      error:
        "`url` carries credentials in its authority (`https://user:pass@host`). " +
        "Post the URL without them.",
    };
  }

  const stripped: string[] = [];
  for (const name of [...parsed.searchParams.keys()]) {
    const value = parsed.searchParams.get(name) ?? "";
    if (CREDENTIAL_PARAM_NAMES.has(name.toLowerCase()) || looksLikeSecret(value)) {
      parsed.searchParams.delete(name);
      if (!stripped.includes(name)) stripped.push(name);
    }
  }

  if (parsed.hash !== "" && looksLikeSecret(parsed.hash.slice(1))) {
    stripped.push("#fragment");
    parsed.hash = "";
  }

  return { url: parsed.toString(), stripped };
}

export interface ParsedReleaseInput {
  engagementSlug: string;
  identifier: string;
  environment: string;
  url: string | null;
  deployedAt: string | null;
  recordedBy: string | null;
  /** Distinct, sorted, FR-19-expanded. May be empty. */
  refs: string[];
  /**
   * Entries the ref reader could not classify, verbatim (bounded).
   *
   * These are reported to the caller and stored nowhere. `unparsed` is the only
   * default: an entry naming no `FR-nn` becomes a loud line in the response, not
   * a guess at what it meant.
   */
  unparsedRefEntries: string[];
  /** Query parameters removed from `url` because they carried a credential. */
  strippedUrlParams: string[];
}

export interface ReleaseInputProblems {
  problems: string[];
}

export function isProblems(
  value: ParsedReleaseInput | ReleaseInputProblems,
): value is ReleaseInputProblems {
  return "problems" in value;
}

function readString(
  record: Record<string, unknown>,
  key: string,
  limit: number,
  problems: string[],
  { required }: { required: boolean },
): string | null {
  const raw = record[key];
  if (raw === undefined || raw === null || raw === "") {
    if (required) problems.push(`\`${key}\` is required.`);
    return null;
  }
  if (typeof raw !== "string") {
    problems.push(`\`${key}\` must be a string.`);
    return null;
  }
  const trimmed = raw.trim();
  if (trimmed === "") {
    if (required) problems.push(`\`${key}\` is required.`);
    return null;
  }
  if (trimmed.length > limit) {
    problems.push(`\`${key}\` is longer than ${limit} characters.`);
    return null;
  }
  return trimmed;
}

/**
 * Validate a decoded JSON body into something the persistence layer can store.
 *
 * Returns **every** problem rather than the first, so a `devops` unit fixing its
 * call does not have to round-trip once per mistake.
 *
 * `source` is deliberately not read from the body. FR-73 defines it as *how the
 * release was recorded*, and a request arriving over the ingest API was recorded
 * over the ingest API whatever it claims about itself. The route pins
 * `ingested`; the operator path pins `declared`.
 */
export function parseReleaseBody(
  raw: unknown,
): ParsedReleaseInput | ReleaseInputProblems {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { problems: ["The request body must be a JSON object."] };
  }

  const record = raw as Record<string, unknown>;
  const problems: string[] = [];

  const engagementSlug = readString(record, "engagement", 200, problems, {
    required: true,
  });
  const identifier = readString(
    record,
    "identifier",
    RELEASE_INPUT_LIMITS.identifier,
    problems,
    { required: true },
  );
  const environment = readString(
    record,
    "environment",
    RELEASE_INPUT_LIMITS.environment,
    problems,
    { required: true },
  );
  const recordedBy = readString(
    record,
    "recorded_by",
    RELEASE_INPUT_LIMITS.recordedBy,
    problems,
    { required: false },
  );

  if (identifier !== null && looksLikeSecret(identifier)) {
    problems.push(
      "`identifier` refuses a secret-shaped value (FR-78). It records a version " +
        "or a deploy reference, never a credential.",
    );
  }
  if (recordedBy !== null && looksLikeSecret(recordedBy)) {
    problems.push("`recorded_by` refuses a secret-shaped value (FR-78).");
  }

  let url: string | null = null;
  let strippedUrlParams: string[] = [];
  const rawUrl = readString(record, "url", RELEASE_INPUT_LIMITS.url, problems, {
    required: false,
  });
  if (rawUrl !== null) {
    const sanitized = sanitizeReleaseUrl(rawUrl);
    if ("error" in sanitized) problems.push(sanitized.error);
    else {
      url = sanitized.url;
      strippedUrlParams = sanitized.stripped;
    }
  }

  let deployedAt: string | null = null;
  const rawDeployedAt = record.deployed_at;
  if (rawDeployedAt !== undefined && rawDeployedAt !== null && rawDeployedAt !== "") {
    if (typeof rawDeployedAt !== "string") {
      problems.push("`deployed_at` must be an ISO 8601 string.");
    } else {
      const parsed = new Date(rawDeployedAt);
      if (Number.isNaN(parsed.getTime())) {
        // Not stored as null. A date the system could not read is reported, not
        // silently converted into "no date recorded" — which is a different and
        // false claim.
        problems.push(
          `\`deployed_at\` is not a date this system can read: ${JSON.stringify(rawDeployedAt).slice(0, 80)}`,
        );
      } else {
        deployedAt = parsed.toISOString();
      }
    }
  }

  const refs: string[] = [];
  const unparsedRefEntries: string[] = [];
  const rawRefs = record.requirement_refs;
  if (rawRefs !== undefined && rawRefs !== null) {
    if (!Array.isArray(rawRefs)) {
      problems.push(
        "`requirement_refs` must be an array of strings. Each entry may name one " +
          "reference or an FR-19 range (`FR-73 to FR-76`).",
      );
    } else if (rawRefs.length > RELEASE_INPUT_LIMITS.refEntries) {
      problems.push(
        `\`requirement_refs\` holds more than ${RELEASE_INPUT_LIMITS.refEntries} entries.`,
      );
    } else {
      const seen = new Set<string>();
      for (const entry of rawRefs) {
        if (typeof entry !== "string") {
          problems.push("Every `requirement_refs` entry must be a string.");
          continue;
        }
        const trimmed = entry.trim();
        if (trimmed === "") continue;
        if (trimmed.length > RELEASE_INPUT_LIMITS.refEntryLength) {
          problems.push(
            `A \`requirement_refs\` entry is longer than ${RELEASE_INPUT_LIMITS.refEntryLength} characters.`,
          );
          continue;
        }
        const expanded = requirementRefs(trimmed);
        if (expanded.length === 0) {
          // The `unparsed` default, applied. Reported, never guessed at.
          if (!unparsedRefEntries.includes(trimmed)) unparsedRefEntries.push(trimmed);
          continue;
        }
        for (const ref of expanded) {
          if (!seen.has(ref)) {
            seen.add(ref);
            refs.push(ref);
          }
        }
      }

      if (refs.length > RELEASE_INPUT_LIMITS.expandedRefs) {
        problems.push(
          `\`requirement_refs\` expands to ${refs.length} references, over the ` +
            `${RELEASE_INPUT_LIMITS.expandedRefs} limit. An FR-19 range expands to every ` +
            `reference it names; check the range bounds.`,
        );
      }
    }
  }

  if (problems.length > 0) return { problems };

  refs.sort(
    (a, b) => Number(a.slice(3)) - Number(b.slice(3)),
  );

  return {
    engagementSlug: engagementSlug as string,
    identifier: identifier as string,
    environment: environment as string,
    url,
    deployedAt,
    recordedBy,
    refs,
    unparsedRefEntries,
    strippedUrlParams,
  };
}
