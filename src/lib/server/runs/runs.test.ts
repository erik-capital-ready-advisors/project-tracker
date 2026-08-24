import { beforeEach, describe, expect, it } from "vitest";

import {
  createFakeAnswerDb,
  resetFakeAnswerIds,
} from "@/lib/server/answers/__fixtures__/fake-answer-db";
import type {
  FakeDbOptions,
  FakeRow,
} from "@/lib/server/answers/__fixtures__/fake-answer-db";

import { CIPHERTEXT_COLUMNS, projectionColumns } from "./columns";
import { loadRunDetail } from "./detail";
import { listRuns } from "./list";
import type { RunsDb } from "./types";

/**
 * The `fleet_run` read layer, driven against the shared PostgREST fake.
 *
 * `createFakeAnswerDb` is reused rather than re-written: it already models the
 * three behaviours that let this code be wrong while a test stays green — a
 * silent `maxRows` truncation, a true `count` distinguishable from a short page,
 * and real unique constraints. It also records every projection it is asked for
 * and every RPC it is called with, which is what makes the §7a assertions at the
 * bottom of this file **behavioural** rather than a second reading of the source.
 */

const ACME = "eng-acme";
const OTHER = "eng-other";

/**
 * The ledger as measured on 2026-08-23, reduced to the rows these tests need.
 *
 * Run `b0952e`'s real columns are preserved exactly where they matter: NULL
 * dispatch and test columns, `verdict = 'unparsed'`, and `started_at` equal to
 * `ended_at`. A fixture that rounded any of those off would be testing a run
 * this ledger does not contain.
 */
function ledger(
  overrides: Record<string, FakeRow[]> = {},
): Record<string, FakeRow[]> {
  return {
    engagement: [
      { id: ACME, slug: "acme", client_name: "Acme Corp" },
      { id: OTHER, slug: "other", client_name: "Other Client" },
    ],
    fleet_run: [
      {
        id: "run-1",
        engagement_id: ACME,
        run_id: "b0952e",
        branch: "agent-build/2026-08-19-b0952e",
        mode: "full",
        started_at: "2026-08-19 00:00:00+00",
        ended_at: "2026-08-19 00:00:00+00",
        dispatch_cap: null,
        dispatches_used: null,
        verdict: "unparsed",
        gates: { build_after_phase1: "PASS" },
        tests_passed: null,
        tests_failed: null,
        tests_skipped: null,
      },
    ],
    work_item: [
      {
        id: "wi-1",
        engagement_id: ACME,
        fleet_run_id: "run-1",
        unit: "u1",
        execution_mode: "fleet",
        work_type: "ui",
        phase: 1,
        executor: "ui-designer",
        executor_kind: "agent",
        status: "done",
        unautomated_reason: null,
        disposition: null,
        evidence_scope: null,
        not_verified_count: 0,
        started_at: null,
        ended_at: null,
        description: "enc:client prose",
        raw_status: "enc:status prose",
      },
      {
        id: "wi-2",
        engagement_id: ACME,
        fleet_run_id: "run-1",
        unit: "i1",
        execution_mode: "fleet",
        work_type: "integration",
        phase: 1,
        executor: "api-integrator",
        executor_kind: "agent",
        status: "blocked",
        unautomated_reason: null,
        disposition: null,
        evidence_scope: null,
        not_verified_count: 2,
        started_at: null,
        ended_at: null,
        description: "enc:more prose",
        raw_status: "enc:more status",
      },
    ],
    open_question: [
      {
        id: "q-1",
        engagement_id: ACME,
        run: "b0952e",
        unit: "i1",
        section: "7a",
        confidence: "med",
        answered_by: null,
        answered_at: null,
        status: "open",
        source_key: "questions-i1.jsonl#0",
        question: "enc:the question",
        best_guess: "enc:the guess",
        answer: "enc:the answer",
      },
    ],
    work_item_requirement: [
      { id: "wir-1", work_item_id: "wi-1", requirement_ref: "FR-10" },
      { id: "wir-2", work_item_id: "wi-1", requirement_ref: "FR-2" },
      { id: "wir-3", work_item_id: "wi-2", requirement_ref: "FR-999" },
    ],
    requirement: [
      { id: "req-1", engagement_id: ACME, ref: "FR-10", text: "enc:spec text" },
      { id: "req-2", engagement_id: ACME, ref: "FR-2", text: "enc:spec text" },
    ],
    defect: [
      {
        id: "def-1",
        engagement_id: ACME,
        ref: "B40",
        severity: "important",
        status: "open",
        title: "A sign-out control",
        fixing_work_item_id: null,
        description: "enc:defect prose",
        wont_fix_reason: null,
      },
    ],
    ...overrides,
  };
}

