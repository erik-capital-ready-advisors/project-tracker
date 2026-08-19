import { describe, it, expect } from "vitest";
import {
  checkDefectRefs,
  deriveDefectStatuses,
  isUnresolved,
  parseQaFindings,
  reactivations,
} from "./defects";
import { validateDefect } from "./types";
import {
  QA_REPORT,
  QA_REPORT_CLEAN,
  QA_REPORT_UNKNOWN_SHAPES,
} from "./__fixtures__/qaReport";
import type {
  Defect,
  Engagement,
  Requirement,
  TestCase,
  TestResult,
  WorkItem,
} from "./types";

const defect = (over: Partial<Defect> = {}): Defect => ({
  id: "tracker:d1", engagement: "tracker", ref: "D-1", source: "qa_agent",
  severity: "critical", rawSeverity: "Critical", title: "anon can write",
  description: null, status: "open", wontFixReason: null,
  requirementRef: null, fixingWorkItem: null, reportedAt: null, reportedBy: null,
  ...over,
});

const workItem = (id: string, executor: string | null): WorkItem => ({
  id, engagement: "tracker", run: "zz01", unit: id,
  executionMode: "fleet", workType: "integration", phase: "1",
  description: null, executor, executorKind: "agent", status: "done",
  unautomatedReason: null, unautomatedDisposition: null, evidenceScope: null,
  notVerifiedCount: 0, dependsOn: [], implements: [], blocker: null, rawStatus: null,
});

const testCase = (id: string, title: string): TestCase => ({
  id, engagement: "tracker", harness: "vitest", file: "x.test.ts",
  title, covers: [], authoredBy: null,
});

const pass = (testId: string, certifiedBy: string | null): TestResult => ({
  testId, status: "pass", evidenceScope: "observed-live", certifiedBy, runAt: "2026-08-18",
});

/**
 * Two parties whose roles cross: `w1` is built by api-integrator and certified
 * by qa-reviewer, `w2` the reverse. A fixture with one actor satisfies both the
 * correct predicate and the widened one, so it cannot tell them apart and every
 * assertion passes under a broken implementation. This one goes red under the
 * widened form, which is the whole reason it is shaped this way.
 */
const CROSSING = {
  workItems: [workItem("w1", "api-integrator"), workItem("w2", "qa-reviewer")],
  tests: [testCase("t1", "D-1 anon write is refused"), testCase("t2", "D-2 limiter trips")],
  results: [pass("t1", "qa-reviewer"), pass("t2", "api-integrator")],
};

describe("parseQaFindings", () => {
  it("FR-64 reads every graded finding out of the Issues section", () => {
    const { defects } = parseQaFindings(QA_REPORT, "tracker", "qa-report-zz01.md");
    expect(defects.map((one) => one.title)).toEqual([
      "Anon role can write the ledger table",
      "RLS claimed but never probed",
      "Rate limit missing on the ingest route",
      "Fragile test selectors",
    ]);
    expect(defects.map((one) => one.severity)).toEqual([
      "critical", "critical", "major", "minor",
    ]);
  });

  it("FR-64 maps the QA agent's `important` onto `major` and keeps its own word", () => {
    // Erik's two vocabularies disagree: the report grades `Important`, FR-63
    // fixes the enum as `major`. Record both rather than resolving it silently.
    const { defects } = parseQaFindings(QA_REPORT, "tracker", "qa-report-zz01.md");
    const rate = defects[2];
    expect(rate.severity).toBe("major");
    expect(rate.rawSeverity).toBe("Important");
  });

  it("FR-64 stores a finding under a heading it does not know as unparsed", () => {
    const { defects, unparsed } = parseQaFindings(
      QA_REPORT_UNKNOWN_SHAPES, "tracker", "qa-report-zz02.md",
    );
    expect(defects).toHaveLength(3);
    expect(defects.every((one) => one.severity === "unparsed")).toBe(true);
    expect(unparsed).toBe(3);
    // The artifact's own word survives, so a human can see what was refused.
    expect(defects.map((one) => one.rawSeverity)).toEqual([null, "Blocker", "Nitpick"]);
  });

  it("FR-64 counts nothing unparsed when every heading is known", () => {
    expect(parseQaFindings(QA_REPORT, "tracker", "r.md").unparsed).toBe(0);
  });

  it("FR-64 yields no defects from a report with no Issues section", () => {
    expect(parseQaFindings(QA_REPORT_CLEAN, "tracker", "r.md").defects).toEqual([]);
  });

  it("FR-64 captures the finding body as the description", () => {
    const { defects } = parseQaFindings(QA_REPORT, "tracker", "r.md");
    expect(defects[0].description).toContain("the grant block hands");
    expect(defects[0].description).toContain("anon PATCH observed 204");
  });

  it("FR-65 reads the requirement a finding names, and nothing where it names none", () => {
    const { defects } = parseQaFindings(QA_REPORT, "tracker", "r.md");
    expect(defects[0].requirementRef).toBe("FR-6");
    expect(defects[1].requirementRef).toBeNull();
  });

  it("FR-64 leaves ref and fixing work item unset for the persistence layer", () => {
    const { defects } = parseQaFindings(QA_REPORT, "tracker", "r.md");
    // `D-nn` is per-engagement and a pure function has no high-water mark; the
    // report template carries no fixing-work-item field at all.
    expect(defects.every((one) => one.ref === null)).toBe(true);
    expect(defects.every((one) => one.fixingWorkItem === null)).toBe(true);
    expect(defects.every((one) => one.source === "qa_agent")).toBe(true);
  });
});

