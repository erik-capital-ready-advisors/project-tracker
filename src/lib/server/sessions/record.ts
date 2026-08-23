/**
 * M1.5 — persist a hand-prompted work session (FR-24 to FR-31).
 *
 * One posted session produces, in this order:
 *
 *   1. an engagement resolution (FR-26), never a discard;
 *   2. a `stack` row, upserted by name, with its first/last-seen window (FR-31);
 *   3. a `work_item` in the **same table fleet work lives in**, carrying
 *      `execution_mode = 'hand'` and `executor_kind = 'erik'` (FR-28, FR-39);
 *   4. its dependency edges, with the unresolvable ones dropped **and counted**
 *      (FR-42);
 *   5. a `work_session` row whose `summary` is ciphertext (§7a).
 *
 * Idempotent by the session's natural key — `(engagement_id,
 * working_directory, started_at)`, which i1 declared as
 * `unique nulls not distinct`. That is what makes FR-27 safe: an agent posting
 * mid-session and the hook posting again at `SessionEnd` are the same session,
 * and the second post updates the first rather than doubling Erik's hours for
 * the stack.
 */

import type { ServiceClient } from "@/lib/supabase/service";
import { ApiError, apiError } from "@/lib/api";

import { encryptField } from "@/lib/server/workitems/field-crypto";
import { applyErikGateRule, resolveDependencyEdges } from "@/lib/server/workitems/rules";
import type { DroppedEdge } from "@/lib/server/workitems/rules";

import { durationMinutes } from "./input";
import type { SessionInput } from "./input";
import { resolveEngagement } from "./resolve-engagement";
import type { EngagementCandidate, ResolutionSource } from "./resolve-engagement";

/**
 * How many engagements the resolver will read.
 *
 * PostgREST silently truncates an unbounded read — a prior fleet run measured
 * the cap at 1000 rows and recorded it, and a truncated read here would not
 * error: it would just stop seeing some engagements and start filing their
 * sessions as `unassigned`. So the limit is explicit and **saturation is an
 * error**, not a shrug. This is a single operator's client book; if it ever
 * reaches 500 the resolver needs a real query, not a bigger number.
 */
export const ENGAGEMENT_SCAN_LIMIT = 500;

export interface RecordedSession {
  sessionId: string;
  workItemId: string;
  engagementId: string;
  engagementSlug: string;
  /** `unassigned` here is what FR-26's queue is populated from. */
  resolvedBy: ResolutionSource;
  /**
   * A slug the caller named that was not honoured, or `null`. Never silent:
   * a session filed against `unassigned` despite naming an engagement is a
   * wrong attribution, and the caller is the only party that can correct it.
   */
  unhonouredSlug: string | null;
  /**
   * True when directory resolution could not be attempted because the FR-5
   * column scoping refused `engagement.repo_path` (the open §7a-versus-FR-24
   * question). Distinguishes "no engagement matched" from "matching was not
   * possible".
   */
  resolutionDegraded: boolean;
  stackId: string | null;
  durationMinutes: number | null;
  /** FR-42. Empty is a fact; a missing field would not be. */
  droppedEdges: DroppedEdge[];
  droppedEdgeCount: number;
  storedEdgeCount: number;
}

function fail(what: string): never {
  // Never carries the Postgres message: it names tables, constraints and
  // sometimes row values. The audit row written by the route guard is where the
  // matching detail lives.
  throw apiError("internal_error", `Could not ${what}.`);
}

/**
 * Read the engagements the resolver will match against.
 *
 * ## §7a vs FR-24: why this reads twice
 *
 * FR-24 says the record carries "the working directory, **the engagement it
 * resolves to**", and FR-26 describes what happens when it resolves to none —
 * so directory-to-engagement resolution needs `engagement.repo_path`.
 *
 * §7a says of `engagement`: *"operator; agent tokens may read **name and slug
 * only**"*, and `repo_path` is named in that row's "Contains" column. i4's
 * `AGENT_ENGAGEMENT_COLUMNS` implements that as an allowlist, and `repo_path`
 * is not on it. So an agent-authenticated request — which is every request to
 * `POST /api/ingest/session`, including the session hook's — is **refused**
 * `repo_path` by `agentScopedDb`, with `forbidden_table`.
 *
 * That is a genuine conflict between two parts of the approved spec, and it is
 * a security boundary, so it is **not mine to resolve**. It is queued as a
 * question. What this function does in the meantime is take the restrictive
 * reading:
 *
 *   1. Ask for `repo_path`. An operator-side caller gets it and full
 *      directory resolution works.
 *   2. If the FR-5 scoping refuses that projection, **fall back to `id, slug`**
 *      and resolve by explicit slug or not at all.
 *
 * The fallback loses no session: FR-26 already defines the unresolved case as
 * first-class — stored against `unassigned` and queued for one-click
 * attribution — so the degradation is *more* rows in Erik's queue, never a
 * discarded record and never a widened grant. If Erik decides agents may read
 * `repo_path`, adding it to `AGENT_ENGAGEMENT_COLUMNS` restores full resolution
 * with no change here.
 *
 * The hook can also skip the whole question by exporting
 * `DELIVERY_LEDGER_ENGAGEMENT`; `slug` is on the allowlist.
 */
