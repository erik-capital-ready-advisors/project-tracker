/**
 * FR-44's filter and sort state, as a pure function over the URL.
 *
 * Nothing here reads a database, a cookie or a clock. That is what lets the one
 * rule most likely to be got quietly wrong -- what happens to a filter value the
 * system does not recognise -- be proven by test rather than asserted.
 *
 * ## An unrecognised filter is reported, never dropped
 *
 * The tempting implementation ignores `?executor=bob` and renders the list
 * unfiltered. That is the widening failure this project names in `CLAUDE.md`,
 * moved from the parser to the URL: the screen would show MORE rows than were
 * asked for while looking like it answered the question. Every value that does
 * not parse comes back in `rejected` and the screen says so above the table.
 *
 * The closed sets themselves are not re-declared here. `EXECUTION_MODE`,
 * `EXECUTOR_KIND`, `EVIDENCE_SCOPE`, `DISPOSITION`, `UNAUTOMATED_REASON` and
 * `WORK_STATUS` in `@/lib/server/workitems/rules` are the single spelling
 * authority, and re-listing their members in a dropdown is how a screen and a
 * database drift into disagreeing about what `erik_gate` is called.
 *
 * ## A stored value is not a URL value, and `toWire` is the difference
 *
 * `closedSet` in `rules.ts` maps a **wire** spelling to a **stored** one, and
 * for two of the six sets those differ: `EVIDENCE_SCOPE` stores
 * `observed_live` and accepts only `observed-live`; `UNAUTOMATED_REASON` stores
 * `human_judgment` and accepts only `human-judgment`. `parse` is an exact key
 * lookup with no normalisation, so writing a stored value into the URL produces
 * a link this module then REJECTS.
 *
 * It did, on eight of this screen's twenty-eight filter option values, until
 * M2.7 (f5) — measured, not inferred. The symptom was the one this file's next
 * paragraph exists to prevent, arrived at from the other end: pick "human
 * judgment", get the "not recognised" banner and an unfiltered list. It also
 * broke FR-84 outright for those two filters, because the URL a detail view
 * restores is only as good as the parse on the way back in.
 *
 * So every closed-set value goes through `toWire` on the way out, uniformly —
 * including the four sets where the two spellings happen to coincide today.
 * Applying it only where it currently matters is how this returns.
 *
 * **The fix is here and not in `rules.ts`.** Teaching `UNAUTOMATED_REASON` to
 * also accept `human_judgment` would work and is the wrong move twice over: it
 * widens a closed set to make a stubborn input classify, which `CLAUDE.md`
 * names as the failure this project is built around, and `toWire` already
 * exists for exactly this translation.
 *
 * ## Filters are clear columns only, and that is §7a's decision rather than mine
 *
 * `work_item.description` and `raw_status` are pgcrypto columns, and §7a states
 * the consequence outright: **there is no cross-engagement full-text search over
 * work items in v1.** So there is no `q=` parameter here, and adding one is a
 * change request with a design decision attached rather than a small feature.
 */

import {
  ENGAGEMENT_PARAM,
  engagementFilterFrom,
} from "@/lib/engagement-filter";
import type { SearchParamRecord } from "@/lib/engagement-filter";
import {
  DISPOSITION,
  EVIDENCE_SCOPE,
  EXECUTION_MODE,
  EXECUTOR_KIND,
  UNAUTOMATED_REASON,
  WORK_STATUS,
  parseSortColumn,
  parseSortDirection,
} from "@/lib/server/workitems/rules";
import type {
  StoredDisposition,
  StoredEvidenceScope,
  StoredExecutionMode,
  StoredExecutorKind,
  StoredUnautomatedReason,
  StoredWorkStatus,
  WorkItemSortColumn,
} from "@/lib/server/workitems/rules";

/** Rows per page. Small enough to read in one glance, per spec 5a. */
export const PAGE_SIZE = 50;

/**
 * The URL parameter names, in one place so the form and the parser agree.
 *
 * `engagement` comes from `@/lib/engagement-filter` rather than being spelled
 * again here. FR-96 puts the same filter on eleven screens, and this object's
 * own literal was one of the four independent declarations of it that made
 * "the same parameter" a coincidence rather than a fact.
 */