describe("checkDefectRefs", () => {
  const requirement: Requirement = {
    id: "tracker:FR-6", engagement: "tracker", ref: "FR-6", text: "requirement 6",
  };

  it("FR-65 reports a requirement reference that does not exist", () => {
    const errors = checkDefectRefs(
      [defect({ requirementRef: "FR-999" })], [requirement], [workItem("w1", "erik")],
    );
    expect(errors).toEqual(["defect D-1: requirement FR-999 does not exist"]);
  });

  it("FR-65 reports a fixing work item that does not exist", () => {
    const errors = checkDefectRefs(
      [defect({ fixingWorkItem: "w9" })], [requirement], [workItem("w1", "erik")],
    );
    expect(errors).toEqual(["defect D-1: fixing work item w9 does not exist"]);
  });

  it("FR-65 accepts references that resolve", () => {
    const errors = checkDefectRefs(
      [defect({ requirementRef: "FR-6", fixingWorkItem: "w1" })],
      [requirement],
      [workItem("w1", "erik")],
    );
    expect(errors).toEqual([]);
  });
});

describe("deriveDefectStatuses", () => {
  const verdict = (one: Defect, over: Partial<typeof CROSSING> = {}) =>
    deriveDefectStatuses({ defects: [one], ...CROSSING, ...over }).get(one.id);

  it("FR-66 verifies when the certifier is not the executor of the fixing work item", () => {
    expect(verdict(defect({ ref: "D-1", fixingWorkItem: "w1" }))).toEqual({
      status: "verified", selfCertified: [], blockedBy: null,
    });
  });

  it("FR-66 refuses a test certified by the executor of the fixing work item", () => {
    // w2's executor is qa-reviewer and t1 is certified by qa-reviewer, so
    // pointing D-1's fix at w2 makes the certifier the author of the fix.
    expect(verdict(defect({ ref: "D-1", fixingWorkItem: "w2" }))).toEqual({
      status: "open", selfCertified: ["t1"], blockedBy: "self-certified",
    });
  });

  it("FR-66 still verifies a certifier who executed some other work item", () => {
    // The control for the widened-join bug, and the reason this fixture holds
    // two parties. qa-reviewer executes w2, so a check comparing the certifier
    // against every executor in the ENGAGEMENT rejects its legitimate
    // certification of w1's fix; the same widening rejects api-integrator's
    // certification of w2's fix. Both must stand. Measured on run b0952e: with
    // one actor in the fixture, every other assertion here passes under the
    // widened implementation too.
    const verdicts = deriveDefectStatuses({
      defects: [
        defect({ id: "d1", ref: "D-1", fixingWorkItem: "w1" }),
        defect({ id: "d2", ref: "D-2", fixingWorkItem: "w2" }),
      ],
      ...CROSSING,
    });
    expect(verdicts.get("d1")?.status).toBe("verified");
    expect(verdicts.get("d2")?.status).toBe("verified");
  });

  it("FR-66 withholds verification when no test names the defect", () => {
    expect(verdict(defect({ ref: "D-7", fixingWorkItem: "w1" }))).toEqual({
      status: "open", selfCertified: [], blockedBy: "no-passing-test",
    });
  });

  it("FR-66 ignores a failing test that names the defect", () => {
    const failing: TestResult = { ...pass("t1", "qa-reviewer"), status: "fail" };
    expect(
      verdict(defect({ ref: "D-1", fixingWorkItem: "w1" }), { results: [failing] }),
    ).toMatchObject({ status: "open", blockedBy: "no-passing-test" });
  });

  it("FR-66 will not verify a defect with no fixing work item", () => {
    // Nothing to be independent of. The condition is vacuous, not satisfied,
    // and a vacuous pass here is exactly the wrong `done` this product exists
    // to prevent.
    expect(verdict(defect({ ref: "D-1", fixingWorkItem: null }))).toEqual({
      status: "open", selfCertified: [], blockedBy: "no-fixing-executor",
    });
  });

  it("FR-66 will not verify when the fixing work item has no recorded executor", () => {
    expect(
      verdict(defect({ ref: "D-1", fixingWorkItem: "w3" }), {
        workItems: [...CROSSING.workItems, workItem("w3", null)],
      }),
    ).toMatchObject({ blockedBy: "no-fixing-executor" });
  });

  it("FR-66 will not verify a defect with no reference of its own", () => {
    expect(verdict(defect({ ref: null, fixingWorkItem: "w1" }))).toMatchObject({
      blockedBy: "no-passing-test",
    });
  });

  it("FR-67 leaves wont_fix alone and never promotes it to verified", () => {
    const one = defect({
      ref: "D-1", fixingWorkItem: "w1", status: "wont_fix", wontFixReason: "by design",
    });
    expect(verdict(one)).toEqual({ status: "wont_fix", selfCertified: [], blockedBy: null });
    // FR-67: a decision, filterable and distinct from verified.
    expect(isUnresolved("wont_fix")).toBe(false);
    expect(isUnresolved("verified")).toBe(false);
    expect(isUnresolved("fixed")).toBe(true);
    expect(isUnresolved("unparsed")).toBe(true);
  });
});

