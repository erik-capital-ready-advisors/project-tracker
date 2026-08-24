/**
 * FR-96's engagement filter, as pure functions over the URL.
 *
 * This is the single spelling authority for the filter: the parameter name, the
 * length cap, which screens honour it, and how a link that carries it is built.
 * Nothing here reads a database, a cookie, a clock or the DOM, which is what
 * lets the rules most likely to be got quietly wrong be proven by test.
 *
 * ## Why this module exists rather than a fourth copy
 *
 * Before it, `engagement` was spelled in three unrelated places — `PARAM` in
 * `@/lib/answer-query` (the six answer screens), `PARAM` in
 * `@/app/work-items/_lib/query` (an identical but separate declaration), and
 * two ad-hoc inline `Record` types on `/questions` and `/waits`. `/runs` and
 * `/registry` read no query string at all. Eleven screens honouring "the same"
 * parameter across four independent declarations is how two of them end up
 * disagreeing about what the parameter is called, and a screen that ignores the
 * filter renders an unfiltered list under a filtered heading — the failure
 * FR-96c is written against, arrived at from the other end.
 *
 * The three existing parsers are **not** rewritten by the unit that added this
 * file; they keep their own shapes and their own tests. What they gain is
 * something to converge on, and `ENGAGEMENT_PARAM` is deliberately the same
 * string they already use, so adoption is a rename and never a behaviour
 * change.
 *
 * ## The cap is 128 because `engagement.slug`'s own validator says 128
 *
 * `MAX.slug` in `@/lib/server/registry/validation` is 128, so a slug longer
 * than that cannot name a row that exists. `@/lib/answer-query`'s 200 is the
 * cap for *free text* (`owner`, `environment`) and is right for those; applying
 * it to a slug just delays the same answer. A value over the cap is **rejected
 * and reported**, never truncated: a truncated slug is a different slug, and
 * filtering by a different slug than the one asked for is the widening failure
 * with an extra step.
 *
 * ## What this module deliberately does NOT do
 *
 * It does not check the slug against the `^[a-z0-9-]+$` shape the registry
 * enforces. `?engagement=Acme` is not malformed enough to need a second kind of
 * loud: it resolves to no engagement, and FR-96c already renders that as an
 * explicit "no such engagement" state with no rows. Adding a pattern check
 * would give two different loud answers to one mistake and put a copy of the
 * registry's slug grammar in the UI layer, where it would drift.
 *
 * It also does not resolve a slug to an engagement. That needs a database and
 * belongs to the screen; `EngagementResolution` below is the shape the screen
 * reports its answer in.
 */

/* ------------------------------------------------------------------------ */
/* The parameter                                                             */
/* ------------------------------------------------------------------------ */

/**
 * The URL parameter name, everywhere in the product.
 *
 * Equal by construction to `PARAM.engagement` in `@/lib/answer-query` and in
 * `@/app/work-items/_lib/query`; `tests/engagement-filter.test.ts` pins that
 * equality so the three cannot drift apart silently.
 */
export const ENGAGEMENT_PARAM = "engagement";

/** `MAX.slug` in the registry's own validator. A longer value names nothing. */
export const ENGAGEMENT_SLUG_LIMIT = 128;

/**
 * The `searchParams` shape every screen in this product already uses, declared
 * once. Next hands a page this after `await`; `URLSearchParams` is what a client
 * component holds. Both are accepted below.
 */
export type SearchParamRecord = Record<string, string | string[] | undefined>;

/**
 * What the URL said about the engagement filter.
 *
 * Three outcomes rather than two, for the same reason `unparsedState` has three:
 * "no filter asked for" and "a filter was asked for and could not be used" are
 * different facts, and collapsing them renders an unfiltered list while the URL
 * says otherwise.
 */
export type EngagementFilter =
  /** No `engagement` parameter. The cross-engagement view, which FR-96 keeps as the default. */
  | { readonly kind: "none" }
  /** A slug to filter by. Not yet known to name a real engagement — see `EngagementResolution`. */
  | { readonly kind: "slug"; readonly slug: string }
  /** Present but unusable. The screen reports it; it never applies it and never drops it. */
  | { readonly kind: "rejected"; readonly value: string };

