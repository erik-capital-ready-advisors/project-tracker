"use server";

/**
 * FR-26's one click, wrapped so the operator sees why it was refused.
 *
 * ## Why this wrapper exists at all
 *
 * `attributeSessionAction` in `@/lib/server/sessions/actions` already does the
 * work and already carries `requireOperator()`. What it does not do is survive
 * contact with the browser: Next **redacts** a thrown Server Action error before
 * it reaches the client, so `"A session cannot be attributed to \"unassigned\""`
 * -- a sentence written for Erik, explaining exactly what to do -- arrives as a
 * generic message and a digest.
 *
 * That redaction is the right default and is not worth switching off: an
 * unclassified throw may carry a Postgres message naming a table, a constraint,
 * or a row value, and this product's rows quote client systems. So the refusals
 * that *were* written for the operator are converted into return values here,
 * and everything else stays redacted.
 *
 * ## Every export is an async function
 *
 * A `'use server'` module may export only async functions. Exporting a `const`
 * from one passes `tsc --noEmit` cleanly and fails only under `next build`, and
 * only once something imports it -- measured on a prior fleet run in this
 * practice. The shared `ActionResult` type therefore lives in
 * `@/lib/action-result`, which imports nothing and is safe for a Client
 * Component to reach.
 */

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { runOperatorAction } from "@/lib/operator-load";
import { attributeSessionAction } from "@/lib/server/sessions/actions";
import type { AttributionResult } from "@/lib/server/sessions/unassigned";

/**
 * FR-26 -- attribute a queued session to the engagement it belongs to.
 *
 * The queue's own path is revalidated here. `attributeSessionAction` revalidates
 * `/work-items` and `/blocked`, which is correct for what it knows about; it
 * does not know this screen exists, and a queue that still lists a session Erik
 * just attributed is a queue he will attribute twice.
 */
export async function attributeSessionSafe(
  sessionId: string,
  engagementSlug: string,
): Promise<ActionResult<AttributionResult>> {
  const result = await runOperatorAction(() =>
    attributeSessionAction(sessionId, engagementSlug),
  );

  if (result.ok) revalidatePath("/work-items/unassigned");

  return result;
}