function db(options: FakeDbOptions = {}) {
  const fake = createFakeAnswerDb({ tables: ledger(), ...options });
  return { fake, client: fake as unknown as RunsDb };
}

beforeEach(() => {
  resetFakeAnswerIds();
});

describe("FR-92 — listRuns", () => {
  it("shapes the run the ledger actually holds, without inventing a number", async () => {
    const { client } = db();
    const listing = await listRuns(client);

    expect(listing.runs).toHaveLength(1);
    const run = listing.runs[0];

    expect(run.runId).toBe("b0952e");
    expect(run.branch).toBe("agent-build/2026-08-19-b0952e");
    expect(run.mode).toBe("full");
    expect(run.engagement?.slug).toBe("acme");

    // The four values D3 is about, each in the state the row actually carries.
    expect(run.verdict.sources[0].verdict).toBe("unparsed");
    expect(run.duration).toEqual({ state: "known", minutes: 0, label: "0m" });
    expect(run.dispatches).toEqual({ state: "unknown" });
    expect(run.tests.state).toBe("unknown");
  });

  it("states each row's own unparsed count", async () => {
    const { client } = db();
    const listing = await listRuns(client);

    // 0 unparsed work items, but the run's own verdict is `unparsed`.
    expect(listing.runs[0].unparsed.workItems).toBe(0);
    expect(listing.runs[0].unparsed.verdictUnparsed).toBe(true);
    expect(listing.runs[0].unparsed.total).toBe(1);
  });

  it("counts unparsed work items per run rather than across the ledger", async () => {
    const tables = ledger();
    tables.fleet_run.push({
      ...tables.fleet_run[0],
      id: "run-2",
      run_id: "aaaaaa",
      started_at: "2026-08-20 00:00:00+00",
      ended_at: "2026-08-20 01:00:00+00",
      verdict: "PASS",
    });
    tables.work_item.push({
      ...tables.work_item[0],
      id: "wi-3",
      fleet_run_id: "run-2",
      unit: "u9",
      status: "unparsed",
    });

    const { client } = db({ tables });
    const listing = await listRuns(client);
    const byId = new Map(listing.runs.map((run) => [run.runId, run]));

    expect(byId.get("aaaaaa")?.unparsed.workItems).toBe(1);
    expect(byId.get("b0952e")?.unparsed.workItems).toBe(0);
  });

  it("orders newest first, and puts a run with no start date last", async () => {
    const tables = ledger();
    tables.fleet_run.push(
      {
        ...tables.fleet_run[0],
        id: "run-2",
        run_id: "newer1",
        started_at: "2026-08-22 00:00:00+00",
        ended_at: "2026-08-22 00:00:00+00",
      },
      {
        ...tables.fleet_run[0],
        id: "run-3",
        run_id: "undate",
        started_at: null,
        ended_at: null,
      },
    );

    const { client } = db({ tables });
    const listing = await listRuns(client);

    // A run with no timestamp is not treated as the epoch — it goes last,
    // because "we did not record when this started" is not "this is oldest".
    expect(listing.runs.map((run) => run.runId)).toEqual([
      "newer1",
      "b0952e",
      "undate",
    ]);
  });

  it("degrades the unparsed column to null rather than to zero when its read fails", async () => {
    const { client } = db({ fail: { work_item: { message: "refused" } } });
    const listing = await listRuns(client);

    expect(listing.unparsedCountsUnavailable).toBe(true);
    expect(listing.runs[0].unparsed.workItems).toBeNull();
    expect(listing.runs[0].unparsed.total).toBeNull();
  });

  it("counts rows that recorded no verdict at all, distinctly from `unparsed`", async () => {
    const tables = ledger();
    tables.fleet_run.push({
      ...tables.fleet_run[0],
      id: "run-2",
      run_id: "novrdc",
      verdict: null,
    });

    const { client } = db({ tables });
    const listing = await listRuns(client);

    expect(listing.noVerdictCount).toBe(1);
    expect(listing.noTestCountsCount).toBe(2);
  });

  it("throws rather than returning a short list when the run read fails", async () => {
    const { client } = db({ fail: { fleet_run: { message: "refused" } } });

    // A partial listing that looks complete is worse than a failure: FR-92 says
    // "every ingested fleet run".
    await expect(listRuns(client)).rejects.toThrow();
  });
});

