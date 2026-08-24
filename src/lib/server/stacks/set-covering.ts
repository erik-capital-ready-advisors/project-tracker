import type { AuditCapableClient } from "@/lib/api/audit";
import { writeAuditLog } from "@/lib/api/audit";
import { apiError } from "@/lib/api";
import type { AnswerQuery } from "@/lib/server/answers/db";

import type { StackCoveringUpdate, StacksDb } from "./types";

/**
 * FR-109 — the operator says which agent covers a stack. Nothing infers it.
 *
 * ## Why there is no inference here and never will be
 *
 * Which stacks the fleet covers is a fact about `~/.claude/agents/`, a directory
 * outside this repository and unreadable from a worktree — the same boundary
 * that cut M2.9's scope. A value derived here would be a claim about a directory
 * the product cannot see, which is the class of statement this ledger exists to
 * stop making. So `agent_covering` has exactly one writer: a person who knows.
 *
 * ## The gate is in `./actions.ts`, and this module is not reachable without it
 *
 * `requireOperator()` is not called here, for the arrangement
 * `@/lib/server/sessions/unassigned.ts` established: the testable function takes
 * an injected database slice, and the thin `'use server'` wrapper beside it
 * holds the gate. This module carries no `'use server'` directive, so Next
 * generates no endpoint for it and nothing but a server module can call it.
 *
 * ## `.select().single()` is the control, not a convenience
 *
 * A PostgREST `update` matching zero rows succeeds silently — no error, no
 * signal, and a caller that only checked `error` would report a stack covered
 * that nothing wrote. Asking for the row back turns that into `PGRST116`, which
 * is the difference between "saved" and "saved nothing". The same shape as the
 * measured lesson about silent RLS refusals: assert the affected row, never the
 * absence of an error.
 */

/**
 * The longest `agent_covering` this path will store.
 *
 * The column is unconstrained `text`. `LIMITS.stackName` is 96 for a technology
 * name, and an agent name — `api-integrator`, `ui-designer` — is the same kind
 * of token, so the same ceiling applies. This is a paste guard, not a schema
 * rule: FR-109 says the operator decides the value and the product cannot check
 * it against a directory it may not read, so nothing here validates the name
 * against a list of agents that exist.
 */
export const AGENT_COVERING_MAX = 96;

/**
 * Turn what a form submitted into what the column should hold.
 *
 * Pure, and separate from the write so it can be tested against frozen input.
 *
 * `null` is a legitimate value and a legitimate destination: clearing coverage
 * is how the operator says "no agent covers this any more", and an empty text
 * input must not store `''`, which would render as covered-by-nothing and count
 * toward `stacksCovered`.
 */
export function normaliseAgentCovering(value: string | null): string | null {
  if (value === null) return null;

  const trimmed = value.trim();
  if (trimmed === "") return null;

  if (trimmed.length > AGENT_COVERING_MAX) {
    throw apiError(
      "invalid_request",
      `An agent name may be at most ${AGENT_COVERING_MAX} characters. That one ` +
        `is ${trimmed.length}.`,
    );
  }

  // A newline in a single-line field is a paste accident, and storing one puts a
  // line break in the middle of a table cell that nobody can see to remove.
  if (/[\r\n]/.test(trimmed)) {
    throw apiError(
      "invalid_request",
      "An agent name is a single line. Remove the line break and try again.",
    );
  }

  return trimmed;
}

/**
 * Write FR-109's value, and record that it was written.
 *
 * FR-59 — "every write is recorded in an append-only audit log carrying actor,
 * action, target and timestamp, with no record contents" — so an `audit_log` row
 * follows the update, carrying the stack's id and **not** the value. The value
 * is a record content; that it changed, and who changed it, is the audit fact.
 */
export async function setAgentCovering(
  db: StacksDb,
  actor: string,
  stackId: string,
  agentCovering: string | null,
): Promise<StackCoveringUpdate> {
  const value = normaliseAgentCovering(agentCovering);

  const result = await (db.from("stack") as AnswerQuery)
    .update({ agent_covering: value })
    .eq("id", stackId)
    .select("id, name, agent_covering")
    .maybeSingle();

  if (result.error) {
    throw apiError(
      "internal_error",
      "Recording which agent covers that stack failed. Nothing was saved. This " +
        "response deliberately carries no database message; check the audit_log " +
        "row for this request.",
    );
  }

  const row = result.data;
  if (row === null) {
    throw apiError(
      "invalid_request",
      "No stack has that id. Reload the register and try again — nothing was saved.",
    );
  }

  await writeAuditLog(db as unknown as AuditCapableClient, {
    actor,
    actorType: "operator",
    action: "stack.agent_covering.set",
    targetTable: "stack",
    targetId: String(row.id),
    outcome: "allowed",
  });

  return {
    id: String(row.id),
    name: String(row.name),
    agentCovering: typeof row.agent_covering === "string" ? row.agent_covering : null,
  };
}
