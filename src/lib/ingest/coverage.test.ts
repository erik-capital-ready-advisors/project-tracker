import { describe, it, expect } from "vitest";
import { indexCoverage, untestedReport } from "./coverage";
import type { CoverageInput } from "./coverage";
import type { Requirement, TestCase, TestResult, WorkItem } from "./types";

const requirement = (n: number): Requirement => ({
  id: `tracker:FR-${n}`, engagement: "tracker", ref: `FR-${n}`, text: `requirement ${n}`,
});

const workItem = (unit: string, executor: string, covers: string[]): WorkItem => ({
  id: `tracker:zz01:${unit}`, engagement: "tracker", run: "zz01", unit,
  executionMode: "fleet", workType: "integration", phase: "1",
  description: null, executor, executorKind: "agent", status: "done",
  unautomatedReason: null, unautomatedDisposition: null, evidenceScope: null,
  notVerifiedCount: 0, dependsOn: [], implements: covers, blocker: null, rawStatus: null,
});

const testCase = (id: string, covers: string[]): TestCase => ({
  id, engagement: "tracker", harness: "vitest", file: "x.test.ts",
  title: covers.join(" "), covers, authoredBy: null,
});

const result = (
  testId: string,
  certifiedBy: string | null,
  evidenceScope: TestResult["evidenceScope"] = "observed-live",
): TestResult => ({ testId, status: "pass", evidenceScope, certifiedBy, runAt: "2026-08-17" });

const input = (tests: TestCase[], results: TestResult[]): CoverageInput => ({
  requirements: [requirement(1), requirement(2)],
  workItems: [workItem("i1", "api-integrator", ["FR-1", "FR-2"])],
  tests,
  results,
});

describe("indexCoverage", () => {
  it("FR-48 leaves every requirement uncovered when no test names one", () => {
    const report = untestedReport(input([], []));
    expect(report).toMatchObject({ requirements: 2, tests: 0, mapped: 0 });
    expect(report.uncovered).toEqual(["FR-1", "FR-2"]);
  });

  it("FR-47 counts a passing test certified by someone else", () => {
    const report = untestedReport(
      input([testCase("t1", ["FR-1"])], [result("t1", "qa-reviewer")]),
    );
    expect(report.mapped).toBe(1);
    expect(report.uncovered).toEqual(["FR-2"]);
  });

  it("FR-47 refuses a test certified by the executor of the work it covers", () => {
    // `i1` implements FR-1 and was executed by api-integrator, so an
    // api-integrator certification is the author signing off on itself.
    const report = untestedReport(
      input([testCase("t1", ["FR-1"])], [result("t1", "api-integrator")]),
    );
    expect(report.uncovered).toContain("FR-1");
    expect(report.selfCertified).toEqual(["t1"]);
  });

  it("FR-47 refuses a passing test with no certifier at all", () => {
    const report = untestedReport(
      input([testCase("t1", ["FR-1"])], [result("t1", null)]),
    );
    expect(report.uncovered).toContain("FR-1");
  });

  it("FR-49 reports a requirement proven only by not-verified evidence as unproven", () => {
    const report = untestedReport(
      input([testCase("t1", ["FR-1"])], [result("t1", "qa-reviewer", "not-verified")]),
    );
    expect(report.unproven).toEqual(["FR-1"]);
    expect(report.uncovered).toContain("FR-1");
  });

  it("FR-51 records a claim separately from a covering", () => {
    const index = indexCoverage(
      input([testCase("t1", ["FR-1"])], [result("t1", "api-integrator")]),
    );
    expect(index.claimed.has("FR-1")).toBe(true);
    expect(index.covered.has("FR-1")).toBe(false);
  });

  it("FR-47 still accepts qa-reviewer when qa-reviewer executed some other unit", () => {
    // The control for the widened-join bug: on a real fleet run the QA
    // work-unit is itself a work item whose executor is `qa-reviewer`. A check
    // that compares the certifier against every executor in the ENGAGEMENT
    // rejects this legitimate certification and leaves every milestone
    // permanently un-billable. The join must run through the requirement.
    const report = untestedReport({
      requirements: [requirement(1), requirement(2)],
      workItems: [
        workItem("i1", "api-integrator", ["FR-1", "FR-2"]),
        workItem("q1", "qa-reviewer", []),
      ],
      tests: [testCase("t1", ["FR-1"])],
      results: [result("t1", "qa-reviewer")],
    });
    expect(report.mapped).toBe(1);
    expect(report.selfCertified).toEqual([]);
  });

  it("FR-48 ignores a failing test entirely", () => {
    const failing: TestResult = { ...result("t1", "qa-reviewer"), status: "fail" };
    const report = untestedReport(input([testCase("t1", ["FR-1"])], [failing]));
    expect(report.mapped).toBe(0);
  });
});
