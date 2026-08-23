/**
 * The six answer endpoints' handler bodies (FR-57, FR-72).
 *
 * They live here rather than in the `route.ts` files so each one can be driven
 * directly in a test with a fake database and no HTTP server — i8's shape, and
 * the reason it is worth copying is that a handler only reachable through
 * `next dev` is a handler whose refusal paths nobody exercises.
 *
 * ## What every one of them does, in the same order
 *
 *   1. Parse the query string. An unknown parameter or an unrecognised value is
 *      `400 invalid_request` — see `filters.ts` for why ignoring one is worse.
 *   2. Compute the answer from `ctx.db`, which is `agentScopedDb`-wrapped.
 *   3. Count FR-58's `unparsed` from the one shared definition.
 *   4. Return `apiOk(data, { unparsed })`.
 *
 * Authentication (FR-4), the `answer:read` capability and FR-5 table scoping
 * (FR-5), the rate limit (FR-8) and the audit row for every outcome including
 * refusals (FR-6 / FR-59) all happen in `withAgentRoute` before any of this runs.
 *
 * ## Every one of them is `async`, and that is not decoration
 *
 * Filter parsing throws on a bad query string. In a non-`async` function that is
 * a **synchronous** throw from the call expression rather than a rejected
 * promise, so a caller writing `handleBlocked(...).catch(...)` never sees it —
 * the throw happens before there is a promise to attach to. `withAgentRoute`
 * happens to survive that, because its `await handler(...)` sits inside a
 * `try`, but relying on a caller's bracket placement for a 400 to become a 400
 * is the kind of thing that holds until someone writes the second caller.
 * `async` makes every failure a rejection.
 *
 * ## `milestones: false`, everywhere in this file
 *
 * Every handler here serves an **agent token**, and §7a refuses agent tokens
 * `contract_milestone` entirely. So Next and Bottleneck are computed without the
 * milestone half of their ordering and say so in the payload, and Committed is
 * refused outright. The operator screens call the same answer functions directly
 * with `milestones: true` and an unscoped client, which is why the ranking logic
 * lives in the answer modules and not here.
 *
 * ## Why a read failure is a bare 500
 *
 * `LoadError` carries the table name and the PostgREST message, which is exactly
 * what a caller must not receive — a Postgres error quotes constraint names and
 * sometimes row values. It is converted to `apiError("internal_error", …)` with
 * a fixed sentence, and the `audit_log` row written by the guard is what ties the
 * response back to the request for diagnosis.
 */

import { apiError, apiOk } from "@/lib/api";

import { blockedAnswer } from "./blocked";
import { bottleneckAnswer } from "./bottleneck";
import { brokenAnswer } from "./broken";
import { committedAnswer } from "./committed";
import type { AnswerDb, CensusDb } from "./db";
import {
  parseBlockedFilters,
  parseBottleneckFilters,
  parseBrokenFilters,
  parseCommittedFilters,
  parseNextFilters,
  parseUntestedFilters,
} from "./filters";
import { LoadError } from "./load";
import { nextAnswer } from "./next";
import { unparsedCensus } from "./unparsed";
import { untestedAnswer } from "./untested";

/** The clock, in one place, so a test can supply its own. */
export interface HandlerOptions {
  now?: () => Date;
}

function todayFrom(options: HandlerOptions | undefined): string {
  return (options?.now?.() ?? new Date()).toISOString().slice(0, 10);
}

/**
 * Run an answer and wrap it in the FR-58 envelope.
 *
 * The census runs **after** the answer rather than beside it, deliberately: if
 * the answer is going to fail, it should fail before this endpoint spends three
 * more round trips counting rows for a response nobody will receive.
 */
async function respond<T>(
  db: AnswerDb,
  compute: () => Promise<T>,
): Promise<Response> {
  let data: T;
  try {
    data = await compute();
  } catch (thrown) {
    if (thrown instanceof LoadError) {
      throw apiError(
        "internal_error",
        "The answer could not be computed because the ledger could not be " +
          "read. Check the server logs for the matching audit_log row.",
      );
    }
    throw thrown;
  }

  const census = await unparsedCensus(db as unknown as CensusDb);

  // `unparsed` is omitted from the envelope when the count is unknown, never
  // sent as 0. `apiOk` does that for an `undefined`; a `null` would serialise.
  return apiOk(
    { ...data, unparsedBreakdown: census },
    census.total === null ? {} : { unparsed: census.total },
  );
}

/** FR-52. */
export async function handleBlocked(
  request: Request,
  db: AnswerDb,
  options?: HandlerOptions,
): Promise<Response> {
  const filters = parseBlockedFilters(new URL(request.url));
  const today = todayFrom(options);
  return respond(db, () => blockedAnswer(db, filters, { today }));
}

/** FR-53. */
export async function handleNext(
  request: Request,
  db: AnswerDb,
  options?: HandlerOptions,
): Promise<Response> {
  const filters = parseNextFilters(new URL(request.url));
  const today = todayFrom(options);
  return respond(db, () => nextAnswer(db, filters, { today, milestones: false }));
}

/**
 * FR-54. **Always `403 forbidden_table` for an agent token.**
 *
 * The refusal is thrown by `agentScopedDb` at the first read of
 * `contract_milestone` — it is not re-implemented here, so it cannot drift from
 * the enforcement. `committed.ts` carries the full explanation of why the route
 * exists at all when it can only refuse.
 */
export async function handleCommitted(
  request: Request,
  db: AnswerDb,
  options?: HandlerOptions,
): Promise<Response> {
  const filters = parseCommittedFilters(new URL(request.url));
  const today = todayFrom(options);
  return respond(db, () => committedAnswer(db, filters, { today }));
}

/** FR-48, FR-49, FR-55. */
export async function handleUntested(
  request: Request,
  db: AnswerDb,
): Promise<Response> {
  const filters = parseUntestedFilters(new URL(request.url));
  return respond(db, () => untestedAnswer(db, filters));
}

/** FR-56. */
export async function handleBottleneck(
  request: Request,
  db: AnswerDb,
  options?: HandlerOptions,
): Promise<Response> {
  const filters = parseBottleneckFilters(new URL(request.url));
  const today = todayFrom(options);
  return respond(db, () =>
    bottleneckAnswer(db, filters, { today, milestones: false }),
  );
}

/** FR-71, FR-72. */
export async function handleBroken(request: Request, db: AnswerDb): Promise<Response> {
  const filters = parseBrokenFilters(new URL(request.url));
  return respond(db, () => brokenAnswer(db, filters));
}
