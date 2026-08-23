import { ANSWER_READ, withAgentRoute } from "@/lib/api";
import type { AnswerDb } from "@/lib/server/answers/db";
import { handleUntested } from "@/lib/server/answers/handlers";

/**
 * FR-48 / FR-49 / FR-55 / FR-57 — `GET /api/answer/untested`.
 *
 * Filters: `engagement` (slug). Reported per engagement, as FR-48 requires,
 * never merged into one total.
 *
 * `covered`, `unproven` and `uncovered` are three separate lists and are never
 * summed. Each uncovered requirement carries FR-55's link to the work items that
 * claim to implement it — an empty `implementedBy` means nothing claims to, which
 * is a different finding from "implemented but untested" and is reported as such.
 */
export const GET = withAgentRoute(ANSWER_READ, ({ request, db }) =>
  handleUntested(request, db as unknown as AnswerDb),
);
