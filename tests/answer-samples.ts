/**
 * Fabricated answers for the six screens' component tests.
 *
 * ## These are NOT fixtures
 *
 * `tests/fixtures/` holds byte copies of real fleet artifacts and the rule there
 * is absolute: when a test fails, fix the parser, never the fixture. This file
 * is the opposite kind of thing — hand-written objects shaped to exercise the
 * *rendering* of distinctions the requirements say must not collapse. Nothing
 * here claims to be real, nothing is parsed from it, and no parser is tested
 * against it.
 *
 * ## Every value is invented, and none of it resembles a client
 *
 * The engagement slugs, client names, defect titles and amounts are deliberately
 * generic. A test file is a committed file, and §7a's whole posture on
 * `defect.description` and `work_item.description` is that client prose does not
 * belong in the clear. It does not belong in a test file either.
 *
 * ## What each sample is shaped to prove
 *
 * Each one carries **both sides of a distinction the spec forbids collapsing**,
 * so a test can assert they render differently and a mutation that merges them
 * turns the suite red:
 *
 *   * `BLOCKED` — a `carried` row and a `closed` row (FR-30); an item held by a
 *     blocker and one held by a wait; two owners, so the grouping is visible.
 *   * `NEXT` — a dated milestone and an undated one, so "nearest" can be checked.
 *   * `COMMITTED` — `open`, `claimed`, `billable` and a contested billable
 *     (FR-51, FR-79); a milestone covered but not shipped and one shipped but
 *     not covered (FR-75); an unreadable amount beside a zero one.
 *   * `COVERAGE` — uncovered, unproven and self-certified all non-empty at once
 *     (FR-48, FR-49, FR-55), plus an uncovered requirement nothing implements.
 *   * `BOTTLENECK` — an `erik` row and an `erik_gate` row (FR-40); a transitive
 *     count that differs from the direct one.
 *   * `BROKEN` — all four severities including `unparsed` (FR-63/FR-64); a
 *     defect whose derived status disagrees with its recorded one (FR-66); a
 *     requirement regression with **no** failing test (FR-69's second kind, the
 *     case a merged number would hide).
 */

import type { BlockedAnswer } from "@/lib/server/answers/blocked";
import type { BottleneckAnswer } from "@/lib/server/answers/bottleneck";
import type { BrokenEngagement } from "@/lib/server/answers/broken";
import type { CommittedMilestone } from "@/lib/server/answers/committed";
import type { NextAnswer } from "@/lib/server/answers/next";
import type { EngagementCoverage } from "@/lib/server/answers/untested";

/* ---------------------------------------------------------------- FR-52 */

export const BLOCKED: BlockedAnswer = {
  itemCount: 3,
  waitCount: 2,
  engagementUnknown: false,
  groups: [
    {
      owner: "erik",
      longestDays: 21,
      items: [
        {
          id: "wi-1",
          engagement: "northwind",
          unit: "u7",
          workType: "ui",
          status: "blocked",
          executor: "ui-designer",
          executorKind: "agent",
          disposition: "carried",
          heldBy: ["status", "blocker"],
          blockerRef: "b-1",
          description: null,
          blockerDescription: null,
          waitLabel: null,
          startedOn: "2026-07-29T00:00:00.000Z",
          daysElapsed: 21,
        },
        {
          id: "wi-2",
          engagement: "northwind",
          unit: "u8",
          workType: "integration",
          status: "blocked",
          executor: null,
          executorKind: "erik_gate",
          // FR-30: decided against, not still owned. Must not render as `carried`.
          disposition: "closed",
          heldBy: ["status"],
          blockerRef: null,
          description: null,
          blockerDescription: null,
          waitLabel: null,
          startedOn: "2026-08-14T00:00:00.000Z",
          daysElapsed: 5,
        },
      ],
      waits: [
        {
          id: "w-1",
          engagement: "northwind",
          label: "App Store review",
          ownerType: "vendor",
          reason: "Submitted build 42; review queue quoted at five days.",
          startedOn: "2026-08-05T00:00:00.000Z",
          expectedBy: "2026-08-12",
          daysWaiting: 14,
          overdue: true,
          blocks: ["u9", "u10"],
        },
      ],
    },
    {
      owner: "client",
      longestDays: 3,
      items: [
        {
          id: "wi-3",
          engagement: "acme",
          unit: "u2",
          workType: "copy",
          status: "blocked",
          executor: "copywriter",
          executorKind: "agent",
          // A third case: nothing recorded. Not the same as `closed`.
          disposition: null,
          heldBy: ["wait"],
          blockerRef: null,
          description: null,
          blockerDescription: null,
          waitLabel: "Brand sign-off",
          startedOn: null,
          // No start date means no elapsed figure. Must not render as `0 days`.
          daysElapsed: null,
        },
      ],
      waits: [
        {
          id: "w-2",
          engagement: "acme",
          label: "Brand sign-off",
          ownerType: "client",
          reason: null,
          startedOn: "2026-08-16T00:00:00.000Z",
          expectedBy: null,
          daysWaiting: 3,
          overdue: false,
          blocks: [],
        },
      ],
    },
  ],
};

