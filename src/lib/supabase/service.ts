import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

import { supabaseUrl } from "./env";

/**
 * The service-role Supabase client.
 *
 * READ THIS BEFORE IMPORTING IT.
 *
 * `service_role` holds BYPASSRLS. Every row-level-security policy written in
 * `20260819144540_rls_and_grants.sql` — including `app.is_operator()`, which is
 * where FR-2's MFA requirement and FR-3's deny-by-default role live — is inert
 * against this client. It is the single credential in this system that can read
 * every client's contract amounts.
 *
 * It exists because three things genuinely require it and nothing else does:
 *
 *   1. Agent bearer tokens are not Postgres roles. An agent request carries no
 *      Supabase session, so there is no `authenticated` identity for RLS to
 *      evaluate. The route handler authenticates the bearer token itself and
 *      then reads on the agent's behalf.
 *   2. The six `public` RPC wrappers (`encrypt_field`, `decrypt_field`,
 *      `hash_agent_token`, `verify_agent_token`, `check_and_increment_rate_limit`,
 *      `prune_rate_limit_counters`) are granted to `service_role` alone.
 *   3. `audit_log` INSERT on behalf of an unauthenticated caller — the record of
 *      a *refused* request has no session to write it under.
 *
 * The consequence, stated plainly because the alternative is it being discovered
 * later: **an agent request's access rules are enforced in this application, not
 * in the database.** `agentScopedDb()` in `@/lib/api/agent-db` is that
 * enforcement, and it is application-layer. Scoped Supabase JWTs are the real
 * fix and belong in Phase 2 planning.
 *
 * `import "server-only"` makes an import from a Client Component a BUILD error
 * rather than a runtime key leak.
 */

export type ServiceClient = SupabaseClient<Database>;

let cached: ServiceClient | undefined;

/**
 * Read the service-role key from the environment, and only from the environment.
 *
 * No default, no fallback, no example value: a fallback is how a placeholder
 * ends up talking to a real project, and a committed default is a committed
 * credential regardless of what it contains.
 */
function serviceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    throw new Error(
      "Missing required environment variable SUPABASE_SERVICE_ROLE_KEY. This is " +
        "a server-only credential that bypasses row-level security; set it in " +
        "Vercel and in .env.local, and nowhere else. See .env.example.",
    );
  }
  return value;
}

/**
 * Create the service-role client.
 *
 * `persistSession` and `autoRefreshToken` are off deliberately. This client is
 * not a user session and must never pick one up from storage — if it did, a
 * request could be served under whichever identity happened to be cached in the
 * function instance, which on Vercel is shared across requests.
 */
export function createServiceClient(): ServiceClient {
  if (cached) return cached;

  const url = supabaseUrl();
  if (!url.startsWith("https://")) {
    // Baseline §1: assert the scheme rather than assume it. A project URL that
    // is not https means credentials and decrypted client prose would cross the
    // network in the clear.
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL must be an https:// URL; got a ${url.split(":")[0]}:// URL.`,
    );
  }

  cached = createSupabaseClient<Database>(url, serviceRoleKey(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cached;
}

/** Test seam. Resets the module-level cache between test cases. */
export function resetServiceClientCache(): void {
  cached = undefined;
}
