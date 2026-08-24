import "server-only";

import { apiError } from "@/lib/api";
import { fetchAllRows, type ReleaseDb } from "@/lib/server/releases/db";

import {
  COLLISION,
  UNRECONCILED,
  decideCollisions,
  type ReconcilableRow,
  type ReconciliationDecision,
} from "./reconcile";

/**
 * FR-90 — write the collision mark, for one engagement.
 *
 * The decision is `decideCollisions`, which is pure and holds the whole rule.
 * This module is the two database calls around it and nothing else: read the
 * engagement's `work_item` rows, ask the rule, write the mark.
 *
 * ## It is called from BOTH directions, and that is deliberate
 *
 * FR-90's trigger is an ingested run meeting a planned row, and that meeting
 * happens in either order:
 *
 *   * a plan document is ingested into an engagement that already holds run
 *     work items — `POST /api/ingest/plan`;
 *   * a run is ingested into an engagement that already holds planned rows —
 *     `POST /api/ingest/run`, after `persistPlan`.
 *
 * Marking on only one of those leaves a real collision unmarked whenever the
 * other lands second, and the mark's stated meaning — "a reconciliation was
 * attempted and no key existed to carry it" — is equally true in both orders.
 * One function, both call sites, so the two can never disagree about what a
 * collision is.
 *
 * ## Idempotent, and narrow on purpose
 *
 * The update carries `plan_reconciliation = 'unreconciled'` as a *filter* as
 * well as reading it. Re-posting the same plan or re-ingesting the same run
 * therefore writes nothing the second time, and a row that some later
 * milestone has marked `keyed` is never reset by this path — including in the
 * window between this function's read and its write.
 *
 * ## The read pages, because an unpaged one lies
 *
 * PostgREST answers **HTTP 206 with `error === null`** past its `max-rows` cap
 * of 1000, so a truncated read is indistinguishable from a complete one at the
 * call site. Measured on two prior engagements in this practice (Shoe Swap
 * Studio 2026-07-24 — a gate query that reported on 1000 of 2342 rows for
 * months; Cully Bet 2026-08-11). `fetchAllRows` pages with a stable order and
 * terminates on an exact count. A silently short read here would mark *some*
 * planned rows and leave others clean, which is worse than not marking at all:
 * the unmarked ones would read as reconciled.
 */

/** What the rule needs off each row. Nothing else is selected. */
const COLUMNS = "id, execution_mode, status, plan_ref, plan_reconciliation";

/**
 * How many ids go into one `in (…)` filter.
 *
 * PostgREST takes the list in the URL, so an unbounded one becomes a request
 * long enough for a proxy to refuse — and it would refuse the *write*, after
 * the read reported the rows. A stated ceiling instead. This is a baseline
 * control with a number I chose; §7a sizes the request rate but says nothing
 * about URL length.
 */
const UPDATE_CHUNK = 200;

export interface CollisionMarkResult extends ReconciliationDecision {
  /** Rows this call actually changed. Zero on a repeat, by design. */
  marked: number;
}

function asRow(row: Record<string, unknown>): ReconcilableRow {
  return {
    id: String(row.id),
    execution_mode: row.execution_mode ?? null,
    status: row.status,
    plan_ref: (row.plan_ref as string | null) ?? null,
    plan_reconciliation: row.plan_reconciliation,
  };
}

/**
 * Mark every unreconciled planned row in one engagement, where FR-90 applies.
 *
 * @param db           an **already-authorised** client. Like the insert
 *                     primitive beside it, this module carries no gate: its two
 *                     callers are an operator action and an agent route, and
 *                     baking in either one's check would lock out the other.
 *                     **Every caller gates before calling.**
 * @param engagementId the engagement to reconcile within. FR-90 never reaches
 *                     across engagements — two clients' work items are not
 *                     candidates for each other under any key.
 */
export async function markPlanCollisions(
  db: ReleaseDb,
  engagementId: string,
): Promise<CollisionMarkResult> {
  const { rows, error } = await fetchAllRows(
    db,
    "work_item",
    COLUMNS,
    (query) => query.eq("engagement_id", engagementId),
  );

  if (error !== null) {
    // No mechanism reaches the caller: a Postgres message names tables and
    // sometimes row values, and the values on this table are `sensitive`.
    //
    // The failure is scoped to the reconciliation, and says so positively.
    // Both callers COMMIT BEFORE reaching this line — `persistPlan` for
    // `POST /api/ingest/run`, `ingestPlanDocument` for `POST /api/ingest/plan`
    // — so a claim that nothing changed is false in both directions, and it is
    // the claim an agent acts on: told the ingest did nothing, it re-posts or
    // reports the work lost. A wrong `done` is the worst output this product
    // can produce and a wrong "not done" is the same defect inverted.
    //
    // Re-posting is safe to advise rather than merely hoped: every ingest
    // write is an upsert on a natural key (`persist.ts`, `onConflict`
    // throughout) and the plan path is `ON CONFLICT DO NOTHING` on
    // `(engagement_id, plan_ref)`.
    throw apiError(
      "internal_error",
      "The FR-90 reconciliation could not read this engagement's work items, " +
        "so no collision mark was written. Everything this request wrote " +
        "before this step stands and was not rolled back. Re-post to " +
        "complete the marking; the writes are upserts on a natural key, so " +
        "nothing is duplicated.",
    );
  }

  const decision = decideCollisions(rows.map(asRow));

  let marked = 0;
  for (let at = 0; at < decision.collisionIds.length; at += UPDATE_CHUNK) {
    const chunk = decision.collisionIds.slice(at, at + UPDATE_CHUNK);

    const result = await db
      .from("work_item")
      .update({ plan_reconciliation: COLLISION })
      .in("id", chunk)
      // Re-asserted as a filter, not merely trusted from the read above. See
      // the note on idempotency.
      .eq("plan_reconciliation", UNRECONCILED)
      .select("id");

    if (result.error) {
      throw apiError(
        "internal_error",
        `The FR-90 reconciliation wrote ${marked} of ` +
          `${decision.collisionIds.length} collision marks and then failed. ` +
          `The marks already written stand; re-post to finish the rest.`,
      );
    }

    marked += (result.data ?? []).length;
  }

  return { ...decision, marked };
}
