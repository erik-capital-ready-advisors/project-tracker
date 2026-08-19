import { describe, it, expect } from "vitest";
import { committedReport } from "./committed";
import { deriveDefectStatuses } from "./defects";
import { shippedIndex } from "./releases";
import type { CommittedInput } from "./committed";
import type { CoverageInput } from "./coverage";
import type {
  Defect, Milestone, Release, Requirement, TestCase, TestResult, WorkItem,
} from "./types";

const requirement = (n: number): Requirement => ({
  id: `tracker:FR-${n}`, engagement: "tracker", ref: `FR-${n}`, text: `requirement ${n}`,
});

const workItem = (unit: string, executor: string, covers: string[]): WorkItem => ({
  id: unit, engagement: "tracker", run: "zz01", unit,
  executionMode: "fleet", workType: "integration", phase: "1",
  description: null, executor, executorKind: "agent", status: "done",
  unautomatedReason: null, unautomatedDisposition: null, evidenceScope: null,
  notVerifiedCount: 0, dependsOn: [], implements: covers, blocker: null, rawStatus: null,
});

const testCase = (id: string, covers: string[]): TestCase => ({
  id, engagement: "tracker", harness: "vitest", file: "x.test.ts",
  title: covers.join(" "), covers, authoredBy: null,
});

const ran = (
  testId: string, status: TestResult["status"], runAt: string,
): TestResult => ({
  testId, status, evidenceScope: "observed-live", certifiedBy: "qa-reviewer", runAt,
});

const defect = (over: Partial<Defect> = {}): Defect => ({
  id: "d1", engagement: "tracker", ref: "D-1", source: "qa_agent",
  severity: "critical", rawSeverity: "Critical", title: "anon can write",
  description: null, status: "open", wontFixReason: null,
  requirementRef: "FR-1", fixingWorkItem: null, reportedAt: null, reportedBy: null,
  ...over,
});

const milestone: Milestone = {
  id: "M1.1", engagement: "tracker", name: "Foundation", amount: null,
  due: null, acceptance: ["FR-1", "FR-2"], submitted: null, paid: null,
};

const coverage = (results: TestResult[]): CoverageInput => ({
  requirements: [requirement(1), requirement(2)],
  workItems: [workItem("i1", "api-integrator", ["FR-1", "FR-2"])],
  tests: [testCase("t1", ["FR-1"]), testCase("t2", ["FR-2"])],
  results,
});

const GREEN = [ran("t1", "pass", "2026-08-01"), ran("t2", "pass", "2026-08-01")];

const releases: Release[] = [{
  id: "r1", engagement: "tracker", identifier: "v1", environment: "production",
  url: null, deployedAt: "2026-08-18", source: "declared", recordedBy: "erik",
}];

const report = (over: Partial<CommittedInput> = {}) => {
  const input: CommittedInput = {
    milestones: [milestone],
    coverage: coverage(GREEN),
    defects: [],
    verdicts: new Map(),
    shipped: shippedIndex(releases, [{ releaseId: "r1", ref: "FR-1" }]),
    ...over,
  };
  return committedReport(input)[0];
};

describe("committedReport", () => {
  it("FR-75 asks covered and shipped as two questions and never collapses them", () => {
    // FR-1 is both covered and shipped; FR-2 is covered and not shipped. Built
    // and deployed are different claims, exactly as FR-43 says for evidence.
    const one = report();
    expect(one.covered).toEqual(["FR-1", "FR-2"]);
    expect(one.shipped).toEqual(["FR-1"]);
    expect(one.notShipped).toEqual(["FR-2"]);
  });

  it("FR-75 reports a shipped requirement that is not covered", () => {
    const one = report({ coverage: coverage([ran("t1", "pass", "2026-08-01")]) });
    expect(one.shipped).toEqual(["FR-1"]);
    expect(one.notCovered).toEqual(["FR-2"]);
    expect(one.state).toBe("open");
  });

  it("FR-75 narrows shipped to one environment when asked", () => {
    expect(report({ environment: "preview" }).shipped).toEqual([]);
    expect(report({ environment: "production" }).shipped).toEqual(["FR-1"]);
  });

  it("FR-50 makes a fully covered milestone billable", () => {
    expect(report().state).toBe("billable");
    expect(report().contested).toBe(false);
  });

  it("FR-70 closes the invoice gate when a covering test goes red", () => {
    // The observation FR-70 exists to force. No new rule produces this: the
    // milestone is billable on the green history and leaves that state on the
    // red one, because a regression removes the FR-47 coverage FR-50 requires.
    const before = report();
    expect(before.state).toBe("billable");

    const after = report({
      coverage: coverage([...GREEN, ran("t1", "fail", "2026-08-02")]),
    });
    expect(after.state).not.toBe("billable");
    // `open`, not `claimed`: `claimed` is billing.ts's word for "passes, but
    // only on the builder's own say-so". A red test is not a weak claim, it is
    // no claim at all.
    expect(after.state).toBe("open");
    expect(after.notCovered).toEqual(["FR-1"]);
    expect(after.regressed).toEqual(["FR-1"]);
  });

  it("FR-79 reports a billable milestone with an open critical defect as contested", () => {
    const one = report({ defects: [defect()] });
    expect(one.state).toBe("billable");
    expect(one.contested).toBe(true);
    expect(one.contestingDefects).toEqual(["d1"]);
  });

  it("FR-79 clears contested when the defect is downgraded", () => {
    const one = report({ defects: [defect({ severity: "major" })] });
    expect(one.state).toBe("billable");
    expect(one.contested).toBe(false);
    expect(one.contestingDefects).toEqual([]);
  });

  it("FR-79 clears contested when the defect is resolved", () => {
    const waived = defect({ status: "wont_fix", wontFixReason: "client accepted the risk" });
    const verdicts = deriveDefectStatuses({
      defects: [waived], workItems: [], tests: [], results: [],
    });
    expect(report({ defects: [waived], verdicts }).contested).toBe(false);
  });

  it("FR-79 ignores a critical defect naming a requirement outside the acceptance set", () => {
    expect(report({ defects: [defect({ requirementRef: "FR-9" })] }).contested).toBe(false);
  });

  it("FR-79 does not contest a milestone that was not billable to begin with", () => {
    // Contested is billable-and-flagged. A milestone that is merely `open`
    // stays `open` — it is not billable, so there is nothing to contest.
    const one = report({
      coverage: coverage([ran("t1", "pass", "2026-08-01")]),
      defects: [defect()],
    });
    expect(one.state).toBe("open");
    expect(one.contested).toBe(false);
  });

  it("FR-79 flags an ungraded defect separately instead of showing the milestone clean", () => {
    // An `unparsed` severity is not a critical one and does not contest. It is
    // also not nothing: the milestone carries a finding nobody has read, and
    // the report says so rather than presenting a clean billable line.
    const one = report({ defects: [defect({ severity: "unparsed", rawSeverity: "Blocker" })] });
    expect(one.contested).toBe(false);
    expect(one.unclassifiedDefects).toEqual(["d1"]);
  });
});
