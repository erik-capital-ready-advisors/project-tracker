/**
 * FR-52 — Blocked. *What is stopping work, and whose move is it?*
 *
 * > Blocked lists every blocked work item and open external wait, grouped by
 * > owner, with elapsed time and disposition.
 *
 * ## Why the grouping key is the thing to get right
 *
 * The owner grouping is not presentation. FR-52 groups by owner *precisely* to
 * separate Erik's rows from a client's or a vendor's, and FR-56's Bottleneck
 * screen exists to answer "what is Erik the bottleneck on". Both answers are
 * wrong by construction if a blocker with no stated owner lands in the wrong
 * bucket — which is exactly what happened once already on this project, when
 * `plan.md` hardcoded the default to `client` and every manifest-derived blocker
 * would have been filed under the client's name.
 *
 * So the owner comes from `DEFAULT_BLOCKER_OWNER` in `src/lib/ingest/blocked.ts`
 * — Erik's own decision, recorded in that file's docstring — and **is never
 * inferred from prose**. There is no regex here that reads a name out of a
 * blocker description, and adding one would be the widening this codebase's
 * `unparsed` rule forbids.
 *
 * ## What counts as blocked
 *
 * Three ways, reported distinctly rather than collapsed into one list, because
 * they need different actions:
 *
 *   * `status` — the work item's own status is `blocked`.
 *   * `blocker` — an unresolved `blocker` row points at it.
 *   * `wait` — an unresolved `external_wait` row points at it.
 *
 * An item can be held more than one way and appears once, carrying every reason.
 * Reporting it three times would inflate the count Erik reads as "how much work
 * is stuck".
 */

import { DEFAULT_BLOCKER_OWNER } from "@/lib/ingest/blocked";
import { daysWaiting, isOverdue } from "@/lib/ingest/waits";
import type { ExternalWait } from "@/lib/ingest/types";
import { toIsoDay } from "@/lib/server/waits/input";

import type { AnswerDb } from "./db";
import type { BlockedFilters } from "./filters";
import type { LoadedBlocker, LoadedWait } from "./load";
import { loadBlockers, loadEngagements, loadWaits, loadWorkItems } from "./load";

export type HeldReason = "status" | "blocker" | "wait";

export interface BlockedItem {
  id: string;
  engagement: string;
  unit: string | null;
  workType: string | null;
  status: string;
  executor: string | null;
  executorKind: string;
  /** FR-52. `carried` means Erik still owns the gap; `closed` means decided against. */
  disposition: "carried" | "closed" | null;
  /** Every reason this item is held. Never collapsed to one. */
  heldBy: HeldReason[];
  blockerRef: string | null;
  waitLabel: string | null;
  startedOn: string | null;
  /** FR-52's elapsed time. Null when the item records no start date. */
  daysElapsed: number | null;
}

export interface BlockedWait {
  id: string;
  engagement: string;
  label: string;
  ownerType: string | null;
  reason: string | null;
  startedOn: string | null;
  expectedBy: string | null;
  daysWaiting: number | null;
  overdue: boolean;
  /** Unit keys (or uuids) of the work items this wait holds. */
  blocks: string[];
}

export interface BlockedGroup {
  owner: string;
  items: BlockedItem[];
  waits: BlockedWait[];
  /** The longest elapsed time in this group, for ordering the groups. */
  longestDays: number | null;
}

export interface BlockedAnswer {
  groups: BlockedGroup[];
  itemCount: number;
  waitCount: number;
  /** True when an `engagement` filter named a slug no engagement has. */
  engagementUnknown: boolean;
}

/**
 * Whole days between an ISO instant and a day, or null.
 *
 * Null rather than a number whenever the start cannot be read as a date.
 * `daysBetween` in `waits.ts` parses `${iso}T00:00:00Z`, which yields `NaN` for
 * a full timestamptz — and `NaN` rendered into a screen reads as a blank cell,
 * which is indistinguishable from "no elapsed time" and is how a two-month-old
 * blocker looks fresh.
 */
function elapsedDays(startedAt: string | null, today: string): number | null {
  if (startedAt === null) return null;
  const day = toIsoDay(startedAt);
  if (day === null) return null;
  const wait: ExternalWait = {
    id: "",
    engagement: "",
    label: "",
    owner: "",
    startedAt: day,
    expectedBy: null,
    resolvedAt: null,
    blocks: [],
  };
  const days = daysWaiting(wait, today);
  return Number.isFinite(days) ? days : null;
}

function toDomainWait(wait: LoadedWait, blocks: string[]): ExternalWait | null {
  const startedAt = wait.startedAt === null ? null : toIsoDay(wait.startedAt);
  if (startedAt === null) return null;
  return {
    id: wait.id,
    engagement: wait.engagement,
    label: wait.label,
    owner: wait.owner ?? DEFAULT_BLOCKER_OWNER,
    startedAt,
    expectedBy: wait.expectedBy === null ? null : toIsoDay(wait.expectedBy),
    resolvedAt: wait.resolvedAt,
    blocks,
  };
}

/**
 * Who owns this row.
 *
 * Resolution order, and every step is a stated field rather than a guess:
 * the blocker's own `owner`, then the wait's `owner`, then
 * `DEFAULT_BLOCKER_OWNER`. The work item's `executor` is deliberately **not**
 * consulted — an executor is who was doing the work, not who is holding it up,
 * and filing a blocked fleet unit under `api-integrator` would put agent names
 * in a grouping whose whole purpose is to separate Erik from his clients.
 */
