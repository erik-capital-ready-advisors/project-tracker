import type { ExternalWait } from "./types";

const MS_PER_DAY = 86_400_000;

function toDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Whole days between two ISO dates. */
function daysBetween(from: string, to: string): number {
  return Math.round((toDay(to) - toDay(from)) / MS_PER_DAY);
}

export function daysWaiting(wait: ExternalWait, today: string): number {
  return daysBetween(wait.startedAt, wait.resolvedAt ?? today);
}

export function isOverdue(wait: ExternalWait, today: string): boolean {
  if (wait.resolvedAt !== null || wait.expectedBy === null) return false;
  return toDay(today) > toDay(wait.expectedBy);
}

/**
 * A milestone cannot land before the last thing it waits on. `today` is a
 * parameter and never the clock, so this is deterministic and testable.
 */
export function projectMilestone(
  due: string | null,
  waits: ExternalWait[],
  // Deliberately unused, and deliberately still in the signature: the
  // projection is driven by each wait's own `expectedBy`, not by the clock.
  // Keeping the parameter holds the shape of the other two functions here and
  // stops a caller reaching for `new Date()` to fill a gap that does not exist.
  _today: string,
): { projected: string | null; slippedDays: number; drivenBy: string | null } {
  const open = waits.filter(
    (wait) => wait.resolvedAt === null && wait.expectedBy !== null,
  );
  if (due === null || open.length === 0) {
    return { projected: due, slippedDays: 0, drivenBy: null };
  }

  const latest = open.reduce((worst, wait) =>
    toDay(wait.expectedBy as string) > toDay(worst.expectedBy as string) ? wait : worst,
  );
  const latestDate = latest.expectedBy as string;

  if (toDay(latestDate) <= toDay(due)) {
    return { projected: due, slippedDays: 0, drivenBy: null };
  }
  return {
    projected: latestDate,
    slippedDays: daysBetween(due, latestDate),
    drivenBy: latest.id,
  };
}
