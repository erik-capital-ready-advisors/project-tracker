import { INGEST_WRITE, withAgentRoute } from "@/lib/api";
import type { ReleaseDb } from "@/lib/server/releases/db";
import { handleReleaseIngest } from "@/lib/server/releases/handler";

/**
 * FR-76 — `POST /api/ingest/release`.
 *
 * Everything before the handler is `withAgentRoute`'s: bearer authentication
 * (FR-4), the `ingest:write` capability check and the FR-5 table scoping on
 * `ctx.db`, the FR-8 rate limit, and exactly one `audit_log` row for every
 * outcome including refusals (FR-6 / FR-59).
 *
 * `ctx.db` is passed through, not replaced. `createServiceClient()` inside a
 * handler is the one move that silently opts out of FR-5, and the cast below is
 * compile-time only — `agentScopedDb`'s `Proxy` is still in the call path at
 * runtime, which is what `handler.test.ts`'s forbidden-table assertion drives.
 *
 * No `export const runtime` and no `export const dynamic`: the root layout
 * awaits `headers()` for its CSP nonce, so every route in this app is already
 * dynamic, and restating it here would be a second place to get it wrong.
 *
 * The call shape a `devops` unit uses is documented in full on
 * `handleReleaseIngest`.
 */
export const POST = withAgentRoute(INGEST_WRITE, ({ request, db }) =>
  handleReleaseIngest(request, db as unknown as ReleaseDb),
);
