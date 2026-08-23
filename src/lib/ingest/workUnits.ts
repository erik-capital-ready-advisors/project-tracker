import { tableRows } from "./markdown";
import { classifyStatus, type StatusClassification } from "./status";
import { requirementRefs } from "./refs";
import type { ExecutorKind, WorkItem } from "./types";

const WORK_UNIT_COLUMNS = 7; // ID | Type | Phase | Description | Dispatched-to | Depends-on | Status

const AGENT_TYPES = new Set([
  "researcher", "ui-designer", "api-integrator", "copywriter",
  "devops", "docs-writer", "qa-reviewer",
]);
const ERIK_REASONS = new Set(["credential-absent", "human-judgment"]);

function dependencies(cell: string): string[] {
  const empty = new Set(["", "-", "—"]);
  if (empty.has(cell)) return [];
  return cell
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "" && !empty.has(part));
}

/**
 * An agent that cannot start because a credential or a decision is missing hands
 * the work back to Erik, whoever the manifest says it was dispatched to.
 */
function executorKind(
  dispatchedTo: string | null,
  classified: StatusClassification,
): ExecutorKind {
  if (classified.unautomatedReason && ERIK_REASONS.has(classified.unautomatedReason)) {
    return "erik_gate";
  }
  if (classified.unautomatedReason === "client-action") return "client";
  return dispatchedTo !== null && AGENT_TYPES.has(dispatchedTo) ? "agent" : "unassigned";
}

export function parseWorkUnits(
  text: string,
  engagement: string,
  run: string,
): WorkItem[] {
  return tableRows(text, "## Work-units").map((cells): WorkItem => {
    const unit = cells[0];
    const base = {
      id: `${engagement}:${run}:${unit}`,
      engagement,
      run,
      unit,
      executionMode: "fleet" as const,
      blocker: null,
      evidenceScope: null,
    };

    if (cells.length !== WORK_UNIT_COLUMNS) {
      return {
        ...base,
        workType: null, phase: null, description: null,
        executor: null, executorKind: "unassigned",
        status: "unparsed",
        unautomatedReason: null, unautomatedDisposition: null,
        notVerifiedCount: 0,
        dependsOn: [], implements: [],
        rawStatus: cells.join(" | "),
      };
    }

    const [, workType, phase, description, dispatchedTo, dependsOn, status] = cells;
    const classified = classifyStatus(status);
    return {
      ...base,
      workType,
      phase,
      description,
      executor: dispatchedTo,
      executorKind: executorKind(dispatchedTo, classified),
      dependsOn: dependencies(dependsOn),
      implements: requirementRefs(description),
      rawStatus: status,
      ...classified,
    };
  });
}
