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

import type { CensusDb } from "@/lib/server/answers/db";
import { currentUnparsedCount } from "@/lib/server/answers/unparsed";

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

  // FR-58 — the ledger's count, from the one shared definition in
  // `@/lib/server/answers/unparsed`. It is **global**: it is not narrowed by
  // this endpoint's filters and it is not scoped to the rows this endpoint
  // touched.
  //
  // This used to be a literal `0`, on the reasoning that nothing on this path
  // is classified so nothing here could fail to classify. That reasoning
  // answers a different question than the one FR-58 asks. FR-58 asks what the
  // *system* could not classify — "a system that cannot classify something says
  // so on every surface" — so a `0` here states that the whole ledger
  // classified cleanly, on a request that counted nothing. That is the wrong
  // `done` this product exists to prevent, reached through an envelope field.
  //
  // `null` when any component of the census could not be counted, never a
  // partial sum, and `apiOk` omits the field entirely rather than sending `0`.
  const unparsed = await currentUnparsedCount(db as unknown as CensusDb);

  return apiOk(
    {
      sessions: queue.sessions,
      count: queue.sessions.length,
      truncated: queue.truncated,
    },
    unparsed === null ? {} : { unparsed },
  );
});