export const PARAM = {
  engagement: ENGAGEMENT_PARAM,
  mode: "mode",
  executor: "executor",
  status: "status",
  disposition: "disposition",
  reason: "reason",
  evidence: "evidence",
  blocked: "blocked",
  sort: "sort",
  dir: "dir",
  page: "page",
} as const;

/** An alias, not a fifth declaration of the shape. See `PARAM.engagement`. */
export type SearchParams = SearchParamRecord;

export interface RejectedFilter {
  field: string;
  value: string;
}

export interface WorkItemQuery {
  engagementSlug: string | null;
  executionMode: StoredExecutionMode | null;
  executorKind: StoredExecutorKind | null;
  status: StoredWorkStatus | null;
  disposition: StoredDisposition | null;
  unautomatedReason: StoredUnautomatedReason | null;
  evidenceScope: StoredEvidenceScope | null;
  blockedOnly: boolean;
  sort: WorkItemSortColumn;
  direction: "asc" | "desc";
  page: number;
  /** Values the URL carried that no closed set recognises. Never silently ignored. */
  rejected: RejectedFilter[];
  /** True when any filter is applied, so the screen can say what it is showing. */
  filtered: boolean;
}

/** The sort a screen falls back to. Named rather than inlined so the test can pin it. */
export const DEFAULT_SORT: WorkItemSortColumn = "started_at";
export const DEFAULT_DIRECTION = "desc" as const;