/* ---------------------------------------------------------------- FR-53 */

export const NEXT: NextAnswer = {
  ordering: "milestone-due-date",
  orderingUnavailableReason: null,
  unparsedCandidates: 4,
  heldByDependency: 6,
  heldByBlocker: 2,
  truncated: false,
  engagementUnknown: false,
  items: [
    {
      id: "wi-10",
      engagement: "northwind",
      unit: "u3",
      workType: "ui",
      phase: "1",
      status: "pending",
      executor: "ui-designer",
      executorKind: "agent",
      description: null,
      implements: ["FR-52", "FR-53"],
      planned: false,
      updatedAt: "2026-08-20T09:00:00Z",
      unblocks: 5,
      nearestMilestone: { id: "m-1", name: "Phase 1 delivery", due: "2026-09-01" },
    },
    {
      id: "wi-11",
      engagement: "acme",
      unit: "u4",
      workType: "docs",
      phase: null,
      status: "not_dispatched",
      executor: null,
      executorKind: "erik",
      description: null,
      implements: ["FR-77"],
      planned: false,
      updatedAt: "2026-08-20T09:00:00Z",
      unblocks: 0,
      // Undated: never nearer than a dated one, and never further away either.
      nearestMilestone: { id: "m-2", name: "Handover", due: null },
    },
    {
      id: "wi-12",
      engagement: "acme",
      unit: null,
      workType: null,
      phase: null,
      status: "pending",
      executor: "api-integrator",
      executorKind: "agent",
      description: null,
      implements: [],
      planned: false,
      updatedAt: "2026-08-20T09:00:00Z",
      unblocks: 1,
      nearestMilestone: null,
    },
  ],
};

/** The same answer with FR-53's ordering unavailable, for the degradation test. */
export const NEXT_DEGRADED: NextAnswer = {
  ...NEXT,
  ordering: "fallback",
  orderingUnavailableReason:
    "FR-53 orders Next by the nearest dated milestone each item serves, which " +
    "requires contract_milestone.due_date.",
};

/* ------------------------------------------------------------ FR-54/75 */

