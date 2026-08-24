/**
 * FR-53 — Next. *What can I actually start right now?*
 *
 * > Next lists work items whose dependencies are all satisfied and which no open
 * > blocker or wait holds, ordered by the nearest dated milestone they serve.
 *
 * ## Three conditions, and the third one is the one this endpoint cannot always meet
 *
 *   1. **Dependencies all satisfied** — every `work_item_dependency` edge points
 *      at an item whose status is `done`. Anything else, including `unparsed`,
 *      is not satisfied. That direction matters: treating an unreadable
 *      dependency as satisfied would put work on the "start this" list on the
 *      strength of a status nobody could classify.
 *   2. **No open blocker or wait** — the same test FR-52 applies, read the same
 *      way, from the same rows.
 *   3. **Ordered by the nearest dated milestone they serve** — and this needs
 *      `contract_milestone.due_date`, which §7a refuses to agent tokens.
 *
 * ## What happens to the ordering when the caller may not read milestones
 *
 * It is **not** silently replaced with a different ordering presented as FR-53's.
 * The payload carries `ordering`, which is either `"milestone-due-date"` or
 * `"fallback"`, plus `orderingUnavailableReason`. An agent gets a deterministic,
 * useful list ordered by engagement and unit — and is told, in the response,
 * that it is not the ordering FR-53 specifies and why.
 *
 * That is the whole discipline of this product applied to an ordering rather
 * than to a status: state what you actually computed. A list sorted by
 * something else while claiming to be sorted by milestone urgency is a wrong
 * answer that looks right, and Erik would act on the top row.
 *
 * ## `unparsed` candidates are counted, not dropped
 *
 * A work item whose status could not be classified is not "next" — it might be
 * done. It is also not nothing. `unparsedCandidates` reports how many were set
 * aside for that reason, so a short Next list has a visible explanation rather
 * than looking like a quiet week.
 */

import type { AnswerDb } from "./db";
import type { NextFilters } from "./filters";
import type { LoadedWorkItem } from "./load";
import { loadBlockers, loadEngagements, loadWaits, loadWorkItems } from "./load";
import type { NearestMilestone } from "./milestone-index";
import {
  bySoonestDue,
  milestonesByRequirement,
  nearestMilestoneFor,
} from "./milestone-index";

/** Statuses that make an item a candidate for "what can I start". */
const READY_STATUSES = new Set(["pending", "not_dispatched"]);

export interface NextItem {
  id: string;
  engagement: string;
  unit: string | null;
  workType: string | null;
  phase: string | null;
  status: string;
  executor: string | null;
  executorKind: string;
  implements: string[];
  /** How many other items are waiting on this one. */
  unblocks: number;
  /** The nearest dated milestone this item serves, when milestones are readable. */
  nearestMilestone: NearestMilestone | null;
  /** FR-53. A unit id and a work type do not tell Erik what he would be starting. */
  description: string | null;
  /**
   * FR-87 — planned work: `execution_mode IS NULL` and `status = 'pending'`.
   *
   * A planned row **is** a Next candidate — `pending` is a ready status — and
   * that is exactly why FR-91 needs it labelled here. Next is the screen that
   * says "you could start this", and a row nobody has ever claimed reads
   * identically to a dispatched one unless it says so.
   */
  planned: boolean;
  /** `work_item.updated_at`. FR-91's staleness timestamp. */
  updatedAt: string | null;
}

export interface NextAnswer {
  items: NextItem[];
  /** `"milestone-due-date"` is FR-53's ordering. Anything else says so. */
  ordering: "milestone-due-date" | "fallback";
  /** Null when the ordering is FR-53's. */
  orderingUnavailableReason: string | null;
  /** Candidates set aside because their status could not be classified. */
  unparsedCandidates: number;
  /** Candidates excluded because a dependency is not yet done. */
  heldByDependency: number;
  /** Candidates excluded because a blocker or wait holds them. */
  heldByBlocker: number;
  truncated: boolean;
  engagementUnknown: boolean;
}

export interface NextOptions {
  today: string;
  /**
   * Whether this caller may read `contract_milestone`.
   *
   * **False for every agent token** — §7a refuses them the table entirely. The
   * route passes `false` rather than letting `agentScopedDb` throw, so the
   * caller gets a served answer with an honest `ordering` field instead of a
   * `403` for the whole endpoint. The proxy remains the enforcement; this flag
   * is how the handler avoids asking a question it knows the answer to.
   */
  milestones: boolean;
}

