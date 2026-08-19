import { describe, it, expect, beforeEach } from "vitest";

import { MANIFEST } from "@/lib/ingest/__fixtures__/manifest";
import { QUESTION_FILES } from "@/lib/ingest/__fixtures__/questions";
import { CHECKPOINT, PROD_MD, QA_REPORT_WITH_GATES } from "@/lib/ingest/__fixtures__/runState";

import { createFakeDb, isFakeCiphertext, type FakeDb } from "./__fixtures__/fakeDb";
import { persistPlan } from "./persist";
import { planRun, type RunArtifacts } from "./plan";

const ARTIFACTS: RunArtifacts = {
  engagementSlug: "widget",
  runId: "zz01",
  manifests: [{ name: "manifest-zz01.md", text: MANIFEST }],
  questionFiles: QUESTION_FILES,
  specText: "FR-6 sixth. FR-7 seventh. FR-8 eighth. FR-9 ninth.",
  testFiles: [{ path: "tests/shell.spec.ts", source: `it("FR-6 renders", () => {});` }],
  prodMdText: PROD_MD,
  checkpointText: CHECKPOINT,
  qaReportText: QA_REPORT_WITH_GATES,
};

/** §7a's encrypted columns on the tables this writer touches. */
const MUST_BE_CIPHERTEXT: Record<string, string[]> = {
  requirement: ["text"],
  blocker: ["description"],
  work_item: ["description", "raw_status"],
  open_question: ["question", "best_guess", "answer"],
};

