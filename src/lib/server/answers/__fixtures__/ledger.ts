/**
 * A ledger fixture built to catch a widened certifier join.
 *
 * ## Why the actors cross, and why that is the whole design
 *
 * FR-47's rule is: *a requirement is covered only when a passing test names it
 * and that test's certifier differs from the executor of the work item
 * implementing the requirement.* The join runs
 * `requirement → the work item that implemented it → that item's executor`.
 *
 * The plausible wrong implementation compares the certifier against **every
 * executor in the input** instead. i2 measured that `plan.md`'s own seven-
 * assertion coverage fixture could not tell the two apart — it wrote the widened
 * form and all seven assertions still passed — because the fixture held a single
 * actor, and with one actor "is this person the executor of *that* item" and "is
 * this person an executor *at all*" are the same question.
 *
 * So this fixture holds **two parties whose roles cross**:
 *
 * | | builds | certifies |
 * |---|---|---|
 * | `api-integrator` | `w1` (FR-1), `w3` (FR-3) | `t3` on FR-1 |
 * | `qa-reviewer`    | `w2` (FR-2)              | `t1` on FR-1, `t2` on FR-2, `t4` on FR-3 |
 *
 * `qa-reviewer` is itself an executor. Under the correct join it may certify
 * FR-1, because it did not build `w1`. Under the widened join it may certify
 * nothing, because it appears in the executor set. That single difference is
 * what `answers.test.ts`'s mutation 1 exercises, and it is why FR-1 is expected
 * `covered` rather than expected `self-certified`.
 *
 * ## The four requirements are four different coverage states, on purpose
 *
 * | Ref | Built by | Test | Certifier | Result | Expected |
 * |---|---|---|---|---|---|
 * | FR-1 | `api-integrator` | `t1` | `qa-reviewer` | pass, observed-live | **covered** |
 * | FR-2 | `qa-reviewer` | `t2` | `qa-reviewer` | pass, observed-live | **self-certified** (FR-47) |
 * | FR-3 | `api-integrator` | `t4` | `qa-reviewer` | pass, **not-verified** | **unproven** (FR-49) |
 * | FR-4 | `api-integrator` (`w4`) | — | — | — | **uncovered** |
 *
 * `t3` also covers FR-1 and is certified by `api-integrator`, which built `w1` —
 * so it is a self-certified test on a requirement that is nonetheless covered by
 * `t1`. That pair is the control proving the rule bites at all: without it, a
 * mutation that simply stopped reporting self-certification would go unnoticed.
 *
 * ## Milestones map one-to-one onto those states
 *
 * `m1` → FR-1 → `billable`. `m2` → FR-2 → `claimed` (FR-51). `m3` → FR-3, FR-4
 * → `open`.
 *
 * ## Nothing here is a real credential or a real client
 *
 * `enc:` is the fake's stand-in for pgcrypto ciphertext — a prefix, not a
 * cipher, so no key and nothing key-shaped exists in this file.
 */

import type { FakeRow } from "./fake-answer-db";

export const ENGAGEMENT = "acme";
export const ENGAGEMENT_ID = "eng-acme";
export const OTHER_ENGAGEMENT_ID = "eng-other";

export const BUILDER = "api-integrator";
export const CERTIFIER = "qa-reviewer";

/** Two distinct actors, named once so a test cannot accidentally use one twice. */
export const ACTORS = { BUILDER, CERTIFIER } as const;

export interface Ledger {
  [table: string]: FakeRow[];
}

/**
 * The base ledger.
 *
 * Every id is a readable string rather than a uuid so a failing assertion names
 * the row it is about. The production code treats them as opaque, which is why
 * the substitution is safe.
 */
