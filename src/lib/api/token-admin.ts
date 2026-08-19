import type { ServiceClient } from "@/lib/supabase/service";

import { writeAuditLog } from "./audit";
import type { AuditCapableClient } from "./audit";
import type { WireCapability } from "./capabilities";
import { toStoredCapability, toWireCapability } from "./capabilities";
import { apiError } from "./errors";
import { mintAgentTokenWithNewId } from "./tokens";

/**
 * Issue, revoke and rotate agent tokens (FR-4, FR-7).
 *
 * FR-7: "Tokens are revocable and rotatable **from the interface without a
 * deploy**." These are the mechanism. The screen that calls them is a UI unit's
 * work; this module is deliberately free of React so the same functions serve a
 * server action, a route handler and a test.
 *
 * ## The plaintext appears exactly once, in the return value of `issueAgentToken`
 *
 * §7a: "the plaintext token is shown once at creation and never stored." So:
 *
 *   * it is not written to `audit_log` — the audit row carries the token **id**;
 *   * it is not returned by `listAgentTokens`, which cannot return it because
 *     the column does not exist;
 *   * it must not be logged, put in a fixture, or pasted into a report.
 *
 * The caller gets exactly one chance to show it to Erik. If he loses it, the
 * answer is `rotateAgentToken`, not a lookup.
 *
 * ## Every function here requires the caller to have already established that
 * the actor is the operator
 *
 * These take an `actor` argument rather than deriving one, because they run with
 * the **service-role** client — needed for `hash_agent_token`, which is granted
 * to `service_role` alone — and `service_role` bypasses RLS. Call
 * `requireOperator()` first and pass its user id. A caller that skips that step
 * has an unauthenticated token-issuing endpoint, which is the worst bug
 * available in this file.
 */

export interface IssueAgentTokenInput {
  label: string;
  capabilities: WireCapability[];
  expiresAt: Date;
}

export interface IssuedAgentToken {
  id: string;
  label: string;
  capabilities: WireCapability[];
  expiresAt: string;
  /** Shown once. Never stored, never logged. */
  plaintext: string;
}

