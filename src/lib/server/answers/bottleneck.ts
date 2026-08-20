/**
 * FR-56 — Bottleneck. *What is Erik personally holding up?*
 *
 * > Bottleneck lists work whose executor is Erik or an Erik-gate, ranked by
 * > downstream work unblocked and by the nearest milestone at risk.
 *
 * ## Why "downstream work unblocked" is transitive
 *
 * The rank is the size of what moves if Erik does this one thing. An item with
 * two direct dependents that each have ten of their own unblocks twelve pieces
 * of work, not two, and ranking it below an item with three direct dependents
 * and nothing behind them would put the smaller lever first. So `unblocks`
 * counts every **transitive** descendant, and `directDependents` is reported
 * beside it so the number can be checked rather than trusted.
 *
 * The walk carries a visited set. `work_item_dependency` has a `no_self` check
 * constraint but nothing in the schema prevents a longer cycle, and an
 * unguarded traversal of one is an infinite loop in a route handler.
 *
 * ## The Erik-gate part is not a heuristic
 *
 * `executor_kind` is `erik` or `erik_gate`; both are stored enum values, not
 * inferred from an executor name. FR-41's invariant — work blocked because no
 * agent exists for its stack *is* an `erik_gate` — is enforced as a check
 * constraint in i1's migration, so this answer inherits it rather than
 * re-implementing it. Nothing here reads a name and decides it looks like Erik.
 *
 * ## The milestone half, and what an agent token gets instead
 *
 * "the nearest milestone at risk" needs `contract_milestone.due_date`, which
 * §7a refuses agent tokens. As in `next.ts`, the ranking degrades and **says
 * so** in the payload rather than silently becoming a different ranking wearing
 * FR-56's name. `ranking` is `"unblocks-then-milestone"` or `"unblocks-only"`.
 */

import type { AnswerDb } from "./db";
import type { BottleneckFilters } from "./filters";
import type { LoadedWorkItem } from "./load";
import { loadBlockers, loadEngagements, loadWaits, loadWorkItems } from "./load";
import type { NearestMilestone } from "./milestone-index";
import {
  bySoonestDue,
  milestonesByRequirement,
  nearestMilestoneFor,
} from "./milestone-index";

/** §7a and FR-40: the two executor kinds that are Erik's own time. */
const ERIK_KINDS = new Set(["erik", "erik_gate"]);

/** Statuses where the item is still Erik's to do. A `done` item blocks nobody. */
const OUTSTANDING = new Set([
  "pending",
  "in_flight",
  "blocked",
  "not_dispatched",
]);

export interface BottleneckItem {
  id: string;
  engagement: string;
  unit: string | null;
  workType: string | null;
  status: string;
  executor: string | null;
  executorKind: string;
  /** FR-29. Why this could not be automated, where the artifact stated it. */
  unautomatedReason: string | null;
  disposition: "carried" | "closed" | null;
  /** Every transitive descendant in the dependency graph. */
  unblocks: number;
  /** The direct edge count, so `unblocks` can be checked rather than trusted. */
  directDependents: number;
  /** Whether an open blocker or wait is also holding this item. */
  alsoHeld: boolean;
  /** Null when milestones are not readable by this caller. */
  nearestMilestone: NearestMilestone | null;
  /** FR-56. What Erik is the bottleneck ON, not merely which unit it is. */
  description: string | null;
}

export interface BottleneckAnswer {
  items: BottleneckItem[];
  ranking: "unblocks-then-milestone" | "unblocks-only";
  rankingDegradedReason: string | null;
  /**
   * Erik-owned items whose status could not be classified. Excluded from the
   * ranking — an item that might be done is not a bottleneck — and counted, so
   * a short list has a visible reason.
   */
  unparsedExcluded: number;
  truncated: boolean;
  engagementUnknown: boolean;
}

export interface BottleneckOptions {
  today: string;
  /** False for every agent token. See the note above and `next.ts`. */
  milestones: boolean;
}

const MILESTONE_REFUSAL =
  "FR-56 ranks Bottleneck by downstream work unblocked AND by the nearest " +
  "milestone at risk. The second half requires contract_milestone.due_date, " +
  "which spec §7a refuses agent tokens. This list is ranked by downstream work " +
  "alone. Use an operator session for FR-56's full ranking.";

