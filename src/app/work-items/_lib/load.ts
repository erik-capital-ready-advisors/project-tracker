import "server-only";

import { requireOperator } from "@/lib/api/operator";
import { createServiceClient } from "@/lib/supabase/service";
import { listWorkItems } from "@/lib/server/workitems/list";
import type { WorkItemListing } from "@/lib/server/workitems/list";
import { listUnassignedSessions } from "@/lib/server/sessions/unassigned";
import type { UnassignedQueue } from "@/lib/server/sessions/unassigned";
import { listEngagements } from "@/lib/server/registry/engagements";
import type { EngagementRecord } from "@/lib/server/registry/types";

import { PAGE_SIZE } from "./query";
import type { WorkItemQuery } from "./query";

/**
 * The reads behind `/work-items` and `/work-items/unassigned`.
 *
 * The server layer already exists -- `i6` built `listWorkItems` and
 * `listUnassignedSessions`, and neither is reimplemented here. What this module
 * adds is the authorisation gate beside the query and the mapping from URL state
 * to filter object, so a page component is left with rendering and nothing else.
 *
 * `requireOperator()` is called inside each read rather than by the caller. That
 * ordering is deliberate: a gate that lives in the caller is a gate someone can
 * forget when they add the second call site.
 *
 * **`includeDescription` is never set.** `work_item.description` is a pgcrypto
 * column, decryption is one round trip per row, and §7a's stated consequence is
 * that these screens work from clear columns. A list that decrypted by default
 * would reintroduce the search surface §7a closed, one row at a time.
 */

export async function readWorkItems(
  query: WorkItemQuery,
): Promise<WorkItemListing> {
  await requireOperator();

  return listWorkItems(createServiceClient(), {
    engagementSlug: query.engagementSlug,
    executionMode: query.executionMode,
    executorKind: query.executorKind,
    status: query.status,
    disposition: query.disposition,
    unautomatedReason: query.unautomatedReason,
    evidenceScope: query.evidenceScope,
    blockedOnly: query.blockedOnly,
    sort: query.sort,
    direction: query.direction,
    limit: PAGE_SIZE,
    offset: (query.page - 1) * PAGE_SIZE,
  });
}

/** FR-26 -- the sessions that resolved to no known engagement. */
export async function readUnassignedQueue(): Promise<UnassignedQueue> {
  await requireOperator();
  return listUnassignedSessions(createServiceClient());
}

/**
 * The engagements a session can be attributed to.
 *
 * `listEngagements` is `i5`'s registry action and carries its own
 * `requireOperator()`, so this is a thin re-export with a name that says what
 * the queue screen wants it for.
 */
export async function readEngagements(): Promise<EngagementRecord[]> {
  return listEngagements();
}
