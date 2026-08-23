/**
 * `POST /api/waits/resolve` — FR-36.
 *
 * *"Resolving a wait records who resolved it and when, and unblocks its
 * dependent work items."* Capability `ingest:write`.
 *
 * `resolvedBy` is required in the body and is not defaulted from the token: a
 * token label is which credential was used, and FR-36 asks who resolved it.
 * Those are different facts and this product does not collapse different facts.
 * The token is still recorded — `withAgentRoute` writes the audit row (FR-6)
 * naming the token id for every request, so both are on the record.
 */

import { INGEST_WRITE, apiError, apiOk, withAgentRoute } from "@/lib/api";

import { parseWaitResolution } from "@/lib/server/waits/input";
import { resolveWait } from "@/lib/server/waits/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAgentRoute(INGEST_WRITE, async ({ request, db }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw apiError("invalid_request", "The request body is not valid JSON.");
  }

  const parsed = parseWaitResolution(body);
  if (!parsed.ok) {
    throw apiError(
      "invalid_request",
      `The resolution was refused: ${parsed.errors.join("; ")}`,
    );
  }

  const resolved = await resolveWait(
    db,
    parsed.value.waitId,
    parsed.value.resolvedBy,
    new Date(),
  );

  return apiOk({
    waitId: resolved.waitId,
    resolvedAt: resolved.resolvedAt,
    resolvedBy: resolved.resolvedBy,
    unblockedWorkItems: resolved.unblockedWorkItemIds,
    unblockedCount: resolved.unblockedWorkItemIds.length,
  });
});
