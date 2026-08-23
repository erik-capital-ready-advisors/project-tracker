import { ANSWER_READ, withAgentRoute } from "@/lib/api";
import type { AnswerDb } from "@/lib/server/answers/db";
import { handleBroken } from "@/lib/server/answers/handlers";

/**
 * FR-71 / FR-72 — `GET /api/answer/broken`. CR-001's sixth answer.
 *
 * Filters: `engagement` (slug), `severity` (`critical` | `major` | `minor` |
 * `unparsed`). Reports the FR-58 `unparsed` count, per FR-72.
 *
 * "Open" here means derived-open. A defect is listed until a passing test names
 * its `D-nn` **and** that test's certifier differs from the executor of the
 * fixing work item (FR-66) — marking your own fix verified does not clear it.
 * Each row carries `blockedBy`, so the screen says why it is still open.
 *
 * The two FR-69 regression kinds are reported separately and neither is derived
 * from the other. `unparsed` is one of the four severity groups rather than a
 * filtered-out remainder, per FR-64.
 */
export const GET = withAgentRoute(ANSWER_READ, ({ request, db }) =>
  handleBroken(request, db as unknown as AnswerDb),
);