export function ledger(): Ledger {
  return {
    engagement: [
      { id: ENGAGEMENT_ID, slug: ENGAGEMENT, client_name: "Acme Corp" },
      { id: OTHER_ENGAGEMENT_ID, slug: "other", client_name: "Other Client" },
    ],

    requirement: [
      { id: "req-1", engagement_id: ENGAGEMENT_ID, ref: "FR-1" },
      { id: "req-2", engagement_id: ENGAGEMENT_ID, ref: "FR-2" },
      { id: "req-3", engagement_id: ENGAGEMENT_ID, ref: "FR-3" },
      { id: "req-4", engagement_id: ENGAGEMENT_ID, ref: "FR-4" },
    ],

    work_item: [
      row("w1", { executor: BUILDER, status: "done" }),
      row("w2", { executor: CERTIFIER, status: "done" }),
      row("w3", { executor: BUILDER, status: "done" }),
      // FR-4's implementer, still to do, and the one thing `next` should offer.
      row("w4", { executor: BUILDER, status: "pending", started_at: "2026-08-10T09:00:00Z" }),
      // Held by an unresolved blocker: FR-52's `blocker` reason.
      row("w5", {
        executor: BUILDER,
        status: "pending",
        blocker_id: "blk-1",
        started_at: "2026-08-01T09:00:00Z",
      }),
      // Held by an unresolved wait: FR-52's `wait` reason.
      row("w6", {
        executor: null,
        executor_kind: "client",
        status: "pending",
        external_wait_id: "wait-1",
        started_at: "2026-08-05T09:00:00Z",
      }),
      // Erik's own work, with two dependents: FR-56's top row.
      row("w7", {
        executor: "erik",
        executor_kind: "erik_gate",
        status: "pending",
        unautomated_reason: "no_agent_for_stack",
        disposition: "carried",
        started_at: "2026-07-20T09:00:00Z",
      }),
      row("w8", { executor: BUILDER, status: "pending" }),
      row("w9", { executor: BUILDER, status: "pending" }),
      // A status nobody could classify. Counted by FR-58, excluded from Next.
      row("w10", { executor: BUILDER, status: "unparsed" }),
    ],

    work_item_requirement: [
      { id: "wir-1", work_item_id: "w1", requirement_ref: "FR-1" },
      { id: "wir-2", work_item_id: "w2", requirement_ref: "FR-2" },
      { id: "wir-3", work_item_id: "w3", requirement_ref: "FR-3" },
      { id: "wir-4", work_item_id: "w4", requirement_ref: "FR-4" },
    ],

    // w8 and w9 wait on w7; w9 also waits on w8, so w7's TRANSITIVE reach is 2
    // and its DIRECT reach is 2 as well — deliberately different from the
    // 1-direct/2-transitive shape, so a test can tell the two numbers apart.
    work_item_dependency: [
      { id: "dep-1", work_item_id: "w8", depends_on_id: "w7" },
      { id: "dep-2", work_item_id: "w9", depends_on_id: "w8" },
    ],

    blocker: [
      {
        id: "blk-1",
        engagement_id: ENGAGEMENT_ID,
        ref: "B1",
        // Null on purpose: `DEFAULT_BLOCKER_OWNER` must fill it, and Erik's
        // decision was that the default is `erik` and never `client`.
        owner: null,
        opened_at: "2026-08-01T09:00:00Z",
        resolved_at: null,
        disposition: "carried",
      },
      {
        id: "blk-2",
        engagement_id: ENGAGEMENT_ID,
        ref: "B2",
        owner: "acme-it",
        opened_at: "2026-07-01T09:00:00Z",
        resolved_at: "2026-07-15T09:00:00Z",
        disposition: "closed",
      },
    ],

    external_wait: [
      {
        id: "wait-1",
        engagement_id: ENGAGEMENT_ID,
        label: "App Store review",
        owner: "apple",
        owner_type: "vendor",
        reason: "submitted build 42",
        started_at: "2026-08-05T09:00:00Z",
        expected_by: "2026-08-12",
        resolved_at: null,
      },
      {
        id: "wait-2",
        engagement_id: ENGAGEMENT_ID,
        label: "Signed contract",
        owner: null,
        owner_type: "client",
        reason: null,
        started_at: "2026-08-14T09:00:00Z",
        expected_by: null,
        resolved_at: null,
      },
    ],

    test_case: [
      test("t1", "FR-1 covers the happy path"),
      test("t2", "FR-2 covers the registry write"),
      test("t3", "FR-1 covers the boundary case"),
      test("t4", "FR-3 covers the projection"),
    ],

    // Append order is history order; `run_at` orders them.
    test_result: [
      result("tr-1", "t1", "pass", "observed_live", CERTIFIER, "2026-08-18T10:00:00Z"),
      result("tr-2", "t2", "pass", "observed_live", CERTIFIER, "2026-08-18T10:01:00Z"),
      result("tr-3", "t3", "pass", "observed_live", BUILDER, "2026-08-18T10:02:00Z"),
      result("tr-4", "t4", "pass", "not_verified", CERTIFIER, "2026-08-18T10:03:00Z"),
    ],

    contract_milestone: [
      milestone("m1", "Phase 1 delivery", "enc:5000", "2026-09-01"),
      milestone("m2", "Registry", "enc:2500", "2026-09-15"),
      milestone("m3", "Reporting", "enc:7500", null),
    ],

    acceptance_criterion: [
      { id: "ac-1", milestone_id: "m1", requirement_ref: "FR-1" },
      { id: "ac-2", milestone_id: "m2", requirement_ref: "FR-2" },
      { id: "ac-3", milestone_id: "m3", requirement_ref: "FR-3" },
      { id: "ac-4", milestone_id: "m3", requirement_ref: "FR-4" },
    ],

    defect: [
      {
        id: "d1",
        engagement_id: ENGAGEMENT_ID,
        ref: "D-1",
        source: "qa_agent",
        severity: "critical",
        title: "checkout 500s on submit",
        status: "open",
        requirement_ref: "FR-1",
        fixing_work_item_id: "w1",
        reported_at: "2026-08-17T09:00:00Z",
        reported_by: CERTIFIER,
      },
      {
        id: "d2",
        engagement_id: ENGAGEMENT_ID,
        ref: "D-2",
        // FR-64: a finding the parser could not grade. It is a bucket on Broken
        // and a row in the FR-58 census, never a hidden remainder.
        severity: "unparsed",
        source: "qa_agent",
        title: "something about the sidebar",
        status: "open",
        requirement_ref: null,
        fixing_work_item_id: null,
        reported_at: "2026-08-17T09:05:00Z",
        reported_by: CERTIFIER,
      },
    ],

    release: [
      {
        id: "rel-1",
        engagement_id: ENGAGEMENT_ID,
        identifier: "dpl_1",
        environment: "production",
        url: "https://acme.example.com",
        deployed_at: "2026-08-18T12:00:00Z",
        source: "ingested",
        recorded_by: "devops",
      },
    ],

    release_requirement: [
      { id: "rr-1", release_id: "rel-1", requirement_ref: "FR-1" },
    ],
  };
}

