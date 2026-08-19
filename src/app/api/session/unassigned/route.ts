/**
 * `GET /api/session/unassigned` — FR-26's queue, over the API.
 *
 * Capability `answer:read`. The screen `u4` builds calls
 * `listUnassignedSessions` directly from a server component; this exists so an
 * agent — or Erik with `curl` — can see the same queue, and so the count is
 * reachable without a browser.
 *
 * §7a: the decrypted summary is in this response. That is what §7a's
 * "operator, agents, decrypted server-side" allows, and it is the reason this
 * route requires a capability at all.
 */

import { ANSWER_READ, apiError, apiOk, withAgentRoute } from "@/lib/api";

import {
  UNASSIGNED_PAGE_LIMIT,
  listUnassignedSessions,
} from "@/lib/server/sessions/unassigned";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAgentRoute(ANSWER_READ, async ({ request, db }) => {
  const raw = new URL(request.url).searchParams.get("limit");

  let limit = UNASSIGNED_PAGE_LIMIT;
  if (raw !== null) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > UNASSIGNED_PAGE_LIMIT) {
      throw apiError(
        "invalid_request",
        `limit must be a whole number between 1 and ${UNASSIGNED_PAGE_LIMIT}.`,
      );
    }
    limit = parsed;
  }

  const queue = await listUnassignedSessions(db, limit);

  return apiOk(
    {
      sessions: queue.sessions,
      count: queue.sessions.length,
      truncated: queue.truncated,
    },
    // FR-58. These rows are sessions awaiting attribution, not classified work
    // items, so nothing here was classified and nothing failed to be: the count
    // is a real zero rather than an omission.
    { unparsed: 0 },
  );
});
