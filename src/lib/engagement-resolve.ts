import "server-only";

import { cache } from "react";

import type {
  EngagementFilter,
  EngagementResolution,
} from "@/lib/engagement-filter";
import { getEngagement } from "@/lib/server/registry/engagements";

/**
 * FR-96c's other half: turning what the URL asked for into what the ledger has.
 *
 * `@/lib/engagement-filter` is the pure half — it reads the parameter, caps it
 * and says which screens honour it — and it deliberately stops short of
 * resolution, because that needs a database. This module is the one place that
 * lookup lives, so eleven screens cannot arrive at eleven answers to the
 * question "is `?engagement=acmee` a real engagement".
 *
 * ## Why all four `EngagementResolution` states are produced here
 *
 * The temptation is three: filtered, not filtered, no such thing. The fourth —
 * `unavailable` — is what keeps FR-96c honest. If the engagement read itself
 * failed, "no engagement has this slug" is a positive claim nothing checked, and
 * rendering FR-96c's notice for it would be a wrong `done` wearing a different
 * hat. A screen shows the load notice for that state and, crucially, **still
 * shows no rows**: a filter that could not be resolved has not been applied, and
 * rendering the unfiltered list under a picker reading `Acme` is precisely the
 * lie FR-96c names.
 *
 * ## Two entry points, because the eleven screens are not all the same shape
 *
 * `resolveEngagementSlug` takes a slug a caller has already validated — the
 * seven screens with a filter bar parse the whole query string themselves and
 * report an over-long value through `RejectedFilters`, which states in words
 * that the list below is NOT narrowed by it. That treatment is loud, it is what
 * every other filter on those bars gets, and this unit did not change it.
 *
 * `resolveEngagementFilter` takes the raw filter and maps a **rejection** to
 * `unresolved`. The four screens that gained the filter in this unit —
 * `/questions`, `/waits`, `/runs`, `/registry` — have no filter bar and no
 * rejection banner, so dropping an over-long value there would be exactly the
 * silent fall-back FR-96c forbids. Mapping is honest rather than convenient: a
 * value longer than `ENGAGEMENT_SLUG_LIMIT` (128, `MAX.slug`'s own cap) **cannot
 * name a row that exists**, so "no engagement has this slug" is true of it. The
 * value carried into the notice is the already-truncated one the filter
 * reported, so the screen never prints somebody's whole paste.
 *
 * The divergence is deliberate and is queued for Erik rather than settled here.
 *
 * What must NOT happen on either path is the third option.
 * `engagementFilterSlug()` returns `null` for a rejection and
 * `isEngagementFiltered()` returns `false`, so a screen that reached for either
 * of those and stopped there would render the **unfiltered** list for a filter
 * the URL plainly carries.
 *
 * ## Call it INSIDE `loadForOperator`, not beside it
 *
 * `getEngagement` calls `requireOperator()`. A gated visitor would therefore get
 * `unavailable` here as well as a gate refusal from the screen's own read, and
 * the screen would render two notices about one sign-in. Resolving inside the
 * same `loadForOperator` callback means the gate is reported once, by the
 * machinery that already owns it, and `unavailable` is left meaning what it
 * says: a role-holding operator asked, and the read failed.
 *
 * ## Security posture (§7a)
 *
 * `engagement` is `personal`, with §7a's stated exception that `client_name` and
 * the slug are deliberately not encrypted because they are the grouping key on
 * every screen — which is what makes this filter possible at all. Nothing here
 * reads a `sensitive` column, and the only value leaving this module besides the
 * slug the caller already had is the engagement's `id`, used to scope a query.
 * No `decrypt_field` call is issued on this path.
 */

/**
 * The lookup, keyed on a primitive so `cache()` can actually memoise it.
 *
 * `cache()` compares arguments by identity, so a function taking the
 * `EngagementFilter` object would miss on every call — a fresh literal is never
 * identity-equal to the last one. `@/lib/runs-load` made the same call for the
 * same reason and its header explains it at length.
 */
const resolveSlug = cache(
  async (slug: string): Promise<EngagementResolution> => {
    try {
      const record = await getEngagement(slug);
      return record === null
        ? { kind: "unresolved", slug }
        : { kind: "resolved", slug, id: record.id };
    } catch {
      // Deliberately swallowed here and deliberately not logged: the request
      // that failed owns its own audit path. This function has one job, which is
      // to never let a failed read become the claim that an engagement does not
      // exist. CR-005 §3.3 point 2: an archived-not-purged engagement resolves
      // normally, and `getEngagement` does not filter on `archived_at`, so that
      // half of the requirement needs no code here.
      return { kind: "unavailable", slug };
    }
  },
);

/**
 * What the ledger says about a slug a caller already validated.
 *
 * `null` is the unfiltered ledger. For the seven screens whose own parser
 * already reported an unusable value through `RejectedFilters`.
 */
export async function resolveEngagementSlug(
  slug: string | null,
): Promise<EngagementResolution> {
  if (slug === null) return { kind: "unfiltered" };
  return resolveSlug(slug);
}

/**
 * What the ledger says about the filter the URL carried, rejection included.
 *
 * For the four screens with no filter bar to report a rejection in. See the
 * header on why a rejection lands in `unresolved` rather than nowhere.
 */
export async function resolveEngagementFilter(
  filter: EngagementFilter,
): Promise<EngagementResolution> {
  if (filter.kind === "rejected") {
    return { kind: "unresolved", slug: filter.value };
  }
  return resolveEngagementSlug(filter.kind === "slug" ? filter.slug : null);
}

/**
 * Whether the screen must render **no rows**.
 *
 * True for both unresolvable states, and that pairing is the point: FR-96c's
 * "renders nothing, loudly" and a failed engagement read differ in what they
 * *say* and agree entirely on what they *show*. A screen that branched on
 * `unresolved` alone would fall back to the unfiltered list the moment the
 * engagement read failed — the same lie arrived at from the other end.
 */
export function engagementScopeBlocksRows(
  resolution: EngagementResolution,
): boolean {
  return resolution.kind === "unresolved" || resolution.kind === "unavailable";
}

/**
 * The engagement id to scope a query by, or `null` for the whole ledger.
 *
 * Only `resolved` yields one. Pair it with `engagementScopeBlocksRows` — on its
 * own, the `null` an `unresolved` resolution returns reads as "no filter" and
 * widens the query back to every engagement.
 */
export function engagementScopeId(
  resolution: EngagementResolution,
): string | null {
  return resolution.kind === "resolved" ? resolution.id : null;
}

/**
 * The slug to scope a query by, for the reads that filter on slug rather than
 * id. Same pairing rule as `engagementScopeId`.
 */
export function engagementScopeSlug(
  resolution: EngagementResolution,
): string | null {
  return resolution.kind === "resolved" ? resolution.slug : null;
}
