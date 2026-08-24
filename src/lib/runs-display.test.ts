import { describe, expect, it } from "vitest";

import {
  RUN_UNPARSED_GAPS,
  VERDICT_SOURCE_QA_REPORT,
  dispatchUsage,
  reconcileVerdicts,
  renderGates,
  runDuration,
  runUnparsed,
  runVerdict,
  testTriple,
} from "./runs-display";

/**
 * The pure derivations behind M2.8's two run screens.
 *
 * Every function here is fed a shape it does not recognise — a NULL where a
 * number belongs, a jsonb array where an object belongs, a verdict word no
 * template emits — and asserted to say so rather than to guess. That is this
 * repository's standing rule for a parser, applied to the display side of the
 * same boundary: `unparsed` is the only default, and an unknown never renders
 * as a zero.
 *
 * The values marked "measured" are run `b0952e`'s actual columns, read from
 * `onpvolboecjpdkvurjaf` on 2026-08-23. They are here so the suite exercises the
 * state that ships rather than only the states that are easy to imagine.
 */

describe("FR-95 — a verdict is emitted exactly as recorded", () => {
  it("carries `unparsed` through without hiding or renaming it", () => {
    // Measured: this is the only run in the ledger and this is its verdict.
    const model = runVerdict({ verdict: "unparsed" });

    expect(model.sources).toHaveLength(1);
    expect(model.sources[0].verdict).toBe("unparsed");
    expect(model.sources[0].origin).toBe(VERDICT_SOURCE_QA_REPORT);
    expect(model.sources[0].recognised).toBe(true);
  });

  it("does not title-case, trim or map a recorded verdict", () => {
    for (const raw of ["PASS", "pass", "  BLOCKED  ", "ISSUES", "Shipped it"]) {
      expect(runVerdict({ verdict: raw }).sources[0].verdict).toBe(raw);
    }
  });

  it("flags a word no template emits without rewriting it", () => {
    const model = runVerdict({ verdict: "mostly fine" });

    expect(model.sources[0].verdict).toBe("mostly fine");
    expect(model.sources[0].recognised).toBe(false);
  });

  it("reports one source as `single`, never as agreement", () => {
    const model = runVerdict({ verdict: "PASS" });

    // The distinction this product turns on: one source agreeing with itself
    // has not tested FR-95's condition, and must not render as if it had.
    expect(model.agreement).toBe("single");
    expect(model.soleReason).toBe("one_verdict_column");
  });

  it("reports a missing verdict as `none`, with no source invented", () => {
    for (const empty of [null, "", "   "]) {
      const model = runVerdict({ verdict: empty });
      expect(model.agreement).toBe("none");
      expect(model.sources).toEqual([]);
      expect(model.soleReason).toBe("no_verdict_recorded");
    }
  });

  it("never synthesises a second source from a single row", () => {
    // D1: the `gates` payload is a build gate, not a verdict. A disagreement
    // this product manufactured would be an artefact of its own modelling.
    expect(runVerdict({ verdict: "unparsed" }).sources).toHaveLength(1);
  });
});

describe("FR-95 — where sources disagree, both are shown", () => {
  const source = (origin: string, verdict: string) => ({
    origin,
    verdict,
    recognised: true,
  });

  /*
   * These drive `reconcileVerdicts` directly with fabricated multi-source input.
   * Today's schema can only ever produce one source, so without these the
   * `agreed` and `disagreed` branches would never execute — and a branch nothing
   * exercises is indistinguishable from one that does not work.
   */

  it("reports disagreement and keeps every source", () => {
    // The standing example: manifest-cd414c says `u4` pending, checkpoint says merged.
    const model = reconcileVerdicts([
      source("manifest", "pending"),
      source("checkpoint", "merged"),
    ]);

    expect(model.agreement).toBe("disagreed");
    expect(model.sources).toHaveLength(2);
    expect(model.distinct).toEqual(["pending", "merged"]);
    expect(model.soleReason).toBeNull();
  });

  it("never picks a winner or drops the minority reading", () => {
    const model = reconcileVerdicts([
      source("a", "PASS"),
      source("b", "FAIL"),
      source("c", "FAIL"),
    ]);

    expect(model.agreement).toBe("disagreed");
    expect(model.sources.map((one) => one.verdict)).toEqual(["PASS", "FAIL", "FAIL"]);
    expect(model.distinct).toEqual(["PASS", "FAIL"]);
  });

  it("reports agreement only when two or more sources match byte-for-byte", () => {
    expect(reconcileVerdicts([source("a", "PASS"), source("b", "PASS")]).agreement).toBe(
      "agreed",
    );
    // Case differences are a disagreement, not a match. Normalising here would
    // be the mapping FR-95 forbids, arriving through a comparison instead.
    expect(reconcileVerdicts([source("a", "PASS"), source("b", "pass")]).agreement).toBe(
      "disagreed",
    );
  });
});

