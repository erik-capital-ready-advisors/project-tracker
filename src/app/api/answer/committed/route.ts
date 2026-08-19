import { ANSWER_READ, withAgentRoute } from "@/lib/api";
import type { AnswerDb } from "@/lib/server/answers/db";
import { handleCommitted } from "@/lib/server/answers/handlers";

/**
 * FR-54 / FR-75 / FR-57 — `GET /api/answer/committed`.
 *
 * **An `answer:read` agent token receives `403 forbidden_table` from this route,
 * always, with no partial answer.** Spec §7a: `contract_milestone` is "operator
 * only; agent tokens are refused this table". Every field on this answer derives
 * from a row in it, so there is nothing left to serve once the table is refused.
 *
 * The route is registered anyway because FR-57 requires each of the six answers
 * to be available at `GET /api/answer/<name>` under `answer:read`. It
 * authenticates, rate-limits and writes its audit row, and then refuses with a
 * code and a sentence naming the operator session as the way in. A 404 here
 * would read as "not built yet" rather than as "you may not have this".
 *
 * An agent wanting requirement-level coverage and shipped state without the
 * commercial figures has `GET /api/answer/untested` and `GET /api/answer/broken`,
 * both of which read no `contract_milestone` row.
 *
 * Filters (for the operator path, which calls `committedAnswer` directly):
 * `engagement` (slug), `state` (`open` | `claimed` | `billable`), `environment`.
 */
export const GET = withAgentRoute(ANSWER_READ, ({ request, db }) =>
  handleCommitted(request, db as unknown as AnswerDb),
);