export interface AgentTokenSummary {
  id: string;
  label: string;
  capabilities: WireCapability[];
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

/** The columns the operator may see. `token_hash` is absent and stays absent. */
const SUMMARY_COLUMNS =
  "id, label, capabilities, expires_at, last_used_at, revoked_at, created_at";

function validate(input: IssueAgentTokenInput): void {
  const label = input.label.trim();
  if (label.length === 0 || label.length > 120) {
    throw apiError(
      "invalid_request",
      "A token needs a label between 1 and 120 characters, so it can be told " +
        "apart from the others in the list.",
    );
  }
  if (input.capabilities.length === 0) {
    throw apiError(
      "invalid_request",
      "A token needs at least one capability. A token with none can call " +
        "nothing, which is a revocation rather than an issue.",
    );
  }
  if (Number.isNaN(input.expiresAt.getTime())) {
    throw apiError("invalid_request", "The expiry date is not a valid date.");
  }
  if (input.expiresAt.getTime() <= Date.now()) {
    // §7a: tokens are expiring. An expiry in the past is almost certainly a
    // timezone mistake, and accepting it produces a token that never works and
    // a support question about why.
    throw apiError(
      "invalid_request",
      "The expiry must be in the future. A token that expires on creation " +
        "cannot be used.",
    );
  }
}

/**
 * Issue a new token.
 *
 * The row id is generated here and the hash is computed **before** the INSERT,
 * so the row never exists in a state where its `token_hash` verifies nothing.
 * The hash is produced by `public.hash_agent_token`, which is bcrypt at cost 12
 * inside Postgres — the plaintext is sent over TLS to the database and is never
 * hashed in the Node process, so there is one implementation of the hashing rule
 * rather than two that can drift.
 */
export async function issueAgentToken(
  client: ServiceClient,
  actor: string,
  input: IssueAgentTokenInput,
): Promise<IssuedAgentToken> {
  validate(input);

  const minted = mintAgentTokenWithNewId();

  const { data: hash, error: hashError } = await client.rpc(
    "hash_agent_token",
    { p_token: minted.secret },
  );

  if (hashError || typeof hash !== "string") {
    throw apiError(
      "internal_error",
      "The token could not be hashed, so none was issued. Nothing was written.",
    );
  }

  const { error: insertError } = await client.from("agent_token").insert({
    id: minted.id,
    label: input.label.trim(),
    token_hash: hash,
    capabilities: input.capabilities.map(toStoredCapability),
    expires_at: input.expiresAt.toISOString(),
  });

  if (insertError) {
    throw apiError(
      "internal_error",
      "The token could not be saved, so none was issued.",
    );
  }

  await writeAuditLog(client as unknown as AuditCapableClient, {
    actor,
    actorType: "operator",
    action: "token.issue",
    targetTable: "agent_token",
    targetId: minted.id,
    outcome: "allowed",
  });

  return {
    id: minted.id,
    label: input.label.trim(),
    capabilities: input.capabilities,
    expiresAt: input.expiresAt.toISOString(),
    plaintext: minted.plaintext,
  };
}

/**
 * Revoke a token (FR-7).
 *
 * Sets `revoked_at` rather than deleting the row: §7a's retention for this table
 * is "until revoked, **then 90 days for audit**", which a delete would make
 * impossible. `authenticateAgentRequest` refuses any token with `revoked_at`
 * set, and it does so *after* verifying the secret, so a revoked token's holder
 * learns it was revoked and a stranger learns nothing.
 *
 * Revoking an already-revoked token is a no-op that still returns success — the
 * caller asked for it to be revoked and it is revoked. It does not write a
 * second audit row.
 */
export async function revokeAgentToken(
  client: ServiceClient,
  actor: string,
  tokenId: string,
  now: Date = new Date(),
): Promise<{ revoked: boolean }> {
  const { data, error } = await client
    .from("agent_token")
    .update({ revoked_at: now.toISOString() })
    .eq("id", tokenId)
    .is("revoked_at", null)
    .select("id");

  if (error) {
    throw apiError(
      "internal_error",
      "The token could not be revoked. It is still active; retry.",
    );
  }

  const revoked = (data?.length ?? 0) > 0;

  if (revoked) {
    await writeAuditLog(client as unknown as AuditCapableClient, {
      actor,
      actorType: "operator",
      action: "token.revoke",
      targetTable: "agent_token",
      targetId: tokenId,
      outcome: "allowed",
    });
  }

  return { revoked };
}

/**
 * Rotate a token (FR-7): issue a replacement carrying the same label and
 * capabilities, then revoke the original.
 *
 * **Issue first, revoke second, and never in the other order.** A fleet run
 * holding the old token keeps working until the new one is in hand; reversing
 * the order opens a window in which no valid token exists, which is an outage
 * introduced by a routine credential rotation.
 *
 * The old row stays, revoked, so the 90-day audit window §7a asks for still has
 * something to point at.
 */
export async function rotateAgentToken(
  client: ServiceClient,
  actor: string,
  tokenId: string,
  expiresAt: Date,
): Promise<IssuedAgentToken> {
  const { data: existing, error } = await client
    .from("agent_token")
    .select("id, label, capabilities")
    .eq("id", tokenId)
    .maybeSingle();

  if (error) {
    throw apiError("internal_error", "The token could not be read.");
  }
  if (!existing) {
    throw apiError("invalid_request", "No such token.");
  }

  const issued = await issueAgentToken(client, actor, {
    label: existing.label,
    capabilities: existing.capabilities.map(toWireCapability),
    expiresAt,
  });

  await revokeAgentToken(client, actor, tokenId);

  await writeAuditLog(client as unknown as AuditCapableClient, {
    actor,
    actorType: "operator",
    action: "token.rotate",
    targetTable: "agent_token",
    targetId: tokenId,
    outcome: "allowed",
  });

  return issued;
}

/**
 * List tokens for the operator's interface.
 *
 * `SUMMARY_COLUMNS` names every column except `token_hash`. That mirrors the
 * column-level grant i1 wrote for `authenticated` — the hash is withheld at the
 * grant, not by convention — and keeps the same shape on the service-role path,
 * which has no such grant to protect it.
 */
export async function listAgentTokens(
  client: ServiceClient,
): Promise<AgentTokenSummary[]> {
  const { data, error } = await client
    .from("agent_token")
    .select(SUMMARY_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) {
    throw apiError("internal_error", "The token list could not be read.");
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    capabilities: row.capabilities.map(toWireCapability),
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  }));
}
