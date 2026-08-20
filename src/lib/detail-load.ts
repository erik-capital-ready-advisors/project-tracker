import "server-only";

import { cache } from "react";

import { requireOperator } from "@/lib/api/operator";
import type { DetailDb } from "@/lib/server/detail/types";
import { loadBlockerDetail } from "@/lib/server/detail/blocker";
import { loadContractMilestoneDetail } from "@/lib/server/detail/contract-milestone";
import { loadDefectDetail } from "@/lib/server/detail/defect";
import { loadExternalWaitDetail } from "@/lib/server/detail/external-wait";
import { loadOpenQuestionDetail } from "@/lib/server/detail/open-question";
import { loadReleaseDetail } from "@/lib/server/detail/release";
import { loadRequirementDetail } from "@/lib/server/detail/requirement";
import { loadWorkItemDetail, workItemRefs } from "@/lib/server/detail/work-item";
import { resolveRefs } from "@/lib/server/detail/refs";
import type { RefQuery, RefResolution } from "@/lib/server/detail/refs";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The reads behind M2.7's eight detail views and behind reference resolution on
 * every screen (CR-003 FR-80 to FR-86).
 *
 * ## Nothing here computes a rule
 *
 * Every rule lives under `@/lib/server/detail/*`, which is pure over an injected
 * database slice and tested against a fake. This module supplies three things
 * and no fourth: **the authorisation gate, the client, and per-request
 * memoisation.** It is `src/lib/answer-load.ts` for the detail layer, and the
 * reasoning in that file's header applies here unchanged.
 *
 * ## `requireOperator()` is called inside each read, never by the caller
 *
 * u4's rule and it is kept: a gate that lives in the caller is a gate someone
 * can forget when they add the second call site. Eight detail routes written by
 * three Wave C units is exactly the shape that produces a second call site.
 *
 * ## The service-role client, and what that does and does not mean — B29
 *
 * `createServiceClient()` holds BYPASSRLS. Every policy in
 * `20260819144540_rls_and_grants.sql`, including `app.is_operator()` where
 * FR-2's MFA requirement and FR-3's deny-by-default role live, is **inert
 * against it**. So `requireOperator()` above is the whole of the authorisation
 * on this path; it is not a convenience in front of a second check.
 *
 * That is B29, and CR-003 Q9 answered it **(b)** at approval: M2.7 ships on this
 * read path and the debt is recorded rather than paid. The failure mode `i1`
 * named on 2026-08-19 was "a later unit quietly routing every read through
 * `service_role` until RLS is decorative" — so this unit does it **loudly**:
 * every new decrypt edge and every new `service_role` read is named
 * individually in the build report, one row each.
 *
 * **No `security_invoker` view was built.** That is the correct end state and
 * Q9 says so; building a security control under the same milestone as eight new
 * views is how one gets built in a hurry.
 *
 * ## FR-86 — and why there is no JSON route in this unit
 *
 * > Detail views and navigation add **no new decryption surface reachable by an
 * > agent token.**
 *
 * There is no `app/api/detail/*` and this unit built none. Every function below
 * is reachable only from a React Server Component behind `requireOperator()`.
 * `contract_milestone` stays refused to agents in full: it is in
 * `AGENT_FORBIDDEN_TABLES`, `agentScopedDb` is a runtime Proxy that no
 * compile-time cast can remove, and `/api/answer/committed` still answers an
 * agent `403 forbidden_table`.
 *
 * ## `cache()` and why the signatures take primitives
 *
 * `cache()` memoises per request on argument identity. A detail route renders
 * the page and may also generate metadata from the same row, and both should
 * pay for one read. An options **object** would defeat that — a fresh literal at
 * each call site is never identity-equal — so `withProse` is a boolean
 * positional argument rather than a bag.
 *
 * `readRefResolution` is deliberately **not** cached: its argument is an array,
 * so memoisation would never hit and a `cache()` wrapper would say otherwise.
 */

/** The cast is compile-time only and removes nothing at runtime. */
function db(): DetailDb {
  return createServiceClient() as unknown as DetailDb;
}

/**
 * FR-81 — `work_item`.
 *
 * `withProse` defaults to `true`: §7a permits the operator `description` and
 * `raw_status` decrypted server-side, and FR-81 asks for them by name. Pass
 * `false` on a path that needs only the row's identity, and pay nothing.
 */
export const readWorkItemDetail = cache(async (id: string, withProse = true) => {
  await requireOperator();
  return loadWorkItemDetail(db(), id, { withProse });
});

