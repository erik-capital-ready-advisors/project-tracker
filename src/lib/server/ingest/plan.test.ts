import { describe, it, expect } from "vitest";

import { MANIFEST } from "@/lib/ingest/__fixtures__/manifest";
import { QUESTION_FILES } from "@/lib/ingest/__fixtures__/questions";
import {
  QA_REPORT,
  QA_REPORT_CLEAN,
  QA_REPORT_EDITED_IN_PLACE,
  QA_REPORT_UNKNOWN_SHAPES,
} from "@/lib/ingest/__fixtures__/qaReport";
import {
  CHECKPOINT,
  PROD_MD,
  QA_REPORT_WITH_GATES,
} from "@/lib/ingest/__fixtures__/runState";

import { planRun, type RunArtifacts } from "./plan";

const ARTIFACTS: RunArtifacts = {
  engagementSlug: "widget",
  runId: "zz01",
  manifests: [{ name: "manifest-zz01.md", text: MANIFEST }],
  questionFiles: QUESTION_FILES,
  specText: "FR-1 first. FR-2 second.",
  testFiles: [{ path: "tests/shell.spec.ts", source: `it("FR-1 renders", () => {});` }],
  prodMdText: PROD_MD,
  checkpointText: CHECKPOINT,
  qaReportText: QA_REPORT_WITH_GATES,
};

