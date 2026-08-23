/**
 * M1.6 — external waits, persisted (FR-32 to FR-38).
 *
 * The date arithmetic is **not** here. `daysWaiting`, `isOverdue` and
 * `projectMilestone` are already built as pure functions in
 * `@/lib/ingest/waits`, tested against frozen dates, and this module calls them
 * rather than reimplementing them. What lives here is the reading and writing
 * around those functions, plus the two things that touch other rows: linking a
 * wait to the work items it blocks, and unblocking them when it resolves.
 */

import { apiError } from "@/lib/api";
import { daysWaiting, isOverdue } from "@/lib/ingest/waits";
import type { ExternalWait } from "@/lib/ingest/types";
import type { ServiceClient } from "@/lib/supabase/service";

import type { DroppedEdge } from "@/lib/server/workitems/rules";

import { toIsoDay } from "./input";
import type { WaitDeclaration } from "./input";

/**
 * Bounded because an unbounded PostgREST read is silently truncated at 1000
 * rows. An external-wait list that quietly stopped at the truncation point
 * would under-report exactly the dependencies FR-38 exists to make visible.
 */
export const WAIT_PAGE_LIMIT = 500;

export interface StoredWait {
  id: string;
  engagementId: string;
  engagementSlug: string | null;
  label: string;
  owner: string | null;
  ownerType: string | null;
  reason: string | null;
  startedOn: string | null;
  expectedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionMethod: "probe" | "manual" | null;
  probeTarget: string | null;
  /** FR-34. Elapsed whole days, frozen at resolution once resolved. */
  daysWaiting: number | null;
  /** FR-34. False for a resolved wait and for one with no expected-by date. */
  overdue: boolean;
  /** Unit keys of the work items this wait blocks. */
  blocks: string[];
}

export interface DeclaredWait {
  waitId: string;
  engagementId: string;
  created: boolean;
  blockedWorkItemIds: string[];
  /** FR-42's discipline, applied to `blocks`: named, not merely counted. */
  droppedBlocks: DroppedEdge[];
  droppedBlockCount: number;
}

async function engagementIdForSlug(
  db: ServiceClient,
  slug: string,
): Promise<string> {
  const { data, error } = await db
    .from("engagement")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw apiError("internal_error", "Could not read the engagement.");
  if (!data) {
    throw apiError(
      "invalid_request",
      "No engagement has that slug. A wait belongs to an engagement; declare " +
        "the engagement first.",
    );
  }
  return data.id;
}

/**
 * FR-32 / FR-33 — declare a wait, or update the one already declared.
 *
 * Idempotent on `(engagement_id, label)`, the unique key i1 declared. An agent
 * that hits the same store-review wait on two consecutive runs declares it
 * twice and gets one row, which is what makes FR-33 safe to call from an
 * unattended fleet run.
 *
 * A resolved wait that is re-declared is **not** reopened. Re-declaring is what
 * an agent does when it encounters a wait again; deciding that a wait Erik
 * marked resolved is open again is a judgment, and it is not one an ingest call
 * gets to make silently.
 */
export async function declareWait(
  db: ServiceClient,
  declaration: WaitDeclaration,
  now: Date,
): Promise<DeclaredWait> {
  const engagementId = await engagementIdForSlug(db, declaration.engagementSlug);

  const { data: existing, error: existingError } = await db
    .from("external_wait")
    .select("id")
    .eq("engagement_id", engagementId)
    .eq("label", declaration.label)
    .maybeSingle();

  if (existingError) throw apiError("internal_error", "Could not read the wait.");

  const values = {
    engagement_id: engagementId,
    label: declaration.label,
    owner: declaration.owner,
    owner_type: declaration.ownerType,
    reason: declaration.reason,
    // Stored as an instant because the column is `timestamptz`; the day is what
    // the arithmetic uses and `toIsoDay` puts it back.
    started_at: `${declaration.startedOn}T00:00:00.000Z`,
    expected_by: declaration.expectedBy,
    resolution_method: declaration.resolutionMethod,
    probe_target: declaration.probeTarget,
  };

  let waitId: string;
  if (existing) {
    const { error } = await db
      .from("external_wait")
      .update(values)
      .eq("id", existing.id);
    if (error) throw apiError("internal_error", "Could not update the wait.");
    waitId = existing.id;
  } else {
    const { data, error } = await db
      .from("external_wait")
      .insert(values)
      .select("id")
      .single();
    if (error || !data) throw apiError("internal_error", "Could not store the wait.");
    waitId = data.id;
  }

  const linked = await linkBlockedWorkItems(
    db,
    engagementId,
    waitId,
    declaration.blocks,
    now,
  );

  return {
    waitId,
    engagementId,
    created: !existing,
    blockedWorkItemIds: linked.blockedIds,
    droppedBlocks: linked.dropped,
    droppedBlockCount: linked.dropped.length,
  };
}

