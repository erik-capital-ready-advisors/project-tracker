/**
 * The query-string filters the six answer endpoints accept (FR-57, FR-72).
 *
 * ## Why an unknown parameter is a 400 rather than ignored
 *
 * `?engagment=acme` — one letter wrong — returns every engagement's rows if
 * unknown parameters are ignored. The caller sees a plausible, well-formed,
 * completely unfiltered answer and has no way to tell. That is the same failure
 * as a widened regex: a wrong result that looks like a right one, arrived at by
 * being permissive about input nobody could classify.
 *
 * So this module refuses what it does not recognise, in both directions: an
 * unknown parameter *name* and an unrecognised parameter *value* are both
 * `invalid_request`, and the message names the offending key and lists what was
 * expected. That is louder than the alternative and loud is the point.
 *
 * ## Why `engagement` is a slug and not a uuid
 *
 * §7a lets an agent read `engagement.slug`; the slug is also the URL-safe,
 * human-typable identity Erik uses everywhere else in this product. A caller
 * naming an engagement that does not exist gets an empty result with
 * `engagementUnknown: true` on the payload rather than a 404 — an engagement
 * with no rows and an engagement that does not exist look identical in the data,
 * and the flag is how the two are told apart without guessing.
 */

import { apiError } from "@/lib/api";

/** Filters every answer accepts. */
export interface CommonFilters {
  /** `engagement.slug`, or null for every engagement. */
  engagement: string | null;
}

export interface BlockedFilters extends CommonFilters {
  /** Narrow to one owner group. Free text — §7a leaves owner vocabularies open. */
  owner: string | null;
  /** `carried` or `closed`, per FR-30. Null means both. */
  disposition: "carried" | "closed" | null;
}

export interface NextFilters extends CommonFilters {
  limit: number;
}

export interface CommittedFilters extends CommonFilters {
  /** FR-50/FR-51. Null means every state. */
  state: "open" | "claimed" | "billable" | null;
  /**
   * FR-75. Narrows "shipped" to one deployment environment. Left out, any
   * release counts — the parser keeps the environment set rather than a boolean
   * precisely so this stays the caller's choice.
   */
  environment: string | null;
}

export type UntestedFilters = CommonFilters;

export interface BottleneckFilters extends CommonFilters {
  limit: number;
}

export interface BrokenFilters extends CommonFilters {
  severity: "critical" | "major" | "minor" | "unparsed" | null;
}

const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 500;

function refuse(message: string): never {
  throw apiError("invalid_request", message);
}

/**
 * Reject any parameter this endpoint does not define.
 *
 * `allowed` is the complete set for the route. Empty values are still names —
 * `?owner=` is a caller asking to filter by an empty owner and is refused by
 * the value parsers, not silently dropped here.
 */
function assertKnownParameters(url: URL, allowed: readonly string[]): void {
  const unknown = [...url.searchParams.keys()].filter(
    (key) => !allowed.includes(key),
  );
  if (unknown.length > 0) {
    refuse(
      `Unrecognised query parameter${unknown.length > 1 ? "s" : ""}: ` +
        `${unknown.join(", ")}. This endpoint accepts ${allowed.join(", ")}. ` +
        `Unknown parameters are refused rather than ignored, because an ignored ` +
        `filter returns an unfiltered answer that looks filtered.`,
    );
  }
}

function optionalText(url: URL, key: string): string | null {
  const raw = url.searchParams.get(key);
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") {
    refuse(`\`${key}\` was given with no value. Omit it, or give it a value.`);
  }
  if (trimmed.length > 200) {
    refuse(`\`${key}\` is longer than 200 characters.`);
  }
  return trimmed;
}

function oneOf<T extends string>(
  url: URL,
  key: string,
  allowed: readonly T[],
): T | null {
  const value = optionalText(url, key);
  if (value === null) return null;
  if (!(allowed as readonly string[]).includes(value)) {
    refuse(
      `\`${key}=${value}\` is not one of ${allowed.join(", ")}. ` +
        `An unrecognised value is refused rather than defaulted.`,
    );
  }
  return value as T;
}

/**
 * A row limit.
 *
 * Bounded at `MAX_LIMIT` rather than accepted as given: an unbounded list
 * endpoint is an `important` finding under the security baseline's §5, and this
 * one runs behind a token whose rate limit counts requests rather than rows.
 * A caller asking for more is told the ceiling rather than silently clamped —
 * a silently clamped page looks like a complete one.
 */
function limit(url: URL): number {
  const raw = url.searchParams.get("limit");
  if (raw === null) return DEFAULT_LIMIT;
  if (!/^\d+$/.test(raw.trim())) {
    refuse("`limit` must be a whole number.");
  }
  const value = Number(raw.trim());
  if (value < 1) refuse("`limit` must be at least 1.");
  if (value > MAX_LIMIT) {
    refuse(`\`limit\` is capped at ${MAX_LIMIT}; ${value} was asked for.`);
  }
  return value;
}

export function parseBlockedFilters(url: URL): BlockedFilters {
  assertKnownParameters(url, ["engagement", "owner", "disposition"]);
  return {
    engagement: optionalText(url, "engagement"),
    owner: optionalText(url, "owner"),
    disposition: oneOf(url, "disposition", ["carried", "closed"] as const),
  };
}

export function parseNextFilters(url: URL): NextFilters {
  assertKnownParameters(url, ["engagement", "limit"]);
  return { engagement: optionalText(url, "engagement"), limit: limit(url) };
}

export function parseCommittedFilters(url: URL): CommittedFilters {
  assertKnownParameters(url, ["engagement", "state", "environment"]);
  return {
    engagement: optionalText(url, "engagement"),
    state: oneOf(url, "state", ["open", "claimed", "billable"] as const),
    environment: optionalText(url, "environment"),
  };
}

export function parseUntestedFilters(url: URL): UntestedFilters {
  assertKnownParameters(url, ["engagement"]);
  return { engagement: optionalText(url, "engagement") };
}

export function parseBottleneckFilters(url: URL): BottleneckFilters {
  assertKnownParameters(url, ["engagement", "limit"]);
  return { engagement: optionalText(url, "engagement"), limit: limit(url) };
}

export function parseBrokenFilters(url: URL): BrokenFilters {
  assertKnownParameters(url, ["engagement", "severity"]);
  return {
    engagement: optionalText(url, "engagement"),
    severity: oneOf(url, "severity", [
      "critical",
      "major",
      "minor",
      "unparsed",
    ] as const),
  };
}