describe("planRun", () => {
  const plan = planRun(ARTIFACTS);

  it("FR-22 the same artifacts produce a byte-identical plan", () => {
    // Idempotency starts here: every natural key is a function of the artifacts
    // and of nothing else — no clock, no random id, no row order from a read.
    expect(JSON.stringify(planRun(ARTIFACTS))).toBe(JSON.stringify(plan));
  });

  it("FR-14 reads every work-unit row from the manifest", () => {
    expect(plan.workItems.map((item) => item.unit)).toEqual([
      "r1", "u1", "i1", "i2", "u2", "u3", "d1", "q1",
    ]);
  });

  it("FR-15 carries the classified status through to the row", () => {
    const byUnit = Object.fromEntries(plan.workItems.map((i) => [i.unit, i.status]));
    expect(byUnit.u2).toBe("pending");
    expect(byUnit.u3).toBe("superseded");
    expect(byUnit.d1).toBe("blocked");
    expect(byUnit.r1).toBe("done");
  });

  it("FR-15 an unparsed status reaches the database as unparsed, unrepaired", () => {
    const unknown = planRun({
      ...ARTIFACTS,
      manifests: [
        {
          name: "manifest-zz01.md",
          text: [
            "## Work-units",
            "| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |",
            "|---|---|---|---|---|---|---|",
            "| x1 | ui | 1 | Something | ui-designer | — | nearly finished |",
          ].join("\n"),
        },
      ],
    });
    expect(unknown.workItems[0].status).toBe("unparsed");
    expect(unknown.summary.unparsedWorkItems).toBe(1);
  });

  it("FR-15 the raw status cell survives verbatim next to the classification", () => {
    const u3 = plan.workItems.find((item) => item.unit === "u3");
    expect(u3?.raw_status).toContain("superseded by u2");
  });

  it("FR-19 expands requirement ranges into per-work-item links", () => {
    const i1 = plan.workItemRequirements
      .filter((link) => link.unit === "i1")
      .map((link) => link.requirement_ref);
    expect(i1).toEqual(["FR-6", "FR-7", "FR-8", "FR-9"]);
  });

  it("FR-14 records the depends-on edges as unit pairs", () => {
    expect(plan.dependencies).toContainEqual({ unit: "i2", dependsOnUnit: "i1" });
    expect(plan.dependencies).toContainEqual({ unit: "i2", dependsOnUnit: "u1" });
  });

  it("maps the hyphenated reason vocabulary onto the Postgres enum labels", () => {
    const d1 = plan.workItems.find((item) => item.unit === "d1");
    expect(d1?.unautomated_reason).toBe("credential_absent");
    expect(d1?.disposition).toBe("carried");
  });

  it("FR-18 gives every question a source key of filename and ordinal", () => {
    expect(plan.questions.map((q) => q.source_key)).toEqual([
      "questions-zz01.jsonl#0",
      "questions-zz01.jsonl#1",
      "questions-zz02.jsonl#0",
      "questions-u2-zz01.jsonl#0",
      "questions-i4-zz01.jsonl#0",
    ]);
  });

  it("FR-18 normalizes the answered record and leaves the rest open", () => {
    const answered = plan.questions.filter((q) => q.status === "answered");
    expect(answered).toHaveLength(1);
    expect(answered[0].answered_by).toBe("erik");
    expect(answered[0].answer).toBe("Soft delete");
  });

  it("a confidence outside low/med/high becomes null rather than rounding to med", () => {
    const plan2 = planRun({
      ...ARTIFACTS,
      questionFiles: [
        {
          name: "questions-zz01.jsonl",
          text: `{"unit":"i1","question":"Q?","confidence":"fairly sure"}`,
        },
      ],
    });
    expect(plan2.questions[0].confidence).toBeNull();
    expect(plan2.summary.unmappable).toContainEqual({
      field: "open_question.confidence",
      value: "fairly sure",
    });
  });

  it("FR-21 merges the QA gates with the checkpoint's build gate", () => {
    expect(plan.fleetRun.gates).toEqual({
      build: "PASS",
      typecheck: "PASS",
      lint: "FAIL",
      playwright: "FAIL",
      accessibility: "unparsed",
      build_after_phase1: "PASS",
    });
  });

  it("FR-21 records the reported counts, the verdict, the branch and the mode", () => {
    expect(plan.fleetRun.tests_passed).toBe(5);
    expect(plan.fleetRun.tests_failed).toBe(1);
    expect(plan.fleetRun.verdict).toBe("ISSUES");
    expect(plan.fleetRun.branch).toBe("agent-build/2026-01-01-zz01");
    expect(plan.fleetRun.mode).toBe("full");
    expect(plan.fleetRun.started_at).toBe("2026-01-01T09:00:00.000Z");
  });

  it("FR-20 parses the tracker but does NOT plan it for persistence", () => {
    expect(plan.trackerMilestones).toHaveLength(6);
    expect(plan.summary.notPersisted).toHaveLength(1);
    expect(plan.summary.notPersisted[0].kind).toBe("prod.md milestone tracker");
  });

  it("FR-20 merges prod.md's blockers over the manifest's, keeping the owner", () => {
    const b9 = plan.blockers.find((blocker) => blocker.ref === "B9");
    expect(b9?.owner).toBe("vendor");
    const b1a = plan.blockers.find((blocker) => blocker.ref === "B1a");
    expect(b1a?.disposition).toBe("closed");
  });

  it("FR-12 reads the requirements out of the spec text", () => {
    expect(plan.requirements.map((r) => r.ref)).toEqual(["FR-1", "FR-2"]);
  });

  it("FR-16 a unit id repeated within one run is dropped and counted", () => {
    const duplicated = planRun({
      ...ARTIFACTS,
      manifests: [
        {
          name: "manifest-zz01.md",
          text: [
            "## Work-units",
            "| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |",
            "|---|---|---|---|---|---|---|",
            "| i1 | ui | 1 | First | ui-designer | — | done |",
            "| i1 | ui | 1 | Second | ui-designer | — | done |",
          ].join("\n"),
        },
      ],
    });
    expect(duplicated.workItems).toHaveLength(1);
    expect(duplicated.summary.unmappable).toContainEqual({
      field: "work_item.unit (duplicate within run)",
      value: "i1",
    });
  });

  it("a non-integer phase becomes null and is counted, never parseInt-ed", () => {
    const odd = planRun({
      ...ARTIFACTS,
      manifests: [
        {
          name: "manifest-zz01.md",
          text: [
            "## Work-units",
            "| ID | Type | Phase | Description | Dispatched-to | Depends-on | Status |",
            "|---|---|---|---|---|---|---|",
            "| x1 | ui | 2 (deferred) | Thing | ui-designer | — | done |",
          ].join("\n"),
        },
      ],
    });
    expect(odd.workItems[0].phase).toBeNull();
    expect(odd.summary.unmappable).toContainEqual({
      field: "work_item.phase",
      value: "2 (deferred)",
    });
  });

  it("FR-23 plans from text alone — no artifact carries a path", () => {
    // Every input is a string. There is nothing here to open and nothing to
    // write back to, which is what makes FR-23 structural rather than a promise.
    const values = [
      ...ARTIFACTS.manifests.map((m) => m.text),
      ...ARTIFACTS.questionFiles.map((q) => q.text),
    ];
    expect(values.every((value) => typeof value === "string")).toBe(true);
  });

  // --- B27: FR-64, the QA report's findings ---------------------------------

  it("FR-64 plans a defect for every finding in the QA report", () => {
    const built = planRun({ ...ARTIFACTS, qaReportText: QA_REPORT });
    expect(built.defects.length).toBeGreaterThan(0);
    // The identity is the artifact's, not a generated one, so a second post of
    // the same report updates rather than allocating a second set of refs.
    expect(built.defects[0].source_key).toMatch(/^qa-report#\d+$/);
    expect(built.defects.every((d) => d.status === "open")).toBe(true);
  });

  it("FR-64 keeps the artifact's own severity word beside the mapped enum", () => {
    const built = planRun({ ...ARTIFACTS, qaReportText: QA_REPORT });
    // The fixture grades a finding `Important` where FR-63's enum says `major`.
    // Both facts survive: one is what was written, the other is the classification.
    const major = built.defects.find((d) => d.severity === "major");
    expect(major?.raw_severity).toBe("Important");
  });

  it("FR-64 grades an unrecognised severity heading `unparsed` rather than guessing", () => {
    const built = planRun({ ...ARTIFACTS, qaReportText: QA_REPORT_UNKNOWN_SHAPES });
    expect(built.defects.every((d) => d.severity === "unparsed")).toBe(true);
    expect(built.summary.unparsedDefects).toBe(built.defects.length);
    // And the heading it could not map is still readable, so the screen can say
    // what the artifact claimed instead of only that nothing classified it.
    expect(built.defects.some((d) => d.raw_severity !== null)).toBe(true);
  });

  it("plans no defects from a report with no Issues section", () => {
    const built = planRun({ ...ARTIFACTS, qaReportText: QA_REPORT_CLEAN });
    expect(built.defects).toEqual([]);
    expect(built.summary.unparsedDefects).toBe(0);
  });

  it("FR-22 keys a defect by its ordinal in the report, not its position in the array", () => {
    // A retracted finding shortens the array. If source_key were positional,
    // every later defect would re-point at its neighbour's row on the next post.
    const built = planRun({ ...ARTIFACTS, qaReportText: QA_REPORT_EDITED_IN_PLACE });
    const keys = built.defects.map((d) => d.source_key);
    expect(new Set(keys).size).toBe(keys.length);
    // Entry 0 is a struck-through closure record and is not ingested, so the
    // first surviving defect is #1 rather than #0.
    expect(keys[0]).toBe("qa-report#1");
  });
});
