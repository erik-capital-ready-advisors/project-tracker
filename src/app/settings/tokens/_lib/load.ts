import "server-only";

import { requireOperator } from "@/lib/api/operator";
import { listAgentTokens } from "@/lib/api/token-admin";
import { createServiceClient } from "@/lib/supabase/service";

import { tokenStatus } from "./status";
import type { TokenView } from "./status";

/**
 * The read behind `/settings/tokens`.
 *
 * `listAgentTokens` selects an explicit column list that **does not contain
 * `token_hash`**, mirroring the column-level grant `i1` wrote for
 * `authenticated`. That is the control, and this module does not route around
 * it: it adds a derived status and nothing else, and there is no code path here
 * that could ask for the hash even if someone wanted it.
 *
 * §7a: `agent_token` is `sensitive` -- "operator only; never returned by any
 * read endpoint". `requireOperator()` is the gate, and it sits beside the query
 * rather than in the page, so a second call site cannot forget it.
 *
 * The status is derived here, on the server, from a `now` supplied by the
 * caller's clock exactly once. A client component recomputing it would disagree
 * with the server across a hydration boundary about whether a credential is
 * still valid.
 */
export async function readTokens(now: Date): Promise<TokenView[]> {
  await requireOperator();

  const tokens = await listAgentTokens(createServiceClient());

  return tokens.map((token) => ({
    id: token.id,
    label: token.label,
    capabilities: token.capabilities,
    expiresAt: token.expiresAt,
    lastUsedAt: token.lastUsedAt,
    revokedAt: token.revokedAt,
    createdAt: token.createdAt,
    status: tokenStatus(token, now),
  }));
}
