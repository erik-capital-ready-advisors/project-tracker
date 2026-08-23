import { describe, it, expect } from "vitest";
import { currentCoverage, findRegressions, latestResults } from "./regressions";
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

const ran = (
  testId: string,
  status: TestResult["status"],
  runAt: string,
  certifiedBy = "qa-reviewer",
): TestResult => ({ testId, status, evidenceScope: "observed-live", certifiedBy, runAt });

/** History is supplied in append order, oldest first. */
const history = (tests: TestCase[], results: TestResult[]): CoverageInput => ({
  requirements: [requirement(1), requirement(2)],
  workItems: [workItem("i1", "api-integrator", ["FR-1", "FR-2"])],
  tests,
  results,
});

describe("latestResults", () => {
  it("FR-69 keeps the last result per test and discards the superseded ones", () => {
    const latest = latestResults([
      ran("t1", "pass", "2026-08-01"),
      ran("t1", "fail", "2026-08-02"),
      ran("t2", "pass", "2026-08-03"),
    ]);
    expect(latest).toHaveLength(2);
    expect(latest.find((one) => one.testId === "t1")?.status).toBe("fail");
  });
});

describe("findRegressions", () => {
  it("FR-69 reports a test whose latest result is a failure after an earlier pass", () => {
    const report = findRegressions(
      history(
        [testCase("t1", ["FR-1"])],
        [ran("t1", "pass", "2026-08-01"), ran("t1", "fail", "2026-08-02")],
      ),
    );
    expect(report.tests).toEqual([
      { testId: "t1", lastPassedAt: "2026-08-01", failedAt: "2026-08-02" },
    ]);
  });

  it("FR-69 does not call a test that has only ever failed a regression", () => {
    const report = findRegressions(
      history(
        [testCase("t1", ["FR-1"])],
        [ran("t1", "fail", "2026-08-01"), ran("t1", "fail", "2026-08-02")],
      ),
    );
    expect(report.tests).toEqual([]);
  });

  it("FR-69 does not call a test that failed and was then fixed a regression", () => {
    const report = findRegressions(
      history(
        [testCase("t1", ["FR-1"])],
        [ran("t1", "fail", "2026-08-01"), ran("t1", "pass", "2026-08-02")],
      ),
    );
    expect(report.tests).toEqual([]);
    expect(report.requirements).toEqual([]);
  });

  it("FR-69 reports a requirement that was covered under FR-47 and is not now", () => {
    const report = findRegressions(
      history(
        [testCase("t1", ["FR-1"])],
        [ran("t1", "pass", "2026-08-01"), ran("t1", "fail", "2026-08-02")],
      ),
    );
    expect(report.requirements).toEqual([{ ref: "FR-1", failingTests: ["t1"] }]);
  });

  it("FR-69 does not report a requirement that was never covered", () => {
    const report = findRegressions(
      history([testCase("t1", ["FR-1"])], [ran("t1", "fail", "2026-08-01")]),
    );
    expect(report.requirements).toEqual([]);
  });

  it("FR-69 reports the two kinds separately — a red test whose requirement is still covered", () => {
    // t1 goes red but t2 still covers FR-1, so there is a test regression and
    // no requirement regression. Collapsing the two kinds into one number
    // would report this milestone as broken when its coverage is intact.
    const report = findRegressions(
      history(
        [testCase("t1", ["FR-1"]), testCase("t2", ["FR-1"])],
        [
          ran("t1", "pass", "2026-08-01"),
          ran("t1", "fail", "2026-08-02"),
          ran("t2", "pass", "2026-08-03"),
        ],
      ),
    );
    expect(report.tests.map((one) => one.testId)).toEqual(["t1"]);
    expect(report.requirements).toEqual([]);
  });

  it("FR-69 reports a requirement regression with no test going red at all", () => {
    // The mirror case, and the reason the second kind is not derivable from the
    // first: t1 keeps passing, but the latest run was certified by the executor
    // of the work item implementing FR-1. The covering condition under FR-47 no
    // longer holds even though nothing is failing.
    const report = findRegressions(
      history(
        [testCase("t1", ["FR-1"])],
        [
          ran("t1", "pass", "2026-08-01", "qa-reviewer"),
          ran("t1", "pass", "2026-08-02", "api-integrator"),
        ],
      ),
    );
    expect(report.tests).toEqual([]);
    expect(report.requirements).toEqual([{ ref: "FR-1", failingTests: [] }]);
  });
});

describe("currentCoverage", () => {
  it("FR-69 covers a requirement on the strength of the latest result, not an old one", () => {
    const input = history(
      [testCase("t1", ["FR-1"])],
      [ran("t1", "pass", "2026-08-01"), ran("t1", "fail", "2026-08-02")],
    );
    expect(currentCoverage(input).covered.has("FR-1")).toBe(false);
  });

  it("FR-69 covers a requirement whose latest result still passes", () => {
    const input = history(
      [testCase("t1", ["FR-1"])],
      [ran("t1", "fail", "2026-08-01"), ran("t1", "pass", "2026-08-02")],
    );
    expect(currentCoverage(input).covered.has("FR-1")).toBe(true);
  });
});
