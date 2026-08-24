import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import type { ReleaseDb } from "@/lib/server/releases/db";

import { createFakePlannedDb, type FakePlannedDb } from "./__fixtures__/fakePlannedDb";
import { markPlanCollisions } from "./mark-collisions";

const planned = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  engagement_id: "eng-1",
  execution_mode: null,
  status: "pending",
  plan_ref: null,
  plan_reconciliation: "unreconciled",
  ...over,
});

const ingestedRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  engagement_id: "eng-1",
  execution_mode: "fleet",
  status: "done",
  plan_ref: null,
  plan_reconciliation: "unreconciled",
  ...over,
});

const run = (fake: FakePlannedDb) =>
  markPlanCollisions(fake.client as ReleaseDb, "eng-1");

const marksOf = (fake: FakePlannedDb) =>
  Object.fromEntries(
    fake.rows("work_item").map((row) => [row.id, row.plan_reconciliation]),
  );

describe("markPlanCollisions", () => {
  it("writes the mark onto every unreconciled planned row", async () => {
    const fake = createFakePlannedDb();
    fake.seed("work_item", [planned("p1"), planned("p2"), ingestedRow("i1")]);

    const result = await run(fake);

    expect(result.marked).toBe(2);
    expect(marksOf(fake)).toEqual({
      p1: "collision",
      p2: "collision",
      i1: "unreconciled",
    });
  });

  it("writes nothing when the engagement holds no ingested work", async () => {
    const fake = createFakePlannedDb();
    fake.seed("work_item", [planned("p1"), planned("p2")]);

    const result = await run(fake);

    expect(result.marked).toBe(0);
    expect(marksOf(fake)).toEqual({ p1: "unreconciled", p2: "unreconciled" });
    expect(fake.calls.some((call) => call.op === "update")).toBe(false);
  });

  it("never marks a row in another engagement", async () => {
    const fake = createFakePlannedDb();
    fake.seed("work_item", [
      planned("p1"),
      ingestedRow("i1"),
      planned("other", { engagement_id: "eng-2" }),
      ingestedRow("other-i", { engagement_id: "eng-2" }),
    ]);

    await run(fake);

    expect(marksOf(fake)).toMatchObject({
      p1: "collision",
      other: "unreconciled",
    });
  });

  /**
   * The engagement filter must be on the READ. Without it the rule would see
   * another client's ingested rows as this engagement's counterparts, and a
   * planned row in an engagement with no runs of its own would be marked.
   */
  it("scopes the read to the engagement", async () => {
    const fake = createFakePlannedDb();
    fake.seed("work_item", [planned("p1"), ingestedRow("i1")]);

    await run(fake);

    const read = fake.calls.find((call) => call.op === "select");
    expect(read?.filters).toContainEqual({
      kind: "eq",
      column: "engagement_id",
      value: "eng-1",
    });
  });

  /**
   * The update carries `plan_reconciliation = 'unreconciled'` as a filter, not
   * merely as something the read established. Removing it would let this path
   * reset a row a later milestone marked `keyed`, in the window between the two
   * calls.
   */
  it("re-asserts unreconciled on the update, so a keyed row is never reset", async () => {
    const fake = createFakePlannedDb();
    fake.seed("work_item", [
      planned("p1"),
      planned("p2", { plan_ref: "K", plan_reconciliation: "keyed" }),
      ingestedRow("i1"),
    ]);

    const result = await run(fake);

    expect(marksOf(fake)).toMatchObject({ p1: "collision", p2: "keyed" });
    expect(result.marked).toBe(1);

    const update = fake.calls.find((call) => call.op === "update");
    expect(update?.filters).toContainEqual({
      kind: "eq",
      column: "plan_reconciliation",
      value: "unreconciled",
    });
  });

  it("is idempotent: a second call writes nothing", async () => {
    const fake = createFakePlannedDb();
    fake.seed("work_item", [planned("p1"), ingestedRow("i1")]);

    expect((await run(fake)).marked).toBe(1);
    expect((await run(fake)).marked).toBe(0);
    expect(marksOf(fake)).toEqual({ p1: "collision", i1: "unreconciled" });
  });

  it("never sets `keyed`, whatever the keys look like", async () => {
    const fake = createFakePlannedDb();
    fake.seed("work_item", [
      planned("p1", { plan_ref: "K" }),
      ingestedRow("i1", { plan_ref: "K2" }),
    ]);

    await run(fake);

    const written = fake.calls
      .filter((call) => call.op === "update")
      .map((call) => call.patch?.plan_reconciliation);
    expect(written).toEqual(["collision"]);
    expect(written).not.toContain("keyed");
  });

  it("chunks a large id list rather than sending one unbounded filter", async () => {
    const fake = createFakePlannedDb();
    const rows = Array.from({ length: 450 }, (_, index) =>
      planned(`p${String(index).padStart(3, "0")}`),
    );
    fake.seed("work_item", [...rows, ingestedRow("i1")]);

    const result = await run(fake);

    expect(result.marked).toBe(450);

    const updates = fake.calls.filter((call) => call.op === "update");
    expect(updates).toHaveLength(3);
    for (const update of updates) {
      const ids = update.filters.find((filter) => filter.kind === "in");
      expect(ids).toBeDefined();
      expect((ids!.value as unknown[]).length).toBeLessThanOrEqual(200);
    }
  });

  it("reads past one page rather than trusting a single window", async () => {
    const fake = createFakePlannedDb();
    const rows = Array.from({ length: 1200 }, (_, index) =>
      planned(`p${String(index).padStart(4, "0")}`),
    );
    fake.seed("work_item", [...rows, ingestedRow("zzz-i1")]);

    const result = await run(fake);

    // 1201 rows across a 1000-row page size. A single unpaged read would see
    // 1000 and report success — the failure mode the Shoe Swap Studio incident
    // note records.
    expect(result.plannedCount).toBe(1200);
    expect(result.marked).toBe(1200);
  });

  it("refuses without a mechanism when the read fails", async () => {
    const fake = createFakePlannedDb();
    fake.seed("work_item", [planned("p1"), ingestedRow("i1")]);
    fake.failNext("work_item", 'relation "work_item" does not exist');

    const error = await run(fake).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(ApiError);
    const message = (error as ApiError).message;
    expect(message).not.toContain("does not exist");
    expect(message).toContain("no collision mark was written");
    expect(marksOf(fake)).toEqual({ p1: "unreconciled", i1: "unreconciled" });
  });

  /**
   * QA d4000f, `important` #1.
   *
   * **Both** call sites commit their writes BEFORE this function runs —
   * `persistPlan` for `POST /api/ingest/run`, `ingestPlanDocument` for
   * `POST /api/ingest/plan`. "Nothing else was changed" is therefore false in
   * both directions, and it is the one sentence an agent acts on: told the
   * ingest did nothing, it re-posts the run or reports it lost.
   *
   * A wrong `done` is the worst output this product can produce. A wrong
   * *"not done"* is that same defect facing the other way, and this message
   * was emitting one after a fully committed run.
   *
   * The failure is scoped to the reconciliation instead — the shape the
   * partial-write branch already uses two lines below it.
   */
  it("never claims nothing changed, because the caller has already committed", async () => {
    const fake = createFakePlannedDb();
    fake.seed("work_item", [planned("p1"), ingestedRow("i1")]);
    fake.failNext("work_item", 'relation "work_item" does not exist');

    const error = await run(fake).catch((thrown: unknown) => thrown);

    const message = (error as ApiError).message;
    expect(message).not.toContain("Nothing else was changed");
    // Says positively what survived, so the caller can tell "the run is not
    // there" from "the run is there and one bookkeeping step is missing".
    expect(message).toContain("was not rolled back");
    // Still no mechanism and still no row prose: §7a classifies `work_item`
    // text `sensitive`.
    expect(message).not.toContain("does not exist");
  });
});
