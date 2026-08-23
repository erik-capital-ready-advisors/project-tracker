import "server-only";

import { createClient as createSessionClient } from "@/lib/supabase/server";

import { apiError } from "./errors";

/**
 * Operator-session identity, for the routes and server actions that act as Erik
 * rather than as an agent.
 *
 * ## The trap this module exists to stop someone walking into
 *
 * `app.is_operator()` requires **both** a non-null `operator.role` (FR-3) and
 * `aal2` (FR-2). Both are enforced in row-level security, which is what §7a
 * demands — "enforced in row-level security rather than only in the application
 * layer", written there because a prior build in this practice shipped MFA in
 * the app layer only and a review called it critical.
 *
 * The consequence is not obvious and it is how you lock Erik out of his own
 * product: **at `aal1` the operator's own row in `public.operator` is
 * unreadable.** The `operator_select` policy calls `app.is_operator()`, which is
 * false until a second factor is presented. So a signed-in-but-not-yet-verified
 * operator queries `public.operator` and gets zero rows — which is
 * indistinguishable, if you are not careful, from "this account does not exist."
 *
 * Treat that as "not yet at aal2", never as "no account". i1 left no
 * MFA-enrolment carve-out in RLS deliberately, and it does not need one:
 * enrolment runs through GoTrue (`/auth/v1/factors`,
 * `supabase.auth.mfa.enroll()`), which touches no RLS-gated table, so a
 * never-enrolled operator can still enrol. They simply read nothing until they
 * have.
 *
 * `assuranceLevel` is therefore returned separately from `profile`, and the two
 * must be read together.
 */

export type AssuranceLevel = "aal1" | "aal2" | null;

export interface OperatorContext {
  /** The authenticated auth.users identity. Null when nobody is signed in. */
  userId: string | null;
  email: string | null;
  /** `aal2` means a second factor was presented this session. */
  assuranceLevel: AssuranceLevel;
  /** The next level this account *can* reach — `aal2` once a factor is enrolled. */
  nextAssuranceLevel: AssuranceLevel;
  /**
   * The `public.operator` row, or null.
   *
   * **Null does not mean "no account".** It means one of: nobody is signed in,
   * the session is at `aal1`, or the account has no role yet (FR-3's
   * deny-by-default). `mustEnrolMfa` and `mustVerifyMfa` below say which.
   */
  profile: { id: string; email: string; displayName: string | null } | null;
  /** Signed in, has a factor enrolled, but has not presented it this session. */
  mustVerifyMfa: boolean;
  /** Signed in with no second factor enrolled at all. FR-2 requires one. */
  mustEnrolMfa: boolean;
}

/**
 * Read the current operator context. Never throws for an anonymous visitor —
 * it returns a context describing that.
 *
 * `getUser()` rather than `getSession()`: `getSession()` reads the cookie and
 * trusts it, while `getUser()` revalidates the JWT against the auth server. On a
 * server path the difference is the difference between a forged cookie working
 * and not working.
 */
export async function getOperatorContext(): Promise<OperatorContext> {
  const supabase = await createSessionClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      userId: null,
      email: null,
      assuranceLevel: null,
      nextAssuranceLevel: null,
      profile: null,
      mustVerifyMfa: false,
      mustEnrolMfa: false,
    };
  }

  const { data: assurance } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  const currentLevel = (assurance?.currentLevel ?? null) as AssuranceLevel;
  const nextLevel = (assurance?.nextLevel ?? null) as AssuranceLevel;

  // Only worth querying at aal2; below it the policy refuses and a zero-row
  // answer would be noise that reads like data.
  let profile: OperatorContext["profile"] = null;
  if (currentLevel === "aal2") {
    const { data } = await supabase
      .from("operator")
      .select("id, email, display_name")
      .eq("id", user.id)
      .maybeSingle();
    if (data) {
      profile = {
        id: data.id,
        email: data.email,
        displayName: data.display_name,
      };
    }
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    assuranceLevel: currentLevel,
    nextAssuranceLevel: nextLevel,
    profile,
    mustVerifyMfa: currentLevel === "aal1" && nextLevel === "aal2",
    mustEnrolMfa: currentLevel === "aal1" && nextLevel !== "aal2",
  };
}

/**
 * Demand a fully-authenticated operator, or refuse.
 *
 * Returns the context on success and throws an `ApiError` otherwise. The
 * refusals are distinguished because the interface has to route on them — an
 * operator who needs to enrol a factor and one who needs to present one see
 * different screens — and because none of these distinctions is available to an
 * anonymous attacker: you must already hold a valid session to see any of them.
 */
export async function requireOperator(): Promise<OperatorContext> {
  const context = await getOperatorContext();

  if (context.userId === null) {
    throw apiError(
      "missing_authorization",
      "Sign in to continue. This product has no public surface and no public " +
        "signup; the operator account is provisioned by hand.",
    );
  }

  if (context.assuranceLevel !== "aal2") {
    throw apiError(
      "insufficient_capability",
      context.mustEnrolMfa
        ? "Multi-factor authentication is required and no second factor is " +
            "enrolled on this account. Enrol one to continue."
        : "Present your second factor to continue.",
    );
  }

  if (context.profile === null) {
    // aal2 and still no row: FR-3's deny-by-default. A brand-new account holds
    // no role and can read no table until one is granted deliberately.
    throw apiError(
      "insufficient_capability",
      "This account has no role in the ledger. Role elevation is a deliberate " +
        "administrative act; ask the operator to grant one.",
    );
  }

  return context;
}