export async function nextAnswer(
  db: AnswerDb,
  filters: NextFilters,
  options: NextOptions,
): Promise<NextAnswer> {
  const engagements = await loadEngagements(db, filters.engagement);
  if (engagements.length === 0) {
    return {
      items: [],
      ordering: options.milestones ? "milestone-due-date" : "fallback",
      orderingUnavailableReason: options.milestones
        ? null
        : MILESTONE_REFUSAL,
      unparsedCandidates: 0,
      heldByDependency: 0,
      heldByBlocker: 0,
      truncated: false,
      engagementUnknown: filters.engagement !== null,
    };
  }

  const [workItems, blockers, waits] = await Promise.all([
    loadWorkItems(db, engagements, { withProse: true }),
    loadBlockers(db, engagements),
    loadWaits(db, engagements),
  ]);

  const statusById = new Map(workItems.map((one) => [one.id, one.status]));
  const openBlockerIds = new Set(
    blockers.filter((one) => one.resolvedAt === null).map((one) => one.id),
  );
  const openWaitIds = new Set(
    waits.filter((one) => one.resolvedAt === null).map((one) => one.id),
  );

  /** How many items depend on each item — FR-56 uses the same edge set. */
  const dependents = new Map<string, number>();
  for (const item of workItems) {
    for (const dependency of item.dependsOn) {
      dependents.set(dependency, (dependents.get(dependency) ?? 0) + 1);
    }
  }

  let unparsedCandidates = 0;
  let heldByDependency = 0;
  let heldByBlocker = 0;
  const ready: LoadedWorkItem[] = [];

  for (const item of workItems) {
    if (item.status === "unparsed") {
      unparsedCandidates += 1;
      continue;
    }
    // `blocked`, `in_flight`, `done` and `superseded` are not candidates at all
    // and are not counted as held — they are not work Erik could start.
    if (!READY_STATUSES.has(item.status)) continue;

    if (
      (item.blocker !== null && openBlockerIds.has(item.blocker)) ||
      (item.externalWaitId !== null && openWaitIds.has(item.externalWaitId))
    ) {
      heldByBlocker += 1;
      continue;
    }

    // Every edge must point at a `done` item. A dependency whose row is missing
    // entirely is NOT satisfied: `work_item_dependency` has real foreign keys at
    // both ends, so a missing target means the item was deleted, not that the
    // edge was decorative.
    const satisfied = item.dependsOn.every(
      (dependency) => statusById.get(dependency) === "done",
    );
    if (!satisfied) {
      heldByDependency += 1;
      continue;
    }

    ready.push(item);
  }

  const nearest = options.milestones
    ? await milestonesByRequirement(db, engagements)
    : new Map<string, NearestMilestone>();

  const items: NextItem[] = ready.map((item) => ({
    id: item.id,
    engagement: item.engagement,
    unit: item.unit,
    workType: item.workType,
    description: item.description,
    phase: item.phase,
    status: item.status,
    executor: item.executor,
    executorKind: item.executorKind,
    implements: item.implements,
    planned: item.planned,
    updatedAt: item.updatedAt,
    unblocks: dependents.get(item.id) ?? 0,
    nearestMilestone: nearestMilestoneFor(item, nearest),
  }));

  sortNext(items, options.milestones);

  return {
    items: items.slice(0, filters.limit),
    ordering: options.milestones ? "milestone-due-date" : "fallback",
    orderingUnavailableReason: options.milestones ? null : MILESTONE_REFUSAL,
    unparsedCandidates,
    heldByDependency,
    heldByBlocker,
    truncated: items.length > filters.limit,
    engagementUnknown: false,
  };
}

const MILESTONE_REFUSAL =
  "FR-53 orders Next by the nearest dated milestone each item serves, which " +
  "requires contract_milestone.due_date. Spec §7a refuses agent tokens that " +
  "table entirely, so this list is ordered by engagement and unit instead. " +
  "Use an operator session for FR-53's ordering.";

/**
 * FR-53's order when milestones are readable; a stated fallback when they are
 * not.
 *
 * Both orders are total — engagement then unit then id break every tie — so the
 * list is reproducible across calls. An unstable order on a "what do I do next"
 * screen means the top row changes on refresh, which trains Erik to distrust it.
 */
function sortNext(items: NextItem[], milestones: boolean): void {
  items.sort((a, b) => {
    if (milestones) {
      // A dated milestone always sorts ahead of an undated one or of no
      // milestone at all — "nearest dated" is FR-53's wording.
      const due = bySoonestDue(a.nearestMilestone, b.nearestMilestone);
      if (due !== 0) return due;
    }
    // Within the same milestone date, the item that unblocks more comes first.
    if (a.unblocks !== b.unblocks) return b.unblocks - a.unblocks;

    const engagement = a.engagement.localeCompare(b.engagement);
    if (engagement !== 0) return engagement;
    const unit = (a.unit ?? "").localeCompare(b.unit ?? "");
    return unit !== 0 ? unit : a.id.localeCompare(b.id);
  });
}
