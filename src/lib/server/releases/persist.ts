import type { ReleaseSource } from "@/lib/ingest/types";

import { IN_CHUNK, chunk } from "./db";
import type { DbQuery, ReleaseDb } from "./db";
import type { ParsedReleaseInput } from "./input";

/**
 * FR-73 and FR-74's persistence: write a release and the requirement references
 * it names, and say honestly what happened to each one.
 *
 * ## What this module refuses to do
 *
 * **It does not create a requirement.** FR-12 says a milestone reference naming
 * a requirement that does not exist is reported rather than silently accepted,
 * and FR-65 says the same for defects. A release is the third case of the same
 * rule. So a `FR-nn` that resolves against no `requirement` row for this
 * engagement comes back in `unresolvedRefs` and the caller is told.
 *
 * **It does not drop that reference either.** The link row is still written,
 * because the release genuinely claimed it and this product's standing rule is
 * to emit what an artifact says and record both sides where two artifacts
 * disagree. A dropped reference would be the disagreement resolved silently in
 * favour of whichever artifact was ingested first. Queued for Erik on run
 * b0952e — the alternative reading, "report and store nothing", is one line
 * away in `linkRequirements` if he wants it.
 *
 * **It does not derive `shipped`.** No field sets it (FR-74); it is computed by
 * `shippedIndex` in `src/lib/ingest/releases.ts` from the rows this module
 * writes. See `shipped.ts` for the read side.
 *
 * ## What it decrypts
 *
 * Nothing. `release` and `release_requirement` are class `internal` in §7a and
 * carry no encrypted column, and the join to `requirement` runs on `ref`, which
 * §7a leaves clear precisely so that this kind of join needs no decryption. The
 * release path never calls `decrypt_field`.
 */

export interface RecordReleaseResult {
  releaseId: string;
  /** False when a release with this `(engagement, identifier, environment)` already existed. */
  created: boolean;
  /** Refs that resolve against a `requirement` row for this engagement. */
  resolvedRefs: string[];
  /**
   * Refs that parsed as `FR-nn` but name no requirement in this engagement.
   * Reported, stored, never invented (FR-12 / FR-65).
   */
  unresolvedRefs: string[];
  /** Link rows written by this call. Zero on an exact repost — this is FR-76's idempotency. */
  linksCreated: number;
  /** Link rows that already existed. */
  linksExisting: number;
}

export interface RecordReleaseFailure {
  failure: string;
  /** Set when the failure is the caller's fault rather than the system's. */
  clientFault?: boolean;
}

export function isFailure(
  value: RecordReleaseResult | RecordReleaseFailure,
): value is RecordReleaseFailure {
  return "failure" in value;
}

/** A `unique_violation`. Two identical posts racing is the expected cause. */
const UNIQUE_VIOLATION = "23505";

/**
 * Resolve an engagement slug to its id.
 *
 * Inlined here rather than shared: three work-units in this wave need the same
 * two-line query, and a shared module written three times in three worktrees
 * conflicts at merge for no benefit.
 *
 * The projection is `id, slug` and not `*`. §7a restricts `engagement` at the
 * column level for agent tokens, and `agentScopedDb` refuses a wildcard
 * outright — so `select("*")` here would 403 rather than leak, but it would 403
 * at runtime rather than in review.
 */
async function resolveEngagement(
  db: ReleaseDb,
  slug: string,
): Promise<{ id: string } | { failure: string; clientFault: boolean }> {
  const result = await db
    .from("engagement")
    .select("id, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (result.error) {
    return { failure: `engagement lookup failed: ${result.error.message}`, clientFault: false };
  }
  if (result.data === null) {
    // Refused loudly rather than routed to the seeded `unassigned` engagement.
    // FR-26's fallback is written for a *session*, which resolves to an
    // engagement by heuristic and would otherwise be discarded. A release names
    // its engagement outright (FR-73), so an unknown slug is a caller mistake
    // that the caller can fix on the spot — and attributing someone's deploy to
    // `unassigned` is a wrong answer that looks like a right one. Queued.
    return {
      failure: `No engagement has the slug \`${slug}\`.`,
      clientFault: true,
    };
  }
  return { id: result.data.id as string };
}

/** Which of `refs` exist as requirements on this engagement. Chunked, never truncated. */
async function existingRequirementRefs(
  db: ReleaseDb,
  engagementId: string,
  refs: string[],
): Promise<{ present: Set<string> } | { failure: string }> {
  const present = new Set<string>();

  for (const batch of chunk(refs, IN_CHUNK)) {
    const result = await db
      .from("requirement")
      .select("ref")
      .eq("engagement_id", engagementId)
      .in("ref", batch);

    if (result.error) return { failure: `requirement lookup failed: ${result.error.message}` };
    for (const row of result.data ?? []) present.add(row.ref as string);
  }

  return { present };
}

