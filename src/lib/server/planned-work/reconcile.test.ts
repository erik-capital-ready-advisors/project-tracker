import { describe, expect, it } from "vitest";

import { decideCollisions, type ReconcilableRow } from "./reconcile";

/**
 * FR-90 / Q13 — the reconciliation rule.
 *
 * ## A note on D-1, which this suite deliberately does not depend on
 *
 * `fromExecutionMode(null)` currently returns `"fleet"` and u4 is fixing it in
 * this same wave. **Nothing here asserts that behaviour, in either direction.**
 * The rule under test reads the raw snake_case columns through i4's
 * `isPlannedRow` precisely to sidestep the lossy conversion, so these tests are
 * green before u4's fix and green after it. A test that pinned the current
 * value would make the defect permanent and turn u4's fix red for the wrong
 * reason.
 */

const planned = (id: string, over: Partial<ReconcilableRow> = {}): ReconcilableRow => ({
  id,
  execution_mode: null,
  status: "pending",
  plan_ref: null,
  plan_reconciliation: "unreconciled",
  ...over,
});

const ingested = (id: string, over: Partial<ReconcilableRow> = {}): ReconcilableRow => ({
  id,
  execution_mode: "fleet",
  status: "done",
  plan_ref: null,
  plan_reconciliation: "unreconciled",
  ...over,
});

describe("decideCollisions", () => {
  it("marks nothing when the engagement holds no ingested work", () => {
    const decision = decideCollisions([planned("p1"), planned("p2")]);

    expect(decision.collisionIds).toEqual([]);
    expect(decision.plannedCount).toBe(2);
    expect(decision.ingestedCount).toBe(0);
  });

  it("marks every unreconciled planned row once ingested work exists", () => {
    const decision = decideCollisions([
      planned("p1"),
      planned("p2"),
      ingested("i1"),
    ]);

    expect(decision.collisionIds).toEqual(["p1", "p2"]);
    expect(decision.plannedCount).toBe(2);
    expect(decision.ingestedCount).toBe(1);
  });

  /**
   * CR-005 §3.1a, the bullet that matters most: all-collisions-and-no-merges on
   * the first real plan is the CORRECT output, not a bug to fix. No artifact
   * carries a shared key today, so this is the whole of FR-90's behaviour in
   * production.
   */
  it("marks a collision even where the plan carries an explicit key", () => {
    const decision = decideCollisions([
      planned("p1", { plan_ref: "PLAN-1" }),
      ingested("i1"),
    ]);

    expect(decision.collisionIds).toEqual(["p1"]);
  });

  it("never merges: every planned row still stands in the decision", () => {
    const rows = [planned("p1"), planned("p2"), ingested("i1"), ingested("i2")];
    const decision = decideCollisions(rows);

    expect(decision.plannedCount + decision.ingestedCount).toBe(rows.length);
  });

  /**
   * i1's migration reserves `keyed` for FR-90's deferred write half. Marking it
   * without merging would assert a reconciliation that did not happen — two
   * rows standing while the ledger claims they are one.
   */
  it("never produces `keyed`, under any arrangement of keys", () => {
    const arrangements: ReconcilableRow[][] = [
      [planned("p1", { plan_ref: "K" }), ingested("i1", { plan_ref: "K" })],
      [planned("p1", { plan_ref: "K" }), ingested("i1", { plan_ref: "OTHER" })],
      [planned("p1"), ingested("i1", { plan_ref: "K" })],
      [planned("p1", { plan_ref: "K" })],
    ];

    for (const rows of arrangements) {
      const decision = decideCollisions(rows);
      // The decision only ever names ids to mark `collision`; there is no
      // channel through which a `keyed` could leave this function.
      expect(Object.keys(decision)).not.toContain("keyedIds");
      expect(decision.collisionIds.length).toBeLessThanOrEqual(1);
    }
  });

  it("leaves a row that already carries a non-default mark alone", () => {
    const decision = decideCollisions([
      planned("p1", { plan_reconciliation: "collision" }),
      planned("p2", { plan_ref: "K", plan_reconciliation: "keyed" }),
      planned("p3"),
      ingested("i1"),
    ]);

    expect(decision.collisionIds).toEqual(["p3"]);
    expect(decision.alreadyMarked).toBe(2);
  });

  it("counts an already-marked planned row even when no attempt is made", () => {
    const decision = decideCollisions([
      planned("p1", { plan_reconciliation: "collision" }),
      planned("p2"),
    ]);

    expect(decision.collisionIds).toEqual([]);
    expect(decision.alreadyMarked).toBe(1);
  });

  /** FR-87: only an explicit SQL NULL execution mode is planned work. */
  it("treats a row with any execution mode as the ingested side", () => {
    for (const mode of ["fleet", "hand", "external", "something-new"]) {
      const decision = decideCollisions([
        planned("p1"),
        ingested("i1", { execution_mode: mode, status: "pending" }),
      ]);

      expect(decision.ingestedCount).toBe(1);
      expect(decision.collisionIds).toEqual(["p1"]);
    }
  });

  /** FR-87's other half. A dispatched row is no longer planned work. */
  it("treats a null-mode row whose status is not pending as ingested", () => {
    const decision = decideCollisions([
      planned("p1", { status: "done" }),
      planned("p2"),
      ingested("i1"),
    ]);

    expect(decision.collisionIds).toEqual(["p2"]);
    expect(decision.plannedCount).toBe(1);
    expect(decision.ingestedCount).toBe(2);
  });

  it("treats an unrecognised status as not planned rather than guessing", () => {
    const decision = decideCollisions([
      planned("p1", { status: "wat" }),
      ingested("i1"),
    ]);

    expect(decision.collisionIds).toEqual([]);
    expect(decision.plannedCount).toBe(0);
  });

  it("is empty-safe", () => {
    expect(decideCollisions([])).toEqual({
      collisionIds: [],
      plannedCount: 0,
      ingestedCount: 0,
      alreadyMarked: 0,
    });
  });

  /**
   * Q13 excludes prose similarity absolutely. The rule is handed rows carrying
   * no prose at all, so the forbidden mechanism is unavailable to it by
   * construction rather than by discipline — this test states that the shape it
   * consumes has no title or description on it.
   */
  it("reads no prose: the row shape it consumes carries none", () => {
    const row = planned("p1");
    expect(row).not.toHaveProperty("description");
    expect(row).not.toHaveProperty("title");

    // Two planned rows whose only difference would be prose are indistinguishable
    // here, which is the point.
    const decision = decideCollisions([planned("p1"), planned("p2"), ingested("i1")]);
    expect(decision.collisionIds).toEqual(["p1", "p2"]);
  });
});