/**
 * Point the named work items at this wait and mark them blocked.
 *
 * A unit key naming nothing is **dropped and reported**, the same rule FR-42
 * states for dependency edges and for the same reason: a wait that claims to
 * block `i7` when no `i7` exists is a finding about the artifact that declared
 * it, and swallowing it makes the wait look narrower than it is.
 */
async function linkBlockedWorkItems(
  db: ServiceClient,
  engagementId: string,
  waitId: string,
  blocks: readonly string[],
  now: Date,
): Promise<{ blockedIds: string[]; dropped: DroppedEdge[] }> {
  if (blocks.length === 0) return { blockedIds: [], dropped: [] };

  const { data, error } = await db
    .from("work_item")
    .select("id, unit")
    .eq("engagement_id", engagementId)
    .in("unit", [...blocks]);

  if (error) throw apiError("internal_error", "Could not read the blocked work items.");

  const found = new Map<string, string>();
  for (const row of data ?? []) {
    if (row.unit !== null) found.set(row.unit, row.id);
  }

  const dropped: DroppedEdge[] = [];
  const blockedIds: string[] = [];
  const seen = new Set<string>();

  for (const unit of blocks) {
    const id = found.get(unit);
    if (id === undefined) {
      dropped.push({ from: waitId, to: unit, reason: "unknown-target" });
      continue;
    }
    if (seen.has(id)) {
      dropped.push({ from: waitId, to: unit, reason: "duplicate" });
      continue;
    }
    seen.add(id);
    blockedIds.push(id);
  }

  if (blockedIds.length > 0) {
    const { error: updateError } = await db
      .from("work_item")
      .update({
        external_wait_id: waitId,
        status: "blocked",
        started_at: now.toISOString(),
      })
      .in("id", blockedIds);
    if (updateError) {
      throw apiError("internal_error", "Could not mark the work items blocked.");
    }
  }

  return { blockedIds, dropped };
}

export interface ResolvedWait {
  waitId: string;
  resolvedAt: string;
  resolvedBy: string;
  /** FR-36. The work items this resolution released. */
  unblockedWorkItemIds: string[];
}

/**
 * FR-36 — record who resolved a wait and when, and unblock what it held.
 *
 * ## Two decisions worth stating
 *
 * **Only items still `blocked` are moved.** An item that reached `done` while
 * the wait was open is not dragged backwards, and one already `superseded`
 * stays superseded. The transition is `blocked` → `pending`, and nothing else
 * is touched.
 *
 * **`external_wait_id` is left in place.** It is the record of what blocked the
 * item; clearing it would tidy away the history that makes the Blocked screen's
 * past legible. `resolved_at` on the wait is what says the block is over.
 *
 * Resolving an already-resolved wait is refused rather than treated as
 * idempotent: the second caller's name and timestamp would overwrite the first
 * caller's, and FR-36 exists to record *who* resolved it.
 */
export async function resolveWait(
  db: ServiceClient,
  waitId: string,
  resolvedBy: string,
  now: Date,
): Promise<ResolvedWait> {
  const { data: wait, error: readError } = await db
    .from("external_wait")
    .select("id, resolved_at")
    .eq("id", waitId)
    .maybeSingle();

  if (readError) throw apiError("internal_error", "Could not read the wait.");
  if (!wait) throw apiError("invalid_request", "No external wait has that id.");
  if (wait.resolved_at !== null) {
    throw apiError(
      "invalid_request",
      "That wait is already resolved. Recording a second resolution would " +
        "overwrite who resolved it the first time.",
    );
  }

  const resolvedAt = now.toISOString();

  const { error: updateError } = await db
    .from("external_wait")
    .update({ resolved_at: resolvedAt, resolved_by: resolvedBy })
    .eq("id", waitId);

  if (updateError) throw apiError("internal_error", "Could not resolve the wait.");

  const { data: blockedItems, error: blockedError } = await db
    .from("work_item")
    .select("id")
    .eq("external_wait_id", waitId)
    .eq("status", "blocked");

  if (blockedError) {
    throw apiError("internal_error", "Could not read the work items this wait blocked.");
  }

  const unblockedWorkItemIds = (blockedItems ?? []).map((row) => row.id);

  if (unblockedWorkItemIds.length > 0) {
    const { error } = await db
      .from("work_item")
      .update({ status: "pending" })
      .in("id", unblockedWorkItemIds);
    if (error) throw apiError("internal_error", "Could not unblock the work items.");
  }

  return { waitId, resolvedAt, resolvedBy, unblockedWorkItemIds };
}

