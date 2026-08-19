import { ANSWER_READ, withAgentRoute } from "@/lib/api";
import type { AnswerDb } from "@/lib/server/answers/db";
import { handleBottleneck } from "@/lib/server/answers/handlers";

/**
 * FR-56 / FR-57 — `GET /api/answer/bottleneck`.
 *
 * Filters: `engagement` (slug), `limit`.
 *
 * Selects work whose `executor_kind` is `erik` or `erik_gate` — stored enum
 * values, never a name this code decided looks like Erik — and ranks by the
 * transitive count of work each item unblocks.
 *
 * **The second half of FR-56's ranking degrades for an agent token and the
 * response says so.** "The nearest milestone at risk" needs
 * `contract_milestone.due_date`, which §7a refuses agent tokens, so `ranking` is
 * `"unblocks-only"` with a stated reason rather than FR-56's name over a
 * different ordering.
 */
export const GET = withAgentRoute(ANSWER_READ, ({ request, db }) =>
  handleBottleneck(request, db as unknown as AnswerDb),
);
