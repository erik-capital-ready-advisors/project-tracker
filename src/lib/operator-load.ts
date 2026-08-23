import "server-only";

import { ApiError } from "@/lib/api";
import { getOperatorContext } from "@/lib/api/operator";
import type { ActionResult } from "@/lib/action-result";

import type { LoadNoticeReason } from "@/components/operator-load-notice";

/**
 * The one wrapper every operator screen reads its data through.
 *
 * ## What it is for
 *
 * A screen has three outcomes, not two: it read the data, it read the data and
 * there was none, or **it could not read**. The third is the one this product
 * cannot afford to lose, because a screen that renders its empty state after a
 * failed read has told Erik the ledger is clean without looking at it. That is
 * the same class of mistake as rendering an unknown `unparsed` count as `0`,
 * and `@/lib/unparsed-display` already refuses it for a number; this refuses it
 * for a whole screen.
 *
 * So the return type is a discriminated union and there is no way to reach the
 * data without first handling the failure.
 *
 * ## Why the operator context is read before the read, rather than after
 *
 * `requireOperator()` throws `insufficient_capability` for two different
 * situations -- "present your second factor" and "this account has no role" --
 * and the operator has to do a different thing in each. The error code alone
 * cannot separate them, and matching on the message text is the kind of coupling
 * that breaks silently when someone rewrites a sentence. Reading the context
 * first gives the distinction structurally.
 *
 * None of this leaks anything: you must already hold a valid session to see any
 * refusal beyond `sign-in`.
 *
 * ## What may be shown to the reader
 *
 * `ApiError` messages are written for the caller and carry no mechanism by
 * construction (`@/lib/api/errors`), so they are shown verbatim. **Anything
 * else is replaced.** A raw Postgres error carries table names, constraint
 * names and sometimes row values, and this product's rows quote client systems.
 *
 * The single exception is a missing environment variable, whose message names a
 * variable and never a value. Surfacing it turns an opaque blank screen into an
 * actionable one, which matters because a fresh deployment hits exactly this.
 */

export type LoadResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: LoadNoticeReason; detail: string };

/** Shown when a read failed for a reason the operator cannot act on. */
const OPAQUE_FAILURE =
  "The ledger could not be read. Retry; if it persists, check that the " +
  "database is reachable.";

const MISSING_ENV_PREFIX = "Missing required environment variable";

function describe(error: unknown): { reason: LoadNoticeReason; detail: string } {
  if (error instanceof ApiError) {
    if (error.code === "missing_authorization") {
      return { reason: "sign-in", detail: error.message };
    }
    if (error.code === "insufficient_capability") {
      return { reason: "mfa", detail: error.message };
    }
    return { reason: "error", detail: error.message };
  }

  if (error instanceof Error && error.message.startsWith(MISSING_ENV_PREFIX)) {
    return { reason: "error", detail: error.message };
  }

  return { reason: "error", detail: OPAQUE_FAILURE };
}

/**
 * Run an operator-only read, returning a result rather than throwing.
 *
 * `read` is called only once the session has been established as a role-holding
 * operator at `aal2`, so it may use `requireOperator()` itself -- and it should,
 * because the authorisation gate belongs beside the query and not in a caller
 * that could be forgotten.
 */
export async function loadForOperator<T>(
  read: () => Promise<T>,
): Promise<LoadResult<T>> {
  try {
    const context = await getOperatorContext();

    if (context.userId === null) {
      return {
        reason: "sign-in",
        ok: false,
        detail:
          "There is no public signup. The operator account is provisioned by " +
          "hand.",
      };
    }

    if (context.assuranceLevel !== "aal2") {
      return {
        ok: false,
        reason: "mfa",
        detail: context.mustEnrolMfa
          ? "No second factor is enrolled on this account. Enrol one to " +
            "continue; enrolment does not need a role."
          : "Present your second factor to continue.",
      };
    }

    if (context.profile === null) {
      return {
        ok: false,
        reason: "no-role",
        detail:
          "Role elevation is a deliberate administrative act. Until a role is " +
          "granted, this account can read no table. This is not a missing " +
          "account.",
      };
    }

    return { ok: true, data: await read() };
  } catch (error) {
    const described = describe(error);
    return { ok: false, reason: described.reason, detail: described.detail };
  }
}

/**
 * Run an operator-only **write** and return a result rather than throwing.
 *
 * The read counterpart above renders a whole screen; this one feeds a form. The
 * difference that matters is which messages survive: `ApiError` carries the
 * validation sentences the server layer wrote for the operator, and losing them
 * to Next's error redaction would leave a form that refuses input without ever
 * saying why.
 *
 * `fn` is expected to call `requireOperator()` itself. This wrapper deliberately
 * does not, so that a caller cannot mistake "the wrapper authorises" for "the
 * action is authorised" -- the gate belongs beside the write.
 */
export async function runOperatorAction<T>(
  fn: () => Promise<T>,
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (error) {
    return { ok: false, message: describe(error).detail };
  }
}