interface WaitRow {
  id: string;
  engagement_id: string;
  label: string;
  owner: string | null;
  owner_type: string | null;
  reason: string | null;
  started_at: string | null;
  expected_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_method: "probe" | "manual" | null;
  probe_target: string | null;
  engagement: { slug: string } | { slug: string }[] | null;
  work_item: { id: string; unit: string | null }[] | null;
}

function toDomainWait(row: WaitRow): ExternalWait | null {
  const startedOn = row.started_at === null ? null : toIsoDay(row.started_at);
  if (startedOn === null) return null;
  return {
    id: row.id,
    engagement: row.engagement_id,
    label: row.label,
    owner: row.owner ?? "",
    startedAt: startedOn,
    expectedBy: row.expected_by === null ? null : toIsoDay(row.expected_by),
    resolvedAt: row.resolved_at === null ? null : toIsoDay(row.resolved_at),
    blocks: (row.work_item ?? []).map((item) => item.id),
  };
}

export interface WaitFilters {
  engagementSlug?: string | null;
  /** Default: only waits that are still open. FR-34's screen is about those. */
  includeResolved?: boolean;
  limit?: number;
}

export interface WaitGroup {
  owner: string;
  waits: StoredWait[];
  overdueCount: number;
}

export interface WaitListing {
  waits: StoredWait[];
  /** FR-38 — grouped by owner, so dependencies on other people read as one list. */
  byOwner: WaitGroup[];
  overdueCount: number;
  truncated: boolean;
}

/**
 * FR-34 / FR-38 — read the waits, with elapsed days and the overdue flag.
 *
 * `today` is a parameter and never the clock, so a screen's "6 days waiting" is
 * reproducible in a test.
 */
export async function listWaits(
  db: ServiceClient,
  today: string,
  filters: WaitFilters = {},
): Promise<WaitListing> {
  const limit = Math.min(Math.max(1, filters.limit ?? WAIT_PAGE_LIMIT), WAIT_PAGE_LIMIT);

  let query = db
    .from("external_wait")
    .select(
      "id, engagement_id, label, owner, owner_type, reason, started_at, " +
        "expected_by, resolved_at, resolved_by, resolution_method, probe_target, " +
        "engagement:engagement_id (slug), work_item (id, unit)",
    )
    .order("expected_by", { ascending: true })
    .limit(limit);

  if (filters.engagementSlug) {
    const engagementId = await engagementIdForSlug(db, filters.engagementSlug);
    query = query.eq("engagement_id", engagementId);
  }
  if (filters.includeResolved !== true) {
    query = query.is("resolved_at", null);
  }

  const { data, error } = await query;
  if (error) throw apiError("internal_error", "Could not read the external waits.");

  const rows = (data ?? []) as unknown as WaitRow[];
  const waits: StoredWait[] = [];

  for (const row of rows) {
    const domain = toDomainWait(row);
    const engagement = Array.isArray(row.engagement)
      ? (row.engagement[0] ?? null)
      : row.engagement;

    waits.push({
      id: row.id,
      engagementId: row.engagement_id,
      engagementSlug: engagement?.slug ?? null,
      label: row.label,
      owner: row.owner,
      ownerType: row.owner_type,
      reason: row.reason,
      startedOn: domain?.startedAt ?? null,
      expectedBy: domain?.expectedBy ?? null,
      resolvedAt: row.resolved_at,
      resolvedBy: row.resolved_by,
      resolutionMethod: row.resolution_method,
      probeTarget: row.probe_target,
      // A wait with an unreadable start date reports `null` days rather than a
      // number nobody can justify. See `toIsoDay` for the NaN trap this avoids.
      daysWaiting: domain === null ? null : daysWaiting(domain, today),
      overdue: domain === null ? false : isOverdue(domain, today),
      blocks: (row.work_item ?? []).map((item) => item.unit ?? item.id),
    });
  }

  const groups = new Map<string, WaitGroup>();
  for (const wait of waits) {
    // FR-32 requires an owner; a legacy row without one is grouped as
    // `unattributed` rather than dropped from a screen that exists to show
    // every outstanding dependency.
    const owner = wait.owner ?? "unattributed";
    const group = groups.get(owner) ?? { owner, waits: [], overdueCount: 0 };
    group.waits.push(wait);
    if (wait.overdue) group.overdueCount += 1;
    groups.set(owner, group);
  }

  return {
    waits,
    byOwner: [...groups.values()].sort((a, b) => a.owner.localeCompare(b.owner)),
    overdueCount: waits.filter((wait) => wait.overdue).length,
    truncated: waits.length === limit,
  };
}
