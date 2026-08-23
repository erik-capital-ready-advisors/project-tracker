/**
 * Date and duration rendering, as pure functions.
 *
 * ## Why UTC and never the reader's locale
 *
 * Every date on these screens is rendered from its UTC calendar day. Two
 * reasons, and the second is the one that bites:
 *
 *   1. Spec 5a puts dates in a monospace column to be compared. A locale format
 *      that varies by machine cannot be compared down a column, and `YYYY-MM-DD`
 *      sorts lexically the same way it sorts chronologically.
 *   2. A Server Component renders in the deployment's timezone and the browser
 *      rehydrates in the reader's. Any formatter that consults the local zone
 *      produces two different strings for the same value and React reports a
 *      hydration mismatch -- or worse, does not, and the date silently shifts by
 *      a day either side of midnight.
 *
 * `@/lib/server/waits/input` already reduces instants to calendar days for the
 * wait arithmetic and names the `NaN` trap that lives in that conversion. This
 * is the display-side counterpart and it returns `null` rather than a guess for
 * exactly the same reason.
 */

/** A calendar day in `YYYY-MM-DD`, or `null` when the value is not a date. */
export function isoDay(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

/** A minute-resolution instant in `YYYY-MM-DD HH:MM`, or `null`. */
export function isoMinute(value: string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 16).replace("T", " ");
}

/**
 * A duration in minutes, rendered compactly.
 *
 * `null` in, `null` out. A session with no recorded duration renders as absent
 * rather than as `0m`, because "nobody recorded how long it took" and "it took
 * no time" are different facts.
 */
export function duration(minutes: number | null | undefined): string | null {
  if (minutes === null || minutes === undefined) return null;
  if (!Number.isFinite(minutes) || minutes < 0) return null;
  const whole = Math.round(minutes);
  if (whole < 60) return `${whole}m`;
  const hours = Math.floor(whole / 60);
  const rest = whole % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Whole days elapsed, phrased for a wait.
 *
 * `null` renders as absent. FR-34 asks for the elapsed count on an overdue wait,
 * and a wait whose start date could not be read reports no count rather than a
 * number nobody can justify -- `@/lib/server/waits/store` already returns `null`
 * for that case rather than a `NaN`.
 */
export function elapsedDays(days: number | null | undefined): string | null {
  if (days === null || days === undefined) return null;
  if (!Number.isFinite(days) || days < 0) return null;
  const whole = Math.round(days);
  return whole === 1 ? "1 day" : `${whole} days`;
}
