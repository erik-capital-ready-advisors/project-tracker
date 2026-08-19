"use server";

/**
 * Operator-side server actions for M1.5 and M1.6 — the ones `u4`'s screens bind
 * their buttons to.
 *
 * Every export here is an async function, because a `"use server"` module's
 * exports all become callable endpoints and Next requires that shape.
 *
 * ## Why these are actions rather than route handlers
 *
 * The API routes beside them are for **agents**, authenticated by a bearer
 * token with a capability. These are for **Erik**, authenticated by an operator
 * session with MFA. `requireOperator()` is the gate, and it is the first line of
 * every one of them — an action is a POST endpoint that Next generates, and one
 * without an authorisation check is a public write endpoint that happens not to
 * have a URL you can guess.
 *
 * `createServiceClient()` and not `ctx.db`: there is no agent context here, and
 * the FR-5 agent scoping would be the wrong control anyway — the operator is
 * exactly who §7a says may read these tables. RLS is the control on the
 * operator's own session; the service client is used because these writes touch
 * `work_item` and `work_session` on Erik's behalf after his session has already
 * been checked by `requireOperator()`.
 */

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/api/operator";
import { createServiceClient } from "@/lib/supabase/service";

import { attributeSession, listUnassignedSessions } from "./unassigned";
import type { AttributionResult, UnassignedQueue } from "./unassigned";

/** FR-26 — the queue, for a server component to render. */
export async function getUnassignedQueue(limit?: number): Promise<UnassignedQueue> {
  await requireOperator();
  return listUnassignedSessions(createServiceClient(), limit);
}

/**
 * FR-26's one click.
 *
 * Revalidates the two screens whose contents change: the queue itself and the
 * unified work-item list, because the attributed item moves engagement in both.
 */
export async function attributeSessionAction(
  sessionId: string,
  engagementSlug: string,
): Promise<AttributionResult> {
  await requireOperator();
  const result = await attributeSession(
    createServiceClient(),
    sessionId,
    engagementSlug,
  );

  revalidatePath("/work-items");
  revalidatePath("/blocked");
  return result;
}
