import { fetchAllRows } from "@/lib/server/answers/db";
import { LoadError } from "@/lib/server/answers/load";
import { num, requiredText, text } from "@/lib/server/detail/rows";

import { STACK_COLUMNS, WORK_SESSION_COLUMNS } from "./columns";
import { BLOCKING_MILESTONE_CLAUSE, TRIGGER_THRESHOLDS, evaluateTrigger, isActionable } from "./rule";
import type {
  RegisterBlindness,
  RegisterState,
  StackRegister,
  StackRow,
  StacksDb,
} from "./types";

/**
 * FR-104 to FR-108 — every stack the ledger has ever observed, with the hours on
 * it, the engagements it appears in, and what the register could not see.
 *
 * ## Where the engagement count comes from, and why it is not the other table
 *
 * FR-104's "how many engagements it appears in" could derive from
 * `work_session.engagement_id` or from `work_item.engagement_id`; both tables
 * carry `stack_id`. **This layer uses `work_session`.** Three reasons, in the
 * order they mattered:
 *
 *   1. **FR-105 defines the hours as a sum over `work_session.duration_minutes`,
 *      and FR-106 makes a conjunction of the two figures.** A conjunction over
 *      two different populations is not a rule anyone can state on a screen,
 *      which is exactly what FR-106 requires. Counting both from the sessions
 *      makes "in N engagements, over H hours" one sentence about one set of
 *      rows.
 *   2. **A reader could not diagnose the difference.** Derived separately, a
 *      stack can show three engagements and zero hours because the third
 *      engagement's rows exist only in `work_item` — a figure that is correct,
 *      unexplainable from the screen, and indistinguishable from a bug.
 *   3. **The two populations are the same today anyway.** `work_item.stack_id`
 *      and `work_session.stack_id` are written in the same function, from the
 *      same local, on the same request: `@/lib/server/sessions/record.ts` sets
 *      both from `upsertStack`'s return. Nothing else in the product writes
 *      either column — verified by grep over `src/` on 2026-08-24 — so choosing
 *      `work_session` costs no row today and stays coherent with FR-105 if the
 *      two ever diverge.
 *
 * ## Both reads page, and neither is filtered
 *
 * PostgREST answers **HTTP 206 with `error === null`** past its `max-rows` cap,
 * so a truncated read is indistinguishable from a complete one at the call site.
 * `fetchAllRows` pages to an exact count and reports a stalled read as an error
 * rather than as a short page, so these two reads are exhaustive or they fail
 * loudly. There is no third outcome for a caller to mistake for completeness.
 *
 * The `work_session` read carries **no filter at all**, and that is Q25's
 * ruling rather than an omission: every row counts, with no narrowing by
 * executor, by execution mode or by `source`. The screen states that they are
 * all Mode 2 capture, so the day something else begins writing sessions the
 * sentence is visibly wrong rather than quietly wrong.
 *
 * ## Nothing here decrypts anything
 *
 * `work_session` is §7a `sensitive` on one column, `summary`, and this layer
 * issues no `decrypt_field` RPC and names that column nowhere. See
 * `./columns.ts`, and `./columns.test.ts` for the assertion that proves it
 * behaviourally rather than by reading the source twice.
 */
