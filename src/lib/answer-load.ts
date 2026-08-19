import "server-only";

import { requireOperator } from "@/lib/api/operator";
import { blockedAnswer } from "@/lib/server/answers/blocked";
import { bottleneckAnswer } from "@/lib/server/answers/bottleneck";
import { brokenAnswer } from "@/lib/server/answers/broken";
import { committedAnswer } from "@/lib/server/answers/committed";
import type { AnswerDb } from "@/lib/server/answers/db";
import { nextAnswer } from "@/lib/server/answers/next";
import { untestedAnswer } from "@/lib/server/answers/untested";
import { createServiceClient } from "@/lib/supabase/service";

import type {
  BlockedQuery,
  BottleneckQuery,
  BrokenQuery,
  CommittedQuery,
  NextQuery,
  UntestedQuery,
} from "@/lib/answer-query";

/**
 * The six reads behind the six answer screens.
 *
 * ## Nothing here computes an answer
 *
 * Every rule lives in `@/lib/server/answers/*`, which i7 built and which the
 * JSON endpoints call through the same functions. This module supplies three
 * things and no fourth: the authorisation gate, the client, and the clock.
 * A screen that recomputed any part of FR-52 through FR-79 would be a second
 * implementation to keep in step, and the first thing to drift would be a
 * distinction the requirements say must not collapse.
 *
 * ## Why `milestones: true` here and `false` in the handlers
 *
 * §7a refuses agent tokens `contract_milestone` entirely, so the JSON handlers
 * pass `milestones: false` and Next and Bottleneck return a **stated** fallback
 * ordering rather than claiming FR-53's. These screens run under an operator
 * session, which §7a does allow that table, so they pass `true` and get the
 * ordering the requirement specifies.
 *
 * The screens still render the degradation notice, because `ordering` and
 * `ranking` are read off the payload rather than assumed from this flag. If a
 * future change makes the milestone read fail on the operator path too, the
 * screen says so instead of quietly presenting a differently-sorted list under
 * FR-53's heading.
 *
 * ## `requireOperator()` is called inside each read, not by the caller
 *
 * u4's rule and it is kept: a gate that lives in the caller is a gate someone
 * can forget when they add the second call site. `loadForOperator` wraps these
 * for the screens, but the authorisation is beside the query regardless.
 *
 * ## The service-role client, and what that does and does not mean
 *
 * `createServiceClient()` holds BYPASSRLS, so `requireOperator()` above it is
 * the whole of the authorisation on this path — it is not a convenience in front
 * of a second check. That is the same posture the JSON routes run under, where
 * `agentScopedDb` is the enforcement. It is stated here rather than discovered:
 * **an operator screen's access rules are enforced in this application.**
 *
 * The cast to `AnswerDb` is compile-time only and removes nothing at runtime.
 */

/** The clock, in one place, so every answer in one render agrees on the day. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function db(): AnswerDb {
  return createServiceClient() as unknown as AnswerDb;
}

/** FR-52. */
export async function readBlocked(query: BlockedQuery) {
  await requireOperator();
  return blockedAnswer(
    db(),
    {
      engagement: query.engagement,
      owner: query.owner,
      disposition: query.disposition,
    },
    { today: today() },
  );
}

/** FR-53. */
export async function readNext(query: NextQuery) {
  await requireOperator();
  return nextAnswer(
    db(),
    { engagement: query.engagement, limit: query.limit },
    { today: today(), milestones: true },
  );
}

/**
 * FR-54 / FR-75.
 *
 * This is the one answer an agent token cannot retrieve at all — §7a refuses it
 * `contract_milestone` and every field here derives from that table. The screen
 * is unaffected because it runs under an operator session, and nothing in this
 * unit implies otherwise.
 */
export async function readCommitted(query: CommittedQuery) {
  await requireOperator();
  return committedAnswer(
    db(),
    {
      engagement: query.engagement,
      state: query.state,
      environment: query.environment,
    },
    { today: today() },
  );
}

/** FR-48 / FR-49 / FR-55. */
export async function readUntested(query: UntestedQuery) {
  await requireOperator();
  return untestedAnswer(db(), { engagement: query.engagement });
}

/** FR-56. */
export async function readBottleneck(query: BottleneckQuery) {
  await requireOperator();
  return bottleneckAnswer(
    db(),
    { engagement: query.engagement, limit: query.limit },
    { today: today(), milestones: true },
  );
}

/** FR-71 / FR-69. */
export async function readBroken(query: BrokenQuery) {
  await requireOperator();
  return brokenAnswer(db(), {
    engagement: query.engagement,
    severity: query.severity,
  });
}