function single(params: SearchParams, key: string): string | null {
  const raw = params[key];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Apply a closed-set parser to a URL value, recording a rejection rather than
 * falling back to "no filter".
 */
function closed<T>(
  params: SearchParams,
  key: string,
  parse: (raw: unknown) => T | null,
  rejected: RejectedFilter[],
): T | null {
  const raw = single(params, key);
  if (raw === null) return null;
  const parsed = parse(raw);
  if (parsed === null) {
    rejected.push({ field: key, value: raw });
    return null;
  }
  return parsed;
}

export function parseWorkItemQuery(params: SearchParams): WorkItemQuery {
  const rejected: RejectedFilter[] = [];

  // FR-96. The cap, the trim and the empty-value rule all come from
  // `@/lib/engagement-filter` now; the local `SLUG_LIMIT = 128` this replaced
  // agreed with it by hand, which is exactly the kind of agreement that stops
  // being true the day one of the two moves.
  const engagementFilter = engagementFilterFrom(params);
  if (engagementFilter.kind === "rejected") {
    rejected.push({
      field: PARAM.engagement,
      value: engagementFilter.value,
    });
  }
  const engagementSlug =
    engagementFilter.kind === "slug" ? engagementFilter.slug : null;

  const executionMode = closed(
    params,
    PARAM.mode,
    EXECUTION_MODE.parse,
    rejected,
  );
  const executorKind = closed(
    params,
    PARAM.executor,
    EXECUTOR_KIND.parse,
    rejected,
  );
  const status = closed(params, PARAM.status, WORK_STATUS.parse, rejected);
  const disposition = closed(
    params,
    PARAM.disposition,
    DISPOSITION.parse,
    rejected,
  );
  const unautomatedReason = closed(
    params,
    PARAM.reason,
    UNAUTOMATED_REASON.parse,
    rejected,
  );
  const evidenceScope = closed(
    params,
    PARAM.evidence,
    EVIDENCE_SCOPE.parse,
    rejected,
  );

  // Presence-style flag. Only the two spellings a link in this app produces are
  // accepted; anything else is reported, because a mistyped `blocked=ture`
  // silently showing every row is the same failure as a mistyped enum.
  const rawBlocked = single(params, PARAM.blocked);
  let blockedOnly = false;
  if (rawBlocked !== null) {
    if (rawBlocked === "1" || rawBlocked === "true") blockedOnly = true;
    else if (rawBlocked === "0" || rawBlocked === "false") blockedOnly = false;
    else rejected.push({ field: PARAM.blocked, value: rawBlocked });
  }

  const rawSort = single(params, PARAM.sort);
  let sort = DEFAULT_SORT;
  if (rawSort !== null) {
    const parsed = parseSortColumn(rawSort);
    if (parsed === null) rejected.push({ field: PARAM.sort, value: rawSort });
    else sort = parsed;
  }

  const rawDirection = single(params, PARAM.dir);
  let direction: "asc" | "desc" = DEFAULT_DIRECTION;
  if (rawDirection !== null) {
    const parsed = parseSortDirection(rawDirection);
    if (parsed === null) rejected.push({ field: PARAM.dir, value: rawDirection });
    else direction = parsed;
  }

  const rawPage = single(params, PARAM.page);
  let page = 1;
  if (rawPage !== null) {
    const parsed = Number(rawPage);
    if (!Number.isInteger(parsed) || parsed < 1) {
      rejected.push({ field: PARAM.page, value: rawPage });
    } else {
      page = parsed;
    }
  }

  return {
    engagementSlug,
    executionMode,
    executorKind,
    status,
    disposition,
    unautomatedReason,
    evidenceScope,
    blockedOnly,
    sort,
    direction,
    page,
    rejected,
    filtered:
      engagementSlug !== null ||
      executionMode !== null ||
      executorKind !== null ||
      status !== null ||
      disposition !== null ||
      unautomatedReason !== null ||
      evidenceScope !== null ||
      blockedOnly,
  };
}

/**
 * Rebuild the query string with some parameters changed.
 *
 * Used for the column sort links and pagination, so those stay ordinary `<a>`
 * elements: server-rendered, middle-clickable, and correct with the back button.
 * Changing a filter always returns to page one, because staying on page seven of
 * a list that just got shorter shows an empty page that reads like an empty
 * ledger.
 */
export function withParams(
  query: WorkItemQuery,
  changes: Partial<
    Record<keyof typeof PARAM, string | number | boolean | null>
  >,
): string {
  const current: Record<string, string> = {};

  if (query.engagementSlug) current[PARAM.engagement] = query.engagementSlug;
  // `toWire` on every one of them, including where the two spellings coincide.
  // See the header: this is the round trip FR-84 rests on.
  if (query.executionMode)
    current[PARAM.mode] = EXECUTION_MODE.toWire(query.executionMode);
  if (query.executorKind)
    current[PARAM.executor] = EXECUTOR_KIND.toWire(query.executorKind);
  if (query.status) current[PARAM.status] = WORK_STATUS.toWire(query.status);
  if (query.disposition)
    current[PARAM.disposition] = DISPOSITION.toWire(query.disposition);
  if (query.unautomatedReason)
    current[PARAM.reason] = UNAUTOMATED_REASON.toWire(query.unautomatedReason);
  if (query.evidenceScope)
    current[PARAM.evidence] = EVIDENCE_SCOPE.toWire(query.evidenceScope);
  if (query.blockedOnly) current[PARAM.blocked] = "1";
  if (query.sort !== DEFAULT_SORT) current[PARAM.sort] = query.sort;
  if (query.direction !== DEFAULT_DIRECTION) current[PARAM.dir] = query.direction;
  if (query.page !== 1) current[PARAM.page] = String(query.page);

  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === false || value === "") delete current[key];
    else current[key] = String(value);
    // Anything other than a page change alters what the list contains, and
    // staying on page seven of a list that just got shorter renders an empty
    // page that reads exactly like an empty ledger.
    if (key !== PARAM.page) delete current[PARAM.page];
  }

  const search = new URLSearchParams(current).toString();
  return search === "" ? "/work-items" : `/work-items?${search}`;
}

/**
 * The direction a column header should link to.
 *
 * Clicking the column already sorted flips it; clicking a different column
 * starts it descending, because every sortable column here is a recency or
 * severity axis where the interesting end is the top.
 */
export function nextDirection(
  query: WorkItemQuery,
  column: WorkItemSortColumn,
): "asc" | "desc" {
  if (query.sort !== column) return "desc";
  return query.direction === "desc" ? "asc" : "desc";
}
