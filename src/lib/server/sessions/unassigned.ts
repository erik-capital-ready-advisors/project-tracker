/**
 * FR-26's second half — the queue, and attributing a session out of it.
 *
 * A session that resolved to no known engagement is stored against
 * `unassigned` and **listed for Erik to attribute in one click**. This module
 * is that list and that click. `u4` builds the screen on top of it and `i7`
 * may surface the count.
 *
 * ## The summary is decrypted here, and only here
 *
 * §7a: `work_session.summary` is read by "operator, agents, decrypted
 * server-side". This runs server-side, so decrypting is what the spec asks for
 * — but it is also the one place in this unit where client prose exists in
 * plaintext in application memory. It is never logged, never put in an audit
 * row (§7a: audit carries no record contents), and never echoed into an error.
 *
 * A decrypt that fails yields `null`, which the caller renders as absent. It
 * deliberately does **not** yield an empty string: "could not decrypt" and
 * "there was nothing there" are different facts, and this product does not
 * collapse different facts.
 */

import { apiError } from "@/lib/api";
import type { ServiceClient } from "@/lib/supabase/service";

import { decryptField } from "@/lib/server/workitems/field-crypto";

import { UNASSIGNED_SLUG } from "./resolve-engagement";

/**
 * The queue is a work list, not an archive. Bounded explicitly because an
 * unbounded PostgREST read is silently truncated at 1000 rows, which would make
 * a long queue look finished.
 */
export const UNASSIGNED_PAGE_LIMIT = 100;

export interface UnassignedSession {
  id: string;
  workItemId: string | null;
  workingDirectory: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  stackName: string | null;
  filesChanged: number | null;
  commits: number | null;
  /** Plaintext, decrypted server-side. Null when absent or undecryptable. */
  summary: string | null;
  source: string | null;
}

export interface UnassignedQueue {
  sessions: UnassignedSession[];
  /** True when the page filled, so the caller knows there may be more. */
  truncated: boolean;
}

/** Look up the `unassigned` engagement's id. */
async function unassignedEngagementId(db: ServiceClient): Promise<string> {
  const { data, error } = await db
    .from("engagement")
    .select("id")
    .eq("slug", UNASSIGNED_SLUG)
    .maybeSingle();

  if (error || !data) {
    throw apiError(
      "internal_error",
      `The "${UNASSIGNED_SLUG}" engagement is missing, so FR-26's queue cannot ` +
        `be read. It is seeded by the schema migration.`,
    );
  }
  return data.id;
}

/** FR-26 — what is waiting for Erik to attribute. */
export async function listUnassignedSessions(
  db: ServiceClient,
  limit: number = UNASSIGNED_PAGE_LIMIT,
): Promise<UnassignedQueue> {
  const engagementId = await unassignedEngagementId(db);
  const capped = Math.min(Math.max(1, limit), UNASSIGNED_PAGE_LIMIT);

  const { data, error } = await db
    .from("work_session")
    .select(
      "id, work_item_id, working_directory, started_at, ended_at, " +
        "duration_minutes, files_changed, commits, summary, source, " +
        "stack:stack_id (name)",
    )
    .eq("engagement_id", engagementId)
    .order("started_at", { ascending: false })
    .limit(capped);

  if (error) throw apiError("internal_error", "Could not read the unassigned queue.");

  const rows = (data ?? []) as unknown as {
    id: string;
    work_item_id: string | null;
    working_directory: string | null;
    started_at: string;
    ended_at: string | null;
    duration_minutes: number | null;
    files_changed: number | null;
    commits: number | null;
    summary: string | null;
    source: string | null;
    stack: { name: string } | { name: string }[] | null;
  }[];

  const sessions = await Promise.all(
    rows.map(async (row) => {
      const stack = Array.isArray(row.stack) ? (row.stack[0] ?? null) : row.stack;
      return {
        id: row.id,
        workItemId: row.work_item_id,
        workingDirectory: row.working_directory,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        durationMinutes: row.duration_minutes,
        stackName: stack?.name ?? null,
        filesChanged: row.files_changed,
        commits: row.commits,
        summary: await decryptField(db, row.summary),
        source: row.source,
      } satisfies UnassignedSession;
    }),
  );

  return { sessions, truncated: sessions.length === capped };
}

export interface AttributionResult {
  sessionId: string;
  engagementId: string;
  engagementSlug: string;
  /** The work item moved with the session, so the two never disagree. */
  workItemId: string | null;
}

/**
 * FR-26's one click — move a session to the engagement it belongs to.
 *
 * The session's `work_item` moves with it. Moving one and not the other would
 * leave a work item filed under `unassigned` describing work that is now
 * attributed elsewhere, which is precisely the "two lists Erik has to merge in
 * his head" this product exists to end.
 *
 * Attributing to `unassigned` is refused rather than treated as a no-op: it is
 * always a mistake, and silently accepting it would report success for a click
 * that changed nothing.
 */
export async function attributeSession(
  db: ServiceClient,
  sessionId: string,
  engagementSlug: string,
): Promise<AttributionResult> {
  if (engagementSlug === UNASSIGNED_SLUG) {
    throw apiError(
      "invalid_request",
      `A session cannot be attributed to "${UNASSIGNED_SLUG}"; that is where it ` +
        `already is. Choose the engagement the work belongs to.`,
    );
  }

  const { data: engagement, error: engagementError } = await db
    .from("engagement")
    .select("id, slug")
    .eq("slug", engagementSlug)
    .maybeSingle();

  if (engagementError) throw apiError("internal_error", "Could not read the engagement.");
  if (!engagement) {
    throw apiError("invalid_request", "No engagement has that slug.");
  }

  const { data: session, error: sessionError } = await db
    .from("work_session")
    .select("id, work_item_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) throw apiError("internal_error", "Could not read the session.");
  if (!session) throw apiError("invalid_request", "No session has that id.");

  // The work item first. If the session move then fails, a work item attributed
  // correctly with its session still queued is a visible inconsistency in the
  // queue; the reverse — a session attributed with its work item left behind —
  // is invisible, because nothing lists work items by their session.
  if (session.work_item_id !== null) {
    const { error } = await db
      .from("work_item")
      .update({ engagement_id: engagement.id })
      .eq("id", session.work_item_id);
    if (error) throw apiError("internal_error", "Could not move the work item.");
  }

  const { error: moveError } = await db
    .from("work_session")
    .update({ engagement_id: engagement.id })
    .eq("id", sessionId);

  if (moveError) throw apiError("internal_error", "Could not move the session.");

  return {
    sessionId,
    engagementId: engagement.id,
    engagementSlug: engagement.slug,
    workItemId: session.work_item_id,
  };
}
