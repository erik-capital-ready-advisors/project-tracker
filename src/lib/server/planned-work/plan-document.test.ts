import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { parsePlanDocument, type ParsedPlan } from "@/lib/ingest/planDocument";
import type { ServiceClient } from "@/lib/supabase/service";

import {
  createFakePlannedDb,
  isFakeCiphertext,
  type FakePlannedDb,
} from "./__fixtures__/fakePlannedDb";
import { ingestPlanDocument, mapPlanTasks } from "./plan-document";

/**
 * FR-88's parsed half — i2's parser through u2's primitive and out the other
 * side as rows.
 *
 * **Nothing here asserts D-1's behaviour.** `fromExecutionMode(null)` returning
 * `"fleet"` is u4's to fix in this same wave; this seam writes and reads the raw
 * `execution_mode` column and never converts it, so these tests are green
 * before that fix and after it.
 */

const PLAN = [
  "# Some plan",
  "",
  "### Task 1: Parse the work-unit table",
  "",
  "- [ ] **Step 1: Write the failing test**",
  "- [x] **Step 2: Run it and watch it fail**",
  "",
  "### Task 2: Wire the route",
  "",
  "**Plan-id:** `PLAN-WIRE`",
  "",
  "- [ ] Do the thing",
  "",
].join("\n");

function parse(text: string, slug = "widget", source = "plan.md"): ParsedPlan {
  const result = parsePlanDocument(text, slug, source);
  if (result.kind !== "plan") throw new Error(`fixture is not a plan: ${result.reason}`);
  return result;
}

function seeded(): FakePlannedDb {
  const fake = createFakePlannedDb();
  fake.seed("engagement", [{ id: "eng-1", slug: "widget" }]);
  fake.seed("work_item", []);
  return fake;
}

const ingest = (fake: FakePlannedDb, plan: ParsedPlan) =>
  ingestPlanDocument(fake.client as unknown as ServiceClient, plan);

describe("mapPlanTasks", () => {
  it("maps a task onto the primitive's input shape", () => {
    const mapping = mapPlanTasks(parse(PLAN));

    expect(mapping.inputs).toEqual([
      {
        description: "Parse the work-unit table",
        workType: null,
        unit: null,
        planRef: null,
      },
      {
        description: "Wire the route",
        workType: null,
        unit: null,
        planRef: "PLAN-WIRE",
      },
    ]);
  });

  /**
   * The positional `### Task N:` number shifts the moment a task is inserted
   * above it. Writing it into `unit` would produce a value that reads like a
   * stable key and is not one — Q13's hazard through a different column.
   */
  it("never writes the positional task number into `unit`", () => {
    const mapping = mapPlanTasks(parse(PLAN));

    for (const input of mapping.inputs) expect(input.unit).toBeNull();
  });

  it("carries an explicit plan id and records the absence of one as null", () => {
    const mapping = mapPlanTasks(parse(PLAN));

    expect(mapping.inputs.map((input) => input.planRef)).toEqual([null, "PLAN-WIRE"]);
    expect(mapping.tasksWithPlanRef).toBe(1);
    expect(mapping.tasksWithoutPlanRef).toBe(1);
  });

  /**
   * u2's primitive fixes `status = 'pending'`, so writing a heading this
   * product did not understand would assert it understood it. Withheld and
   * counted instead.
   */
  it("withholds an unparsed task and reports its line, not its prose", () => {
    const text = [
      "### Task 1: Good one",
      "- [ ] step",
      "",
      "### Task two: client's confidential heading",
      "- [ ] step",
      "",
    ].join("\n");

    const mapping = mapPlanTasks(parse(text));

    expect(mapping.inputs).toHaveLength(1);
    expect(mapping.unparsedTaskLines).toEqual([4]);
    expect(JSON.stringify(mapping)).not.toContain("confidential");
  });

  /**
   * The case a null-title fixture cannot reach, and the one that matters most.
   *
   * i2's parser marks a task `unparsed` when its `**Plan-id:**` is malformed or
   * stated twice — and in that path the **title survives**, so a guard written
   * as `title === null` alone would let the row through. That row would be
   * written with `planRef: null`, silently converting "this task's
   * reconciliation key is ambiguous" into "this task has no key", which is the
   * wrong `done` FR-90 exists to prevent.
   *
   * A mutation deleting the `status === "unparsed"` half of the guard survived
   * the suite until this test existed.
   */
  it("withholds a task whose plan id is ambiguous, even though its title parsed", () => {
    const duplicated = [
      "### Task 1: Fine one",
      "- [ ] step",
      "",
      "### Task 2: Key stated twice",
      "**Plan-id:** `A`",
      "**Plan-id:** `B`",
      "- [ ] step",
      "",
    ].join("\n");

    const parsed = parse(duplicated);
    const ambiguous = parsed.tasks[1];
    // The precondition this test exists for: unparsed, but the title is there.
    expect(ambiguous.status).toBe("unparsed");
    expect(ambiguous.title).toBe("Key stated twice");

    const mapping = mapPlanTasks(parsed);
    expect(mapping.inputs).toHaveLength(1);
    expect(mapping.inputs[0].description).toBe("Fine one");
    expect(mapping.unparsedTaskLines).toEqual([4]);
  });

  it("withholds a task whose plan id is malformed", () => {
    const malformed = [
      "### Task 1: Fine one",
      "- [ ] step",
      "",
      "### Task 2: Bad key",
      "**Plan-id:** not a token!!",
      "- [ ] step",
      "",
    ].join("\n");

    const parsed = parse(malformed);
    expect(parsed.tasks[1].status).toBe("unparsed");
    expect(parsed.tasks[1].title).toBe("Bad key");

    const mapping = mapPlanTasks(parsed);
    expect(mapping.inputs.map((input) => input.description)).toEqual(["Fine one"]);
  });

  it("counts steps rather than persisting them", () => {
    const mapping = mapPlanTasks(parse(PLAN));

    expect(mapping.stepsNotPersisted).toBe(3);
    for (const input of mapping.inputs) {
      expect(input.description).not.toContain("Step 1");
    }
  });
});

