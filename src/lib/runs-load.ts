import "server-only";

import { cache } from "react";

import { requireOperator } from "@/lib/api/operator";
import { listRuns } from "@/lib/server/runs/list";
import { loadRunDetail } from "@/lib/server/runs/detail";
import type { RunsDb } from "@/lib/server/runs/types";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The reads behind M2.8's two fleet-run screens (CR-005 §3.2, FR-92 to FR-95).
 *
 * ## Nothing here computes a rule
 *
 * Every rule lives in two places and neither is this file: `@/lib/runs-display`
 * holds the pure derivations, and `@/lib/server/runs/*` holds the queries over
 * an injected database slice, tested against a fake. This module supplies three
 * things and no fourth: **the authorisation gate, the client, and per-request
 * memoisation.** It is `@/lib/detail-load.ts` for the run layer and the
 * reasoning in that file's header applies here unchanged.
 *
 * ## `requireOperator()` is called inside each read, never by the caller
 *
 * u4's rule from M2.7, kept: a gate that lives in the caller is a gate someone
 * can forget when the second call site is added. `/runs` and `/runs/[run-id]`
 * are built by two different units in parallel, which is exactly the shape that
 * produces a second call site.
 *
 * ## The service-role client — B29, named rather than deepened
 *
 * `createServiceClient()` holds BYPASSRLS, so every policy in
 * `20260819144540_rls_and_grants.sql` — including `app.is_operator()`, where
 * FR-2's MFA requirement and FR-3's deny-by-default role live — is **inert
 * against it**. `requireOperator()` above is therefore the whole of the
 * authorisation on this path and not a convenience in front of a second check.
 *
 * That is **B29**, an open accepted debt. This unit uses the existing
 * `createServiceClient()` path exactly as `detail-load.ts`, `questions-load.ts`
 * and `answer-load.ts` do, adds no new `service_role` mechanism, and does not
 * attempt to pay the debt down in a worktree building two read-only screens.
 * The one rule that governs a unit in this position is `i1`'s from 2026-08-19 —
 * the failure mode is "a later unit quietly routing every read through
 * `service_role` until RLS is decorative" — so it is done **loudly**: two new
 * `service_role` reads, both named in the build report.
 *
 * ## No new decryption surface, and no new agent-reachable surface
 *
 * **This unit issues no `decrypt_field` RPC at all.** Every projection it reads
 * is listed in `@/lib/server/runs/columns.ts` and every one of them is clear
 * under §7a; `runs-columns.test.ts` asserts that and proves the assertion can
 * fail. A run screen is a listing surface — it says *which* unit or question to
 * open, and the eight M2.7 detail views are where the prose is decrypted, one
 * `decrypt_field` round trip per value, behind their own gate.
 *
 * There is no `app/api/runs/*` and this unit built none. Both functions below
 * are reachable only from a React Server Component behind `requireOperator()`.
 *
 * ## `cache()` and why the signatures take primitives
 *
 * `cache()` memoises per request on argument identity. A detail route renders
 * the page and may also generate metadata from the same row, and both should pay
 * for one read. An options **object** would defeat that — a fresh literal at each
 * call site is never identity-equal — so these take a bare string or nothing.
 */

/** The cast is compile-time only and removes nothing at runtime. */
function db(): RunsDb {
  return createServiceClient() as unknown as RunsDb;
}

/**
 * FR-92 — every ingested fleet run, newest first, across every engagement
 * unless FR-96's filter narrows it.
 *
 * Exhaustive rather than paged: FR-92 says "every", and `fetchAllRows` pages to
 * an exact count and reports a stalled read as an error rather than as a short
 * page. See `RunListing`'s note on why there is deliberately no limit.
 *
 * The parameter is a resolved engagement **id** or `null`, and a primitive for
 * the reason this file's header already gives: `cache()` memoises on argument
 * identity, and an options object would be a fresh literal at every call site.
 */
export const readRuns = cache(async (engagementId: string | null = null) => {
  await requireOperator();
  return listRuns(db(), engagementId);
});

/**
 * FR-93 — one run, keyed by its **human run id** (`b0952e`), not by a uuid.
 *
 * Returns a discriminated result rather than `T | null`, because `run_id` is
 * unique per engagement and not across the ledger — see `RunDetailResult`. A
 * caller must handle `ambiguous`; it cannot be collapsed into `not_found`
 * without telling a reader that a run they can see on `/runs` does not exist.
 */
export const readRunDetail = cache(async (runId: string) => {
  await requireOperator();
  return loadRunDetail(db(), runId);
});

// The types `/runs` and `/runs/[run-id]` render against, re-exported so a route
// imports from one module rather than reaching into `@/lib/server/*` directly.
// This is the module boundary those two units are built against.

export type {
  ListedRun,
  RunDefects,
  RunDetail,
  RunDetailResult,
  RunIdentity,
  RunListing,
  RunQuestion,
  RunRequirements,
  RunWorkUnit,
} from "@/lib/server/runs/types";

export type {
  DispatchUsage,
  DurationUnknownReason,
  RenderedGate,
  RenderedGates,
  RunDuration,
  RunUnparsed,
  RunUnparsedGap,
  RunVerdictModel,
  SoleVerdictReason,
  TestTriple,
  VerdictAgreement,
  VerdictSource,
} from "@/lib/runs-display";

export { RUN_UNPARSED_GAPS, VERDICT_SOURCE_QA_REPORT } from "@/lib/runs-display";

// `DetailRef` is `<EntityRef>`'s props by definition rather than by resemblance
// (see `@/lib/server/detail/types`). Re-exported here so a run screen renders
// its work units, questions, defects and requirements through the same markup
// contract FR-83 is asserted against, rather than a run-local link shape.
export type { DetailEngagement, DetailRef } from "@/lib/server/detail/types";
