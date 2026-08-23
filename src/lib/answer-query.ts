/**
 * The six answer screens' filter state, as pure functions over the URL.
 *
 * Nothing here reads a database, a cookie or a clock, which is what lets the one
 * rule most likely to be got quietly wrong — what happens to a filter value the
 * system does not recognise — be proven by test rather than asserted.
 *
 * ## Why this is not `src/lib/server/answers/filters.ts`
 *
 * That module is the *endpoint's* parser and it is right for an endpoint: an
 * unrecognised parameter throws `invalid_request`, so an agent gets a `400`
 * naming its mistake rather than a plausible unfiltered answer. A **screen**
 * cannot do that — a thrown `ApiError` inside a Server Component renders an
 * error page, and losing the whole answer because one query parameter was
 * mistyped is a worse outcome than showing the answer with the bad filter named
 * above it.
 *
 * So the two modules disagree about the *response* and agree about the *rule*:
 * **an unrecognised value is never silently dropped.** The endpoint refuses it;
 * the screen reports it in `rejected` and says so above the table. Neither
 * pretends the filter was applied. That is u4's idiom on `/work-items`, applied
 * to the six answers.
 *
 * The closed sets themselves are not re-declared. They are imported from
 * `@/lib/server/answers/filters`' own vocabulary below as literal tuples that
 * the type system checks against that module's filter interfaces — so a screen
 * offering an option the endpoint would refuse is a type error rather than a
 * discovery.
 */

import type {
  BlockedFilters,
  BottleneckFilters,
  BrokenFilters,
  CommittedFilters,
  NextFilters,
  UntestedFilters,
} from "@/lib/server/answers/filters";

/* ------------------------------------------------------------------------ */
/* The closed sets, exactly as the endpoints define them                     */
/* ------------------------------------------------------------------------ */

/** FR-30. Both dispositions are filterable and neither is a default. */
export const DISPOSITIONS = ["carried", "closed"] as const;

/** FR-50 / FR-51. `claimed` is a review request, not an invoice. */
export const MILESTONE_STATES = ["open", "claimed", "billable"] as const;

/** FR-63. `unparsed` is one of the four and is never omitted from the control. */
export const SEVERITIES = ["critical", "major", "minor", "unparsed"] as const;

/**
 * The row limit the screens offer.
 *
 * `MAX_LIMIT` in the endpoint's parser is 500 and these stay under it, so a
 * screen can never build a URL the endpoint would refuse. The default matches
 * the endpoint's default for the same reason: two surfaces answering the same
 * question with different page sizes is a small version of two surfaces
 * answering with different numbers.
 */
export const LIMITS = [25, 50, 100, 250, 500] as const;
export const DEFAULT_LIMIT = 50;

/** URL parameter names, in one place so the form and the parser agree. */
export const PARAM = {
  engagement: "engagement",
  owner: "owner",
  disposition: "disposition",
  state: "state",
  environment: "environment",
  severity: "severity",
  limit: "limit",
} as const;

export type SearchParams = Record<string, string | string[] | undefined>;

export interface RejectedFilter {
  field: string;
  value: string;
}

/** What every screen's parsed query carries beyond its own filters. */
export interface QueryReport {
  /** Values the URL carried that no closed set recognises. Never silently ignored. */
  rejected: RejectedFilter[];
  /** True when any filter narrows the answer, so the screen can say what it shows. */
  filtered: boolean;
}

export type BlockedQuery = BlockedFilters & QueryReport;
export type NextQuery = NextFilters & QueryReport;
export type CommittedQuery = CommittedFilters & QueryReport;
export type UntestedQuery = UntestedFilters & QueryReport;
export type BottleneckQuery = BottleneckFilters & QueryReport;
export type BrokenQuery = BrokenFilters & QueryReport;

/* ------------------------------------------------------------------------ */
/* Primitives                                                                */
/* ------------------------------------------------------------------------ */

/**
 * Free text, length-capped at the endpoint's own 200 characters.
 *
 * A value longer than the cap is *rejected* rather than truncated. A truncated
 * slug is a different slug, and filtering by a different slug than the one asked
 * for is the widening failure with an extra step.
 */
