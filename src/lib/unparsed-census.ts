import "server-only";

import { cache } from "react";

import { getOperatorContext } from "@/lib/api/operator";
import type { CensusDb } from "@/lib/server/answers/db";
import { unparsedCensus } from "@/lib/server/answers/unparsed";
import type { UnparsedCensus } from "@/lib/server/answers/unparsed";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * FR-58's count, read once per request and shared by everything that reports it.
 *
 * ## What this adds to `unparsedCensus`, and what it deliberately does not
 *
 * `@/lib/server/answers/unparsed` **owns the definition** of what the count
 * counts and this module does not touch it. What it adds is three things a
 * screen needs and a pure counting function must not have:
 *
 *   1. **One read per request.** The app shell renders the badge and the screen
 *      renders the per-table breakdown; both want the same number and neither
 *      should pay for it twice. `cache()` is per-request memoisation, so the two
 *      call sites cannot disagree even in principle — the second gets the first
 *      one's promise.
 *   2. **The operator gate.** The census runs on the service-role client, which
 *      holds BYPASSRLS. An anonymous visitor on `/sign-in` must not learn the
 *      ledger's shape from a badge in the header, so a caller who is not a
 *      role-holding operator at `aal2` gets `UNCOUNTED` rather than a number.
 *   3. **A failure is `UNCOUNTED`, never zero.** No database, no environment
 *      variable, a refused query — all of them produce a census whose every
 *      field is `null`, which renders "unparsed count unavailable". Letting any
 *      of them fall through to `0` would state that the system classified
 *      everything, on a request where nothing was counted at all. That is the
 *      claim this product exists to never make.
 *
 * ## Why the whole thing is wrapped in a `try`
 *
 * This runs in the **root layout**, so anything it throws takes every route in
 * the application down with it — including `/sign-in`, which is how the operator
 * would recover. `createServiceClient()` throws outright when
 * `SUPABASE_SERVICE_ROLE_KEY` is unset, which is exactly the state a fresh
 * deployment is in. A missing count must degrade the badge, not the product.
 */

/** Every component `null`: counted nothing, and says so. Never a partial sum. */
export const UNCOUNTED: UnparsedCensus = {
  total: null,
  workItems: null,
  defects: null,
  testResults: null,
};

export const readUnparsedCensus = cache(async (): Promise<UnparsedCensus> => {
  try {
    const context = await getOperatorContext();

    // `profile` is non-null only at `aal2` with a role granted (FR-2, FR-3), so
    // this single check covers anonymous, unverified and unroled callers alike.
    if (context.profile === null) return UNCOUNTED;

    return await unparsedCensus(
      createServiceClient() as unknown as CensusDb,
    );
  } catch {
    // Deliberately swallowed and deliberately not logged as an error here: the
    // audit and log paths belong to the request that failed, and this one has
    // one job, which is to not turn an unknown count into a clean-looking zero.
    return UNCOUNTED;
  }
});
