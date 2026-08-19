import { describe, it, expect } from "vitest";

import { QA_REPORT } from "./__fixtures__/qaReport";
import {
  CHECKPOINT,
  CHECKPOINT_FAILED,
  CHECKPOINT_UNKNOWN_GATE,
  QA_REPORT_NO_GATES,
  QA_REPORT_WITH_GATES,
} from "./__fixtures__/runState";
import { parseCheckpoint, parseQaGates } from "./runReport";

describe("parseCheckpoint", () => {
  const facts = parseCheckpoint(CHECKPOINT);

  it("FR-21 reads the run id from the checkpoint title", () => {
    expect(facts.runId).toBe("zz01");
  });

  it("FR-21 reads the branch, mode and both timestamps", () => {
    expect(facts.branch).toBe("agent-build/2026-01-01-zz01");
    expect(facts.mode).toBe("full");
    expect(facts.startedAt).toBe("2026-01-01T09:00:00Z");
    expect(facts.endedAt).toBe("2026-01-01T11:30:00Z");
  });

  it("FR-21 classifies the build gate", () => {
    expect(facts.buildGate).toBe("PASS");
    expect(parseCheckpoint(CHECKPOINT_FAILED).buildGate).toBe("FAIL");
  });

  it("FR-15 a gate word outside the closed set is unparsed, not PASS", () => {
    expect(parseCheckpoint(CHECKPOINT_UNKNOWN_GATE).buildGate).toBe("unparsed");
  });

  it("FR-21 a checkpoint stating no build gate yields null, which is not FAIL", () => {
    expect(parseCheckpoint("# Checkpoint zz09\n\nbranch: x\n").buildGate).toBeNull();
  });

  it("FR-21 only the front block is read as fields", () => {
    // `spec_path:` appears again inside the decisions prose in this fixture's
    // shape; a key after the first `## ` heading must not become a field.
    const withTrailer = `${CHECKPOINT}\nmode: SHOULD_NOT_WIN\n`;
    expect(parseCheckpoint(withTrailer).mode).toBe("full");
  });
});

describe("parseQaGates", () => {
  const report = parseQaGates(QA_REPORT_WITH_GATES);

  it("FR-21 reads the verdict word", () => {
    expect(report.verdict).toBe("ISSUES");
    expect(report.rawVerdict).toBe("ISSUES");
  });

  it("FR-21 reads the severity tally", () => {
    expect(report.severity).toEqual({ critical: 0, important: 2, minor: 3 });
  });

  it("FR-21 reads each gate outcome under Verification performed", () => {
    expect(report.gates).toEqual({
      build: "PASS",
      typecheck: "PASS",
      lint: "FAIL",
      playwright: "FAIL",
      accessibility: "unparsed",
    });
  });

  it("FR-21 reads the reported test counts from the Playwright line", () => {
    expect(report.testsPassed).toBe(5);
    expect(report.testsFailed).toBe(1);
  });

  it("FR-21 stores the outcome word only, never the reason excerpt behind it", () => {
    // `- Lint: FAIL 3 errors in the shell` contributes FAIL and nothing else.
    expect(Object.values(report.gates)).toEqual(
      Object.values(report.gates).map((g) => g.trim()),
    );
    expect(JSON.stringify(report.gates)).not.toContain("errors in the shell");
  });

  it("FR-58 counts the gate lines it could not classify", () => {
    // `Accessibility: axe — 0 violations` states no outcome word, and
    // `Security checklist` is not a gate this build knows.
    expect(report.unparsed).toBe(2);
  });

  it("FR-21 a NOT RUN gate is NOT_RUN, which is neither PASS nor FAIL", () => {
    const notRun = parseQaGates(
      "## Verification performed\n\n- Build (pnpm): NOT RUN no lockfile\n",
    );
    expect(notRun.gates.build).toBe("NOT_RUN");
  });

  it("FR-15 a verdict word outside the template's set is unparsed", () => {
    expect(parseQaGates("**Status:** probably fine\n").verdict).toBe("unparsed");
  });

  it("FR-21 a report with no Verification performed section yields no gates", () => {
    const clean = parseQaGates(QA_REPORT_NO_GATES);
    expect(clean.verdict).toBe("PASS");
    expect(clean.gates).toEqual({});
    expect(clean.testsPassed).toBeNull();
  });

  it("FR-21 reads the older report shape that carries a bare Build line", () => {
    const older = parseQaGates(QA_REPORT);
    expect(older.verdict).toBe("FAIL");
    expect(older.gates).toEqual({ build: "PASS" });
    expect(older.severity).toEqual({ critical: 2, important: 1, minor: 1 });
  });

  it("FR-21 null counts are not zero — the artifact stated none", () => {
    expect(parseQaGates(QA_REPORT).testsPassed).toBeNull();
  });
});