async function linkRequirements(
  db: ReleaseDb,
  releaseId: string,
  refs: string[],
): Promise<{ created: number; existing: number } | { failure: string }> {
  if (refs.length === 0) return { created: 0, existing: 0 };

  const already = new Set<string>();
  for (const batch of chunk(refs, IN_CHUNK)) {
    const result = await db
      .from("release_requirement")
      .select("requirement_ref")
      .eq("release_id", releaseId)
      .in("requirement_ref", batch);

    if (result.error) return { failure: `link lookup failed: ${result.error.message}` };
    for (const row of result.data ?? []) already.add(row.requirement_ref as string);
  }

  const missing = refs.filter((ref) => !already.has(ref));
  if (missing.length === 0) return { created: 0, existing: already.size };

  const result = await db.from("release_requirement").insert(
    missing.map((ref) => ({ release_id: releaseId, requirement_ref: ref })),
  );

  if (result.error && result.error.code !== UNIQUE_VIOLATION) {
    return { failure: `link insert failed: ${result.error.message}` };
  }

  // A unique violation here means a concurrent identical post won the race. The
  // row exists either way, which is what idempotency asks for.
  return {
    created: result.error ? 0 : missing.length,
    existing: already.size + (result.error ? missing.length : 0),
  };
}

/**
 * Write the release row, or find the one already there.
 *
 * The idempotency key is the database's own `unique (engagement_id, identifier,
 * environment)` constraint, not a rule invented here. Posting the same deploy
 * twice updates the mutable fields and creates nothing.
 */
async function upsertRelease(
  db: ReleaseDb,
  engagementId: string,
  input: ParsedReleaseInput,
  source: ReleaseSource,
): Promise<{ id: string; created: boolean } | { failure: string }> {
  const key = (query: DbQuery): DbQuery =>
    query
      .eq("engagement_id", engagementId)
      .eq("identifier", input.identifier)
      .eq("environment", input.environment);

  const mutable = {
    url: input.url,
    deployed_at: input.deployedAt,
    source,
    recorded_by: input.recordedBy,
  };

  const existing = await key(db.from("release").select("id")).maybeSingle();
  if (existing.error) return { failure: `release lookup failed: ${existing.error.message}` };

  if (existing.data !== null) {
    const id = existing.data.id as string;
    const updated = await key(db.from("release").update(mutable));
    if (updated.error) return { failure: `release update failed: ${updated.error.message}` };
    return { id, created: false };
  }

  const inserted = await db
    .from("release")
    .insert({
      engagement_id: engagementId,
      identifier: input.identifier,
      environment: input.environment,
      ...mutable,
    })
    .select("id")
    .maybeSingle();

  if (inserted.error) {
    if (inserted.error.code !== UNIQUE_VIOLATION) {
      return { failure: `release insert failed: ${inserted.error.message}` };
    }
    // Lost a race with an identical concurrent post. Read the winner's row.
    const raced = await key(db.from("release").select("id")).maybeSingle();
    if (raced.error || raced.data === null) {
      return { failure: "release insert conflicted and the existing row could not be read" };
    }
    return { id: raced.data.id as string, created: false };
  }

  if (inserted.data === null) return { failure: "release insert returned no row" };
  return { id: inserted.data.id as string, created: true };
}

/**
 * FR-73 + FR-74, end to end.
 *
 * `source` is a parameter and not a body field on purpose: it records *how* the
 * release was recorded, and a caller does not get to decide that about itself.
 * The ingest route passes `ingested`; `declareRelease` below pins `declared` for
 * the operator path.
 */
export async function recordRelease(
  db: ReleaseDb,
  input: ParsedReleaseInput,
  source: ReleaseSource,
): Promise<RecordReleaseResult | RecordReleaseFailure> {
  const engagement = await resolveEngagement(db, input.engagementSlug);
  if ("failure" in engagement) {
    return { failure: engagement.failure, clientFault: engagement.clientFault };
  }

  const release = await upsertRelease(db, engagement.id, input, source);
  if ("failure" in release) return { failure: release.failure };

  const existing = await existingRequirementRefs(db, engagement.id, input.refs);
  if ("failure" in existing) return { failure: existing.failure };

  const resolvedRefs = input.refs.filter((ref) => existing.present.has(ref));
  const unresolvedRefs = input.refs.filter((ref) => !existing.present.has(ref));

  const links = await linkRequirements(db, release.id, input.refs);
  if ("failure" in links) return { failure: links.failure };

  return {
    releaseId: release.id,
    created: release.created,
    resolvedRefs,
    unresolvedRefs,
    linksCreated: links.created,
    linksExisting: links.existing,
  };
}

/**
 * FR-73's other half: a release Erik records himself rather than one an agent
 * posted.
 *
 * It is the same write with `source` pinned to `declared`. There is deliberately
 * no `"use server"` directive and no form handler here — the operator screen
 * that would call this belongs to a UI unit, and inventing an unauthenticated
 * server action ahead of it would be a write path nobody reviewed. The caller
 * supplies a client it has already authorised as the operator.
 */
export async function declareRelease(
  db: ReleaseDb,
  input: ParsedReleaseInput,
): Promise<RecordReleaseResult | RecordReleaseFailure> {
  return recordRelease(db, input, "declared");
}