export interface EngagementCandidates {
  candidates: EngagementCandidate[];
  /**
   * False when the FR-5 column scoping refused `repo_path`, so directory
   * resolution could not run at all. Reported to the caller: a session that
   * landed in the attribution queue because a column was unreadable is a
   * different fact from one that landed there because no engagement matched,
   * and only the first is fixed by a decision Erik has not made yet.
   */
  repoPathReadable: boolean;
}

async function readEngagementCandidates(
  db: ServiceClient,
): Promise<EngagementCandidates> {
  let rows: { id: string; slug: string; repo_path?: string | null }[] | null = null;
  let repoPathReadable = true;

  try {
    const { data, error } = await db
      .from("engagement")
      .select("id, slug, repo_path")
      .limit(ENGAGEMENT_SCAN_LIMIT);
    if (error) fail("read the engagement list");
    rows = data;
  } catch (thrown) {
    // Only the FR-5 column refusal is absorbed. Anything else is a real fault
    // and must not be turned into a quietly-degraded resolution.
    if (!(thrown instanceof ApiError) || thrown.code !== "forbidden_table") throw thrown;
    repoPathReadable = false;

    const { data, error } = await db
      .from("engagement")
      .select("id, slug")
      .limit(ENGAGEMENT_SCAN_LIMIT);
    if (error) fail("read the engagement list");
    rows = data;
  }

  if (!rows) fail("read the engagement list");

  if (rows.length >= ENGAGEMENT_SCAN_LIMIT) {
    throw apiError(
      "internal_error",
      `Engagement resolution reads at most ${ENGAGEMENT_SCAN_LIMIT} rows and ` +
        `that limit was reached, so the resolution cannot be trusted. Refusing ` +
        `rather than filing this session against a guess.`,
    );
  }

  return {
    repoPathReadable,
    candidates: rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      repoPath: row.repo_path ?? null,
    })),
  };
}

/**
 * FR-31 — one row per stack, with the window it has been seen in.
 *
 * The hours themselves are not stored here; they are summed from
 * `work_session.duration_minutes` at read time, so a corrected session
 * corrects the total instead of leaving a counter that drifted.
 */
async function upsertStack(
  db: ServiceClient,
  name: string | null,
  now: string,
): Promise<string | null> {
  if (name === null) return null;

  const { data: existing, error: readError } = await db
    .from("stack")
    .select("id, first_seen_at")
    .eq("name", name)
    .maybeSingle();

  if (readError) fail("read the stack");

  if (existing) {
    const { error } = await db
      .from("stack")
      .update({ last_seen_at: now })
      .eq("id", existing.id);
    if (error) fail("update the stack");
    return existing.id;
  }

  const { data, error } = await db
    .from("stack")
    .insert({ name, first_seen_at: now, last_seen_at: now })
    .select("id")
    .single();

  if (error || !data) fail("record the stack");
  return data.id;
}

/**
 * FR-42 — turn declared unit keys into stored edges, dropping and counting the
 * rest.
 *
 * The lookup is scoped to the engagement: unit keys are only unique within one,
 * and an edge that reached across engagements would be a dependency on another
 * client's work.
 */
async function writeDependencyEdges(
  db: ServiceClient,
  engagementId: string,
  workItemId: string,
  dependsOn: readonly string[],
): Promise<{ dropped: DroppedEdge[]; stored: number }> {
  if (dependsOn.length === 0) return { dropped: [], stored: 0 };

  const { data, error } = await db
    .from("work_item")
    .select("id, unit")
    .eq("engagement_id", engagementId)
    .in("unit", [...dependsOn]);

  if (error) fail("read the work items an edge names");

  const known = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.unit !== null) known.set(row.unit, row.id);
  }
  // The posting item's own identity, so a self-reference is reported as one
  // rather than as an unknown source.
  known.set("__self__", workItemId);

  const edges = dependsOn.map((to) => ({ from: "__self__", to }));
  const { resolved, dropped } = resolveDependencyEdges(edges, known);

  if (resolved.length > 0) {
    const { error: writeError } = await db
      .from("work_item_dependency")
      .upsert(
        resolved.map((edge) => ({
          work_item_id: edge.workItemId,
          depends_on_id: edge.dependsOnId,
        })),
        { onConflict: "work_item_id,depends_on_id" },
      );
    if (writeError) fail("store the dependency edges");
  }

  return {
    // Report the edge as the caller wrote it, not with the internal marker.
    dropped: dropped.map((edge) => ({ ...edge, from: workItemId })),
    stored: resolved.length,
  };
}