describe("FR-92 — a duration, where zero and unknown are different facts", () => {
  it("renders a genuinely zero-length run as `0m`", () => {
    // Measured: run b0952e's started_at and ended_at are the same instant.
    const result = runDuration("2026-08-19 00:00:00+00", "2026-08-19 00:00:00+00");

    expect(result).toEqual({ state: "known", minutes: 0, label: "0m" });
  });

  it("reports a missing timestamp as unknown rather than as zero", () => {
    expect(runDuration(null, "2026-08-19T00:00:00Z")).toEqual({
      state: "unknown",
      reason: "no_start",
    });
    expect(runDuration("2026-08-19T00:00:00Z", null)).toEqual({
      state: "unknown",
      reason: "no_end",
    });
    expect(runDuration(null, null)).toEqual({ state: "unknown", reason: "no_start" });
  });

  it("reports an unparseable timestamp as unknown rather than as the epoch", () => {
    expect(runDuration("not a date", "2026-08-19T00:00:00Z").state).toBe("unknown");
    expect(runDuration("2026-08-19T00:00:00Z", "").state).toBe("unknown");
  });

  it("reports an end before a start rather than clamping it to zero", () => {
    expect(runDuration("2026-08-19T06:00:00Z", "2026-08-19T05:00:00Z")).toEqual({
      state: "unknown",
      reason: "ends_before_start",
    });
  });

  it("uses the repository's one duration formatter", () => {
    expect(runDuration("2026-08-19T00:00:00Z", "2026-08-19T00:45:00Z").state).toBe("known");
    expect(runDuration("2026-08-19T00:00:00Z", "2026-08-19T00:45:00Z")).toMatchObject({
      minutes: 45,
      label: "45m",
    });
    expect(runDuration("2026-08-19T00:00:00Z", "2026-08-19T02:30:00Z")).toMatchObject({
      label: "2h 30m",
    });
  });
});

describe("FR-92 — dispatches used against cap", () => {
  it("reports NULL/NULL as unknown, never as `0 of 0`", () => {
    // Measured: both columns are NULL on the only run, and nothing writes them.
    expect(dispatchUsage(null, null)).toEqual({ state: "unknown" });
  });

  it("renders a recorded pair, including a legitimate zero", () => {
    expect(dispatchUsage(8, 20)).toEqual({
      state: "known",
      used: 8,
      cap: 20,
      label: "8 of 20",
    });
    // 0 used against a recorded cap of 20 IS data and renders.
    expect(dispatchUsage(0, 20)).toMatchObject({ state: "known", label: "0 of 20" });
  });

  it("reports half-recorded as partial, and keeps the missing half null", () => {
    expect(dispatchUsage(8, null)).toEqual({ state: "partial", used: 8, cap: null });
    expect(dispatchUsage(null, 20)).toEqual({ state: "partial", used: null, cap: 20 });
  });

  it("treats a nonsense count as unknown rather than clamping it", () => {
    expect(dispatchUsage(-1, -1)).toEqual({ state: "unknown" });
    expect(dispatchUsage(Number.NaN, 20)).toEqual({
      state: "partial",
      used: null,
      cap: 20,
    });
  });
});

describe("FR-92 — the reported test triple", () => {
  it("reports three NULLs as unknown, never as `0 / 0 / 0`", () => {
    // Measured: all three are NULL on run b0952e — its QA report had no
    // Playwright line, so the parser stored nulls rather than zeros.
    expect(testTriple(null, null, null)).toMatchObject({
      state: "unknown",
      passed: null,
      failed: null,
      skipped: null,
      label: null,
    });
  });

  it("renders a complete triple, zeros included", () => {
    expect(testTriple(5, 1, 0)).toMatchObject({
      state: "known",
      label: "5 passed, 1 failed, 0 skipped",
    });
    expect(testTriple(0, 0, 0)).toMatchObject({
      state: "known",
      label: "0 passed, 0 failed, 0 skipped",
    });
  });

  it("reports a partial triple as partial and does not fill the gap", () => {
    const triple = testTriple(5, null, 0);

    expect(triple.state).toBe("partial");
    expect(triple.failed).toBeNull();
    expect(triple.label).toBeNull();
  });
});

