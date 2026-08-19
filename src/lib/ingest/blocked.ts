import { tableRows } from "./markdown";
import { classifyStatus } from "./status";
import { requirementRefs } from "./refs";
import type { Blocker, WorkItem } from "./types";

const BLOCKED_COLUMNS = 5; // ID | Type | Milestone | Blocker | Status
const BLOCKER_ID = /\bB(\d+)\b/;

/**
 * The `## Blocked` table: work carried against a named blocker. A row whose
 * Blocker cell names no `Bn` gets `null` rather than an invented identifier.
 */
export function parseBlocked(
  text: string,
  engagement: string,
  run: string,
): { items: WorkItem[]; blockers: Blocker[] } {
  const items: WorkItem[] = [];
  const blockers = new Map<string, Blocker>();

  for (const cells of tableRows(text, "## Blocked")) {
    if (cells.length !== BLOCKED_COLUMNS) continue;
    const [unit, workType, milestone, blockerCell, status] = cells;

    const match = BLOCKER_ID.exec(blockerCell);
    const blockerId = match ? `${engagement}:B${match[1]}` : null;
    if (blockerId && !blockers.has(blockerId)) {
      blockers.set(blockerId, {
        id: blockerId,
        engagement,
        owner: "client",
        description: blockerCell,
        disposition: "carried",
      });
    }

    const classified = classifyStatus(status);
    items.push({
      id: `${engagement}:${run}:${unit}`,
      engagement,
      run,
      unit,
      executionMode: "fleet",
      workType,
      phase: null,
      description: milestone,
      executor: null,
      executorKind: "unassigned",
      dependsOn: [],
      implements: requirementRefs(milestone),
      blocker: blockerId,
      evidenceScope: null,
      rawStatus: status,
      ...classified,
    });
  }

  return { items, blockers: [...blockers.values()] };
}