function row(id: string, overrides: FakeRow): FakeRow {
  return {
    id,
    engagement_id: ENGAGEMENT_ID,
    fleet_run_id: null,
    unit: id,
    execution_mode: "fleet",
    work_type: "integration",
    phase: 1,
    executor: null,
    executor_kind: "agent",
    status: "pending",
    unautomated_reason: null,
    disposition: null,
    evidence_scope: null,
    not_verified_count: 0,
    blocker_id: null,
    external_wait_id: null,
    started_at: null,
    ended_at: null,
    ...overrides,
  };
}

function test(id: string, title: string): FakeRow {
  return {
    id,
    engagement_id: ENGAGEMENT_ID,
    harness: "vitest",
    file: `src/${id}.test.ts`,
    title,
    covers: title.match(/\bFR-\d+\b/g) ?? [],
    authored_by: BUILDER,
    certified_by: CERTIFIER,
  };
}

function result(
  id: string,
  testCaseId: string,
  status: string,
  evidenceScope: string | null,
  certifiedBy: string | null,
  runAt: string,
): FakeRow {
  return {
    id,
    test_case_id: testCaseId,
    status,
    evidence_scope: evidenceScope,
    evidence_ref: null,
    run_at: runAt,
    certified_by: certifiedBy,
  };
}

function milestone(
  id: string,
  name: string,
  amount: string,
  due: string | null,
): FakeRow {
  return {
    id,
    engagement_id: ENGAGEMENT_ID,
    name,
    amount,
    currency: "USD",
    due_date: due,
    submitted_at: null,
    paid_at: null,
  };
}
