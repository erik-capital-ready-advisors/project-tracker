import type { ServiceClient } from "@/lib/supabase/service";
import { createServiceClient } from "@/lib/supabase/service";

import { agentScopedDb } from "./agent-db";
import type { AuthenticatedAgentToken } from "./authenticate";
import { assertCapability, authenticateAgentRequest } from "./authenticate";
import type { AuditCapableClient, AuditOutcome } from "./audit";
import { endpointOf, writeAuditLog } from "./audit";
import type { WireCapability } from "./capabilities";
import { ApiError, toErrorResponse } from "./errors";
import type { RateLimitPolicy } from "./rate-limit";
import { enforceRateLimit, policyFor, rateLimitedResponse } from "./rate-limit";
import { describeTokenForLog } from "./tokens";

/**
 * The wrapper every agent-facing route handler goes through.
 *
 * ## What a later unit writes
 *
 * ```ts
 * // src/app/api/answer/blocked/route.ts
 * import { withAgentRoute, apiOk, ANSWER_READ } from "@/lib/api";
 *
 * export const GET = withAgentRoute(ANSWER_READ, async ({ db }) => {
 *   const { data, error } = await db.from("work_item").select("id, title");
 *   if (error) throw apiError("internal_error", "…");
 *   return apiOk(data, { unparsed: 0 });
 * });
 * ```
 *
 * ## What it guarantees, in order
 *
 *   1. **FR-4** — the bearer token is parsed and its secret verified before the
 *      handler runs at all.
 *   2. **FR-5** — the token carries the required capability, and `ctx.db` is
 *      scoped so the handler cannot reach `contract_milestone` (or the other
 *      three operator-only tables) even by accident.
 *   3. **FR-8** — the request is counted against the token's window before the
 *      handler runs, so a refused request costs one RPC rather than a query.
 *   4. **FR-6 / FR-59** — exactly one `audit_log` row is written for **every**
 *      outcome, including refusals, including a handler that threw. The row
 *      carries the capability, the endpoint and the outcome, and no record
 *      contents.
 *
 * ## The order is deliberate
 *
 * Authenticate → capability → rate limit → handler. Rate limiting after
 * authentication means an attacker cannot exhaust a victim token's window
 * without holding the victim's token; rate limiting before the handler means a
 * throttled request never touches the data. The cost of that ordering is that an
 * unauthenticated flood is limited only by Vercel's platform limits, which is
 * the right trade here because authentication itself is one indexed lookup plus
 * one bcrypt, and §7a states there is no public surface to flood.
 *
 * ## What it does not do
 *
 * It does not validate the request body. Each route validates its own input at
 * its own boundary, because only the route knows its shape.
 */

export interface AgentRouteContext {
  request: Request;
  token: AuthenticatedAgentToken;
  capability: WireCapability;
  /**
   * The database, scoped to what an agent token may touch.
   *
   * **Use this and not `createServiceClient()`.** The scoping in `agent-db.ts`
   * is the whole of FR-5's enforcement; a handler that reaches for its own
   * client silently opts out of it.
   */
  db: ServiceClient;
}

export type AgentRouteHandler = (
  context: AgentRouteContext,
) => Promise<Response> | Response;

/** Injectable seams. Production values are the real client and the real clock. */
export interface AgentRouteDeps {
  createClient: () => ServiceClient;
  now: () => Date;
  policyFor: (capability: WireCapability) => RateLimitPolicy;
}

const DEFAULT_DEPS: AgentRouteDeps = {
  createClient: createServiceClient,
  now: () => new Date(),
  policyFor,
};

function outcomeForStatus(status: number): AuditOutcome {
  if (status >= 500) return "error";
  if (status >= 400) return "refused";
  return "allowed";
}

/**
 * Build the guard with explicit dependencies. Tests use this; production code
 * uses `withAgentRoute`, which is this bound to the real ones.
 */
export function createAgentRouteGuard(deps: Partial<AgentRouteDeps> = {}) {
  const resolved: AgentRouteDeps = { ...DEFAULT_DEPS, ...deps };

  return function withAgentRoute(
    capability: WireCapability,
    handler: AgentRouteHandler,
  ): (request: Request) => Promise<Response> {
    return async function guarded(request: Request): Promise<Response> {
      const endpoint = endpointOf(request);
      const client = resolved.createClient();
      const audit = client as unknown as AuditCapableClient;

      /**
       * One row per request, written on every path out of this function.
       *
       * `actor` is the token id once known and `unauthenticated` before that —
       * never any part of the secret. `describeTokenForLog` is the only thing
       * that formats it, so there is one place to check that rule.
       */
      const record = async (
        actor: string,
        status: number,
        token: AuthenticatedAgentToken | null,
      ): Promise<void> => {
        await writeAuditLog(audit, {
          actor,
          actorType: "agent",
          action: "api.request",
          capability: token ? capability : null,
          endpoint,
          outcome: outcomeForStatus(status),
          status,
          targetTable: null,
          targetId: token ? token.id : null,
        });
      };

      try {
        const auth = await authenticateAgentRequest(
          request,
          client as never,
          resolved.now(),
        );

        if (!auth.ok) {
          await record(describeTokenForLog(auth.parts), auth.error.status, null);
          return auth.error.toResponse();
        }

        const { token } = auth;
        const actor = `agent_token:${token.id}`;

        const missing = assertCapability(token, capability);
        if (missing) {
          await record(actor, missing.status, token);
          return missing.toResponse();
        }

        const verdict = await enforceRateLimit(
          client as never,
          token.id,
          resolved.policyFor(capability),
          resolved.now(),
        );

        if (!verdict.allowed) {
          const response = rateLimitedResponse(verdict);
          await record(actor, response.status, token);
          return response;
        }

        let response: Response;
        try {
          response = await handler({
            request,
            token,
            capability,
            db: agentScopedDb(client),
          });
        } catch (thrown) {
          // Includes the `forbidden_table` refusal thrown by `agentScopedDb`.
          response = toErrorResponse(thrown);
        }

        await record(actor, response.status, token);
        await touchLastUsed(client, token.id, resolved.now());
        return response;
      } catch (thrown) {
        // Reached when the audit write itself failed, or the rate limiter failed
        // closed. There is deliberately no second audit attempt: the first one
        // is what just failed, and a retry loop against a broken database turns
        // one 500 into many.
        return toErrorResponse(thrown);
      }
    };
  };
}

/**
 * `last_used_at` is advisory and is updated best-effort.
 *
 * If it fails the request still succeeds, because **the audit log is the
 * authoritative record of token use (FR-6) and it has already been written by
 * this point.** This column exists so the token list can show "last seen"; it is
 * not a control, and failing a served request to keep a convenience column
 * accurate would be the wrong trade.
 */
async function touchLastUsed(
  client: ServiceClient,
  tokenId: string,
  now: Date,
): Promise<void> {
  try {
    await client
      .from("agent_token")
      .update({ last_used_at: now.toISOString() })
      .eq("id", tokenId);
  } catch {
    // Deliberately swallowed. See the note above.
  }
}

/** The production guard. */
export const withAgentRoute = createAgentRouteGuard();

export { ApiError };
