"use server";

/**
 * FR-7 -- tokens are revocable and rotatable **from the interface without a
 * deploy**. These three actions are the interface half; `i4` built the
 * mechanism and reported FR-7 PARTIAL because nothing called it.
 *
 * ## The plaintext crosses this boundary exactly once
 *
 * `issueAgentToken` returns the plaintext, and this is the only path it travels:
 * database → server action → the component that shows it. §7a: "the plaintext
 * token is shown once at creation and never stored." What that means concretely,
 * and what is enforced here:
 *
 *   * it is **not logged** -- there is no `console.log` in this file, and adding
 *     one would put a live credential in the Vercel function log;
 *   * it is **not written to the audit row** -- `issueAgentToken` audits the
 *     token *id*;
 *   * it is **not returned by `listAgentTokens`**, which cannot return it,
 *     because `token_hash` is not in the projection and the plaintext is not in
 *     the database at all;
 *   * it is **not revalidated into a cache** -- `revalidatePath` is called after
 *     issuing so the table refreshes, and the plaintext is in the action's
 *     return value rather than in the re-rendered page.
 *
 * If Erik loses it, the answer is `rotateAgentToken`, not a lookup. There is no
 * lookup.
 *
 * ## Why `requireOperator()` is called here and the actor is passed down
 *
 * `token-admin`'s functions take an `actor` rather than deriving one, because
 * they run with the **service-role** client -- needed for `hash_agent_token`,
 * which is granted to `service_role` alone -- and service-role bypasses RLS.
 * `i4` states the consequence plainly: "A caller that skips that step has an
 * unauthenticated token-issuing endpoint, which is the worst bug available in
 * this file." So every action below opens with `requireOperator()` and passes
 * its user id.
 *
 * Every export is an async function, because a `'use server'` module may export
 * only those.
 */

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { apiError, parseWireCapabilities } from "@/lib/api";
import { requireOperator } from "@/lib/api/operator";
import {
  issueAgentToken,
  revokeAgentToken,
  rotateAgentToken,
} from "@/lib/api/token-admin";
import type { IssuedAgentToken } from "@/lib/api/token-admin";
import { runOperatorAction } from "@/lib/operator-load";
import { createServiceClient } from "@/lib/supabase/service";

import { expiryInstant } from "./_lib/status";

/** FR-4 -- a token names a capability set and carries an expiry. */
export async function issueTokenSafe(
  label: string,
  capabilities: unknown,
  expiryDay: string,
): Promise<ActionResult<IssuedAgentToken>> {
  return runOperatorAction(async () => {
    const operator = await requireOperator();

    // `parseWireCapabilities` refuses the whole list if any member is unknown,
    // which is the right shape for a security decision: there is no safe
    // default for "a capability string the system does not recognise".
    const parsed = parseWireCapabilities(capabilities);
    if (parsed === null) {
      throw apiError(
        "invalid_request",
        "Choose at least one capability, from the set this product defines.",
      );
    }

    const expiresAt = expiryInstant(expiryDay);
    if (expiresAt === null) {
      throw apiError(
        "invalid_request",
        "The expiry must be a calendar date, e.g. 2026-11-17.",
      );
    }

    const issued = await issueAgentToken(
      createServiceClient(),
      operator.profile?.id ?? operator.userId ?? "operator",
      { label, capabilities: parsed, expiresAt },
    );

    revalidatePath("/settings/tokens");
    return issued;
  });
}

/**
 * FR-7 -- revoke.
 *
 * `revoked: false` comes back when the token was already revoked. That is
 * success, not failure: the caller asked for it to be revoked and it is
 * revoked. It is surfaced rather than hidden so the interface can say "that one
 * was already revoked" instead of implying it just did something.
 */
export async function revokeTokenSafe(
  tokenId: string,
): Promise<ActionResult<{ revoked: boolean }>> {
  return runOperatorAction(async () => {
    const operator = await requireOperator();
    const result = await revokeAgentToken(
      createServiceClient(),
      operator.profile?.id ?? operator.userId ?? "operator",
      tokenId,
    );
    revalidatePath("/settings/tokens");
    return result;
  });
}

/**
 * FR-7 -- rotate: issue a replacement carrying the same label and capabilities,
 * then revoke the original.
 *
 * The order is `i4`'s and it is deliberate: a fleet run holding the old token
 * keeps working until the new one is in hand. Reversing it opens a window in
 * which no valid token exists, which is an outage introduced by routine
 * credential hygiene.
 *
 * The replacement's plaintext comes back the same way a newly issued one does,
 * and is shown exactly once.
 */
export async function rotateTokenSafe(
  tokenId: string,
  expiryDay: string,
): Promise<ActionResult<IssuedAgentToken>> {
  return runOperatorAction(async () => {
    const operator = await requireOperator();

    const expiresAt = expiryInstant(expiryDay);
    if (expiresAt === null) {
      throw apiError(
        "invalid_request",
        "The expiry must be a calendar date, e.g. 2026-11-17.",
      );
    }

    const issued = await rotateAgentToken(
      createServiceClient(),
      operator.profile?.id ?? operator.userId ?? "operator",
      tokenId,
      expiresAt,
    );

    revalidatePath("/settings/tokens");
    return issued;
  });
}
