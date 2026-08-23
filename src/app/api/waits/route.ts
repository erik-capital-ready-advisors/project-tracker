/**
 * `/api/waits` — FR-32 to FR-34, FR-38.
 *
 *   * `POST` declares an external wait (`ingest:write`). FR-33: *"A wait may be
 *     declared by Erik or by an agent that encounters one, over the ingest
 *     API."* This is that API.
 *   * `GET` lists them with elapsed days, the overdue flag and the by-owner
 *     grouping (`answer:read`).
 *
 * The resolution endpoint is `POST /api/waits/resolve` and takes the id in the
 * body rather than in the path: `withAgentRoute` wraps a
 * `(request) => Response` handler, so a dynamic `[id]` segment's params would
 * be dropped on the floor by the guard rather than reaching the handler.
 */

import { ANSWER_READ, INGEST_WRITE, apiError, apiOk, withAgentRoute } from "@/lib/api";

import type { CensusDb } from "@/lib/server/answers/db";
import { currentUnparsedCount } from "@/lib/server/answers/unparsed";

import { parseWaitDeclaration } from "@/lib/server/waits/input";
import { WAIT_PAGE_LIMIT, declareWait, listWaits } from "@/lib/server/waits/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = withAgentRoute(INGEST_WRITE, async ({ request, db }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw apiError("invalid_request", "The request body is not valid JSON.");
  }

  const parsed = parseWaitDeclaration(body);
  if (!parsed.ok) {
    throw apiError(
      "invalid_request",
      `The external wait was refused: ${parsed.errors.join("; ")}`,
    );
  }

  const declared = await declareWait(db, parsed.value, new Date());

  return apiOk(
    {
      waitId: declared.waitId,
      created: declared.created,
      blockedWorkItems: declared.blockedWorkItemIds,
      // FR-42's discipline applied to `blocks`: a unit key naming nothing is
      // reported, never swallowed.
      droppedBlocks: declared.droppedBlocks,
      droppedBlockCount: declared.droppedBlockCount,
    },
    { status: declared.created ? 201 : 200 },
  );
});

export const GET = withAgentRoute(ANSWER_READ, async ({ request, db }) => {
  const params = new URL(request.url).searchParams;

  const raw = params.get("limit");
  let limit = WAIT_PAGE_LIMIT;
  if (raw !== null) {
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > WAIT_PAGE_LIMIT) {
      throw apiError(
        "invalid_request",
        `limit must be a whole number between 1 and ${WAIT_PAGE_LIMIT}.`,
      );
    }
    limit = parsed;
  }

  /**
   * `today` is accepted as a parameter so the elapsed-day arithmetic is
   * reproducible from outside the process, and defaults to the server's date.
   * It is validated rather than passed through: `@/lib/ingest/waits` builds a
   * date by string concatenation, so a malformed value there produces `NaN`
   * days rather than an error.
   */
  const todayParam = params.get("today");
  if (todayParam !== null && !/^\d{4}-\d{2}-\d{2}$/.test(todayParam)) {
    throw apiError("invalid_request", "today must be a calendar date, e.g. 2026-08-19.");
  }
  const today = todayParam ?? new Date().toISOString().slice(0, 10);

  const listing = await listWaits(db, today, {
    engagementSlug: params.get("engagement"),
    includeResolved: params.get("includeResolved") === "true",
    limit,
  });

  // FR-58 — the ledger's count, from the one shared definition in
  // `@/lib/server/answers/unparsed`. It is **global**: it is not narrowed by
  // this endpoint's filters and it is not scoped to the rows this endpoint
  // touched.
  //
  // This used to be a literal `0`, on the reasoning that nothing on this path
  // is classified so nothing here could fail to classify. That reasoning
  // answers a different question than the one FR-58 asks. FR-58 asks what the
  // *system* could not classify — "a system that cannot classify something says
  // so on every surface" — so a `0` here states that the whole ledger
  // classified cleanly, on a request that counted nothing. That is the wrong
  // `done` this product exists to prevent, reached through an envelope field.
  //
  // `null` when any component of the census could not be counted, never a
  // partial sum, and `apiOk` omits the field entirely rather than sending `0`.
  const unparsed = await currentUnparsedCount(db as unknown as CensusDb);

  return apiOk(
    {
      today,
      waits: listing.waits,
      // FR-38 — the studio's dependencies on other people, in one place.
      byOwner: listing.byOwner,
      overdueCount: listing.overdueCount,
      truncated: listing.truncated,
    },
    unparsed === null ? {} : { unparsed },
  );
});
