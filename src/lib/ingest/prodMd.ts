import { tableRows } from "./markdown";
import type { Blocker } from "./types";

/**
 * FR-20. `spec/prod.md`'s milestone tracker and active blockers.
 *
 * Pure: text in, records out. No filesystem, no database, no clock.
 *
 * ## The status vocabulary is read, not invented
 *
 * Six words, and every one of them is a word these artifacts actually write:
 * `project-lead`'s Build-log writeback step 2 writes `Complete`, `In Progress`,
 * `Blocked` and `Deferred`; the live `prod.md` template additionally carries
 * `Done` and `Not Started`. Anything else is `unparsed`.
 *
 * `Done` and `Complete` map to the same value because they are two writers'
 * words for one state in one document, and both are present verbatim. That is a
 * transcription, not a widening — the widening this discipline forbids is
 * mapping a word the artifacts do NOT use onto the nearest-looking status, which
 * is why "Nearly done" and "✅" stay `unparsed` rather than becoming `complete`.
 */
export const TRACKER_STATUSES = [
  "complete",
  "in_progress",
  "blocked",
  "deferred",
  "not_started",
  "unparsed",
] as const;

export type TrackerStatus = (typeof TRACKER_STATUSES)[number];

const TRACKER_STATUS_BY_WORD = new Map<string, TrackerStatus>([
  ["done", "complete"],
  ["complete", "complete"],
  ["in progress", "in_progress"],
  ["blocked", "blocked"],
  ["deferred", "deferred"],
  ["not started", "not_started"],
]);

/** `B1`, `B1a`, `B12`. The identifier prod.md gives a blocker. */
const BLOCKER_REF = /\bB(\d+[a-z]?)\b/;

const MILESTONE_COLUMNS = 3; // Milestone | Status | Notes
const BLOCKER_COLUMNS = 5; // ID | Blocker | Owner | Blocks | Resolution path

/**
 * Erik's decision, which overrides `plan.md`: absent a statement naming a client
 * or a vendor, a blocker is Erik's. Provisioning and infrastructure blockers are
 * his per CLAUDE.md, and FR-52 groups the Blocked screen by owner precisely to
 * separate his rows from a client's.
 *
 * The owner is taken from the artifact's own Owner column and is never inferred
 * from the blocker prose — a classifier guessing at ownership is the same move
 * as a classifier guessing at status.
 */
export { DEFAULT_BLOCKER_OWNER } from "./blocked";
import { DEFAULT_BLOCKER_OWNER } from "./blocked";

/** Strip the emphasis and strikethrough markdown wraps a table cell carries. */
function plain(cell: string): string {
  return cell.replace(/~~/g, "").replace(/\*\*/g, "").replace(/`/g, "").trim();
}

/** A resolved blocker is struck through in the ID cell. That is the marker. */
function isStruckThrough(cell: string): boolean {
  return cell.includes("~~");
}

export interface TrackerMilestone {
  /** `M1.4 Ingest`, verbatim. */
  name: string;
  status: TrackerStatus;
  /** The Status cell exactly as written, kept whatever the classification. */
  rawStatus: string;
  notes: string | null;
}

export interface ProdMdResult {
  milestones: TrackerMilestone[];
  blockers: Blocker[];
  /** FR-58: milestone rows whose status word this parser does not recognise. */
  unparsed: number;
}

/**
 * `tableRows` drops a header row only when its first cell reads `id`, which is
 * true of the blocker table and false of the milestone tracker. The tracker's
 * header is dropped here by its own first cell instead.
 *
 * The tracker also spans several `### Phase n` tables under one `## Milestone
 * tracker` heading. `tableRows` stops at the next `## ` or `# ` and `### ` is
 * neither, so all of them are read as one list, which is what FR-20 wants.
 */
function milestoneRows(text: string): string[][] {
  return tableRows(text, "## Milestone tracker").filter(
    (cells) => cells[0]?.toLowerCase() !== "milestone",
  );
}

export function parseProdMd(text: string, engagement: string): ProdMdResult {
  const milestones: TrackerMilestone[] = [];

  for (const cells of milestoneRows(text)) {
    if (cells.length !== MILESTONE_COLUMNS) continue;
    const [name, status, notes] = cells;
    if (plain(name) === "") continue;

    milestones.push({
      name: plain(name),
      status: TRACKER_STATUS_BY_WORD.get(plain(status).toLowerCase()) ?? "unparsed",
      rawStatus: status,
      notes: plain(notes) === "" ? null : notes.trim(),
    });
  }

  const blockers = new Map<string, Blocker>();

  for (const cells of tableRows(text, "## Active blockers")) {
    if (cells.length !== BLOCKER_COLUMNS) continue;
    const [idCell, description, owner] = cells;

    // A row naming no `Bn` gets no invented identifier — the same rule
    // `blocked.ts` applies to the manifest's Blocked table.
    const match = BLOCKER_REF.exec(plain(idCell));
    if (!match) continue;

    const id = `${engagement}:B${match[1]}`;
    if (blockers.has(id)) continue;

    const statedOwner = plain(owner).toLowerCase();
    blockers.set(id, {
      id,
      engagement,
      owner: statedOwner === "" ? DEFAULT_BLOCKER_OWNER : statedOwner,
      description: plain(description),
      disposition: isStruckThrough(idCell) ? "closed" : "carried",
    });
  }

  return {
    milestones,
    blockers: [...blockers.values()],
    unparsed: milestones.filter((m) => m.status === "unparsed").length,
  };
}
