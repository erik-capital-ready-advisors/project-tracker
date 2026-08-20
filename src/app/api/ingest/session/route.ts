/**
 * `POST /api/ingest/session` — FR-24, FR-27.
 *
 * The endpoint the Claude Code `SessionEnd` hook posts to, and the one a
 * running agent posts to mid-session. Capability `ingest:write`.
 *
 * Authentication, capability check, FR-8 rate limiting and the FR-6 audit row
 * are all handled by `withAgentRoute`; this handler validates its own body,
 * because only it knows the shape.
 *
 * §7a: the response reports what was stored and what could not be — it never
 * echoes the summary back, because the summary is the field that may quote
 * whatever client codebase the session was in.
 */

import { INGEST_WRITE, apiError, apiOk, withAgentRoute } from "@/lib/api";

import { parseSessionPayload } from "@/lib/server/sessions/input";
import { recordWorkSession } from "@/lib/server/sessions/record";

export const runtime = "nodejs";
/**
 * Never cached and never prerendered. This is a write endpoint whose answer
 * depends on a bearer token, and a cached ingest response would be both wrong
 * and a cross-token leak.
 */
export const dynamic = "force-dynamic";

/**
 * One sentence a human can act on, or null when nothing needs saying.
 *
 * The structured fields above are for the hook; this is for whoever reads the
 * response in a terminal and would otherwise see `201` and assume the session
 * was filed where they asked.
 */
function attributionNote(recorded: {
  unhonouredSlug: string | null;
  resolutionDegraded: boolean;
}): string | null {
  if (recorded.unhonouredSlug !== null) {
    return (
      `No engagement is registered with the slug \`${recorded.unhonouredSlug}\`, so ` +
      `this session was filed against \`unassigned\` for attribution rather than ` +
      `discarded (FR-26). Register the engagement, then re-post: the session's ` +
      `natural key is unchanged, so the second post corrects the first.`
    );
  }
  if (recorded.resolutionDegraded) {
    return (
      `This session could not be matched to an engagement by its working ` +
      `directory, because an agent token may not read \`engagement.repo_path\`. ` +
      `It was filed against \`unassigned\`. Post an explicit \`engagement\` slug ` +
      `to file it directly.`
    );
  }
  return null;
}

export const POST = withAgentRoute(INGEST_WRITE, async ({ request, db }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw apiError("invalid_request", "The request body is not valid JSON.");
  }

  const parsed = parseSessionPayload(body);
  if (!parsed.ok) {
    throw apiError(
      "invalid_request",
      `The work-session record was refused: ${parsed.errors.join("; ")}`,
    );
  }

  const recorded = await recordWorkSession(db, parsed.value, new Date());

  return apiOk(
    {
      sessionId: recorded.sessionId,
      workItemId: recorded.workItemId,
      engagement: recorded.engagementSlug,
      // FR-26: `unassigned` here is the caller's signal that this session is in
      // the attribution queue rather than filed against a client.
      resolvedBy: recorded.resolvedBy,
      // The slug the caller asked for and did not get, or null. FR-26's
      // fallback still applies -- the session is kept, never discarded -- but it
      // is no longer applied in silence. A named engagement quietly turned into
      // `unassigned` is a wrong attribution, and the caller is the only party
      // positioned to correct it.
      unhonouredSlug: recorded.unhonouredSlug,
      // True when directory resolution could not run because this token may not
      // read `engagement.repo_path` (the open 7a-versus-FR-24 question). "No
      // engagement matched" and "matching was not possible" are different facts.
      resolutionDegraded: recorded.resolutionDegraded,
      attributionNote: attributionNote(recorded),
      durationMinutes: recorded.durationMinutes,
      storedEdges: recorded.storedEdgeCount,
      // FR-42: named, not merely counted. A caller that declared an edge to a
      // unit that does not exist learns which one.
      droppedEdges: recorded.droppedEdges,
      droppedEdgeCount: recorded.droppedEdgeCount,
    },
    { status: 201 },
  );
});