export async function bottleneckAnswer(
  db: AnswerDb,
  filters: BottleneckFilters,
  options: BottleneckOptions,
): Promise<BottleneckAnswer> {
  const engagements = await loadEngagements(db, filters.engagement);
  if (engagements.length === 0) {
    return {
      items: [],
      ranking: options.milestones ? "unblocks-then-milestone" : "unblocks-only",
      rankingDegradedReason: options.milestones ? null : MILESTONE_REFUSAL,
      unparsedExcluded: 0,
      truncated: false,
      engagementUnknown: filters.engagement !== null,
    };
  }

  const [workItems, blockers, waits] = await Promise.all([
    loadWorkItems(db, engagements, { withProse: true }),
    loadBlockers(db, engagements),
    loadWaits(db, engagements),
  ]);

  const openBlockerIds = new Set(
    blockers.filter((one) => one.resolvedAt === null).map((one) => one.id),
  );
  const openWaitIds = new Set(
    waits.filter((one) => one.resolvedAt === null).map((one) => one.id),
  );

  const dependents = directDependentIndex(workItems);

  const byRef = options.milestones
    ? await milestonesByRequirement(db, engagements)
    : new Map<string, NearestMilestone>();

  let unparsedExcluded = 0;
  const items: BottleneckItem[] = [];

  for (const item of workItems) {
    if (!ERIK_KINDS.has(item.executorKind)) continue;
    if (item.status === "unparsed") {
      unparsedExcluded += 1;
      continue;
    }
    if (!OUTSTANDING.has(item.status)) continue;

    items.push({
      id: item.id,
      engagement: item.engagement,
      unit: item.unit,
      workType: item.workType,
      description: item.description,
      status: item.status,
      executor: item.executor,
      executorKind: item.executorKind,
      unautomatedReason: item.unautomatedReason,
      disposition: item.unautomatedDisposition,
      unblocks: transitiveDependents(item.id, dependents),
      directDependents: (dependents.get(item.id) ?? []).length,
      alsoHeld:
        (item.blocker !== null && openBlockerIds.has(item.blocker)) ||
        (item.externalWaitId !== null && openWaitIds.has(item.externalWaitId)),
      nearestMilestone: options.milestones
        ? nearestMilestoneFor(item, byRef)
        : null,
    });
  }

  items.sort((a, b) => {
    if (a.unblocks !== b.unblocks) return b.unblocks - a.unblocks;
    if (options.milestones) {
      const due = bySoonestDue(a.nearestMilestone, b.nearestMilestone);
      if (due !== 0) return due;
    }
    const engagement = a.engagement.localeCompare(b.engagement);
    if (engagement !== 0) return engagement;
    const unit = (a.unit ?? "").localeCompare(b.unit ?? "");
    return unit !== 0 ? unit : a.id.localeCompare(b.id);
  });

  return {
    items: items.slice(0, filters.limit),
    ranking: options.milestones ? "unblocks-then-milestone" : "unblocks-only",
    rankingDegradedReason: options.milestones ? null : MILESTONE_REFUSAL,
    unparsedExcluded,
    truncated: items.length > filters.limit,
    engagementUnknown: false,
  };
}

/** id → the ids of items that depend on it. */
function directDependentIndex(items: LoadedWorkItem[]): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const item of items) {
    for (const dependency of item.dependsOn) {
      const existing = index.get(dependency);
      if (existing === undefined) index.set(dependency, [item.id]);
      else existing.push(item.id);
    }
  }
  return index;
}

/**
 * Every item transitively waiting on this one.
 *
 * Breadth-first with a visited set. The visited set is not an optimisation: a
 * dependency cycle — which the schema permits beyond length one — makes an
 * unguarded walk loop forever inside a request, and a route handler that never
 * returns is an outage rather than a wrong number.
 */
function transitiveDependents(
  id: string,
  dependents: Map<string, string[]>,
): number {
  const seen = new Set<string>([id]);
  const queue = [...(dependents.get(id) ?? [])];

  while (queue.length > 0) {
    const next = queue.shift() as string;
    if (seen.has(next)) continue;
    seen.add(next);
    queue.push(...(dependents.get(next) ?? []));
  }

  // Minus the item itself, which was seeded to stop a cycle counting it.
  return seen.size - 1;
}