describe("validateDefect", () => {
  it("FR-66 refuses a defect that arrives already claiming verified", () => {
    expect(validateDefect(defect({ status: "verified" }))).toEqual([
      "defect tracker:d1: status=verified is derived under FR-66, never recorded",
    ]);
  });

  it("FR-67 refuses wont_fix with no stated reason", () => {
    expect(validateDefect(defect({ status: "wont_fix" }))).toEqual([
      "defect tracker:d1: status=wont_fix with no stated reason (FR-67)",
    ]);
  });

  it("FR-67 accepts wont_fix once the reason is stated", () => {
    expect(
      validateDefect(defect({ status: "wont_fix", wontFixReason: "client withdrew it" })),
    ).toEqual([]);
  });

  it("FR-63 refuses a severity outside the closed set", () => {
    expect(validateDefect({ ...defect(), severity: "blocker" })).toEqual([
      'defect tracker:d1: severity="blocker" not one of critical, major, minor, unparsed',
    ]);
  });

  it("FR-63 accepts a parsed finding whose severity is unparsed", () => {
    expect(validateDefect(defect({ severity: "unparsed", rawSeverity: "Blocker" }))).toEqual([]);
  });
});

describe("reactivations", () => {
  const engagements: Engagement[] = [
    { id: "e1", slug: "tracker", archivedAt: "2026-07-01" },
    { id: "e2", slug: "live", archivedAt: null },
  ];

  it("FR-68 surfaces an archived engagement carrying an unresolved defect", () => {
    const one = defect({ id: "d1", engagement: "tracker" });
    const verdicts = deriveDefectStatuses({ defects: [one], ...CROSSING });
    expect(reactivations(engagements, [one], verdicts)).toEqual([
      { engagement: "tracker", defects: ["d1"] },
    ]);
  });

  it("FR-68 leaves an archived engagement alone once its defects are resolved", () => {
    const one = defect({
      id: "d1", engagement: "tracker", ref: "D-1", fixingWorkItem: "w1",
    });
    const verdicts = deriveDefectStatuses({ defects: [one], ...CROSSING });
    expect(verdicts.get("d1")?.status).toBe("verified");
    expect(reactivations(engagements, [one], verdicts)).toEqual([]);
  });

  it("FR-68 does not surface a live engagement, whatever its defects", () => {
    const one = defect({ id: "d1", engagement: "live" });
    const verdicts = deriveDefectStatuses({ defects: [one], ...CROSSING });
    expect(reactivations(engagements, [one], verdicts)).toEqual([]);
  });
});
