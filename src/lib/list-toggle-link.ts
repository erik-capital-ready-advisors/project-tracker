import type { SearchParamRecord } from "@/lib/engagement-filter";

/**
 * The href for the same screen with one presence-style flag flipped, every
 * other parameter kept.
 *
 * ## Why this exists rather than two string literals
 *
 * `/questions` and `/waits` each carry one toggle — "include answered",
 * "include resolved" — and both were written as literal pairs:
 * `href={includeAnswered ? "/questions" : "/questions?answered=1"}`. That is
 * correct for a screen with exactly one parameter and becomes a **silent filter
 * drop** the moment a second one exists. FR-96 gave both screens an
 * `?engagement=` filter, so clicking "Include answered" on
 * `/questions?engagement=acme` would have widened the list back to every
 * engagement while the shell picker still read `Acme` — the disagreement between
 * chrome and screen that FR-96c is written against, arrived at from a link
 * rather than from a bad slug.
 *
 * ## Everything survives, including a value this screen does not understand
 *
 * The parameters are copied verbatim, so an `engagement` value that resolves to
 * nothing is carried across the toggle rather than tidied away. That is
 * deliberate: FR-96c's notice must still be on screen after the click, because
 * a filter that vanished when you pressed an unrelated button is a filter you
 * cannot trust. A repeated parameter stays a repeat.
 *
 * Ordering is stable — the flag first, then the remaining parameters in the
 * order the URL carried them — so the same state always produces the same
 * string, matching `withEngagementFilter`'s rule in `@/lib/engagement-filter`.
 *
 * Nothing here reads a database, a cookie or a clock.
 */
export function withListFlag(
  pathname: string,
  params: SearchParamRecord,
  flag: string,
  on: boolean,
): string {
  const next = new URLSearchParams();

  // Set rather than appended, and dropped entirely when off: the "off" URL is
  // the bare path plus whatever else was there, which is what makes a cleared
  // toggle a clean link rather than `?answered=0`.
  if (on) next.set(flag, "1");

  for (const [key, value] of Object.entries(params)) {
    if (key === flag) continue;
    if (typeof value === "string") next.append(key, value);
    else if (Array.isArray(value)) {
      for (const one of value) next.append(key, one);
    }
  }

  const search = next.toString();
  return search === "" ? pathname : `${pathname}?${search}`;
}
