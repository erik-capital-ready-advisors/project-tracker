"use server";

import { revalidatePath } from "next/cache";

import { requireOperator } from "@/lib/api/operator";
import type { ActionResult } from "@/lib/action-result";
import { runOperatorAction } from "@/lib/operator-load";
import { createServiceClient } from "@/lib/supabase/service";

import { setAgentCovering } from "./set-covering";
import type { StackCoveringUpdate, StacksDb } from "./types";

/**
 * FR-109's one write, as the seam `/stacks` binds its control to.
 *
 * ## Every export here is an async function
 *
 * A `'use server'` module's exports all become callable HTTP endpoints and Next
 * requires that shape. A `const` exported from one passes `tsc --noEmit`
 * cleanly and fails only under `next build`, and only once something imports it
 * — measured on run `cd414c`. The constants and the pure normaliser live in
 * `./set-covering.ts` for that reason.
 *
 * ## `requireOperator()` is the first line, and it is the whole gate
 *
 * These are Erik's writes, not an agent's. The API routes beside them are for
 * agents, authenticated by a bearer token with a capability; this is
 * authenticated by an operator session at `aal2`. An action is a POST endpoint
 * Next generates, and one without an authorisation check is a public write
 * endpoint that happens not to have a URL you can guess.
 *
 * `createServiceClient()` holds `BYPASSRLS`, so every policy in
 * `20260819144540_rls_and_grants.sql` is inert against it and `requireOperator()`
 * above is the entirety of the authorisation on this path. That is **B29**, an
 * open and accepted debt on every operator surface in this product. This unit
 * adds two `service_role` reads and one `service_role` write, uses the existing
 * client exactly as `runs-load.ts` and `sessions/actions.ts` do, adds no new
 * mechanism, and names them here rather than paying the debt down in a worktree
 * building one screen's data layer.
 *
 * ## The refusal is returned, not thrown
 *
 * Next redacts a thrown Server Action error before it reaches the browser, which
 * is right for anything unclassified and destroys the sentences this path writes
 * on purpose — "no stack has that id", "an agent name is a single line".
 * `runOperatorAction` catches and returns them as values.
 */

/** The cast is compile-time only and removes nothing at runtime. */
function db(): StacksDb {
  return createServiceClient() as unknown as StacksDb;
}

/**
 * FR-109 — record which fleet agent covers a stack, or clear it.
 *
 * `null`, or a string that is empty once trimmed, clears the value. Clearing is
 * a real operation and not an error: it is how the operator says an agent no
 * longer covers this stack, and it moves the row back into FR-107's actionable
 * set if the trigger has fired for it.
 */
export async function setStackAgentCoveringAction(
  stackId: string,
  agentCovering: string | null,
): Promise<ActionResult<StackCoveringUpdate>> {
  const operator = await requireOperator();
  const actor = operator.profile?.id ?? operator.userId ?? "unknown_operator";

  const result = await runOperatorAction(() =>
    setAgentCovering(db(), actor, stackId, agentCovering),
  );

  // Only on success: a refused write changed nothing, and revalidating on a
  // refusal would make a failed save look like a save that did not take.
  if (result.ok) revalidatePath("/stacks");
  return result;
}