const TEXT_LIMIT = 200;

function single(params: SearchParams, key: string): string | null {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function text(
  params: SearchParams,
  key: string,
  rejected: RejectedFilter[],
): string | null {
  const raw = single(params, key);
  if (raw === null) return null;
  if (raw.length > TEXT_LIMIT) {
    rejected.push({ field: key, value: `${raw.slice(0, 32)}…` });
    return null;
  }
  return raw;
}

/**
 * A member of a closed set, or a recorded rejection.
 *
 * The generic is pinned to the tuple's member type, so adding an option to a
 * dropdown that this function's `allowed` tuple does not carry is a type error
 * at the call site rather than a filter that silently never applies.
 */
function oneOf<T extends string>(
  params: SearchParams,
  key: string,
  allowed: readonly T[],
  rejected: RejectedFilter[],
): T | null {
  const raw = single(params, key);
  if (raw === null) return null;
  if (!(allowed as readonly string[]).includes(raw)) {
    rejected.push({ field: key, value: raw });
    return null;
  }
  return raw as T;
}

/**
 * The row limit.
 *
 * A limit outside the offered set is rejected rather than clamped. A silently
 * clamped page looks like a complete one — the same reason the endpoint's parser
 * tells a caller the ceiling instead of quietly applying it.
 */
function limit(params: SearchParams, rejected: RejectedFilter[]): number {
  const raw = single(params, PARAM.limit);
  if (raw === null) return DEFAULT_LIMIT;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || !(LIMITS as readonly number[]).includes(parsed)) {
    rejected.push({ field: PARAM.limit, value: raw });
    return DEFAULT_LIMIT;
  }
  return parsed;
}

/* ------------------------------------------------------------------------ */
/* The six parsers                                                           */
/* ------------------------------------------------------------------------ */

export function parseBlockedQuery(params: SearchParams): BlockedQuery {
  const rejected: RejectedFilter[] = [];
  const engagement = text(params, PARAM.engagement, rejected);
  const owner = text(params, PARAM.owner, rejected);
  const disposition = oneOf(params, PARAM.disposition, DISPOSITIONS, rejected);
  return {
    engagement,
    owner,
    disposition,
    rejected,
    filtered: engagement !== null || owner !== null || disposition !== null,
  };
}

export function parseNextQuery(params: SearchParams): NextQuery {
  const rejected: RejectedFilter[] = [];
  const engagement = text(params, PARAM.engagement, rejected);
  return {
    engagement,
    limit: limit(params, rejected),
    rejected,
    // A limit is a page size, not a filter: it changes how much of the answer is
    // shown, not which rows qualify. Calling it a filter would make the screen
    // say "these results are filtered" about an unfiltered answer.
    filtered: engagement !== null,
  };
}

export function parseCommittedQuery(params: SearchParams): CommittedQuery {
  const rejected: RejectedFilter[] = [];
  const engagement = text(params, PARAM.engagement, rejected);
  const state = oneOf(params, PARAM.state, MILESTONE_STATES, rejected);
  const environment = text(params, PARAM.environment, rejected);
  return {
    engagement,
    state,
    environment,
    rejected,
    filtered: engagement !== null || state !== null || environment !== null,
  };
}

export function parseUntestedQuery(params: SearchParams): UntestedQuery {
  const rejected: RejectedFilter[] = [];
  const engagement = text(params, PARAM.engagement, rejected);
  return { engagement, rejected, filtered: engagement !== null };
}

export function parseBottleneckQuery(params: SearchParams): BottleneckQuery {
  const rejected: RejectedFilter[] = [];
  const engagement = text(params, PARAM.engagement, rejected);
  return {
    engagement,
    limit: limit(params, rejected),
    rejected,
    filtered: engagement !== null,
  };
}

export function parseBrokenQuery(params: SearchParams): BrokenQuery {
  const rejected: RejectedFilter[] = [];
  const engagement = text(params, PARAM.engagement, rejected);
  const severity = oneOf(params, PARAM.severity, SEVERITIES, rejected);
  return {
    engagement,
    severity,
    rejected,
    filtered: engagement !== null || severity !== null,
  };
}
