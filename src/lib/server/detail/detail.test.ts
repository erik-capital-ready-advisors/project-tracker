// @vitest-environment node

import { beforeEach, describe, expect, it } from "vitest";

import { agentScopedDb } from "@/lib/api";
import { ENTITY_KINDS, entityHref } from "@/lib/entity-routes";
import type { EntityKind } from "@/lib/entity-routes";
import { createFakeAnswerDb, resetFakeAnswerIds } from "@/lib/server/answers/__fixtures__/fake-answer-db";
import type { FakeAnswerDb, FakeRow } from "@/lib/server/answers/__fixtures__/fake-answer-db";
import { ENGAGEMENT, ENGAGEMENT_ID, OTHER_ENGAGEMENT_ID, ledger } from "@/lib/server/answers/__fixtures__/ledger";
import { untestedAnswer } from "@/lib/server/answers/untested";

import { loadBlockerDetail } from "./blocker";
import { loadContractMilestoneDetail } from "./contract-milestone";
import { loadDefectDetail } from "./defect";
import { loadExternalWaitDetail } from "./external-wait";
import { loadOpenQuestionDetail } from "./open-question";
import { danglingQueries, labelEntities, refKey, resolveRefs, resolvedId } from "./refs";
import type { RefQuery } from "./refs";
import { loadReleaseDetail } from "./release";
import { loadRequirementDetail } from "./requirement";
import type { DetailDb, DetailRef } from "./types";
import { fallbackLabel } from "./types";
import { loadWorkItemDetail, workItemRefs } from "./work-item";

/**
 * The detail read layer, against the same in-memory PostgREST stand-in the six
 * answers are tested through.
 *
 * **No live database was reached by any of this.** This worktree holds no
 * credentials, which is the state Wave A also measured; the report says so and
 * marks the live behaviour NOT VERIFIED rather than claiming it.
 *
 * What the fake does still make decidable is everything the production code
 * actually decides: which columns are projected, whether `decrypt_field` was
 * called at all, whether a reference resolved to one row or refused, and
 * whether `agentScopedDb`'s refusal survives the cast to `DetailDb`.
 */

/**
 * Extra rows the shared ledger does not carry, because the six answers had no
 * use for them: a fleet run, a second run defining the SAME unit id, and an
 * open question.
 *
 * The two `u4`s are the whole point of the ambiguity tests. They are legal —
 * `work_item_engagement_run_unit_key` is `(engagement_id, fleet_run_id, unit)`
 * — and they are what makes "resolve `u4`" a question with no honest answer
 * unless the caller says which run.
 */
function extras(): Record<string, FakeRow[]> {
  const base = ledger();
  return {
    // The SAME ref in a second engagement. Without this row, a batch never
    // spans two engagements, the `.in()` filter on the read does all the
    // scoping by itself, and the in-memory scoping is untested — which is
    // exactly what a mutation run caught.
    requirement: [
      ...base.requirement,
      { id: "req-other-1", engagement_id: OTHER_ENGAGEMENT_ID, ref: "FR-1" },
    ],
    fleet_run: [
      { id: "run-1", engagement_id: ENGAGEMENT_ID, run_id: "aaaa11", branch: "b/1", mode: "full", verdict: "green" },
      { id: "run-2", engagement_id: ENGAGEMENT_ID, run_id: "bbbb22", branch: "b/2", mode: "full", verdict: null },
    ],
    work_item: [
      ...base.work_item,
      // Same unit id, two runs. FR-16 says both are distinct records.
      {
        ...(base.work_item[0] as FakeRow),
        id: "wr1",
        fleet_run_id: "run-1",
        unit: "u4",
        description: "enc:run one's u4",
        raw_status: "enc:done, merged as abc123",
      },
      {
        ...(base.work_item[0] as FakeRow),
        id: "wr2",
        fleet_run_id: "run-2",
        unit: "u4",
      },
      // A work item with no unit at all: `hand` mode carries neither run nor unit.
      {
        ...(base.work_item[0] as FakeRow),
        id: "wh1",
        execution_mode: "hand",
        fleet_run_id: null,
        unit: null,
      },
    ],
    open_question: [
      {
        id: "q1",
        engagement_id: ENGAGEMENT_ID,
        run: "aaaa11",
        unit: "u4",
        section: "§7a",
        question: "enc:Which role may read the amount column?",
        best_guess: "enc:operator only",
        confidence: "med",
        answer: null,
        answered_by: null,
        answered_at: null,
        status: "open",
        source_key: "questions-aaaa11.jsonl#0",
      },
      {
        // No run recorded, so `u4` cannot be narrowed and must dangle.
        id: "q2",
        engagement_id: ENGAGEMENT_ID,
        run: null,
        unit: "u4",
        section: "§5a",
        question: "enc:How does an inline reference show it is a link?",
        best_guess: null,
        confidence: "low",
        answer: "enc:hover underline only",
        answered_by: "erik",
        answered_at: "2026-08-20T09:00:00Z",
        status: "answered",
        source_key: "questions-aaaa11.jsonl#1",
      },
    ],
  };
}

