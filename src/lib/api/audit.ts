import type { Database } from "@/lib/database.types";

import type { WireCapability } from "./capabilities";
import { apiError } from "./errors";

/**
 * The audit writer (FR-6, FR-59).
 *
 * FR-59: "Every write is recorded in an append-only audit log carrying actor,
 * action, target and timestamp, **with no record contents**."
 * FR-6: "Every token use is written to the audit log with **the capability, the
 * endpoint and the outcome**."
 *
 * The three FR-6 facts are stored in three columns rather than concatenated into
 * `action`, so the operator's audit view can filter on them. Those columns are
 * added by `…_audit_log_fr6_columns.sql` and are nullable, because an operator
 * action has no capability and a role grant has no endpoint.
 *
 * ## "No record contents" is enforced here, not merely intended
 *
 * The one place a record's contents would realistically leak into this table is
 * the **query string** — `/api/answer/blocked?client=<a client's name>` or a
 * search parameter carrying prose. So `endpointOf()` records the method and the
 * **pathname only** and drops the query string entirely. That is a deliberate
 * loss of detail: knowing an endpoint was called is FR-6's requirement, and
 * knowing which client was filtered for is a record content.
 *
 * `target_table` and `target_id` carry identifiers, never values, which is what
 * §7a's classification of this table as `internal` — "actor, action, target
 * identifiers, no record contents" — depends on.
 */

export type AuditActorType = Database["public"]["Enums"]["actor_type"];

/** The outcome vocabulary. Closed on purpose; `unparsed` is not a valid outcome here. */
export type AuditOutcome = "allowed" | "refused" | "error";

export interface AuditEntry {
  /**
   * Who acted. `agent_token:<uuid>` for an agent, the operator's user id for a
   * person, `unauthenticated` for a request that never proved anything.
   * **Never a token secret** — see `describeTokenForLog`.
   */
  actor: string;
  actorType: AuditActorType;
  /** A short verb phrase: `token.issue`, `token.revoke`, `api.request`. */
  action: string;
  targetTable?: string | null;
  targetId?: string | null;
  capability?: WireCapability | null;
  /** `GET /api/answer/blocked`. Method and pathname; never the query string. */
  endpoint?: string | null;
  outcome?: AuditOutcome | null;
  /** The HTTP status actually returned, so a refusal's shape is recoverable. */
  status?: number | null;
}

/**
 * Minimal client surface this module needs.
 *
 * Typed structurally rather than as `SupabaseClient` so a test can pass a fake
 * without constructing a real client — and so this module cannot accidentally
 * reach for anything beyond an insert into one table.
 */
export interface AuditCapableClient {
  from(table: "audit_log"): {
    insert(values: Record<string, unknown>): PromiseLike<{
      error: { message: string } | null;
    }>;
  };
}

/** Build the `endpoint` value, dropping the query string. See the note above. */
export function endpointOf(request: {
  method: string;
  url: string;
}): string {
  let pathname: string;
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    // A relative or malformed URL. Record that we could not parse it rather
    // than recording the raw string, which is where a query string would hide.
    pathname = "unparsed";
  }
  return `${request.method.toUpperCase()} ${pathname}`;
}

/**
 * Write one audit row.
 *
 * **Fails closed.** If the insert fails, this throws and the request fails with
 * a 500. The alternative — swallowing the error and serving the request — means
 * FR-6's "every token use is written" quietly becomes "most token uses are
 * written", and the gap is invisible precisely when something is going wrong.
 * An unwritable audit log on this stack means the database is unreachable, in
 * which case the request was not going to succeed anyway.
 *
 * The thrown error carries no database message to the caller; the guard turns it
 * into the generic `internal_error` body.
 */
export async function writeAuditLog(
  client: AuditCapableClient,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await client.from("audit_log").insert({
    actor: entry.actor,
    actor_type: entry.actorType,
    action: entry.action,
    target_table: entry.targetTable ?? null,
    target_id: entry.targetId ?? null,
    capability: entry.capability ?? null,
    endpoint: entry.endpoint ?? null,
    outcome: entry.outcome ?? null,
    status: entry.status ?? null,
  });

  if (error) {
    throw apiError(
      "internal_error",
      "The request was not completed because it could not be recorded in the " +
        "audit log. Nothing was served unrecorded.",
    );
  }
}
