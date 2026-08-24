import { describe, it, expect } from "vitest";

import { QA_REPORT, QA_REPORT_REAL_GATE_LINES } from "./__fixtures__/qaReport";
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

/**
 * B58. The bug this suite could not see, and why.
 *
 * `parseQaGates` extracted ZERO gate outcomes from ZERO of 103 non-empty lines
 * across all four tracked QA reports, and reported nothing about it: the
 * unrecognised line was dropped by a `continue` sitting ABOVE the counter that
 * exists to notice exactly that, so `unparsed` read 0 as well.
 *
 * These assert on the shapes the artifacts actually carry, not on a shape the
 * parser is believed to want.
 */
describe("parseQaGates against the real corpus shapes (B58)", () => {
  const real = parseQaGates(QA_REPORT_REAL_GATE_LINES);

  it("reads a bold label with the colon INSIDE the bold span", () => {
    expect(real.gates.build).toBe("PASS");
  });

  it("reads a bold label with the colon OUTSIDE the bold span", () => {
    expect(real.gates.typecheck).toBe("PASS");
  });

  it("reads a bold OUTCOME word, which the raw value hides behind asterisks", () => {
    // `- **Lint** (oxlint): **PASS** - exit 0` leaves the value as
    // `**PASS** - exit 0`, and /^PASS\\b/ never matches that. Both layers of
    // B58 had to be fixed before a single gate could be read.
    expect(real.gates.lint).toBe("PASS");
  });

  it("reads NOT RUN, so a gate that did not run is not silently absent", () => {
    expect(real.gates.playwright).toBeDefined();
  });

  it("counts every gate bullet it cannot classify instead of dropping it", () => {
    // `Unit tests` and `pnpm gate:m27:e2e` are not in GATE_LABELS. They stay
    // LOUD rather than being widened into the map to make this pass.
    expect(real.unparsed).toBeGreaterThan(0);
  });

  it("never reports zero gates for a report that states its gates", () => {
    expect(Object.keys(real.gates).length).toBeGreaterThan(0);
  });
});