function fake(overrides: Record<string, FakeRow[]> = {}, options = {}): FakeAnswerDb {
  return createFakeAnswerDb({ tables: { ...ledger(), ...extras(), ...overrides }, ...options });
}

function db(overrides: Record<string, FakeRow[]> = {}, options = {}): DetailDb {
  return fake(overrides, options) as unknown as DetailDb;
}

beforeEach(() => {
  resetFakeAnswerIds();
});

// ---------------------------------------------------------------------------
// FR-83 — resolution, and the shape of "resolved to nothing"
// ---------------------------------------------------------------------------

describe("FR-83 — a reference that resolves to nothing is null, and null is a finding", () => {
  it("resolves each of the seven singly-keyed kinds against its natural key", async () => {
    const queries: RefQuery[] = [
      { kind: "requirement", ref: "FR-1", engagementId: ENGAGEMENT_ID },
      { kind: "defect", ref: "D-1", engagementId: ENGAGEMENT_ID },
      { kind: "blocker", ref: "B1", engagementId: ENGAGEMENT_ID },
      { kind: "external_wait", ref: "App Store review", engagementId: ENGAGEMENT_ID },
      { kind: "release", ref: "dpl_1", engagementId: ENGAGEMENT_ID },
      { kind: "contract_milestone", ref: "Registry", engagementId: ENGAGEMENT_ID },
      { kind: "open_question", ref: "questions-aaaa11.jsonl#0", engagementId: ENGAGEMENT_ID },
    ];

    const resolution = await resolveRefs(db(), queries);

    expect(queries.map((query) => resolvedId(resolution, query))).toEqual([
      "req-1",
      "d1",
      "blk-1",
      "wait-1",
      "rel-1",
      "m2",
      "q1",
    ]);
  });

  it("returns an entry for every query, including the ones that resolve to nothing", async () => {
    const queries: RefQuery[] = [
      { kind: "requirement", ref: "FR-1", engagementId: ENGAGEMENT_ID },
      { kind: "requirement", ref: "FR-999", engagementId: ENGAGEMENT_ID },
    ];
    const resolution = await resolveRefs(db(), queries);

    // Present in the map and null — never absent, never dropped, never thrown.
    expect(resolution.size).toBe(2);
    expect(resolution.has(refKey(queries[1]))).toBe(true);
    expect(resolution.get(refKey(queries[1]))).toBeNull();
    expect(danglingQueries(resolution, queries)).toEqual([queries[1]]);
  });

  it("refuses an ambiguous unit id rather than picking one", async () => {
    // Two runs each define `u4`. Without a run there is no honest answer, so
    // the resolver gives none. A resolver that picked the most recent would be
    // right most of the time and silently wrong the rest of it.
    const query: RefQuery = { kind: "work_item", ref: "u4", engagementId: ENGAGEMENT_ID };
    expect(resolvedId(await resolveRefs(db(), [query]), query)).toBeNull();
  });

  it("resolves the same unit id exactly when the caller supplies the run", async () => {
    const first: RefQuery = { kind: "work_item", ref: "u4", engagementId: ENGAGEMENT_ID, runId: "run-1" };
    const second: RefQuery = { kind: "work_item", ref: "u4", engagementId: ENGAGEMENT_ID, runId: "run-2" };
    const resolution = await resolveRefs(db(), [first, second]);

    expect(resolvedId(resolution, first)).toBe("wr1");
    expect(resolvedId(resolution, second)).toBe("wr2");
    // The two queries differ only in the run, so they must not share a key.
    expect(refKey(first)).not.toBe(refKey(second));
  });

  it("resolves a unit id with no run when the engagement holds exactly one", async () => {
    const query: RefQuery = { kind: "work_item", ref: "w5", engagementId: ENGAGEMENT_ID };
    expect(resolvedId(await resolveRefs(db(), [query]), query)).toBe("w5");
  });

  it("resolves the same ref to a different row per engagement, in one batch", async () => {
    // Both engagements hold an `FR-1`. A batch spanning the two is the case the
    // in-memory scoping exists for — the `.in()` filter on the read cannot do
    // it, because the read fetches both engagements' rows at once. A mutation
    // run caught the earlier version of this test passing without it.
    const acme: RefQuery = { kind: "requirement", ref: "FR-1", engagementId: ENGAGEMENT_ID };
    const other: RefQuery = { kind: "requirement", ref: "FR-1", engagementId: OTHER_ENGAGEMENT_ID };
    const resolution = await resolveRefs(db(), [acme, other]);

    expect(resolvedId(resolution, acme)).toBe("req-1");
    expect(resolvedId(resolution, other)).toBe("req-other-1");
  });

  it("does not resolve a reference the engagement does not hold", async () => {
    // `FR-2` exists in acme and nowhere else.
    const query: RefQuery = { kind: "requirement", ref: "FR-2", engagementId: OTHER_ENGAGEMENT_ID };
    expect(resolvedId(await resolveRefs(db(), [query]), query)).toBeNull();
  });

  it("decrypts nothing — resolution is free of decrypt_field", async () => {
    const client = fake();
    await resolveRefs(client as unknown as DetailDb, [
      { kind: "requirement", ref: "FR-1", engagementId: ENGAGEMENT_ID },
      { kind: "work_item", ref: "u4", engagementId: ENGAGEMENT_ID, runId: "run-1" },
      { kind: "contract_milestone", ref: "Registry", engagementId: ENGAGEMENT_ID },
    ]);

    expect(client.rpcCalls).toEqual([]);
    // And no encrypted column was even projected.
    for (const projection of client.projections) {
      expect(projection.columns).not.toMatch(/\b(description|text|question|best_guess|amount|notes|raw_status|answer|wont_fix_reason)\b/);
    }
  });

  it("costs one read per kind, not one per reference", async () => {
    const client = fake();
    const queries: RefQuery[] = ["FR-1", "FR-2", "FR-3", "FR-4", "FR-99"].map((ref) => ({
      kind: "requirement" as const,
      ref,
      engagementId: ENGAGEMENT_ID,
    }));
    await resolveRefs(client as unknown as DetailDb, queries);

    const reads = client.projections.filter((one) => one.table === "requirement");
    expect(reads.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// The eight loaders
// ---------------------------------------------------------------------------

describe("FR-81 — eight loaders, each returning null rather than a half-built page", () => {
  it("answers null for an id no row carries, on every kind", async () => {
    const client = db();
    expect(await loadWorkItemDetail(client, "nope")).toBeNull();
    expect(await loadDefectDetail(client, "nope")).toBeNull();
    expect(await loadBlockerDetail(client, "nope")).toBeNull();
    expect(await loadRequirementDetail(client, "nope")).toBeNull();
    expect(await loadOpenQuestionDetail(client, "nope")).toBeNull();
    expect(await loadExternalWaitDetail(client, "nope")).toBeNull();
    expect(await loadReleaseDetail(client, "nope")).toBeNull();
    expect(await loadContractMilestoneDetail(client, "nope")).toBeNull();
  });

  it("answers null for a whitespace id rather than reading the whole table", async () => {
    expect(await loadWorkItemDetail(db(), "   ")).toBeNull();
  });
});

describe("FR-81 — work_item", () => {
  it("decrypts both of §7a's columns when prose is requested", async () => {
    const detail = await loadWorkItemDetail(db(), "wr1");
    expect(detail?.description).toEqual({ text: "run one's u4", state: "present" });
    expect(detail?.rawStatus).toEqual({ text: "done, merged as abc123", state: "present" });
  });

  it("says `not-requested` rather than empty when prose is declined, and pays nothing", async () => {
    const client = fake();
    const detail = await loadWorkItemDetail(client as unknown as DetailDb, "wr1", {
      withProse: false,
    });

    expect(detail?.description).toEqual({ text: null, state: "not-requested" });
    expect(detail?.rawStatus).toEqual({ text: null, state: "not-requested" });
    expect(client.rpcCalls).toEqual([]);
  });

  it("distinguishes a column that was never written from one that will not decrypt", async () => {
    const client = fake(
      {
        work_item: extras().work_item.map((row) =>
          row.id === "wr1" ? { ...row, description: "enc:broken", raw_status: null } : row,
        ),
      },
      {
        decrypt: (ciphertext: string) =>
          ciphertext === "enc:broken" ? null : ciphertext.replace(/^enc:/, ""),
      },
    );

    const detail = await loadWorkItemDetail(client as unknown as DetailDb, "wr1");

    // Stored and unreadable is a FAULT to show. Never written is an absence.
    // Collapsing them would render a lost field as "there was nothing there".
    expect(detail?.description.state).toBe("unreadable");
    expect(detail?.rawStatus.state).toBe("absent");

    // The control: one bad ciphertext must not take the page down, and the
    // isolating retry must actually have run.
    expect(client.rpcCalls.filter((one) => one.name === "decrypt_field").length).toBeGreaterThan(0);
  });

  it("carries its outbound and inbound references, resolved", async () => {
    const detail = await loadWorkItemDetail(db(), "w5");

    expect(detail?.blocker).toEqual({ kind: "blocker", label: "B1", id: "blk-1" });
    expect(detail?.externalWait).toBeNull();
    expect(detail?.run).toBeNull();

    const w7 = await loadWorkItemDetail(db(), "w7");
    // w8 depends on w7, so w7's INBOUND side names w8.
    expect(w7?.blocks.map((one) => one.id)).toEqual(["w8"]);
    expect(w7?.dependsOn).toEqual([]);

    const w1 = await loadWorkItemDetail(db(), "w1");
    expect(w1?.implementsRequirements).toEqual([
      { kind: "requirement", label: "FR-1", id: "req-1" },
    ]);
    // FR-71: the defect this work item fixes.
    expect(w1?.fixesDefects.map((one) => one.label)).toEqual(["D-1"]);
  });

  it("renders a requirement ref naming nothing as dangling, not as a broken link", async () => {
    const detail = await loadWorkItemDetail(
      db({
        work_item_requirement: [{ id: "wir-x", work_item_id: "w1", requirement_ref: "FR-999" }],
      }),
      "w1",
    );

    const ref = detail?.implementsRequirements[0];
    expect(ref?.id).toBeNull();
    expect(ref?.label).toBe("FR-999");
    // FR-12 requires the ref to be REPORTED. Dropping it would lose the finding.
    expect(entityHref(ref?.kind ?? "", ref?.id ?? "")).toBeNull();
  });

  it("labels a work item that carries no unit id, rather than rendering an empty token", async () => {
    const labels = await labelEntities(db(), "work_item", ["wh1"]);
    expect(labels.get("wh1")).toBeNull();

    const refs = await workItemRefs(db(), ["wh1"]);
    expect(refs.get("wh1")).toEqual({
      kind: "work_item",
      label: fallbackLabel("work_item", "wh1"),
      id: "wh1",
    });
  });

  it("gives the dangling treatment to a uuid that names no row", async () => {
    const refs = await workItemRefs(db(), ["ghost-id"]);
    expect(refs.get("ghost-id")?.id).toBeNull();
    expect(refs.get("ghost-id")?.title).toContain("not a link");
  });
});

describe("FR-81 — defect, blocker, external_wait, release, open_question, contract_milestone", () => {
  it("reads a defect's clear and encrypted columns per §7a and CR-001", async () => {
    const detail = await loadDefectDetail(
      db({
        defect: ledger().defect.map((row) =>
          row.id === "d1"
            ? { ...row, description: "enc:the POST body is rejected", raw_severity: "Critical" }
            : row,
        ),
      }),
      "d1",
    );

    // `title` is §7a's stated exception and comes back clear.
    expect(detail?.title).toBe("checkout 500s on submit");
    expect(detail?.description).toEqual({ text: "the POST body is rejected", state: "present" });
    expect(detail?.rawSeverity).toBe("Critical");
    expect(detail?.requirement).toEqual({ kind: "requirement", label: "FR-1", id: "req-1" });
    expect(detail?.fixingWorkItem).toEqual({ kind: "work_item", label: "w1", id: "w1" });
    // FR-66: `test_case.covers` holds D-nn refs too. None here names D-1.
    expect(detail?.tests).toEqual([]);
  });

  it("reads a blocker and the work it holds", async () => {
    const detail = await loadBlockerDetail(db(), "blk-1");
    expect(detail?.ref).toBe("B1");
    expect(detail?.description).toEqual({
      text: "Client has not returned the signed change order.",
      state: "present",
    });
    expect(detail?.blocks.map((one) => one.id)).toEqual(["w5"]);
  });

  it("reads an external wait with no decryption at all — §7a leaves `reason` clear", async () => {
    const client = fake();
    const detail = await loadExternalWaitDetail(client as unknown as DetailDb, "wait-1");

    expect(detail?.reason).toBe("submitted build 42");
    expect(detail?.blocks.map((one) => one.id)).toEqual(["w6"]);
    expect(client.rpcCalls).toEqual([]);
  });

  it("reads a release and the requirements it names", async () => {
    const client = fake();
    const detail = await loadReleaseDetail(client as unknown as DetailDb, "rel-1");

    expect(detail?.environment).toBe("production");
    expect(detail?.requirements).toEqual([
      { kind: "requirement", label: "FR-1", id: "req-1" },
    ]);
    expect(client.rpcCalls).toEqual([]);
  });

  it("resolves an open question's (run, unit) pair through fleet_run", async () => {
    const detail = await loadOpenQuestionDetail(db(), "q1");
    expect(detail?.question).toEqual({
      text: "Which role may read the amount column?",
      state: "present",
    });
    expect(detail?.answer).toEqual({ text: null, state: "absent" });
    expect(detail?.workItem).toEqual({ kind: "work_item", label: "u4", id: "wr1" });
  });

  it("dangles an open question's work item when the pair cannot be narrowed", async () => {
    const detail = await loadOpenQuestionDetail(db(), "q2");
    // `u4` exists twice and q2 records no run, so there is no honest target.
    expect(detail?.workItem?.id).toBeNull();
    expect(detail?.workItem?.label).toBe("u4");
    expect(detail?.answer).toEqual({ text: "hover underline only", state: "present" });
  });

  it("decrypts a milestone amount and keeps `0` apart from `could not read`", async () => {
    const detail = await loadContractMilestoneDetail(db(), "m2");
    expect(detail?.amount).toBe(2500);
    expect(detail?.amountUnreadable).toBe(false);
    expect(detail?.acceptance).toEqual([
      { kind: "requirement", label: "FR-2", id: "req-2" },
    ]);

    const priced = await loadContractMilestoneDetail(
      db({
        contract_milestone: ledger().contract_milestone.map((row) =>
          row.id === "m2" ? { ...row, amount: null } : row,
        ),
      }),
      "m2",
    );
    expect(priced?.amount).toBeNull();
    // Nobody priced it. That is not a fault and must carry no warning.
    expect(priced?.amountUnreadable).toBe(false);

    const broken = await loadContractMilestoneDetail(
      db(
        {
          contract_milestone: ledger().contract_milestone.map((row) =>
            row.id === "m2" ? { ...row, amount: "enc:broken" } : row,
          ),
        },
        { decrypt: (ciphertext: string) => (ciphertext === "enc:broken" ? null : ciphertext.replace(/^enc:/, "")) },
      ),
      "m2",
    );
    expect(broken?.amount).toBeNull();
    // Stored and unreadable. A number Erik would put in an invoice is missing,
    // and the screen has to be able to say so.
    expect(broken?.amountUnreadable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FR-82 — the four relationships, and that none of them is a second derivation
// ---------------------------------------------------------------------------

describe("FR-82 — a requirement's four relationships, shown together", () => {
  it("lists work items, tests, defects and releases for one requirement", async () => {
    const detail = await loadRequirementDetail(db(), "req-1");

    expect(detail?.ref).toBe("FR-1");
    expect(detail?.workItems.map((one) => one.unit)).toEqual(["w1"]);
    expect(detail?.tests.map((one) => one.id).sort()).toEqual(["t1", "t3"]);
    expect(detail?.defects.map((one) => one.ref.label)).toEqual(["D-1"]);
    expect(detail?.releases.map((one) => one.identifier)).toEqual(["dpl_1"]);
  });

  it("takes FR-47 and FR-49's verdicts from indexCoverage, matching /untested exactly", async () => {
    // The four requirements in this ledger are four different coverage states
    // by construction. If this layer had its own implementation, one of these
    // four would drift — and the first to go would be unproven versus
    // uncovered, which FR-49 exists to keep apart.
    const answer = await untestedAnswer(db(), { engagement: ENGAGEMENT });
    const report = answer.engagements.find((one) => one.engagement === ENGAGEMENT);
    expect(report).toBeDefined();

    for (const [id, ref] of [
      ["req-1", "FR-1"],
      ["req-2", "FR-2"],
      ["req-3", "FR-3"],
      ["req-4", "FR-4"],
    ] as const) {
      const detail = await loadRequirementDetail(db(), id);
      const expected = report?.unproven.includes(ref)
        ? "unproven"
        : report?.uncovered.includes(ref)
          ? "uncovered"
          : "covered";
      expect(detail?.coverage, `${ref} disagrees with /untested`).toBe(expected);
    }

    // And the states really are three different ones, or the loop above proves
    // nothing: an assertion that both sides agree on one constant is vacuous.
    const states = await Promise.all(
      ["req-1", "req-3", "req-4"].map(async (id) => (await loadRequirementDetail(db(), id))?.coverage),
    );
    expect(new Set(states)).toEqual(new Set(["covered", "unproven", "uncovered"]));
  });

  it("marks a self-certified test rather than dropping it", async () => {
    // t3 covers FR-1 and is certified by the executor who built w1 (FR-47).
    const detail = await loadRequirementDetail(db(), "req-1");
    const t3 = detail?.tests.find((one) => one.id === "t3");
    expect(t3?.selfCertified).toBe(true);
    expect(detail?.tests.find((one) => one.id === "t1")?.selfCertified).toBe(false);
  });

  it("carries each test's latest result, and null for a test that never ran", async () => {
    const detail = await loadRequirementDetail(db(), "req-3");
    const t4 = detail?.tests.find((one) => one.id === "t4");
    expect(t4?.latest?.status).toBe("pass");
    // FR-49: the evidence exists and nobody checked it against the deployment.
    expect(t4?.latest?.evidenceScope).toBe("not-verified");

    const never = await loadRequirementDetail(db({ test_result: [] }), "req-3");
    expect(never?.tests.find((one) => one.id === "t4")?.latest).toBeNull();
  });

  it("takes shipped environments from shippedIndex, as a set and not a boolean", async () => {
    const shipped = await loadRequirementDetail(db(), "req-1");
    expect(shipped?.shippedEnvironments).toEqual(["production"]);

    const unshipped = await loadRequirementDetail(db(), "req-2");
    expect(unshipped?.shippedEnvironments).toEqual([]);
    expect(unshipped?.releases).toEqual([]);
  });

  it("names the milestones whose acceptance criteria reach it, without reading an amount", async () => {
    const client = fake();
    const detail = await loadRequirementDetail(client as unknown as DetailDb, "req-1");

    expect(detail?.milestones).toEqual([
      { kind: "contract_milestone", label: "Phase 1 delivery", id: "m1" },
    ]);
    for (const projection of client.projections.filter((one) => one.table === "contract_milestone")) {
      expect(projection.columns).not.toContain("amount");
    }
  });
});

// ---------------------------------------------------------------------------
// FR-86 / §7a — the refusal survives this layer
// ---------------------------------------------------------------------------

describe("FR-86 — this layer adds no decryption surface an agent token can reach", () => {
  it("still refuses contract_milestone through agentScopedDb, cast or no cast", async () => {
    // The cast to `DetailDb` is compile-time. `agentScopedDb` is a runtime
    // Proxy and cannot be cast away, which is the whole reason FR-5's
    // enforcement is allowed to live in the application.
    const scoped = agentScopedDb(fake() as object) as unknown as DetailDb;

    await expect(loadContractMilestoneDetail(scoped, "m2")).rejects.toThrow(
      /contract_milestone/,
    );
    await expect(
      resolveRefs(scoped, [
        { kind: "contract_milestone", ref: "Registry", engagementId: ENGAGEMENT_ID },
      ]),
    ).rejects.toThrow(/contract_milestone/);
  });

  it("keeps the operator's own reads working through the unscoped client", async () => {
    // The control for the assertion above: without it, a refusal that fired for
    // some unrelated reason would look identical to the one under test.
    expect((await loadContractMilestoneDetail(db(), "m2"))?.name).toBe("Registry");
  });
});

// ---------------------------------------------------------------------------
// The seam Wave C renders against
// ---------------------------------------------------------------------------

describe("the published contract", () => {
  it("returns refs whose kind is one of FR-81's eight and whose id builds an href", async () => {
    const detail = await loadWorkItemDetail(db(), "w1");
    const refs: DetailRef[] = [
      ...(detail?.blocker === null || detail?.blocker === undefined ? [] : [detail.blocker]),
      ...(detail?.dependsOn ?? []),
      ...(detail?.implementsRequirements ?? []),
      ...(detail?.blocks ?? []),
      ...(detail?.fixesDefects ?? []),
    ];

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      expect(ENTITY_KINDS as readonly string[]).toContain(ref.kind);
      // A resolved ref always produces an href; a dangling one never does.
      const href = ref.id === null ? null : entityHref(ref.kind, ref.id);
      expect(href === null).toBe(ref.id === null);
    }
  });

  it("builds a distinct key for every dimension a reference can be scoped by", () => {
    const base: RefQuery = { kind: "release", ref: "dpl_1", engagementId: ENGAGEMENT_ID };
    const keys = new Set([
      refKey(base),
      refKey({ ...base, environment: "production" }),
      refKey({ ...base, environment: "preview" }),
      refKey({ ...base, engagementId: OTHER_ENGAGEMENT_ID }),
      refKey({ ...base, kind: "requirement" as EntityKind }),
    ]);
    expect(keys.size).toBe(5);
  });
});

describe("paging is not decorative", () => {
  it("reads every dependency edge when the response cap is below the row count", async () => {
    // The fake truncates at `maxRows` exactly as PostgREST does — silently,
    // with `error: null`. Without real paging this returns 2 and the work item
    // renders as depending on almost nothing, which reads as "ready to start".
    const edges: FakeRow[] = Array.from({ length: 7 }, (_, index) => ({
      id: `dep-x${index}`,
      work_item_id: "w9",
      depends_on_id: "w7",
    }));

    const detail = await loadWorkItemDetail(
      db({ work_item_dependency: edges }, { maxRows: 2 }),
      "w9",
    );
    expect(detail?.dependsOn.length).toBe(7);
  });
});

describe("a failed read is reported, never rendered as an empty relationship", () => {
  it("throws rather than answering that a blocker holds nothing", async () => {
    await expect(
      loadBlockerDetail(db({}, { fail: { work_item: { message: "refused" } } }), "blk-1"),
    ).rejects.toThrow(/work_item/);
  });
});

describe("FR-87 / FR-91 — the work-item detail carries planned and its timestamp", () => {
  function withPlanned(): Record<string, FakeRow[]> {
    return {
      work_item: [
        ...extras().work_item,
        {
          id: "wp1",
          engagement_id: ENGAGEMENT_ID,
          execution_mode: null,
          executor_kind: "unassigned",
          status: "pending",
          updated_at: "2026-07-25T09:00:00Z",
        },
      ],
    };
  }

  it("FR-87 marks the planned row planned and leaves an ingested one alone", async () => {
    const planned = await loadWorkItemDetail(db(withPlanned()), "wp1");
    expect(planned?.planned).toBe(true);

    const ingested = await loadWorkItemDetail(db(), "w1");
    expect(ingested?.planned).toBe(false);
  });

  it("FR-91 carries updated_at, and the projection names it", async () => {
    const client = fake(withPlanned());
    const detail = await loadWorkItemDetail(client as unknown as DetailDb, "wp1");
    expect(detail?.updatedAt).toBe("2026-07-25T09:00:00Z");

    // The fake records the projection rather than applying it, so the value
    // above would survive the column being dropped from the select. This does
    // not.
    const projections = client.projections
      .filter((one) => one.table === "work_item")
      .map((one) => one.columns);
    expect(projections.some((columns) => columns.includes("updated_at"))).toBe(true);
  });
});
