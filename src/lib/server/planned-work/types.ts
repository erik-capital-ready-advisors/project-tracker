/**
 * The shapes the planned-work insert primitive takes and returns.
 *
 * A separate module from `./create-planned-work-item` for the reason
 * `@/lib/server/registry/types` is separate from `engagements.ts`: whichever
 * caller eventually wraps the primitive in a `'use server'` action may export
 * only async functions, and a type re-exported from such a module is erased
 * while a `const` is not. Keeping the shapes here means no caller has to know
 * that.
 *
 * Consumed by:
 *   * `u2` — the FR-88 hand-entry form at `/work-items/new`.
 *   * `i3` — the FR-88 plan-document path, which maps `PlanTask` (from
 *     `@/lib/ingest/planDocument`) onto `PlannedWorkInput` and calls the batch
 *     form.
 */

/**
 * One planned `work_item`, as the caller describes it.
 *
 * What is deliberately NOT here, because the primitive fixes it rather than
 * accepting it:
 *
 *   * `engagementId` — the engagement is a separate argument, resolved from a
 *     slug once per call. FR-87 as amended by Q14 makes it required, and making
 *     it a per-item field would admit a call where some items carry one and
 *     some do not.
 *   * `executionMode` — always NULL. That is what FR-87 means by planned.
 *   * `status` — always `pending`. Same clause.
 *   * `executorKind` — always `unassigned`. A row nobody has dispatched has
 *     nobody executing it, and offering a choice here would let planned work
 *     claim an executor before anyone agreed to it.
 *   * `plan_reconciliation` — left at the column default `unreconciled`. FR-90's
 *     `collision` mark is i3's to write and is not a property of creation.
 */
export interface PlannedWorkInput {
  /**
   * What the work is. §7a classifies `work_item.description` **sensitive** and
   * the primitive encrypts it with pgcrypto before it reaches the column;
   * nothing else in this build may write that column in the clear.
   *
   * Required and non-empty. A planned row whose description is blank says
   * nothing to the person reading `Next` in ten seconds, which is the only
   * reason FR-87 exists.
   */
  description: string;
  /** `ui`, `integration`, `docs`… Free text, as `work_item.work_type` already is. */
  workType: string | null;
  /**
   * The work-unit key, when the planner has one. Clear, not encrypted — §7a
   * names exactly two encrypted columns on this table and `unit` is not one.
   */
  unit: string | null;
  /**
   * FR-90 / Q13's explicit reconciliation id, read from the plan document.
   * **`null` records its absence**, which is what every artifact produces
   * today and what the hand-entry form always sends: a key Erik invents by
   * hand is not a key a manifest echoes.
   */
  planRef: string | null;
}

/**
 * A planned row as it now exists.
 *
 * **Carries no `description`.** The caller already holds the plaintext it
 * passed in, and echoing it back from a persistence result is how a
 * `sensitive` value ends up in a log line, a `data-verify-*` attribute or a
 * redirect URL. `id` is what the caller actually needs.
 */
export interface PlannedWorkRecord {
  id: string;
  engagementId: string;
  engagementSlug: string;
  unit: string | null;
  planRef: string | null;
  workType: string | null;
  /** Always `pending`, stated rather than implied. */
  status: "pending";
  /** Always `null`. FR-87: planned work has not been dispatched. */
  executionMode: null;
}
