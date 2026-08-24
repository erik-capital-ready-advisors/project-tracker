import "server-only";

import { cache } from "react";

import { requireOperator } from "@/lib/api/operator";
import { loadStackRegister } from "@/lib/server/stacks/list";
import type { StacksDb } from "@/lib/server/stacks/types";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * The read behind M2.2's register screen (CR-007 §3, FR-104 to FR-109).
 *
 * ## Nothing here computes a rule
 *
 * FR-106's rule lives in `@/lib/server/stacks/rule.ts` as a pure function over
 * counted figures, and the counting lives in `@/lib/server/stacks/list.ts` over
 * an injected database slice, tested against a fake. This module supplies three
 * things and no fourth: **the authorisation gate, the client, and per-request
 * memoisation.** It is `@/lib/runs-load.ts` for the register, and that file's
 * header applies here unchanged.
 *
 * ## `requireOperator()` is called inside the read, never by the caller
 *
 * A gate that lives in the caller is a gate someone can forget when the second
 * call site is added — and a register screen that also generates metadata, or a
 * later `/stacks/[name]`, is exactly that second call site.
 *
 * ## The service-role client — B29, named rather than deepened
 *
 * `createServiceClient()` holds `BYPASSRLS`, so every policy in
 * `20260819144540_rls_and_grants.sql`, including `app.is_operator()` where FR-2's
 * MFA requirement and FR-3's deny-by-default role live, is **inert against it**.
 * `requireOperator()` is therefore the whole of the authorisation on this path
 * and not a convenience in front of a second check. That is B29, an open
 * accepted debt: this unit uses the existing path exactly as `detail-load.ts`,
 * `questions-load.ts`, `answer-load.ts` and `runs-load.ts` do, adds no new
 * `service_role` mechanism, and does it **loudly** — two new `service_role`
 * reads, both named in the build report.
 *
 * ## No new decryption surface and no new agent-reachable surface
 *
 * This unit issues no `decrypt_field` RPC at all. `work_session` is §7a
 * `sensitive` on `summary` and that column is named nowhere in this layer; a
 * register of hours has no business holding prose that may quote a client's
 * codebase. `@/lib/server/stacks/columns.test.ts` asserts that behaviourally and
 * proves the assertion can fail.
 *
 * There is no `app/api/stacks/*` and this unit built none. The read below and
 * the write in `@/lib/server/stacks/actions.ts` are reachable only behind
 * `requireOperator()`.
 *
 * ## `cache()` and the argument-free signature
 *
 * `cache()` memoises per request on argument identity. This read takes nothing,
 * so a page and its metadata pay for one read; an options object would defeat
 * that, because a fresh literal at each call site is never identity-equal.
 */
export const readStackRegister = cache(async () => {
  await requireOperator();
  return loadStackRegister(createServiceClient() as unknown as StacksDb);
});

// The types `/stacks` renders against, re-exported so the route imports from one
// module rather than reaching into `@/lib/server/*` directly. This is the module
// boundary `u1` is built against.

export type {
  RegisterBlindness,
  RegisterState,
  StackCoveringUpdate,
  StackRegister,
  StackRow,
  TriggerEvaluation,
  TriggerOutcome,
  TriggerThresholds,
  UnevaluatedClause,
  VolumeClause,
} from "@/lib/server/stacks/types";