function ownerOf(blocker: LoadedBlocker | null, wait: LoadedWait | null): string {
  const stated = blocker?.owner ?? wait?.owner ?? null;
  return stated !== null && stated.trim() !== "" ? stated.trim() : DEFAULT_BLOCKER_OWNER;
}

export interface BlockedOptions {
  /** ISO day. A parameter, never the clock, so elapsed times are reproducible. */
  today: string;
}

export async function blockedAnswer(
  db: AnswerDb,
  filters: BlockedFilters,
  options: BlockedOptions,
): Promise<BlockedAnswer> {
  const engagements = await loadEngagements(db, filters.engagement);
  if (engagements.length === 0) {
    return {
      groups: [],
      itemCount: 0,
      waitCount: 0,
      engagementUnknown: filters.engagement !== null,
    };
  }

  const [workItems, blockers, waits] = await Promise.all([
    loadWorkItems(db, engagements),
    loadBlockers(db, engagements),
    loadWaits(db, engagements),
  ]);

  const blockerById = new Map(blockers.map((one) => [one.id, one]));
  const waitById = new Map(waits.map((one) => [one.id, one]));

  const openBlocker = (id: string | null): LoadedBlocker | null => {
    if (id === null) return null;
    const blocker = blockerById.get(id);
    return blocker !== undefined && blocker.resolvedAt === null ? blocker : null;
  };
  const openWait = (id: string | null): LoadedWait | null => {
    if (id === null) return null;
    const wait = waitById.get(id);
    return wait !== undefined && wait.resolvedAt === null ? wait : null;
  };

  const groups = new Map<string, BlockedGroup>();
  const groupFor = (owner: string): BlockedGroup => {
    const existing = groups.get(owner);
    if (existing !== undefined) return existing;
    const created: BlockedGroup = { owner, items: [], waits: [], longestDays: null };
    groups.set(owner, created);
    return created;
  };

  let itemCount = 0;

  for (const item of workItems) {
    const blocker = openBlocker(item.blocker);
    const wait = openWait(item.externalWaitId);

    const heldBy: HeldReason[] = [];
    if (item.status === "blocked") heldBy.push("status");
    if (blocker !== null) heldBy.push("blocker");
    if (wait !== null) heldBy.push("wait");
    if (heldBy.length === 0) continue;

    const owner = ownerOf(blocker, wait);
    if (filters.owner !== null && owner !== filters.owner) continue;
    if (
      filters.disposition !== null &&
      item.unautomatedDisposition !== filters.disposition
    ) {
      continue;
    }

    const days = elapsedDays(item.startedAt, options.today);
    const group = groupFor(owner);
    group.items.push({
      id: item.id,
      engagement: item.engagement,
      unit: item.unit,
      workType: item.workType,
      status: item.status,
      executor: item.executor,
      executorKind: item.executorKind,
      disposition: item.unautomatedDisposition,
      heldBy,
      blockerRef: blocker?.ref ?? null,
      waitLabel: wait?.label ?? null,
      startedOn: item.startedAt === null ? null : toIsoDay(item.startedAt),
      daysElapsed: days,
    });
    if (days !== null && (group.longestDays === null || days > group.longestDays)) {
      group.longestDays = days;
    }
    itemCount += 1;
  }

  // FR-52's second half: every OPEN external wait, whether or not it currently
  // holds a work item. A wait nobody has linked to an item is still a thing
  // Erik is waiting on, and dropping it would make the screen quieter than the
  // situation.
  const blocksOf = new Map<string, string[]>();
  for (const item of workItems) {
    if (item.externalWaitId === null) continue;
    const key = item.externalWaitId;
    const list = blocksOf.get(key);
    const label = item.unit ?? item.id;
    if (list === undefined) blocksOf.set(key, [label]);
    else list.push(label);
  }

  let waitCount = 0;
  for (const wait of waits) {
    if (wait.resolvedAt !== null) continue;

    const owner = ownerOf(null, wait);
    if (filters.owner !== null && owner !== filters.owner) continue;
    // A wait carries no disposition column, so an explicit disposition filter
    // excludes waits rather than matching them all. Stated because the
    // alternative — showing every wait under `?disposition=closed` — would read
    // as "these waits are closed".
    if (filters.disposition !== null) continue;

    const blocks = blocksOf.get(wait.id) ?? [];
    const domain = toDomainWait(wait, blocks);
    const days = domain === null ? null : daysWaiting(domain, options.today);
    const group = groupFor(owner);

    group.waits.push({
      id: wait.id,
      engagement: wait.engagement,
      label: wait.label,
      ownerType: wait.ownerType,
      reason: wait.reason,
      startedOn: domain?.startedAt ?? null,
      expectedBy: domain?.expectedBy ?? null,
      daysWaiting: days,
      overdue: domain === null ? false : isOverdue(domain, options.today),
      blocks,
    });
    if (days !== null && (group.longestDays === null || days > group.longestDays)) {
      group.longestDays = days;
    }
    waitCount += 1;
  }

  // Longest-waiting group first; a group with no readable elapsed time sorts
  // last rather than first, because "unknown" is not "urgent".
  const ordered = [...groups.values()].sort((a, b) => {
    const left = a.longestDays ?? -1;
    const right = b.longestDays ?? -1;
    return right === left ? a.owner.localeCompare(b.owner) : right - left;
  });

  return { groups: ordered, itemCount, waitCount, engagementUnknown: false };
}
