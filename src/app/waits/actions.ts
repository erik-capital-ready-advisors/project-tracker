"use server";

/**
 * FR-32 and FR-36 from the screen, wrapped so a refusal survives the trip to the
 * browser.
 *
 * `declareWaitAction` and `resolveWaitAction` in `@/lib/server/waits/actions`
 * already carry `requireOperator()` and already run the declaration through the
 * same parser the ingest route uses -- which is what makes FR-33 true, that a
 * wait declared by Erik and one declared by an agent are validated identically.
 * Neither is reimplemented here.
 *
 * What is added is the conversion of a thrown `ApiError` into a returned
 * refusal. The validator's messages are the entire value of the validation --
 * "expectedBy: is before startedAt", "probeTarget: required when
 * resolutionMethod is `probe` — name the probe, or use `manual`" -- and Next
 * redacts a thrown Server Action error before the client sees it. Anything this
 * unit did not classify stays redacted, which is where an unclassified error
 * belongs.
 *
 * Every export is an async function, because a `'use server'` module may export
 * only those.
 */

import type { ActionResult } from "@/lib/action-result";
import { runOperatorAction } from "@/lib/operator-load";
import {
  declareWaitAction,
  resolveWaitAction,
} from "@/lib/server/waits/actions";
import type { DeclaredWait, ResolvedWait } from "@/lib/server/waits/store";

/**
 * FR-32 / FR-33 -- declare an external wait.
 *
 * The payload is passed through untouched. Shaping it here would be a second
 * validator for one shape, and two validators for one shape is how the two
 * drift; `parseWaitDeclaration` is the only one.
 */
export async function declareWaitSafe(
  payload: unknown,
): Promise<ActionResult<DeclaredWait>> {
  return runOperatorAction(() => declareWaitAction(payload));
}

/**
 * FR-36 -- resolve a wait, recording who and when, and unblock what it held.
 *
 * `resolvedBy` is optional and empty means "me": the server action defaults it
 * to the operator's own email, which on this path is more accurate than anything
 * the form could supply. It is offered as an override because a wait is
 * sometimes cleared by the person outside the studio and Erik is only recording
 * that it happened.
 */
export async function resolveWaitSafe(
  waitId: string,
  resolvedBy?: string,
): Promise<ActionResult<ResolvedWait>> {
  const trimmed = resolvedBy?.trim();
  return runOperatorAction(() =>
    resolveWaitAction(waitId, trimmed === "" ? undefined : trimmed),
  );
}
