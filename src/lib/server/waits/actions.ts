"use server";

/**
 * Operator-side server actions for M1.6 — FR-32, FR-34, FR-36, FR-38.
 *
 * The same split as `sessions/actions.ts`: the routes beside these serve agents
 * with a bearer token, these serve Erik with an MFA'd operator session, and
 * `requireOperator()` is the first line of each.
 *
 * `u4` builds the wait-declaration form on `declareWaitAction` and the
 * resolution button on `resolveWaitAction`; `i7` reads `getWaits` for the
 * Blocked screen's external-wait section (FR-38).
 */

import { revalidatePath } from "next/cache";

import { apiError } from "@/lib/api";
import { requireOperator } from "@/lib/api/operator";
import { createServiceClient } from "@/lib/supabase/service";

import { parseWaitDeclaration } from "./input";
import { projectMilestoneDates } from "./projection";
import type { MilestoneProjection } from "./projection";
import { declareWait, listWaits, resolveWait } from "./store";
import type { DeclaredWait, ResolvedWait, WaitFilters, WaitListing } from "./store";

/** The server's calendar day, in the form the wait arithmetic requires. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** FR-34 / FR-38 — the waits, grouped by owner, with elapsed days. */
export async function getWaits(filters?: WaitFilters): Promise<WaitListing> {
  await requireOperator();
  return listWaits(createServiceClient(), today(), filters ?? {});
}

/**
 * FR-32 — declare a wait from the screen.
 *
 * Takes the raw form values and runs them through the same parser the ingest
 * route uses, so a wait declared by Erik and one declared by an agent are
 * validated identically. Two validators for one shape is how the two drift.
 */
export async function declareWaitAction(payload: unknown): Promise<DeclaredWait> {
  await requireOperator();

  const parsed = parseWaitDeclaration(payload);
  if (!parsed.ok) {
    throw apiError(
      "invalid_request",
      `The external wait was refused: ${parsed.errors.join("; ")}`,
    );
  }

  const result = await declareWait(createServiceClient(), parsed.value, new Date());
  revalidatePath("/waits");
  revalidatePath("/blocked");
  return result;
}

/**
 * FR-36 — resolve a wait and release what it held.
 *
 * `resolvedBy` defaults to the operator's own email, because on this path the
 * person clicking is known and recording anything else would be less accurate.
 */
export async function resolveWaitAction(
  waitId: string,
  resolvedBy?: string,
): Promise<ResolvedWait> {
  const operator = await requireOperator();

  const result = await resolveWait(
    createServiceClient(),
    waitId,
    resolvedBy ?? operator.profile?.email ?? "operator",
    new Date(),
  );

  revalidatePath("/waits");
  revalidatePath("/blocked");
  revalidatePath("/next");
  return result;
}

/**
 * FR-37 — milestone dates with the external waits accounted for.
 *
 * Operator-only, and not merely by convention: it reads `contract_milestone`,
 * which §7a refuses to agent tokens entirely. Calling it from inside
 * `withAgentRoute` would throw `forbidden_table`, which is the control working.
 */
export async function getMilestoneProjections(
  engagementSlug: string,
): Promise<MilestoneProjection[]> {
  await requireOperator();
  return projectMilestoneDates(createServiceClient(), engagementSlug, today());
}