describe("FR-93 — loadRunDetail", () => {
  it("finds a run by its human run id and carries its identity", async () => {
    const { client } = db();
    const result = await loadRunDetail(client, "b0952e");

    expect(result.state).toBe("found");
    if (result.state !== "found") return;
    expect(result.run.runId).toBe("b0952e");
    expect(result.run.engagement?.clientName).toBe("Acme Corp");
  });

  it("reports an unknown run id as not_found, and trims the segment", async () => {
    const { client } = db();

    expect((await loadRunDetail(client, "zzzzzz")).state).toBe("not_found");
    expect((await loadRunDetail(client, "   ")).state).toBe("not_found");
    expect((await loadRunDetail(client, " b0952e ")).state).toBe("found");
  });

  it("reports two engagements sharing a run id as ambiguous rather than picking one", async () => {
    const tables = ledger();
    tables.fleet_run.push({
      ...tables.fleet_run[0],
      id: "run-2",
      engagement_id: OTHER,
      run_id: "b0952e",
    });

    const { client } = db({ tables });
    const result = await loadRunDetail(client, "b0952e");

    // `unique (engagement_id, run_id)` — the id is unique per engagement only.
    expect(result.state).toBe("ambiguous");
    if (result.state !== "ambiguous") return;
    expect(result.matches).toHaveLength(2);
    expect(result.matches.map((one) => one.engagement?.slug).sort()).toEqual([
      "acme",
      "other",
    ]);
  });

  it("lists the run's work units with their outcomes, ordered by phase then unit", async () => {
    const { client } = db();
    const result = await loadRunDetail(client, "b0952e");
    if (result.state !== "found") throw new Error("expected found");

    expect(result.run.workUnits.map((unit) => unit.unit)).toEqual(["i1", "u1"]);
    expect(result.run.workUnits[0]).toMatchObject({
      status: "blocked",
      executor: "api-integrator",
      notVerifiedCount: 2,
    });
    // Navigable through the same `<EntityRef>` contract the detail views use.
    expect(result.run.workUnits[0].ref).toMatchObject({ kind: "work_item", id: "wi-2" });
  });

  it("lists the questions the run queued, scoped by engagement AND run", async () => {
    const tables = ledger();
    // A decoy: same run id, different engagement. Matching on `run` alone would
    // pull it onto this run's page, because `run` is text and not a foreign key.
    tables.open_question.push({
      ...tables.open_question[0],
      id: "q-decoy",
      engagement_id: OTHER,
      unit: "zz",
    });

    const { client } = db({ tables });
    const result = await loadRunDetail(client, "b0952e");
    if (result.state !== "found") throw new Error("expected found");

    expect(result.run.questions).toHaveLength(1);
    expect(result.run.questions[0].ref.id).toBe("q-1");
    expect(result.run.questions[0].confidence).toBe("med");
  });

  it("never coerces a null confidence into one of the three labels", async () => {
    const tables = ledger();
    tables.open_question[0].confidence = null;

    const { client } = db({ tables });
    const result = await loadRunDetail(client, "b0952e");
    if (result.state !== "found") throw new Error("expected found");

    expect(result.run.questions[0].confidence).toBeNull();
  });

  it("reports the defects it opened as null, not as an empty list", async () => {
    const { client } = db();
    const result = await loadRunDetail(client, "b0952e");
    if (result.state !== "found") throw new Error("expected found");

    // D2. `[]` renders as "this run opened no defects" — a sentence nothing in
    // the ledger checked. `null` plus a reason lets the screen say what is true.
    expect(result.run.defects.opened).toBeNull();
    expect(result.run.defects.openedUnavailable).toBe("no_opened_by_edge");
  });

  it("reads the one modelled defect edge, and reports it under its own name", async () => {
    const tables = ledger();
    tables.defect[0].fixing_work_item_id = "wi-1";

    const { client } = db({ tables });
    const result = await loadRunDetail(client, "b0952e");
    if (result.state !== "found") throw new Error("expected found");

    // `fixed` is genuinely queried, so an empty `fixed` and a null `opened` are
    // distinguishable: one was asked and came back empty, the other cannot be asked.
    expect(result.run.defects.fixed.map((ref) => ref.label)).toEqual(["B40"]);
    expect(result.run.defects.opened).toBeNull();
  });

  it("does not infer a run-defect edge from reported_by, ref or timestamps", async () => {
    const tables = ledger();
    // Every heuristic a widening parser might reach for, all pointing at this run.
    tables.defect[0].reported_by = "b0952e";
    tables.defect[0].source_key = "qa-report-b0952e.md#1";
    tables.defect[0].reported_at = "2026-08-19 00:00:00+00";

    const { client } = db({ tables });
    const result = await loadRunDetail(client, "b0952e");
    if (result.state !== "found") throw new Error("expected found");

    expect(result.run.defects.fixed).toEqual([]);
    expect(result.run.defects.opened).toBeNull();
  });

  it("lists the requirements it touched as refs, FR-2 before FR-10", async () => {
    const { client } = db();
    const result = await loadRunDetail(client, "b0952e");
    if (result.state !== "found") throw new Error("expected found");

    expect(result.run.requirements.refs.map((ref) => ref.label)).toEqual([
      "FR-2",
      "FR-10",
      "FR-999",
    ]);
  });

  it("renders a requirement ref that resolves to nothing as dangling, not dropped", async () => {
    const { client } = db();
    const result = await loadRunDetail(client, "b0952e");
    if (result.state !== "found") throw new Error("expected found");

    const dangling = result.run.requirements.refs.find((ref) => ref.label === "FR-999");
    // FR-12: a ref naming something not ingested is reported, not rejected.
    expect(dangling?.id).toBeNull();
    expect(result.run.requirements.danglingCount).toBe(1);
  });

  it("renders the gates payload and folds it into the run's unparsed count", async () => {
    const tables = ledger();
    tables.fleet_run[0].gates = { build_after_phase1: "PASS", lint: "unparsed" };

    const { client } = db({ tables });
    const result = await loadRunDetail(client, "b0952e");
    if (result.state !== "found") throw new Error("expected found");

    expect(result.run.gates.gates.map((gate) => gate.key)).toEqual([
      "build_after_phase1",
      "lint",
    ]);
    // 0 unparsed work items + 1 unparsed gate + 1 unparsed verdict.
    expect(result.run.unparsed.total).toBe(2);
  });
});

