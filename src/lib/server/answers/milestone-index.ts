/**
 * "The nearest dated milestone this work item serves."
 *
 * FR-53 orders Next by it and FR-56 ranks Bottleneck by it, so it lives here
 * rather than twice. The rule it encodes is one line long and easy to get
 * subtly wrong in two places differently:
 *
 * > **An undated milestone never displaces a dated one.** "Nearest" is a
 * > question about dates. A milestone with no due date is not nearer than one
 * > due next week and it is not further away either — it is unordered, and
 * > sorting it as though it were due at the epoch (or at the end of time) is a
 * > silent decision about which client's work Erik sees first.
 *
 * ## Reachable only with an operator client
 *
 * Every function here reads `contract_milestone`, which §7a refuses to agent
 * tokens. Callers gate on that before calling rather than catching the refusal:
 * see the `milestones` option on `nextAnswer` and `bottleneckAnswer`.
 */

import type { AnswerDb } from "./db";
import type { EngagementRef, LoadedWorkItem } from "./load";
import { loadMilestones } from "./load";

export interface NearestMilestone {
  id: string;
  name: string;
  due: string | null;
}

/** True when `candidate` is nearer than `incumbent` under the rule above. */
function isNearer(
  candidate: NearestMilestone,
  incumbent: NearestMilestone | undefined | null,
): boolean {
  if (incumbent === undefined || incumbent === null) return true;
  if (candidate.due === null) return false;
  return incumbent.due === null || candidate.due < incumbent.due;
}

/** requirement ref → the nearest-dated milestone whose acceptance criteria name it. */
export async function milestonesByRequirement(
  db: AnswerDb,
  engagements: EngagementRef[],
): Promise<Map<string, NearestMilestone>> {
  const milestones = await loadMilestones(db, engagements);
  const byRef = new Map<string, NearestMilestone>();

  for (const milestone of milestones) {
    const entry: NearestMilestone = {
      id: milestone.id,
      name: milestone.name,
      due: milestone.due,
    };
    for (const ref of milestone.acceptance) {
      if (isNearer(entry, byRef.get(ref))) byRef.set(ref, entry);
    }
  }
  return byRef;
}

/** The nearest milestone served by any requirement this work item implements. */
export function nearestMilestoneFor(
  item: LoadedWorkItem,
  byRef: Map<string, NearestMilestone>,
): NearestMilestone | null {
  let best: NearestMilestone | null = null;
  for (const ref of item.implements) {
    const candidate = byRef.get(ref);
    if (candidate !== undefined && isNearer(candidate, best)) best = candidate;
  }
  return best;
}

/**
 * Compare two milestone dates for a "soonest first" sort, with `null` last.
 *
 * Returns `0` when neither is dated, so the caller's tiebreakers run and the
 * order stays total. An unstable order on a "what do I do next" screen means the
 * top row changes on refresh, which trains the reader to distrust it.
 */
export function bySoonestDue(
  left: NearestMilestone | null,
  right: NearestMilestone | null,
): number {
  const a = left?.due ?? null;
  const b = right?.due ?? null;
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : 1;
}