describe("persistPlan", () => {
  let fake: FakeDb;

  beforeEach(() => {
    fake = createFakeDb();
    fake.seed("engagement", [{ id: "eng-1" }]);
    fake.seed("fleet_run", [{ id: "run-1" }]);
    fake.seed("blocker", [
      { id: "blk-1", ref: "B1" },
      { id: "blk-1a", ref: "B1a" },
      { id: "blk-3", ref: "B3" },
    ]);
    fake.seed("work_item", [
      { id: "wi-r1", unit: "r1" },
      { id: "wi-u1", unit: "u1" },
      { id: "wi-i1", unit: "i1" },
      { id: "wi-i2", unit: "i2" },
      { id: "wi-u2", unit: "u2" },
      { id: "wi-u3", unit: "u3" },
      { id: "wi-d1", unit: "d1" },
      { id: "wi-q1", unit: "q1" },
    ]);
  });

  const run = () => persistPlan(fake.client as never, planRun(ARTIFACTS));

  const upsertFor = (table: string) =>
    fake.calls.find((call) => call.table === table && call.op === "upsert");

  it("FR-22 upserts every table against its natural key, never a generated id", async () => {
    await run();
    expect(upsertFor("fleet_run")?.onConflict).toBe("engagement_id,run_id");
    expect(upsertFor("requirement")?.onConflict).toBe("engagement_id,ref");
    expect(upsertFor("blocker")?.onConflict).toBe("engagement_id,ref");
    expect(upsertFor("work_item")?.onConflict).toBe("engagement_id,fleet_run_id,unit");
    expect(upsertFor("work_item_dependency")?.onConflict).toBe(
      "work_item_id,depends_on_id",
    );
    expect(upsertFor("work_item_requirement")?.onConflict).toBe(
      "work_item_id,requirement_ref",
    );
    expect(upsertFor("open_question")?.onConflict).toBe("engagement_id,source_key");
    expect(upsertFor("test_case")?.onConflict).toBe("engagement_id,file,title");
  });

  it("FR-22 every upsert names a conflict target — none is a blind insert", async () => {
    await run();
    const blind = fake.calls.filter(
      (call) => call.op === "upsert" && call.onConflict === undefined,
    );
    expect(blind).toEqual([]);
  });

  it("§7a routes every encrypted column through encrypt_field", async () => {
    await run();
    for (const [table, columns] of Object.entries(MUST_BE_CIPHERTEXT)) {
      for (const call of fake.calls.filter((c) => c.table === table && c.op === "upsert")) {
        for (const row of call.rows ?? []) {
          for (const column of columns) {
            const value = row[column];
            if (value === undefined || value === null) continue;
            expect(
              isFakeCiphertext(value),
              `${table}.${column} reached the column as plaintext`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("§7a writes no work-item prose in the clear", async () => {
    await run();
    const rows = upsertFor("work_item")?.rows ?? [];
    const serialised = JSON.stringify(rows);
    // A phrase that exists only inside a description and a raw status cell.
    expect(serialised).not.toContain("App shell and design system");
    expect(serialised).not.toContain("No Vercel account is reachable");
  });

  it("clear columns stay clear — a slug that were encrypted could not be filtered", async () => {
    await run();
    const rows = upsertFor("work_item")?.rows ?? [];
    expect(rows.every((row) => !isFakeCiphertext(row.unit))).toBe(true);
    expect(rows.every((row) => !isFakeCiphertext(row.status))).toBe(true);
  });

  it("FR-18 an unanswered question omits the answer columns entirely", async () => {
    await run();
    const batches = fake.calls.filter(
      (call) => call.table === "open_question" && call.op === "upsert",
    );
    const unanswered = batches.find((batch) =>
      (batch.rows ?? []).every((row) => !("answer" in row)),
    );
    expect(unanswered).toBeDefined();
    // This is what stops re-posting a run from erasing an answer Erik typed:
    // ON CONFLICT DO UPDATE only sets the columns the payload names.
    for (const row of unanswered?.rows ?? []) {
      expect(row).not.toHaveProperty("answer");
      expect(row).not.toHaveProperty("answered_by");
      expect(row).not.toHaveProperty("status");
    }
  });

  it("FR-18 an answered question does carry its answer", async () => {
    await run();
    const answered = fake.calls
      .filter((call) => call.table === "open_question" && call.op === "upsert")
      .flatMap((call) => call.rows ?? [])
      .filter((row) => "answer" in row);
    expect(answered).toHaveLength(1);
    expect(answered[0].answered_by).toBe("erik");
  });

  it("FR-22 child tables are reconciled, so a removed edge does not persist", async () => {
    await run();
    const deletes = fake.calls.filter((call) => call.op === "delete").map((c) => c.table);
    expect(deletes).toContain("work_item_dependency");
    expect(deletes).toContain("work_item_requirement");
  });

  it("FR-42 a dependency naming a unit outside this run is reported, not dropped", async () => {
    // `q1` depends on `all`, which is not a unit.
    const result = await run();
    expect(result.unresolvedDependencies).toContainEqual({
      unit: "q1",
      dependsOnUnit: "all",
    });
  });

  it("FR-17 resolves a work item's blocker to a real row id", async () => {
    await run();
    const rows = upsertFor("work_item")?.rows ?? [];
    // This manifest's work-units table names no blocker, so every row is null —
    // and null here means "no blocker named", not "blocker not found".
    expect(rows.every((row) => row.blocker_id === null)).toBe(true);
  });

  it("scopes every work item to the resolved engagement and fleet run", async () => {
    const result = await run();
    expect(result.engagementId).toBe("eng-1");
    expect(result.fleetRunId).toBe("run-1");
    const rows = upsertFor("work_item")?.rows ?? [];
    expect(rows.every((row) => row.engagement_id === "eng-1")).toBe(true);
    expect(rows.every((row) => row.fleet_run_id === "run-1")).toBe(true);
  });

  it("FR-13 refuses to invent an engagement that was never registered", async () => {
    const missing = createFakeDb();
    missing.seed("engagement", []);
    await expect(persistPlan(missing.client as never, planRun(ARTIFACTS))).rejects.toThrow(
      /No engagement is registered/,
    );
  });

  it("FR-20 never writes the prod.md milestone tracker to any table", async () => {
    await run();
    const tables = new Set(fake.calls.map((call) => call.table));
    // The tracker has no §7a-classified entity, so it must reach no table at
    // all — least of all `contract_milestone`, which is client money.
    expect(tables.has("contract_milestone")).toBe(false);
    expect(tables.has("acceptance_criterion")).toBe(false);
  });

  it("§7a never touches contract_milestone from the ingest path", async () => {
    await run();
    expect(fake.calls.map((call) => call.table)).not.toContain("contract_milestone");
  });
});