describe("§7a — observed at runtime, not read off the source", () => {
  it("issues no projection naming a ciphertext column, on either screen's read", async () => {
    const { fake, client } = db();

    await listRuns(client);
    await loadRunDetail(client, "b0952e");

    expect(fake.projections.length).toBeGreaterThan(5);

    for (const { table, columns } of fake.projections) {
      const named = new Set(projectionColumns(columns));
      const leaked = CIPHERTEXT_COLUMNS.filter((column) => named.has(column));
      expect(leaked, `${table} was read with "${columns}"`).toEqual([]);
    }
  });

  it("issues no decrypt_field RPC at all", async () => {
    const { fake, client } = db();

    await listRuns(client);
    await loadRunDetail(client, "b0952e");

    // The fixture rows carry `enc:`-prefixed ciphertext in every bytea column,
    // so a loader that read one would have to decrypt it to render it. Zero
    // calls is the positive evidence that this unit adds no decryption surface.
    expect(fake.rpcCalls.filter((call) => call.name === "decrypt_field")).toEqual([]);
    expect(fake.rpcCalls).toEqual([]);
  });

  it("CONTROL — the projection assertion catches a leaked column", async () => {
    const { fake, client } = db();
    await loadRunDetail(client, "b0952e");

    // Prove the loop above can fail: plant the exact projection it exists to
    // refuse, and assert the same predicate flags it. Without this the check is
    // green whether or not it is looking at anything.
    fake.projections.push({ table: "work_item", columns: "id, unit, raw_status" });

    const leaked = fake.projections.flatMap(({ columns }) => {
      const named = new Set(projectionColumns(columns));
      return CIPHERTEXT_COLUMNS.filter((column) => named.has(column));
    });
    expect(leaked).toEqual(["raw_status"]);
  });
});
