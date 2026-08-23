import "server-only";

import { unstable_rethrow } from "next/navigation";

import { getOperatorContext } from "@/lib/api/operator";

/**
 * Why a registry screen is showing a panel instead of data.
 *
 * `requireOperator()` throws an `ApiError`, which is the right shape for a route
 * handler and the wrong shape for a screen: a thrown error renders the segment's
 * error boundary, and "sign in", "present your second factor" and "this
 * deployment has no database configured" are three different things Erik has to
 * do, not one crash.
 *
 * So the screens read the context, which never throws for an anonymous visitor,
 * and turn it into a state they can render. The actual boundary is unchanged and
 * is not this function: every server action in `@/lib/server/registry` calls
 * `requireOperator()` as its first line, and a gate that renders is not a gate
 * that authorises. This one decides what to draw; that one decides what may
 * happen.
 */
export type OperatorGate =
  | { kind: "ok" }
  /** Nobody is signed in. FR-2 -- there is no public surface and no signup. */
  | { kind: "signin" }
  /** Signed in with no second factor enrolled at all. */
  | { kind: "enrol-mfa" }
  /** Signed in, a factor is enrolled, it has not been presented this session. */
  | { kind: "verify-mfa" }
  /** At `aal2` and still no `operator` row -- FR-3's deny-by-default. */
  | { kind: "no-role" }
  /** The deployment carries no Supabase configuration to reach. */
  | { kind: "unconfigured" }
  /** Anything else. Deliberately carries no mechanism. */
  | { kind: "error" };

/** Every gate state except the one that lets a screen draw data. */
export type GateRefusal = Exclude<OperatorGate, { kind: "ok" }>;

/**
 * The environment check `@/lib/supabase/env` fails with. Matched on the sentence
 * this build wrote itself, never on a message from a dependency.
 */
const MISSING_ENV = "Missing required environment variable";

/**
 * Read the gate. Never throws for a visitor; only ever re-throws Next's own
 * navigation signals, which are control flow rather than errors.
 */
export async function readOperatorGate(): Promise<OperatorGate> {
  try {
    const context = await getOperatorContext();

    if (context.userId === null) return { kind: "signin" };
    if (context.mustEnrolMfa) return { kind: "enrol-mfa" };
    if (context.assuranceLevel !== "aal2") return { kind: "verify-mfa" };
    // aal2 and still no row: FR-3. A brand-new account holds no role and can
    // read no table until one is granted deliberately. This is NOT "no account".
    if (context.profile === null) return { kind: "no-role" };

    return { kind: "ok" };
  } catch (error) {
    // `redirect()`, `notFound()` and friends throw to signal navigation. Catching
    // one and reporting it as an error is how a redirect silently stops working.
    unstable_rethrow(error);

    if (error instanceof Error && error.message.startsWith(MISSING_ENV)) {
      return { kind: "unconfigured" };
    }
    return { kind: "error" };
  }
}
