import { ANSWER_READ, withAgentRoute } from "@/lib/api";
import type { AnswerDb } from "@/lib/server/answers/db";
import { handleBlocked } from "@/lib/server/answers/handlers";

/**
 * FR-52 / FR-57 — `GET /api/answer/blocked`.
 *
 * Filters: `engagement` (slug), `owner`, `disposition` (`carried` | `closed`).
 * Envelope: `{ data, unparsed? }`, with `unparsed` from the one shared FR-58
 * definition in `src/lib/server/answers/unparsed.ts`.
 *
 * `ctx.db` is passed through, not replaced. `createServiceClient()` inside a
 * handler is the one move that silently opts out of FR-5, and the cast below is
 * compile-time only — `agentScopedDb`'s `Proxy` is still in the call path at
 * runtime.
 *
 * No `export const runtime` and no `export const dynamic`: the root layout
 * awaits `headers()` for its CSP nonce, so every route in this app is already
 * dynamic, and restating it here would be a second place to get it wrong.
 */
export const GET = withAgentRoute(ANSWER_READ, ({ request, db }) =>
  handleBlocked(request, db as unknown as AnswerDb),
);