/** The one filter shape, so a caller need not re-derive `none` from `null`. */
export const NO_ENGAGEMENT_FILTER: EngagementFilter = { kind: "none" };

/**
 * Duck-typed rather than `instanceof URLSearchParams`, on purpose.
 *
 * `useSearchParams()` returns Next's `ReadonlyURLSearchParams`, and jsdom, the
 * edge runtime and node each supply their own `URLSearchParams` constructor. An
 * `instanceof` check across two realms answers `false` for an object that is
 * one — and it would fail by falling through to the record branch and reading
 * `params["engagement"]` off a class instance, which is `undefined`. That is a
 * silently unfiltered view, which is the one outcome this module exists to
 * prevent.
 */
function isSearchParams(
  params: SearchParamRecord | URLSearchParams,
): params is URLSearchParams {
  return typeof (params as URLSearchParams).getAll === "function";
}

function rawValue(
  params: SearchParamRecord | URLSearchParams,
  key: string,
): string | null {
  if (isSearchParams(params)) return params.get(key);
  const value = params[key];
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === "string" ? first : null;
}

/**
 * Read the engagement filter out of a URL.
 *
 * An empty or whitespace-only value is `none` rather than a rejection: `?
 * engagement=` is what a cleared control submits, and refusing it would make
 * clearing the filter an error. Every other unusable value is reported.
 */
export function engagementFilterFrom(
  params: SearchParamRecord | URLSearchParams,
): EngagementFilter {
  const raw = rawValue(params, ENGAGEMENT_PARAM);
  if (raw === null) return NO_ENGAGEMENT_FILTER;

  const trimmed = raw.trim();
  if (trimmed === "") return NO_ENGAGEMENT_FILTER;
  if (trimmed.length > ENGAGEMENT_SLUG_LIMIT) {
    return { kind: "rejected", value: trimmed.slice(0, 32) };
  }
  return { kind: "slug", slug: trimmed };
}

/** The slug to filter by, or `null` for every engagement. A rejection filters nothing. */
export function engagementFilterSlug(filter: EngagementFilter): string | null {
  return filter.kind === "slug" ? filter.slug : null;
}

/** Whether the URL narrows the view to one engagement. A rejection does not. */
export function isEngagementFiltered(filter: EngagementFilter): boolean {
  return filter.kind === "slug";
}

/* ------------------------------------------------------------------------ */
/* Which screens honour it                                                   */
/* ------------------------------------------------------------------------ */

/**
 * The eleven screens the filter applies to — CR-005 §3.3 point 1, verbatim.
 *
 * Listed literally rather than derived from `@/lib/nav` by subtracting the two
 * settings pages. Derivation-by-exclusion would silently enrol the next nav
 * entry anyone appends, and a screen that accepts `?engagement=` without
 * honouring it is precisely the lie FR-96c exists to prevent. Instead
 * `tests/engagement-filter.test.ts` asserts this list against `ALL_ROUTES`
 * minus the settings pair, so adding a nav entry trips a test and makes the
 * decision visible rather than making it for you.
 *
 * **Matching is exact, never by prefix.** `/registry` takes the filter and
 * `/registry/[slug]` does not — a detail view already *is* one record, and
 * filtering it can only produce a page that hides itself (CR-005 §3.3 point 1).
 * A prefix match would enrol every detail view under these eleven paths, plus
 * `/registry/new` and `/work-items/unassigned`, none of which reads the
 * parameter.
 */
export const ENGAGEMENT_FILTERABLE_PATHS: readonly string[] = [
  "/blocked",
  "/next",
  "/committed",
  "/untested",
  "/bottleneck",
  "/broken",
  "/registry",
  "/work-items",
  "/waits",
  "/questions",
  "/runs",
] as const;

/** Whether this exact path honours `?engagement=`. See the note on exact matching. */
export function isEngagementFilterable(pathname: string): boolean {
  return ENGAGEMENT_FILTERABLE_PATHS.includes(pathname);
}

/* ------------------------------------------------------------------------ */
/* Building links that carry it                                              */
/* ------------------------------------------------------------------------ */