export async function loadStackRegister(db: StacksDb): Promise<StackRegister> {
  const stackResult = await fetchAllRows(db, "stack", STACK_COLUMNS, (query) => query);
  if (stackResult.error) throw new LoadError("stack", stackResult.error);

  // Q25: no filter. The identity function is the whole predicate, on purpose.
  const sessionResult = await fetchAllRows(
    db,
    "work_session",
    WORK_SESSION_COLUMNS,
    (query) => query,
  );
  if (sessionResult.error) throw new LoadError("work_session", sessionResult.error);

  const tallies = tallySessions(sessionResult.rows);

  const stacks: StackRow[] = stackResult.rows.map((row) => {
    const id = requiredText(row.id);
    const tally = tallies.byStack.get(id) ?? emptyTally();
    const agentCovering = text(row.agent_covering);
    const engagements = tally.engagements.size;
    const trigger = evaluateTrigger({ minutes: tally.minutes, engagements });

    return {
      id,
      name: requiredText(row.name),
      agentCovering,
      firstSeenAt: text(row.first_seen_at),
      lastSeenAt: text(row.last_seen_at),
      minutes: tally.minutes,
      hours: tally.minutes / 60,
      sessions: tally.sessions,
      sessionsWithoutDuration: tally.sessionsWithoutDuration,
      engagements,
      trigger,
      actionable: isActionable(trigger, agentCovering),
    };
  });

  stacks.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // Sessions whose `stack_id` matched no stack row. The foreign key makes this
  // unreachable; it is counted rather than assumed away so the denominator
  // identity holds by construction and a session this layer cannot place is a
  // session it says it cannot place.
  const placed = stacks.reduce((total, stack) => total + stack.sessions, 0);
  const sessionsOnUnknownStack = tallies.sessionsWithStack - placed;

  const blindness: RegisterBlindness = {
    sessionsTotal: sessionResult.rows.length,
    sessionsWithStack: tallies.sessionsWithStack,
    sessionsWithoutStack: tallies.sessionsWithoutStack,
    sessionsOnUnknownStack,
    sessionsWithoutDuration: tallies.sessionsWithoutDuration,
    stacksTotal: stacks.length,
    stacksCovered: stacks.filter((stack) => stack.agentCovering !== null).length,
    stacksEarned: stacks.filter((stack) => stack.trigger.outcome === "earned").length,
    stacksActionable: stacks.filter((stack) => stack.actionable).length,
  };

  return {
    stacks,
    blindness,
    state: registerState(blindness),
    thresholds: TRIGGER_THRESHOLDS,
    blockingMilestone: BLOCKING_MILESTONE_CLAUSE,
  };
}

/**
 * FR-108's three claims, kept apart.
 *
 * An empty register and a register reporting "no stack has earned a specialist"
 * are different claims and only one of them is an answer. The third state is the
 * one this ledger could reach tomorrow: sessions captured, not one of them
 * naming a stack — work seen and none of it attributable.
 *
 * The order of the tests matters. `no-sessions` is checked first because a
 * ledger with no sessions and no stacks is empty rather than blind, and
 * `no-stacks` is checked on the stack table rather than on the sessions so that
 * a stack row with no session against it still counts as observed. That is the
 * `nextjs-supabase` case today: one stack, one session on it, zero minutes.
 */
function registerState(blindness: RegisterBlindness): RegisterState {
  if (blindness.sessionsTotal === 0 && blindness.stacksTotal === 0) return "no-sessions";
  if (blindness.stacksTotal === 0) return "no-stacks";
  return "observed";
}

interface Tally {
  minutes: number;
  sessions: number;
  sessionsWithoutDuration: number;
  engagements: Set<string>;
}

function emptyTally(): Tally {
  return { minutes: 0, sessions: 0, sessionsWithoutDuration: 0, engagements: new Set() };
}

/**
 * One pass over every session row.
 *
 * A row with no `stack_id` is counted into `sessionsWithoutStack` and then
 * skipped. It is never dropped: FR-108 requires it in the denominator, and
 * 50% of this ledger's sessions are that row today.
 *
 * A `duration_minutes` that is not a number contributes nothing to the sum and
 * increments `sessionsWithoutDuration`. `num()` returns `null` for a SQL NULL,
 * and the distinction it preserves is the one that matters here: a session with
 * a recorded `0` and a session with no duration recorded are different facts,
 * and only the second one means the hours are understated.
 */
function tallySessions(rows: readonly Record<string, unknown>[]): {
  byStack: Map<string, Tally>;
  sessionsWithStack: number;
  sessionsWithoutStack: number;
  sessionsWithoutDuration: number;
} {
  const byStack = new Map<string, Tally>();
  let sessionsWithStack = 0;
  let sessionsWithoutStack = 0;
  let sessionsWithoutDuration = 0;

  for (const row of rows) {
    const stackId = text(row.stack_id);
    if (stackId === null) {
      sessionsWithoutStack += 1;
      continue;
    }

    sessionsWithStack += 1;

    let tally = byStack.get(stackId);
    if (tally === undefined) {
      tally = emptyTally();
      byStack.set(stackId, tally);
    }

    tally.sessions += 1;

    const engagementId = text(row.engagement_id);
    if (engagementId !== null) tally.engagements.add(engagementId);

    const minutes = num(row.duration_minutes);
    if (minutes === null) {
      tally.sessionsWithoutDuration += 1;
      sessionsWithoutDuration += 1;
    } else {
      tally.minutes += minutes;
    }
  }

  return { byStack, sessionsWithStack, sessionsWithoutStack, sessionsWithoutDuration };
}
