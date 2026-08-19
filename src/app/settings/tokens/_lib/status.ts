import type { WireCapability } from "@/lib/api";

/**
 * What state a token is in, as a pure function.
 *
 * No clock of its own: `now` is a parameter, so "this token expires tomorrow"
 * is reproducible in a test and identical on the server and in the browser. The
 * status is computed once on the server and passed down as data, because a
 * client component that called `new Date()` would render one answer during the
 * server pass and possibly another at hydration -- and the value it would
 * disagree about is whether a credential is still valid.
 */

export type TokenStatus = "active" | "expired" | "revoked";

export interface TokenView {
  id: string;
  label: string;
  capabilities: WireCapability[];
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  /** Derived server-side by `tokenStatus`, never recomputed in the browser. */
  status: TokenStatus;
}

/**
 * `revoked` outranks `expired`.
 *
 * A token can be both, and the two are not equally interesting: expiry is what
 * happens to every token eventually, revocation is a decision someone made.
 * Showing "expired" over a revoked token would hide the decision, and FR-7's
 * whole point is that revocation is visible and deliberate.
 *
 * A malformed `expires_at` is reported `expired` rather than `active`. Both
 * defaults are wrong in some sense, and only one of them is wrong in the
 * direction that presents an unreadable credential as usable.
 */
export function tokenStatus(
  token: { expiresAt: string; revokedAt: string | null },
  now: Date,
): TokenStatus {
  if (token.revokedAt !== null) return "revoked";
  const expires = Date.parse(token.expiresAt);
  if (Number.isNaN(expires)) return "expired";
  return expires <= now.getTime() ? "expired" : "active";
}

/**
 * A default expiry to prefill the issue form with, as a calendar day.
 *
 * Ninety days. §7a says tokens are "expiring" without naming a period, and the
 * same section sets `agent_token` retention at "until revoked, then 90 days for
 * audit", so ninety is the number this system already uses for the life of a
 * credential record. It is a **prefill and not a policy** -- the field is
 * editable, and the choice is queued for Erik.
 */
export const DEFAULT_EXPIRY_DAYS = 90;

export function defaultExpiryDay(now: Date): string {
  const then = new Date(now.getTime() + DEFAULT_EXPIRY_DAYS * 86_400_000);
  return then.toISOString().slice(0, 10);
}

/**
 * Turn the form's calendar day into the instant the token expires.
 *
 * End of the chosen day in UTC, not its start. A token whose expiry field says
 * `2026-11-17` should work on the seventeenth; interpreting the day as
 * `T00:00:00Z` would kill it the moment the day began, which reads as an
 * off-by-one bug to whoever's fleet run stops at midnight.
 *
 * Returns `null` for anything that is not a calendar day, so the caller refuses
 * rather than issuing a credential with an expiry nobody chose.
 */
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function expiryInstant(day: string): Date | null {
  if (!ISO_DAY.test(day)) return null;
  const parsed = Date.parse(`${day}T23:59:59.999Z`);
  if (Number.isNaN(parsed)) return null;

  const instant = new Date(parsed);

  // `Date.parse` **rolls an impossible day forward instead of refusing it**:
  // `2026-02-31T23:59:59.999Z` parses cleanly as 3 March. A `<input type=date>`
  // will not produce that, but this function is reached from a Server Action
  // whose argument is whatever the client sent, and the value it decides is a
  // credential's lifetime. Round-tripping the day is the only way to tell a
  // real date from one that was silently corrected.
  if (instant.toISOString().slice(0, 10) !== day) return null;

  return instant;
}
