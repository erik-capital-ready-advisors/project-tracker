import { ANSWER_READ, withAgentRoute } from "@/lib/api";
import type { AnswerDb } from "@/lib/server/answers/db";
import { handleNext } from "@/lib/server/answers/handlers";

/**
 * FR-53 / FR-57 — `GET /api/answer/next`.
 *
 * Filters: `engagement` (slug), `limit`.
 *
 * **The ordering degrades for an agent token and the response says so.** FR-53
 * orders by the nearest dated milestone each item serves, which needs
 * `contract_milestone.due_date`; §7a refuses agent tokens that table. The
 * payload's `ordering` field is `"fallback"` with a stated reason rather than
 * `"milestone-due-date"` over a list sorted by something else.
 */
export const GET = withAgentRoute(ANSWER_READ, ({ request, db }) =>
  handleNext(request, db as unknown as AnswerDb),
);
