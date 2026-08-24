import "server-only";

import { getWaits } from "@/lib/server/waits/actions";
import type { WaitListing } from "@/lib/server/waits/store";
import { listEngagements } from "@/lib/server/registry/engagements";
import type { EngagementRecord } from "@/lib/server/registry/types";

/**
 * The reads behind `/waits`.
 *
 * Both are `i5`/`i6` server actions that carry their own `requireOperator()`, so
 * this module is a naming layer rather than a data layer -- it exists so the
 * page component imports one thing per concept and so the `today` the wait
 * arithmetic uses stays where `i6` put it, in `getWaits`, rather than being
 * recomputed on a screen.
 */

/**
 * FR-34 / FR-38 -- the waits, grouped by owner, with elapsed days and overdue flags.
 *
 * FR-96's `engagementSlug` is passed through to `listWaits`, which already
 * accepted one. It must be a slug the caller has **already resolved**
 * (`@/lib/engagement-resolve`): `listWaits` reaches `engagementIdForSlug`, which
 * throws `invalid_request` for a slug naming nothing, and that would render
 * FR-96c's case as a load failure -- "this screen could not be read" instead of
 * "no engagement has this slug". The screen resolves first and simply does not
 * call this when the slug names nothing, so that throw is unreachable from here
 * rather than handled.
 */
export async function readWaits(
  includeResolved: boolean,
  engagementSlug: string | null = null,
): Promise<WaitListing> {
  return getWaits({ includeResolved, engagementSlug });
}

/** The engagements a wait can be declared against. */
export async function readEngagements(): Promise<EngagementRecord[]> {
  return listEngagements();
}