describe("FR-93 — the gates payload, rendered rather than dumped", () => {
  it("renders the payload the only run in the ledger actually carries", () => {
    // Measured: exactly one key.
    const rendered = renderGates({ build_after_phase1: "PASS" });

    expect(rendered.malformed).toBe(false);
    expect(rendered.gates).toEqual([
      { key: "build_after_phase1", outcome: "PASS", recognised: true },
    ]);
    expect(rendered.unparsedCount).toBe(0);
  });

  it("sorts by key, because jsonb does not preserve insertion order", () => {
    const rendered = renderGates({ typecheck: "PASS", build: "FAIL", lint: "PASS" });

    expect(rendered.gates.map((gate) => gate.key)).toEqual([
      "build",
      "lint",
      "typecheck",
    ]);
  });

  it("keeps an unrecognised outcome byte-for-byte and counts it unparsed", () => {
    const rendered = renderGates({ build: "mostly ok", lint: "unparsed" });

    expect(rendered.gates[0]).toEqual({
      key: "build",
      outcome: "mostly ok",
      recognised: false,
    });
    // `unparsed` is itself a recognised outcome word — the classifier's loud
    // default — and it is still counted. Both reach the same reader conclusion.
    expect(rendered.gates[1]).toEqual({
      key: "lint",
      outcome: "unparsed",
      recognised: true,
    });
    expect(rendered.unparsedCount).toBe(2);
  });

  it("names a non-string value rather than dropping the gate", () => {
    const rendered = renderGates({ build: "PASS", flaky: 3, nested: { a: 1 } });

    expect(rendered.gates.map((gate) => gate.key)).toEqual(["build"]);
    expect(rendered.unrenderable).toEqual(["flaky", "nested"]);
    // A gate silently omitted reads as a gate that was never run.
    expect(rendered.unparsedCount).toBe(2);
  });

  it("reports a payload that is not an object as malformed rather than throwing", () => {
    for (const bad of [null, [], ["PASS"], "PASS", 7, true]) {
      const rendered = renderGates(bad);
      expect(rendered.malformed).toBe(true);
      expect(rendered.gates).toEqual([]);
    }
  });

  it("renders an empty payload as empty and not as malformed", () => {
    // `gates` is NOT NULL default '{}', so this is the shape a run with no
    // gates carries, and it is a different fact from an unreadable payload.
    const rendered = renderGates({});

    expect(rendered.malformed).toBe(false);
    expect(rendered.gates).toEqual([]);
    expect(rendered.unparsedCount).toBe(0);
  });
});

describe("FR-94 — a run states its own unparsed count", () => {
  const clean = renderGates({ build_after_phase1: "PASS" });

  it("counts the run's own unparsed verdict, which the global census does not", () => {
    // Measured: run b0952e has 0 unparsed work items but verdict = 'unparsed'.
    const count = runUnparsed({
      unparsedWorkItems: 0,
      gates: clean,
      verdict: "unparsed",
    });

    expect(count.workItems).toBe(0);
    expect(count.gates).toBe(0);
    expect(count.verdictUnparsed).toBe(true);
    expect(count.total).toBe(1);
  });

  it("does not count a recorded verdict that is not the word `unparsed`", () => {
    expect(
      runUnparsed({ unparsedWorkItems: 0, gates: clean, verdict: "PASS" }).total,
    ).toBe(0);
    expect(
      runUnparsed({ unparsedWorkItems: 0, gates: clean, verdict: null }).total,
    ).toBe(0);
  });

  it("reports an unreadable work-item count as null rather than as zero", () => {
    const count = runUnparsed({
      unparsedWorkItems: null,
      gates: clean,
      verdict: "unparsed",
    });

    // A partial total understates, and an understated unparsed count is
    // indistinguishable from a healthy one.
    expect(count.workItems).toBeNull();
    expect(count.total).toBeNull();
  });

  it("sums work items, gates and the verdict", () => {
    const messy = renderGates({ build: "unparsed", lint: "who knows" });

    expect(
      runUnparsed({ unparsedWorkItems: 3, gates: messy, verdict: "unparsed" }).total,
    ).toBe(3 + 2 + 1);
  });

  it("names the populations it could not scope to a run", () => {
    const count = runUnparsed({
      unparsedWorkItems: 0,
      gates: clean,
      verdict: "PASS",
    });

    // "this run has no unparsed defects" and "nothing in the schema can say
    // which defects this run opened" are different statements.
    expect(count.gaps).toBe(RUN_UNPARSED_GAPS);
    expect(count.gaps.map((gap) => gap.population).sort()).toEqual([
      "defect",
      "test_result",
    ]);
    for (const gap of count.gaps) expect(gap.reason).toBe("no_run_edge");
  });
});