export const COMMITTED: CommittedMilestone[] = [
  {
    milestone: "m-1",
    name: "Phase 1 delivery",
    engagement: "northwind",
    clientName: "Northwind",
    state: "billable",
    contested: false,
    contestingDefects: [],
    unclassifiedDefects: [],
    covered: ["FR-52", "FR-53"],
    notCovered: [],
    // FR-75: fully covered, shipped to nothing. Two different claims.
    shipped: [],
    notShipped: ["FR-52", "FR-53"],
    regressed: [],
    amount: 12500,
    amountUnreadable: false,
    currency: "EUR",
    due: "2026-09-01",
    acceptance: ["FR-52", "FR-53"],
    submitted: null,
    paid: null,
    shippedEnvironments: { "FR-52": [], "FR-53": [] },
  },
  {
    milestone: "m-2",
    name: "Discovery",
    engagement: "northwind",
    clientName: "Northwind",
    // FR-51: a review request, not an invoice. Must not render as `billable`.
    state: "claimed",
    contested: false,
    contestingDefects: [],
    unclassifiedDefects: ["d-9"],
    covered: [],
    notCovered: ["FR-01"],
    shipped: ["FR-01"],
    notShipped: [],
    regressed: [],
    amount: 0,
    amountUnreadable: false,
    currency: "EUR",
    due: "2026-08-01",
    acceptance: ["FR-01"],
    submitted: "2026-08-02",
    paid: null,
    shippedEnvironments: { "FR-01": ["production"] },
  },
  {
    milestone: "m-3",
    name: "Integration",
    engagement: "northwind",
    clientName: "Northwind",
    // FR-79: billable AND flagged. Both facts must survive on the row.
    state: "billable",
    contested: true,
    contestingDefects: ["d-1", "d-2"],
    unclassifiedDefects: [],
    covered: ["FR-20", "FR-21"],
    notCovered: [],
    shipped: ["FR-20"],
    notShipped: ["FR-21"],
    regressed: ["FR-21"],
    // An amount that would not decrypt. Distinct from the `0` above.
    amount: null,
    amountUnreadable: true,
    currency: "EUR",
    due: "2026-09-15",
    acceptance: ["FR-20", "FR-21"],
    submitted: "2026-09-16",
    paid: "2026-09-30",
    shippedEnvironments: { "FR-20": ["preview", "production"], "FR-21": [] },
  },
  {
    milestone: "m-4",
    name: "Scoping",
    engagement: "acme",
    clientName: "Acme",
    state: "open",
    contested: false,
    contestingDefects: [],
    unclassifiedDefects: [],
    covered: [],
    notCovered: ["FR-30"],
    shipped: [],
    notShipped: ["FR-30"],
    regressed: [],
    amount: 3000,
    amountUnreadable: false,
    currency: "EUR",
    due: null,
    acceptance: ["FR-30"],
    submitted: null,
    paid: null,
    shippedEnvironments: { "FR-30": [] },
  },
];

/* ------------------------------------------------------------- FR-48/49/55 */

export const COVERAGE: EngagementCoverage = {
  engagement: "northwind",
  clientName: "Northwind",
  requirements: 9,
  tests: 14,
  mapped: 11,
  uncovered: ["FR-31", "FR-32"],
  unproven: ["FR-33"],
  selfCertified: ["t-1"],
  uncoveredDetail: [
    {
      ref: "FR-31",
      implementedBy: [
        {
          id: "wi-20",
          unit: "u5",
          status: "done",
          executor: "api-integrator",
          executorKind: "agent",
        },
      ],
    },
    // Nothing claims to implement this one — a different and worse finding.
    { ref: "FR-32", implementedBy: [] },
  ],
  selfCertifiedDetail: [
    {
      id: "t-1",
      file: "src/lib/ingest/coverage.test.ts",
      title: "FR-47 rejects a certifier who executed the work",
      harness: "vitest",
      covers: ["FR-47"],
      certifiedBy: "api-integrator",
      authoredBy: "api-integrator",
    },
  ],
};

/* ---------------------------------------------------------------- FR-56 */