/** FR-81 — `defect` (CR-001). */
export const readDefectDetail = cache(async (id: string, withProse = true) => {
  await requireOperator();
  return loadDefectDetail(db(), id, { withProse });
});

/** FR-81 — `blocker`. */
export const readBlockerDetail = cache(async (id: string, withProse = true) => {
  await requireOperator();
  return loadBlockerDetail(db(), id, { withProse });
});

/** FR-81 + **FR-82** — `requirement` and its four relationships. */
export const readRequirementDetail = cache(async (id: string, withProse = true) => {
  await requireOperator();
  return loadRequirementDetail(db(), id, { withProse });
});

/** FR-81 — `open_question` (FR-18). */
export const readOpenQuestionDetail = cache(async (id: string, withProse = true) => {
  await requireOperator();
  return loadOpenQuestionDetail(db(), id, { withProse });
});

/**
 * FR-81 — `external_wait`.
 *
 * No `withProse`: §7a classes this table `personal` at provider default and
 * states that `reason` is left clear on purpose. There is nothing to decrypt,
 * and an option that never does anything is a promise a later reader believes.
 */
export const readExternalWaitDetail = cache(async (id: string) => {
  await requireOperator();
  return loadExternalWaitDetail(db(), id);
});

/** FR-81 — `release` (CR-001). No encrypted column on this table either. */
export const readReleaseDetail = cache(async (id: string) => {
  await requireOperator();
  return loadReleaseDetail(db(), id);
});

/**
 * FR-81 — `contract_milestone`. **Operator only.**
 *
 * §7a: "operator only; agent tokens are refused this table". FR-86 keeps that
 * unchanged — there is no agent-reachable path to this function, and
 * `OPERATOR_ONLY_KINDS` in `entity-routes.ts` derives the same fact from
 * `AGENT_FORBIDDEN_TABLES` for the routing layer.
 *
 * `withProse` governs `notes` only. `amount` is decrypted regardless: FR-54 asks
 * for it by name and a milestone view that renders no amount is not one.
 */
export const readContractMilestoneDetail = cache(async (id: string, withProse = true) => {
  await requireOperator();
  return loadContractMilestoneDetail(db(), id, { withProse });
});

/**
 * FR-80 / FR-83 — resolve a batch of rendered references to row ids.
 *
 * One round trip per kind. **Decrypts nothing** — resolution reads only clear
 * natural-key columns, so an existing screen adopting `<EntityRef>` pays no
 * `decrypt_field` call for it.
 *
 * A reference that resolves to nothing comes back `null`, which `<EntityRef>`
 * renders in FR-12's dangling treatment and never as a link. That is a finding,
 * not an error, and it is never dropped from the map.
 */
export async function readRefResolution(
  queries: readonly RefQuery[],
): Promise<RefResolution> {
  await requireOperator();
  return resolveRefs(db(), queries);
}

/**
 * FR-80 — work items a screen holds only by uuid, turned into renderable
 * references in one round trip.
 *
 * For the Wave C units adopting `<EntityRef>` on the existing screens: a
 * defect's `fixingWorkItem` and a dependency edge carry a uuid and no label, and
 * eleven screens each fetching their own would be eleven round trips and eleven
 * fallback conventions.
 */
export async function readWorkItemRefs(ids: readonly string[]) {
  await requireOperator();
  return workItemRefs(db(), ids);
}

// ---------------------------------------------------------------------------
// The types Wave C renders against, re-exported so a detail route has exactly
// one module to import from.
// ---------------------------------------------------------------------------

export type {
  DetailDb,
  DetailEngagement,
  DetailOptions,
  DetailRef,
  Prose,
  ProseState,
} from "@/lib/server/detail/types";
export { danglingRef, fallbackLabel, toRef } from "@/lib/server/detail/types";

export type { RefQuery, RefResolution } from "@/lib/server/detail/refs";
export { danglingQueries, refKey, resolvedId } from "@/lib/server/detail/refs";

export type { WorkItemDetail, WorkItemRun } from "@/lib/server/detail/work-item";
export type { DefectDetail, DefectTest } from "@/lib/server/detail/defect";
export type { BlockerDetail } from "@/lib/server/detail/blocker";
export type {
  RequirementCoverage,
  RequirementDefect,
  RequirementDetail,
  RequirementRelease,
  RequirementTest,
  RequirementWorkItem,
} from "@/lib/server/detail/requirement";
export type { OpenQuestionDetail } from "@/lib/server/detail/open-question";
export type { ExternalWaitDetail } from "@/lib/server/detail/external-wait";
export type { ReleaseDetail } from "@/lib/server/detail/release";
export type { ContractMilestoneDetail } from "@/lib/server/detail/contract-milestone";
