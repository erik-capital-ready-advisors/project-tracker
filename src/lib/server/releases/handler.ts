import { apiError, apiOk, toErrorResponse } from "@/lib/api";

import type { ReleaseDb } from "./db";
import { RELEASE_INPUT_LIMITS, isProblems, parseReleaseBody } from "./input";
import { isFailure, recordRelease } from "./persist";
import { currentUnparsedCount } from "./unparsed";

/**
 * FR-76: a `devops` unit records the deploy it just made, in one call.
 *
 * The handler body lives here rather than in `route.ts` so it can be driven
 * directly in a test with a fake database and no HTTP server, while `route.ts`
 * stays the one-line wiring `withAgentRoute` expects. That split is what makes
 * the idempotency and referential-honesty assertions in `handler.test.ts` real
 * tests rather than mocks of themselves.
 *
 * ## The contract, in full
 *
 * `POST /api/ingest/release`, `Authorization: Bearer dl_<uuid>_<hex>`,
 * capability `ingest:write`, `Content-Type: application/json`.
 *
 * ```json
 * {
 *   "engagement":        "delivery-ledger",
 *   "identifier":        "dpl_9xKq2mVn",
 *   "environment":       "preview",
 *   "url":               "https://delivery-ledger-9xkq2mvn.vercel.app",
 *   "deployed_at":       "2026-08-19T18:04:11Z",
 *   "recorded_by":       "fleet:b0952e/d1",
 *   "requirement_refs":  ["FR-73", "FR-74 to FR-76"]
 * }
 * ```
 *
 * `engagement`, `identifier` and `environment` are required; the rest are
 * optional. `source` is **not** accepted — FR-73 defines it as how the release
 * was recorded, and a request that arrived over the ingest API was recorded over
 * the ingest API whatever it says about itself. This route pins `ingested`.
 *
 * `environment` is free text and is stored verbatim. §7a and FR-73 state no
 * closed set for it, and inventing an enum here would turn a value the spec left
 * open into a 400 for anyone who spells it differently.
 *
 * ## Status codes, which are the idempotency signal
 *
 *   * **201** — a release row was created.
 *   * **200** — a release with this `(engagement, identifier, environment)`
 *     already existed; its mutable fields were updated and no duplicate was
 *     made. Reposting the same deploy is safe and is how a retrying caller
 *     should behave.
 *   * **400** `invalid_request` — every problem with the body, listed at once.
 *   * **401 / 403 / 429** — the guard's, before this function runs.
 */
export async function handleReleaseIngest(
  request: Request,
  db: ReleaseDb,
): Promise<Response> {
  try {
    return await ingest(request, db);
  } catch (thrown) {
    // The guard would do exactly this if the error escaped. Doing it here makes
    // the function total — it returns a `Response` on every path — so a test can
    // assert the status a caller sees without re-implementing the guard.
    return toErrorResponse(thrown);
  }
}

async function ingest(request: Request, db: ReleaseDb): Promise<Response> {
  const declared = request.headers.get("content-length");
  if (declared !== null && Number(declared) > RELEASE_INPUT_LIMITS.bodyBytes) {
    throw apiError(
      "invalid_request",
      `The request body is larger than ${RELEASE_INPUT_LIMITS.bodyBytes} bytes.`,
    );
  }

  const text = await request.text();
  // Checked again after reading, because Content-Length is the caller's claim
  // about the body and a chunked request carries none at all.
  if (new TextEncoder().encode(text).length > RELEASE_INPUT_LIMITS.bodyBytes) {
    throw apiError(
      "invalid_request",
      `The request body is larger than ${RELEASE_INPUT_LIMITS.bodyBytes} bytes.`,
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw apiError("invalid_request", "The request body is not valid JSON.");
  }

  const parsed = parseReleaseBody(body);
  if (isProblems(parsed)) {
    throw apiError("invalid_request", parsed.problems.join(" "));
  }

  const result = await recordRelease(db, parsed, "ingested");
  if (isFailure(result)) {
    if (result.clientFault) throw apiError("invalid_request", result.failure);
    // Never the database's own message. `toErrorResponse` would blank it anyway;
    // throwing the generic error here makes that explicit at the call site.
    throw apiError(
      "internal_error",
      "The release could not be recorded. If it keeps happening, check the " +
        "server logs for the matching audit_log row.",
    );
  }

  const unparsed = await currentUnparsedCount(db);

  return apiOk(
    {
      release: {
        id: result.releaseId,
        engagement: parsed.engagementSlug,
        identifier: parsed.identifier,
        environment: parsed.environment,
        url: parsed.url,
        deployed_at: parsed.deployedAt,
        source: "ingested",
        recorded_by: parsed.recordedBy,
      },
      created: result.created,
      requirement_refs: {
        /** Named by this release and resolving to a requirement on this engagement. */
        resolved: result.resolvedRefs,
        /**
         * FR-12 / FR-65's rule applied to a release: these parsed as `FR-nn` but
         * name no requirement this engagement has. They are **reported here and
         * still linked**, because the release did claim them and the
         * disagreement between the two artifacts is data. No requirement was
         * created to make them resolve.
         */
        unresolved: result.unresolvedRefs,
        /**
         * Entries the FR-19 reader could not classify at all. Reported and
         * stored nowhere: `unparsed` is the only default, and guessing what an
         * unrecognised entry meant is the failure that rule exists to prevent.
         */
        unparsed: parsed.unparsedRefEntries,
        links_created: result.linksCreated,
        links_existing: result.linksExisting,
      },
      /**
       * Query parameters removed from `url` because they carried a credential —
       * `x-vercel-protection-bypass` above all. A deploy URL that gets you past
       * the deploy's protection is a key, and this ledger records where a deploy
       * is, never how to get into it.
       */
      url_params_stripped: parsed.strippedUrlParams,
    },
    {
      status: result.created ? 201 : 200,
      // FR-58. Omitted rather than zeroed when the count could not be read.
      ...(unparsed === null ? {} : { unparsed }),
    },
  );
}
