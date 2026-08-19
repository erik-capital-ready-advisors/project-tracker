/**
 * Which authentication step an operator is on, as a pure function.
 *
 * ## The trap this function exists to make impossible
 *
 * `i1` left **no MFA-enrolment carve-out in row-level security**, deliberately.
 * Enrolment runs through GoTrue (`/auth/v1/factors`), which touches no
 * RLS-gated table, so a never-enrolled operator can still enrol. But
 * `app.is_operator()` demands `aal2`, so **at `aal1` the operator's own row in
 * `public.operator` is unreadable** — the query returns zero rows.
 *
 * Zero rows is indistinguishable from "this account does not exist" if you are
 * not careful, and reading it that way locks Erik out of his own product with no
 * recovery path through the interface: the screen would tell him to get an
 * account he already has, and the only thing that would fix it is the thing the
 * screen refuses to offer.
 *
 * So this function's inputs are **only** what GoTrue reports — is there a
 * session, and what assurance levels does it hold. There is no parameter for a
 * table read, which means no future edit can accidentally start routing on one.
 *
 * ## What `currentLevel` and `nextLevel` mean
 *
 * Supabase's `getAuthenticatorAssuranceLevel()` returns both. `nextLevel` is the
 * highest level this account *can* reach: it becomes `aal2` once a factor is
 * enrolled and verified. So the pair separates the two `aal1` situations that
 * need different screens — "you have a factor, present it" and "you have no
 * factor, enrol one".
 */

export type AuthStep = "password" | "verify" | "enroll" | "ready";

export interface AssuranceReading {
  /** Whether GoTrue reports a session at all. */
  signedIn: boolean;
  /** `currentLevel` from `getAuthenticatorAssuranceLevel()`. */
  currentLevel: string | null | undefined;
  /** `nextLevel` from the same call. `aal2` means a factor is enrolled. */
  nextLevel: string | null | undefined;
}

export function nextAuthStep(reading: AssuranceReading): AuthStep {
  if (!reading.signedIn) return "password";
  if (reading.currentLevel === "aal2") return "ready";
  // A factor exists and has not been presented this session.
  if (reading.nextLevel === "aal2") return "verify";
  // No second factor at all. FR-2 requires one, so enrolment is the next step
  // and NOT an error — this is exactly the first-run state.
  return "enroll";
}

/** Where each step lives, so the form and the tests agree on one set of paths. */
export const STEP_PATH: Record<AuthStep, string> = {
  password: "/sign-in",
  verify: "/sign-in/verify",
  enroll: "/sign-in/enroll",
  ready: "/",
};

/**
 * A TOTP code, validated only for shape before it is sent.
 *
 * Six digits is what an authenticator app produces and what GoTrue expects.
 * This refuses obvious noise so a typo costs no round trip; it decides nothing
 * about whether the code is *correct*, which is GoTrue's call and nobody
 * else's.
 */
export function isWellFormedTotp(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}