describe("ingestPlanDocument", () => {
  it("writes one planned row per understood task", async () => {
    const fake = seeded();

    const result = await ingest(fake, parse(PLAN));

    expect(result.written).toBe(2);
    expect(result.tasksParsed).toBe(2);
    expect(fake.rows("work_item")).toHaveLength(2);
  });

  /** FR-87, as u2's primitive fixes it. Not this module's choice to make. */
  it("writes rows that are planned: null mode, pending, unassigned", async () => {
    const fake = seeded();

    await ingest(fake, parse(PLAN));

    for (const row of fake.rows("work_item")) {
      expect(row.execution_mode).toBeNull();
      expect(row.status).toBe("pending");
      expect(row.executor_kind).toBe("unassigned");
      expect(row.engagement_id).toBe("eng-1");
    }
  });

  /** §7a: `work_item.description` is `sensitive` and holds pgcrypto ciphertext. */
  it("never lets a task title reach the description column in the clear", async () => {
    const fake = seeded();

    await ingest(fake, parse(PLAN));

    for (const row of fake.rows("work_item")) {
      expect(isFakeCiphertext(row.description)).toBe(true);
      expect(String(row.description)).not.toContain("Parse the work-unit");
      expect(String(row.description)).not.toContain("Wire the route");
    }
    expect(fake.encrypted).toEqual(["Parse the work-unit table", "Wire the route"]);
  });

  /** `plan_ref` is the reconciliation key and is deliberately CLEAR. */
  it("stores the plan ref in the clear, beside an encrypted description", async () => {
    const fake = seeded();

    await ingest(fake, parse(PLAN));

    const refs = fake.rows("work_item").map((row) => row.plan_ref);
    expect(refs).toContain("PLAN-WIRE");
  });

  it("returns counts and line numbers, never the plan's prose", async () => {
    const fake = seeded();

    const result = await ingest(fake, parse(PLAN));

    expect(JSON.stringify(result)).not.toContain("Parse the work-unit table");
    expect(JSON.stringify(result)).not.toContain("Wire the route");
  });

  /**
   * `ON CONFLICT DO NOTHING` on `(engagement_id, plan_ref)`. Re-posting the
   * same plan writes nothing new and raises nothing — and leaves the existing
   * row exactly as it is, so a planned row since dispatched is not reset.
   */
  it("is idempotent for a keyed task and additive for an unkeyed one", async () => {
    const fake = seeded();
    const plan = parse(PLAN);

    const first = await ingest(fake, plan);
    const second = await ingest(fake, plan);

    expect(first.written).toBe(2);
    // The unkeyed task inserts again (NULLS DISTINCT); the keyed one is skipped.
    expect(second.written).toBe(1);
    expect(second.skippedAsDuplicate).toBe(1);
    expect(
      fake.rows("work_item").filter((row) => row.plan_ref === "PLAN-WIRE"),
    ).toHaveLength(1);
  });

  it("names the conflict target the plain index supports", async () => {
    const fake = seeded();

    await ingest(fake, parse(PLAN));

    const upsert = fake.calls.find((call) => call.op === "upsert");
    expect(upsert?.onConflict).toBe("engagement_id,plan_ref");
    expect(upsert?.ignoreDuplicates).toBe(true);
  });

  it("refuses an unknown engagement before writing anything", async () => {
    const fake = seeded();

    const error = await ingest(fake, parse(PLAN, "no-such-client")).catch(
      (thrown: unknown) => thrown,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toContain("No engagement is registered");
    expect(fake.rows("work_item")).toHaveLength(0);
  });

  describe("FR-90", () => {
    it("leaves rows unreconciled when the engagement holds no ingested work", async () => {
      const fake = seeded();

      const result = await ingest(fake, parse(PLAN));

      expect(result.reconciliation.marked).toBe(0);
      for (const row of fake.rows("work_item")) {
        expect(row.plan_reconciliation).toBe("unreconciled");
      }
    });

    /**
     * CR-005 §3.1a: all-collisions-and-no-merges on the first real plan is the
     * CORRECT output. No artifact carries a shared key, so nothing can key.
     */
    it("marks every planned row where ingested work already exists", async () => {
      const fake = seeded();
      fake.seed("work_item", [
        {
          id: "wi-existing",
          engagement_id: "eng-1",
          execution_mode: "fleet",
          status: "done",
          plan_ref: null,
          plan_reconciliation: "unreconciled",
        },
      ]);

      const result = await ingest(fake, parse(PLAN));

      expect(result.reconciliation.marked).toBe(2);
      expect(result.reconciliation.ingestedCount).toBe(1);

      const planned = fake
        .rows("work_item")
        .filter((row) => row.execution_mode === null);
      expect(planned).toHaveLength(2);
      for (const row of planned) expect(row.plan_reconciliation).toBe("collision");

      const existing = fake.rows("work_item").find((row) => row.id === "wi-existing");
      expect(existing?.plan_reconciliation).toBe("unreconciled");
    });

    it("merges nothing: both rows stand", async () => {
      const fake = seeded();
      fake.seed("work_item", [
        {
          id: "wi-existing",
          engagement_id: "eng-1",
          execution_mode: "fleet",
          status: "done",
          plan_ref: null,
          plan_reconciliation: "unreconciled",
        },
      ]);

      await ingest(fake, parse(PLAN));

      expect(fake.rows("work_item")).toHaveLength(3);
    });

    /**
     * Marking runs against the whole engagement, not only the rows this call
     * wrote — so a planned row an earlier post created is marked when the
     * ingested counterpart shows up later.
     */
    it("marks planned rows an earlier post created", async () => {
      const fake = seeded();
      await ingest(fake, parse(PLAN));
      expect(fake.rows("work_item").every((r) => r.plan_reconciliation === "unreconciled")).toBe(
        true,
      );

      // A run lands afterwards.
      fake.rows("work_item").push({
        id: "wi-later",
        engagement_id: "eng-1",
        execution_mode: "fleet",
        status: "done",
        plan_ref: null,
        plan_reconciliation: "unreconciled",
      });

      const second = await ingest(fake, parse("### Task 9: Later\n- [ ] x\n"));

      expect(second.reconciliation.marked).toBeGreaterThanOrEqual(2);
      const planned = fake
        .rows("work_item")
        .filter((row) => row.execution_mode === null);
      for (const row of planned) expect(row.plan_reconciliation).toBe("collision");
    });
  });
});