/**
 * Parameters dropped whenever the filter changes.
 *
 * `page` only. Staying on page seven of a list that just got shorter shows an
 * empty page that reads exactly like an empty ledger — `withParams` in
 * `@/app/work-items/_lib/query` already made this call for that screen's own
 * controls, and the shell picker must not disagree with it.
 *
 * Every OTHER parameter survives. A picker that reset `severity` or `sort` on
 * its way past would quietly discard filters Erik set on purpose.
 */
const RESET_ON_FILTER_CHANGE: readonly string[] = ["page"];

/**
 * The href for the same screen with the engagement filter set, cleared, or
 * changed — every other parameter preserved.
 *
 * `slug === null` clears it. The parameter is **removed** rather than emitted
 * empty, so the unfiltered URL is the bare path and a cleared filter produces
 * the link FR-96 calls the default view.
 *
 * Ordering is stable — the engagement first, then the remaining parameters in
 * the order the URL carried them — so the same state always produces the same
 * string and two links to one view are byte-identical.
 */
export function withEngagementFilter(
  pathname: string,
  params: SearchParamRecord | URLSearchParams,
  slug: string | null,
): string {
  const next = new URLSearchParams();

  if (slug !== null && slug.trim() !== "") {
    next.set(ENGAGEMENT_PARAM, slug.trim());
  }

  for (const [key, value] of preservedEngagementParams(params)) {
    next.append(key, value);
  }

  const search = next.toString();
  return search === "" ? pathname : `${pathname}?${search}`;
}

/**
 * Every parameter a link or form that CHANGES the engagement filter must carry
 * forward — that is, all of them except the filter itself and `page`.
 *
 * Exactly the set `withEngagementFilter` preserves, exported separately so the
 * shell picker's hidden form fields and any href built alongside them cannot
 * disagree about what survives a filter change. Repeated parameters stay
 * repeats.
 */
export function preservedEngagementParams(
  params: SearchParamRecord | URLSearchParams,
): readonly (readonly [string, string])[] {
  return entriesOf(params).filter(
    ([key]) =>
      key !== ENGAGEMENT_PARAM && !RESET_ON_FILTER_CHANGE.includes(key),
  );
}

function entriesOf(
  params: SearchParamRecord | URLSearchParams,
): (readonly [string, string])[] {
  if (isSearchParams(params)) return [...params.entries()];

  const out: (readonly [string, string])[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") out.push([key, value] as const);
    else if (Array.isArray(value)) {
      for (const one of value) out.push([key, one] as const);
    }
  }
  return out;
}

/* ------------------------------------------------------------------------ */
/* FR-96c — what a screen must be able to say                                */
/* ------------------------------------------------------------------------ */

/**
 * The answer a screen reports after trying to resolve the filter's slug.
 *
 * **FR-96c: `unresolved` renders an explicit "no such engagement" state with no
 * rows, and never a silent fall-back to the unfiltered view.** A screen that
 * looks scoped while showing everything is the same class of lie as a wrong
 * `done`. `@/components/answer-notices`' `UnknownEngagementNotice` is the
 * rendering the six answer screens already use for it; the other five adopt it
 * rather than growing a second wording.
 *
 * **`unavailable` is the fourth state and it is not decoration.** If the
 * engagement read itself failed, "no engagement has this slug" is a positive
 * claim nothing checked — the same move as rendering `0` for an unread unparsed
 * count. A failed read renders the operator load notice, never FR-96c's state.
 *
 * An **archived-not-purged** engagement resolves normally and filters normally:
 * a permalink must not rot because the engagement was tidied away (CR-005 §3.3
 * point 2). `getEngagement(slug)` in `@/lib/server/registry/engagements` does
 * not filter on `archived_at`, so that half is already true and wants no code.
 * Only the *picker's* list is narrowed to active engagements.
 */
export type EngagementResolution =
  | { readonly kind: "unfiltered" }
  | { readonly kind: "resolved"; readonly slug: string; readonly id: string }
  | { readonly kind: "unresolved"; readonly slug: string }
  | { readonly kind: "unavailable"; readonly slug: string };
