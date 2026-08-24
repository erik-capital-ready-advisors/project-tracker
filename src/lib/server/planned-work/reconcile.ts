import { isPlannedRow } from "@/lib/server/workitems/planned";

/**
 * FR-90 / Q13 — the reconciliation rule, as a pure function over rows.
 *
 * > When an ingested run reports a work unit that a planned row already
 * > describes, the two reconcile onto the planned row rather than producing a
 * > second one. **The reconciliation key, ruled at Q13 on 2026-08-24, is an
 * > explicit id the plan carries and the manifest echoes. Where the id is
 * > absent on either side, BOTH rows stand and the collision is marked — never
 * > merged.** Prose similarity is excluded absolutely.
 *
 * ## What this produces today, and why that is the ruling satisfied
 *
 * Measured 2026-08-24 and restated by CR-005 §3.1a: **no artifact carries such
 * an id.** `plan.md` heads its tasks `### Task 5: …` — positional numbering
 * that shifts the moment a task is inserted — and the manifests have no
 * per-unit plan-id field at all. The two artifacts share **zero** keys.
 *
 * So every reconciliation this function decides is a `collision`, and that is
 * the correct output rather than a gap to close. It yields a false `done` rate
 * of **zero by construction** instead of by care. **The pressure, when the
 * first real plan produces all-collisions-and-no-merges, will be to fall back
 * on titles. That is the wrong `done` CR-005 was written to prevent, and it is
 * forbidden absolutely — this module reads no prose, and adding a title or
 * description comparison to it would be the defect, not the fix.**
 *
 * ## `keyed` is never produced here
 *
 * The enum carries a third member, `keyed`, and i1's migration reserves it:
 * *"the write half of FR-90 is deferred by CR-005 §3.1a and nothing in M2.9
 * produces this value."* This function honours that for a reason stronger than
 * obedience: **marking a row `keyed` without merging it would assert a
 * reconciliation that did not happen.** Two rows would still stand while the
 * ledger claimed they were one. Every outcome here is therefore `collision` or
 * the untouched default, and there is a test that asserts `keyed` is
 * unreachable.
 *
 * ## Why the mark is per-row and carries no edge
 *
 * Phase 1 decision 4, inherited: there is no `collides_with` foreign key. With
 * no shared key you cannot identify *which* two rows correspond except by
 * matching prose, which Q13 excludes absolutely — so a pairwise edge could only
 * ever be populated by the forbidden mechanism. The mark says "a reconciliation
 * was attempted on this row and no key existed to carry it", which is a
 * property of one row and is exactly as much as is known.
 *
 * ## Why "planned" is decided by `isPlannedRow` and not by a PostgREST filter
 *
 * FR-87's definition — `execution_mode IS NULL AND status = 'pending'` — has
 * one spelling in this repository and it is i4's `isPlannedRow`. Re-stating it
 * as `.is("execution_mode", null).eq("status", "pending")` in a query would
 * create a second definition free to drift from the first, and the drift would
 * be invisible: the query would simply return a different set. So the caller
 * reads the engagement's rows and this function partitions them.
 */

/** The `work_item` columns this rule reads. Raw, snake_case, as stored. */
export interface ReconcilableRow {
  id: string;
  /** FR-87's signal. Only an explicit SQL `NULL` is planned. */
  execution_mode: unknown;
  status: unknown;
  /** FR-90's key. `null` on every artifact today. */
  plan_ref: string | null;
  /** The current mark. Only `unreconciled` rows are ever changed. */
  plan_reconciliation: unknown;
}

/** The one non-default value M2.9 writes. */
export const COLLISION = "collision" as const;
/** The column default: no reconciliation has been established for this row. */
export const UNRECONCILED = "unreconciled" as const;

export interface ReconciliationDecision {
  /**
   * The planned rows to mark `collision`. Ids only — never prose, so a caller
   * cannot put a `sensitive` description into a log line by echoing this.
   */
  collisionIds: string[];
  /** Planned rows seen (FR-87), whatever their current mark. */
  plannedCount: number;
  /**
   * Rows that are not planned work — the ingested side of FR-90. When this is
   * zero there is nothing to reconcile against and no attempt is made.
   */
  ingestedCount: number;
  /**
   * Planned rows left alone because they already carry a non-default mark.
   * Re-marking them would be a no-op today, but skipping them keeps this write
   * from ever overwriting a `keyed` a later milestone establishes.
   */
  alreadyMarked: number;
}

/**
 * Decide which planned rows carry an FR-90 collision.
 *
 * @param rows every `work_item` row in ONE engagement — both sides of the
 *             reconciliation. Partitioning happens here rather than in two
 *             queries so both sides come from one consistent read.
 *
 * The rule, in full:
 *
 *   * **No ingested rows in the engagement → nothing is marked.** There is no
 *     counterpart, so no reconciliation was attempted, and `unreconciled`
 *     ("none has been established") is the honest state. Marking here would
 *     make the flag mean "is planned", which is what `execution_mode IS NULL`
 *     already means.
 *   * **Ingested rows present → every `unreconciled` planned row is marked.**
 *     The key is absent on the ingested side of every artifact that exists, so
 *     no planned row can be keyed to one, and Q13's "absent on either side"
 *     clause is satisfied for all of them.
 *
 * A planned row carrying a `plan_ref` is **not** exempted. It cannot be keyed
 * to an ingested row inside one engagement anyway — i1's unique index on
 * `(engagement_id, plan_ref)` makes a second row with that key impossible, so
 * the upsert skips instead of creating one. And in the direction that matters,
 * conservatism points one way: `collision` says "still two rows, not merged",
 * which is true regardless. Claiming otherwise is the failure mode.
 */
export function decideCollisions(
  rows: readonly ReconcilableRow[],
): ReconciliationDecision {
  const planned: ReconcilableRow[] = [];
  let ingestedCount = 0;

  for (const row of rows) {
    if (isPlannedRow(row)) planned.push(row);
    else ingestedCount += 1;
  }

  if (ingestedCount === 0) {
    return {
      collisionIds: [],
      plannedCount: planned.length,
      ingestedCount: 0,
      alreadyMarked: planned.filter(
        (row) => row.plan_reconciliation !== UNRECONCILED,
      ).length,
    };
  }

  const collisionIds: string[] = [];
  let alreadyMarked = 0;

  for (const row of planned) {
    if (row.plan_reconciliation === UNRECONCILED) collisionIds.push(row.id);
    else alreadyMarked += 1;
  }

  return {
    collisionIds,
    plannedCount: planned.length,
    ingestedCount,
    alreadyMarked,
  };
}