/**
 * Record one posted work session.
 *
 * `now` is a parameter and never the clock, so the whole path is deterministic
 * under test.
 */
export async function recordWorkSession(
  db: ServiceClient,
  input: SessionInput,
  now: Date,
): Promise<RecordedSession> {
  const nowIso = now.toISOString();

  const { candidates, repoPathReadable } = await readEngagementCandidates(db);
  const engagement = resolveEngagement(input, candidates);
  const stackId = await upsertStack(db, input.stackName, nowIso);

  // FR-27 idempotency: the same session posted twice is one session.
  const { data: priorSession, error: priorError } = await db
    .from("work_session")
    .select("id, work_item_id")
    .eq("engagement_id", engagement.engagementId)
    .eq("working_directory", input.workingDirectory)
    .eq("started_at", input.startedAt)
    .maybeSingle();

  if (priorError) fail("look for an existing session");

  const [description, rawStatus] = await Promise.all([
    encryptField(db, input.workItem.title),
    encryptField(db, input.workItem.status),
  ]);

  /**
   * FR-28 + FR-39 + FR-41. One `work_item` table for all three modes; the mode
   * and the executor kind are the only things that differ. `applyErikGateRule`
   * is what stops a session claiming "no agent for this stack" from also
   * claiming an agent did it — the schema's check constraint would refuse that
   * row, and this makes the row right instead of making the request fail.
   */
  const workItemValues = {
    engagement_id: engagement.engagementId,
    execution_mode: "hand" as const,
    work_type: "hand-prompted-session",
    executor: "erik",
    executor_kind: applyErikGateRule({
      executorKind: input.workItem.executorKind,
      unautomatedReason: input.workItem.unautomatedReason,
    }),
    status: input.workItem.status,
    unautomated_reason: input.workItem.unautomatedReason,
    disposition: input.workItem.disposition,
    evidence_scope: input.workItem.evidenceScope,
    not_verified_count: input.workItem.notVerifiedCount,
    stack_id: stackId,
    description,
    raw_status: rawStatus,
    started_at: input.startedAt,
    ended_at: input.endedAt,
  };

  let workItemId: string;
  const priorWorkItemId = priorSession?.work_item_id ?? null;

  if (priorWorkItemId !== null) {
    const { error } = await db
      .from("work_item")
      .update(workItemValues)
      .eq("id", priorWorkItemId);
    if (error) fail("update the work item for this session");
    workItemId = priorWorkItemId;
  } else {
    const { data, error } = await db
      .from("work_item")
      .insert(workItemValues)
      .select("id")
      .single();
    if (error || !data) fail("create the work item for this session");
    workItemId = data.id;
  }

  const edges = await writeDependencyEdges(
    db,
    engagement.engagementId,
    workItemId,
    input.workItem.dependsOn,
  );

  // §7a: the summary may quote anything Erik was working on, so it reaches
  // Postgres as ciphertext and appears in no log and no audit row.
  const summary = await encryptField(db, input.summary);

  const sessionValues = {
    engagement_id: engagement.engagementId,
    work_item_id: workItemId,
    started_at: input.startedAt,
    ended_at: input.endedAt,
    duration_minutes: durationMinutes(input.startedAt, input.endedAt),
    stack_id: stackId,
    working_directory: input.workingDirectory,
    files_changed: input.filesChanged,
    commits: input.commits,
    summary,
    source: input.source,
  };

  const { data: session, error: sessionError } = await db
    .from("work_session")
    .upsert(sessionValues, {
      onConflict: "engagement_id,working_directory,started_at",
    })
    .select("id")
    .single();

  if (sessionError || !session) fail("store the work session");

  return {
    sessionId: session.id,
    workItemId,
    engagementId: engagement.engagementId,
    engagementSlug: engagement.slug,
    resolvedBy: engagement.source,
    unhonouredSlug: engagement.unhonouredSlug,
    // Only meaningful when a directory match was the thing that could have run:
    // an explicit slug does not need `repo_path`.
    resolutionDegraded:
      !repoPathReadable &&
      engagement.source === "unassigned" &&
      input.engagementSlug === null,
    stackId,
    durationMinutes: sessionValues.duration_minutes,
    droppedEdges: edges.dropped,
    droppedEdgeCount: edges.dropped.length,
    storedEdgeCount: edges.stored,
  };
}