export const BOTTLENECK: BottleneckAnswer = {
  ranking: "unblocks-then-milestone",
  rankingDegradedReason: null,
  unparsedExcluded: 3,
  truncated: false,
  engagementUnknown: false,
  items: [
    {
      id: "wi-30",
      engagement: "northwind",
      unit: "u1",
      workType: "provisioning",
      status: "pending",
      executor: null,
      executorKind: "erik_gate",
      description: null,
      unautomatedReason: "credential_required",
      disposition: "carried",
      // Transitive far exceeds direct — the number the reader cannot check by eye.
      planned: false,
      updatedAt: "2026-08-20T09:00:00Z",
      unblocks: 12,
      directDependents: 2,
      alsoHeld: false,
      nearestMilestone: { id: "m-1", name: "Phase 1 delivery", due: "2026-09-01" },
    },
    {
      id: "wi-31",
      engagement: "acme",
      unit: "u6",
      workType: "review",
      status: "blocked",
      executor: "erik",
      executorKind: "erik",
      description: null,
      unautomatedReason: null,
      disposition: null,
      planned: false,
      updatedAt: "2026-08-20T09:00:00Z",
      unblocks: 1,
      directDependents: 1,
      alsoHeld: true,
      nearestMilestone: null,
    },
  ],
};

export const BOTTLENECK_DEGRADED: BottleneckAnswer = {
  ...BOTTLENECK,
  ranking: "unblocks-only",
  rankingDegradedReason:
    "FR-56 ranks Bottleneck by downstream work unblocked AND by the nearest " +
    "milestone at risk. The second half requires contract_milestone.due_date.",
};

/* ------------------------------------------------------------- FR-69/71 */

export const BROKEN: BrokenEngagement = {
  engagement: "northwind",
  clientName: "Northwind",
  openDefectCount: 3,
  bySeverity: [
    {
      severity: "critical",
      defects: [
        {
          id: "d-1",
          ref: "D-1",
          title: "checkout 500s on submit",
          severity: "critical",
          // Derived says open; somebody recorded `fixed`. Both are shown.
          status: "open",
          recordedStatus: "fixed",
          blockedBy: "self-certified",
          selfCertifiedTests: ["t-9"],
          source: "qa_agent",
          reportedAt: "2026-08-10T00:00:00.000Z",
          reportedBy: "qa-reviewer",
          requirementRef: "FR-20",
          workItem: { id: "wi-40", unit: "u4", executor: "api-integrator" },
          tests: [{ id: "t-9", file: "e2e/checkout.spec.ts", title: "D-1 checkout" }],
        },
      ],
    },
    {
      severity: "major",
      defects: [
        {
          id: "d-2",
          ref: "D-2",
          title: "session token not rotated on sign-out",
          severity: "major",
          status: "open",
          recordedStatus: "open",
          blockedBy: "no-passing-test",
          selfCertifiedTests: [],
          source: "operator",
          reportedAt: null,
          reportedBy: null,
          requirementRef: null,
          workItem: null,
          tests: [],
        },
      ],
    },
    // Present and empty: an absent bucket and an empty one look the same to a
    // reader scanning for the worst, and only one of them means "none".
    { severity: "minor", defects: [] },
    {
      severity: "unparsed",
      defects: [
        {
          id: "d-3",
          ref: null,
          title: "layout shifts on the pricing table",
          severity: "unparsed",
          status: "unparsed",
          recordedStatus: "unparsed",
          blockedBy: null,
          selfCertifiedTests: [],
          source: "qa_agent",
          reportedAt: "2026-08-18T00:00:00.000Z",
          reportedBy: "qa-reviewer",
          requirementRef: null,
          workItem: null,
          tests: [],
        },
      ],
    },
  ],
  testRegressions: [
    {
      testId: "t-20",
      file: "src/lib/ingest/committed.test.ts",
      title: "FR-51 reports a self-certified milestone as claimed",
      harness: "vitest",
      covers: ["FR-51"],
      lastPassedAt: "2026-08-12T00:00:00.000Z",
      failedAt: "2026-08-18T00:00:00.000Z",
    },
  ],
  requirementRegressions: [
    // FR-69's second kind with no failing test at all — the case that would
    // vanish if the two kinds were merged into one number.
    { ref: "FR-47", failingTests: [], implementedBy: [{ id: "wi-50", unit: "u2", executor: "api-integrator" }] },
  ],
};
