import type { StoredCapability, WireCapability } from "./capabilities";
import { toWireCapability } from "./capabilities";
import { ApiError, apiError } from "./errors";
import type { AgentTokenParts } from "./tokens";
import { bearerFromAuthorizationHeader, parseAgentToken } from "./tokens";

/**
 * FR-4: agents authenticate with bearer tokens, not with the operator's session.
 *
 * ## The order of the checks is the security property
 *
 *   1. Header present, and shaped like `Bearer dl_<uuid>_<hex>`.
 *   2. Look the row up by id.
 *   3. **Verify the secret.**
 *   4. Only then: revoked? expired?
 *
 * Steps 2 and 3 both answer `invalid_token`, merged deliberately. Distinguishing
 * "no such token" from "wrong secret" hands an attacker an oracle for which ids
 * exist. Steps 4's answers are specific — `token_revoked`, `token_expired` —
 * because by then the caller has **proved possession of the credential**, so the
 * information is diagnostic rather than a probe. An agent operator debugging a
 * broken fleet run needs to know its token expired; nobody else can ask.
 *
 * ## The one leak that remains, stated rather than left to be found
 *
 * An unknown id returns before the bcrypt comparison runs, so it returns faster
 * than a known id with a wrong secret. That is a timing oracle for id existence.
 * It is accepted because the ids are v4 uuids: an attacker who can guess one has
 * already won a 122-bit lottery, and paying ~250ms of bcrypt on every malformed
 * request would turn this into an unauthenticated CPU-exhaustion surface, which
 * is a worse trade on a route that has no other cost.
 */

export interface AuthenticatedAgentToken {
  id: string;
  label: string;
  capabilities: WireCapability[];
  expiresAt: string;
}

export type AgentAuthResult =
  | { ok: true; token: AuthenticatedAgentToken }
  /** `parts` is present whenever the header parsed, so a refusal can still be attributed. */
  | { ok: false; error: ApiError; parts: AgentTokenParts | null };

/** The row shape this module reads. Service-role only — `token_hash` is not granted to anyone else. */
interface AgentTokenRow {
  id: string;
  label: string;
  token_hash: string;
  capabilities: StoredCapability[];
  expires_at: string;
  revoked_at: string | null;
}

/**
 * The database surface authentication needs, expressed structurally so tests can
 * supply a fake and so this module cannot reach past what it declares.
 */
export interface AuthCapableClient {
  from(table: "agent_token"): {
    select(columns: string): {
      eq(
        column: "id",
        value: string,
      ): {
        maybeSingle(): PromiseLike<{
          data: AgentTokenRow | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  rpc(
    name: "verify_agent_token",
    args: { p_token: string; p_hash: string },
  ): PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
}

const INVALID_TOKEN_MESSAGE =
  "The bearer token is not valid. Check the token was copied whole and has not " +
  "been replaced; issue a new one from Settings → Agent tokens if in doubt.";

/**
 * Authenticate a request's `Authorization: Bearer …` header.
 *
 * Returns a result rather than throwing, because the caller (`guard.ts`) must
 * write an audit row for the refusal before it turns the refusal into a
 * `Response`. A thrown error would have to be caught and re-classified, and a
 * re-classified refusal is how a 401 becomes a 500 in the audit log.
 *
 * `now` is injectable so the expiry boundary is testable without waiting for it.
 */
export async function authenticateAgentRequest(
  request: { headers: { get(name: string): string | null } },
  client: AuthCapableClient,
  now: Date = new Date(),
): Promise<AgentAuthResult> {
  const header = request.headers.get("authorization");
  if (header === null || header.trim() === "") {
    return {
      ok: false,
      parts: null,
      error: apiError(
        "missing_authorization",
        "This endpoint requires an agent token. Send it as " +
          "`Authorization: Bearer dl_…`.",
      ),
    };
  }

  const raw = bearerFromAuthorizationHeader(header);
  const parts = parseAgentToken(raw);
  if (parts === null) {
    return {
      ok: false,
      parts: null,
      error: apiError(
        "malformed_authorization",
        "The Authorization header is not a Delivery Ledger agent token. The " +
          "expected form is `Authorization: Bearer dl_<id>_<secret>`.",
      ),
    };
  }

  const { data: row, error: selectError } = await client
    .from("agent_token")
    .select("id, label, token_hash, capabilities, expires_at, revoked_at")
    .eq("id", parts.id)
    .maybeSingle();

  if (selectError) {
    return {
      ok: false,
      parts,
      error: apiError(
        "internal_error",
        "The token could not be checked. Retry; if it persists the ledger's " +
          "database is unreachable.",
      ),
    };
  }

  if (row === null) {
    // Unknown id. Same answer as a wrong secret — see the note above.
    return {
      ok: false,
      parts,
      error: apiError("invalid_token", INVALID_TOKEN_MESSAGE),
    };
  }

  const { data: verified, error: verifyError } = await client.rpc(
    "verify_agent_token",
    { p_token: parts.secret, p_hash: row.token_hash },
  );

  if (verifyError) {
    return {
      ok: false,
      parts,
      error: apiError(
        "internal_error",
        "The token could not be checked. Retry; if it persists the ledger's " +
          "database is unreachable.",
      ),
    };
  }

  // `verified !== true` rather than `!verified`: a null from the RPC must fail
  // closed rather than read as a boolean-ish false that happened to be right.
  if (verified !== true) {
    return {
      ok: false,
      parts,
      error: apiError("invalid_token", INVALID_TOKEN_MESSAGE),
    };
  }

  // Past this line the caller has proved possession, so refusals may be specific.

  if (row.revoked_at !== null) {
    return {
      ok: false,
      parts,
      error: apiError(
        "token_revoked",
        "This agent token was revoked. Issue a new one from Settings → Agent " +
          "tokens; revocation is not reversible.",
      ),
    };
  }

  if (new Date(row.expires_at).getTime() <= now.getTime()) {
    return {
      ok: false,
      parts,
      error: apiError(
        "token_expired",
        `This agent token expired at ${row.expires_at}. Rotate it from ` +
          "Settings → Agent tokens to get a replacement with the same " +
          "capabilities.",
      ),
    };
  }

  return {
    ok: true,
    token: {
      id: row.id,
      label: row.label,
      capabilities: row.capabilities.map(toWireCapability),
      expiresAt: row.expires_at,
    },
  };
}

/**
 * FR-5's capability check.
 *
 * Separate from authentication because the audit row distinguishes them: a valid
 * token used on an endpoint it does not cover is a different event from an
 * invalid token, and an operator reading the audit log needs to tell them apart.
 */
export function assertCapability(
  token: AuthenticatedAgentToken,
  required: WireCapability,
): ApiError | null {
  if (token.capabilities.includes(required)) return null;
  return apiError(
    "insufficient_capability",
    `This endpoint requires the \`${required}\` capability. The token presented ` +
      `carries ${token.capabilities.length > 0 ? token.capabilities.map((c) => `\`${c}\``).join(", ") : "no capabilities"}.`,
  );
}
