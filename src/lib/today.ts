/**
 * Today, as `YYYY-MM-DD` in UTC. One definition, read once per render.
 *
 * FR-91's staleness boundary is computed from a date **passed in**, never from a
 * clock inside the rule — that is what keeps `plannedStaleness` a pure function
 * testable against a frozen string. Somebody still has to read a clock, and this
 * is where a server-rendered screen does it, at the page, so a component tree
 * never calls `new Date()` mid-render.
 *
 * UTC rather than local, matching `answers/handlers.ts`'s `todayFrom` and every
 * other elapsed count in this product: `updated_at` is a UTC instant and
 * `daysUntouched` truncates both sides to a UTC calendar day, so reading "today"
 * in a local zone would make a row on the boundary answer differently depending
 * on where the reader is sitting.
 */
export function isoToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
