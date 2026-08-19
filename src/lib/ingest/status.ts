import type { Disposition, ReasonClass, WorkStatus } from "./types";

export interface StatusClassification {
  status: WorkStatus;
  unautomatedReason: ReasonClass | null;
  unautomatedDisposition: Disposition | null;
  notVerifiedCount: number;
}

const CREDENTIAL_ABSENT = [
  "no vercel account", "absent from the environment", "no credential",
  "no api key", "nothing to authenticate",
];
const BUDGET = ["for budget", "for credits", "budget/credits"];
const OUT_OF_SCOPE = ["out of scope"];
const CLOSED_MARKERS = [
  "is a decision, not a gap", "are decisions, not gaps",
  "this is a decision", "scope moved",
];

function reasonFor(lower: string): ReasonClass | null {
  if (CREDENTIAL_ABSENT.some((needle) => lower.includes(needle))) {
    return "credential-absent";
  }
  if (BUDGET.some((needle) => lower.includes(needle))) return "budget";
  if (OUT_OF_SCOPE.some((needle) => lower.includes(needle))) return "out-of-scope";
  return null;
}

/**
 * Map a manifest Status cell to a status, plus why the work was not automated
 * where the artifact says so.
 *
 * Every branch below was read off a real manifest. Anything else is `unparsed`,
 * which is reported rather than defaulted — widening a pattern to make a
 * stubborn row classify is the failure this function exists to prevent.
 */
export function classifyStatus(cell: string): StatusClassification {
  const lower = cell.toLowerCase();
  const result: StatusClassification = {
    status: "unparsed",
    unautomatedReason: null,
    unautomatedDisposition: null,
    notVerifiedCount: 0,
  };

  const counted = [...cell.matchAll(/(\d+)\s+NOT VERIFIED/g)].map((m) => Number(m[1]));
  if (counted.length > 0) {
    result.notVerifiedCount = counted.reduce((sum, n) => sum + n, 0);
  } else if (cell.includes("NOT VERIFIED")) {
    result.notVerifiedCount = 1;
  }

  if (lower.includes("superseded")) result.status = "superseded";
  else if (lower.includes("blocked")) result.status = "blocked";
  else if (/^\*{0,2}done\b/.test(lower)) result.status = "done";
  else if (/^\*{0,2}pending\b/.test(lower)) result.status = "pending";
  else if (/^\*{0,2}not dispatched\b/.test(lower)) result.status = "not_dispatched";

  if (
    result.status === "blocked" ||
    result.status === "superseded" ||
    result.status === "not_dispatched"
  ) {
    result.unautomatedReason = reasonFor(lower);
    // Conservative: an undispositioned gap is one Erik still owns.
    result.unautomatedDisposition =
      CLOSED_MARKERS.some((marker) => lower.includes(marker)) ? "closed" : "carried";
  }
  return result;
}
