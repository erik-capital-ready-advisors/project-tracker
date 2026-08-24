import "server-only";

import { cache } from "react";

import { getOperatorContext } from "@/lib/api/operator";
import { listEngagements } from "@/lib/server/registry/engagements";

/**
 * The engagements FR-96b's shell picker offers, read once per request.
 *
 * Modelled on `@/lib/unparsed-census` deliberately, because it runs in exactly
 * the same place and carries exactly the same three hazards. What it adds to
 * `listEngagements()`:
 *
 *   1. **One read per request.** The picker renders in the app shell, which
 *      wraps every route. `cache()` is per-request memoisation, so a screen that
 *      also lists engagements shares this read rather than paying twice.
 *   2. **The operator gate.** `listEngagements()` opens the service-role client,
 *      which holds BYPASSRLS. An anonymous visitor on `/sign-in` must not learn
 *      Erik's client list from a dropdown in the header, so a caller who is not
 *      a role-holding operator at `aal2` gets `UNAVAILABLE`. §7a permits an
 *      operator `client_name` and `slug` and nothing here reads anything else.
 *   3. **A failure is `unavailable`, never an empty list.** This is the same
 *      distinction the unparsed count draws between `0` and unknown, and it
 *      matters for the same reason: an empty picker states that Erik has
 *      registered no engagements. On a request where the read failed, that is a
 *      claim nothing checked.
 *
 * ## Why the whole thing is wrapped in a `try`
 *
 * It runs in the **root layout**, so anything it throws takes every route down
 * with it, including `/sign-in`, which is how the operator would recover.
 * `requireOperator()` inside `listEngagements()` throws for an unauthenticated
 * caller and `createServiceClient()` throws outright when
 * `SUPABASE_SERVICE_ROLE_KEY` is unset — the state a fresh deployment and every
 * fleet worktree is in. A missing roster must degrade the picker, not the
 * product.
 *
 * ## Security posture
 *
 * §7a classifies `engagement` as `personal` with the stated exception that
 * `client_name` is deliberately not encrypted, because it is the display and
 * grouping key on every screen. Rendering it in a picker is inside that
 * declared posture. **`contract_milestone` is `sensitive` and this module never
 * reaches it** — the projection is two fields wide and neither is money.
 */

/** One option in the picker. Two clear columns, and deliberately no third. */
export interface EngagementOption {
  readonly slug: string;
  readonly clientName: string;
}

/**
 * Three states, not two, and the third one was earned by observation.
 *
 *   ok           the list was read. Zero options means "no engagements are
 *                registered", which is a fact and renders as one.
 *   gated        the caller is not a role-holding operator at `aal2`. There is
 *                nothing to offer and nothing to report — an anonymous visitor
 *                on a gated screen is not owed a filter control, and rendering
 *                a dead one on eleven routes is noise, not honesty.
 *   unavailable  an operator asked and the read FAILED. That is worth saying:
 *                collapsing it into `ok` with an empty list would state that
 *                Erik has no clients on a request where nothing was counted,
 *                which is the same move as rendering `0` for an unread unparsed
 *                count.
 *
 * `gated` and `unavailable` were one value until the picker was served and
 * looked at: an anonymous request rendered a dropdown whose only entry was
 * "every engagement", on every filterable route, behind the operator gate.
 */
export type EngagementRoster =
  | { readonly status: "ok"; readonly options: readonly EngagementOption[] }
  | { readonly status: "gated" }
  | { readonly status: "unavailable" };

/** Not an operator. Nothing to offer, and nothing worth saying about it. */
export const ROSTER_GATED: EngagementRoster = { status: "gated" };

/** An operator asked and the read failed. Never an empty list standing in for it. */
export const ROSTER_UNAVAILABLE: EngagementRoster = { status: "unavailable" };

/**
 * Active engagements only, alphabetically by client name.
 *
 * **Active means `archivedAt === null`.** `archive.ts` states that
 * `archived_at` is the fact and the free-text `status` column is the operator's
 * own word for it, so `status` is not consulted here — deriving "active" from
 * free text is how a picker starts hiding an engagement because Erik typed
 * "Active " with a trailing space.
 *
 * CR-005 §3.3 point 2 narrows only the **picker**. A URL naming an
 * archived-not-purged engagement still resolves and still filters, because
 * `getEngagement(slug)` does not filter on `archived_at` either — a permalink
 * must not rot because the engagement was tidied away.
 *
 * Sorted by client name rather than by `listEngagements()`' `created_at desc`,
 * because a picker is scanned rather than read in order. The filter is done in
 * memory on a list `listEngagements()` already bounds at 1000 rows; a
 * one-operator studio will not reach that, and moving the predicate into the
 * query is the right change on the day it does.
 */
export const readEngagementRoster = cache(async (): Promise<EngagementRoster> => {
  try {
    const context = await getOperatorContext();

    // `profile` is non-null only at `aal2` with a role granted (FR-2, FR-3), so
    // this single check covers anonymous, unverified and unroled callers alike.
    // `gated` rather than `unavailable`: nothing failed here, and a visitor who
    // may not read the ledger is not owed a report about it.
    if (context.profile === null) return ROSTER_GATED;

    const engagements = await listEngagements();

    const options = engagements
      .filter((one) => one.archivedAt === null)
      .map((one) => ({ slug: one.slug, clientName: one.clientName }))
      .sort((a, b) => a.clientName.localeCompare(b.clientName));

    return { status: "ok", options };
  } catch {
    // Deliberately swallowed and deliberately not logged here: the audit and log
    // paths belong to the request that failed. This one has a single job, which
    // is to not turn an unread roster into a claim that there are no clients.
    return ROSTER_UNAVAILABLE;
  }
});
