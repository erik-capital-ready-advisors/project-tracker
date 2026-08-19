import { tableRows } from "./markdown";
import { classifyStatus } from "./status";
import { requirementRefs } from "./refs";
import type { Blocker, WorkItem } from "./types";

const BLOCKED_COLUMNS = 5; // ID | Type | Milestone | Blocker | Status
const BLOCKER_ID = /\bB(\d+)\b/;

/**
 * The owner of a blocker the artifact does not attribute.
 *
 * **`erik`, not `client`** — settled by Erik, overriding `plan.md`'s Task 6,
 * which hardcoded `"client"`. His reasoning, recorded because the default is
 * load-bearing rather than cosmetic:
 *
 * > *"Provisioning and infrastructure blockers are Erik's per CLAUDE.md, and
 * > FR-52 / Flow A1 group the Blocked screen by owner precisely to separate his
 * > rows from a client's or a vendor's. Do NOT infer the owner from blocker
 * > prose — a classifier guessing at ownership contradicts the
 * > unparsed-only-default rule. Where the artifact genuinely names a client or
 * > vendor, use that; absent a statement, the owner is Erik."*
 *
 * The consequence of the old default was that every manifest-derived blocker
 * landed in the client's bucket on the one screen that answers *"what is Erik
 * the bottleneck on"* — which is the question that screen exists to answer, and
 * it would have answered it wrongly by construction.
 *
 * Note what is deliberately **not** done here: no attempt is made to read
 * ownership out of the blocker's prose. A regex looking for a client's name
 * would be exactly the widening this codebase's `unparsed` rule forbids. The
 * owner is Erik's until an artifact states otherwise in a field, and stating it
 * in a field is a change to the artifact format, not to this parser.
 */
export const DEFAULT_BLOCKER_OWNER = "erik";

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
        owner: DEFAULT_BLOCKER_OWNER,
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
