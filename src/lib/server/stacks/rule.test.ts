import { describe, expect, it } from "vitest";

import {
  BLOCKING_MILESTONE_CLAUSE,
  TRIGGER_MIN_ENGAGEMENTS,
  TRIGGER_MIN_HOURS,
  TRIGGER_MIN_MINUTES,
  evaluateTrigger,
  isActionable,
} from "./rule";

/**
 * FR-106's rule, driven as a pure function over frozen figures.
 *
 * No database, no fixtures beyond two numbers. That is the point of keeping the
 * rule out of the query: the boundary cases below — 479 minutes, one engagement
 * with 40 hours on it — do not exist in the ledger and never will until they do,
 * and they are the cases a screen gets wrong.
 */

describe("FR-106 limb one — two or more engagements and eight or more hours", () => {
  it("states its thresholds in the units the requirement states them in", () => {
    expect(TRIGGER_MIN_ENGAGEMENTS).toBe(2);
    expect(TRIGGER_MIN_HOURS).toBe(8);
    expect(TRIGGER_MIN_MINUTES).toBe(480);
  });

  it("earns on the conjunction, at exactly the thresholds", () => {
    const trigger = evaluateTrigger({ minutes: 480, engagements: 2 });
    expect(trigger.volume).toEqual({
      evaluated: true,
      met: true,
      engagementsMet: true,
      hoursMet: true,
    });
    expect(trigger.outcome).toBe("earned");
  });

  it("does not earn one minute short of eight hours", () => {
    const trigger = evaluateTrigger({ minutes: 479, engagements: 5 });
    expect(trigger.volume.met).toBe(false);
    expect(trigger.volume.engagementsMet).toBe(true);
    expect(trigger.volume.hoursMet).toBe(false);
    expect(trigger.outcome).toBe("undetermined");
  });

  it("does not earn on one engagement however many hours are on it", () => {
    const trigger = evaluateTrigger({ minutes: 40 * 60, engagements: 1 });
    expect(trigger.volume.met).toBe(false);
    expect(trigger.volume.engagementsMet).toBe(false);
    expect(trigger.volume.hoursMet).toBe(true);
    expect(trigger.outcome).toBe("undetermined");
  });

  it("reports which half failed, so the screen states the rule rather than the reader computing it", () => {
    const neither = evaluateTrigger({ minutes: 0, engagements: 0 });
    expect(neither.volume.engagementsMet).toBe(false);
    expect(neither.volume.hoursMet).toBe(false);
  });

  it("GROUND TRUTH — `nextjs-supabase` as measured 2026-08-24: one engagement, zero minutes", () => {
    // Both halves fail. The register's first true answer is that nothing has
    // earned anything, and this is the row it is made of.
    const trigger = evaluateTrigger({ minutes: 0, engagements: 1 });
    expect(trigger.outcome).toBe("undetermined");
    expect(trigger.volume.engagementsMet).toBe(false);
    expect(trigger.volume.hoursMet).toBe(false);
  });
});

describe("Q27 — limb two is unevaluated, and cannot be read as false", () => {
  it("carries no `met` field at all", () => {
    const trigger = evaluateTrigger({ minutes: 480, engagements: 2 });

    // The assertion this whole ruling rests on. A `met: false` here would be
    // readable as "checked, did not hold"; the absence of the key means a caller
    // cannot read limb two as false, because there is nothing there to read.
    expect("met" in trigger.blockingMilestone).toBe(false);
    expect(trigger.blockingMilestone.evaluated).toBe(false);
  });

  it("CONTROL — the same check fires on limb one, which IS evaluated", () => {
    // Proves the assertion above discriminates rather than always passing.
    const trigger = evaluateTrigger({ minutes: 480, engagements: 2 });
    expect("met" in trigger.volume).toBe(true);
  });

  it("says what would have to exist for the clause to be evaluable", () => {
    expect(BLOCKING_MILESTONE_CLAUSE.reason).toContain("no such link");
    expect(BLOCKING_MILESTONE_CLAUSE.reason).toContain("Q27");
  });

  it("never earns on limb two, because limb two is never checked", () => {
    // A stack that would plausibly satisfy limb two — one engagement, no agent,
    // work stalled — is still `undetermined`, never `earned`.
    expect(evaluateTrigger({ minutes: 0, engagements: 1 }).outcome).toBe("undetermined");
  });

  it("`undetermined` is not the same claim as unearned, and the type says so", () => {
    // There are exactly two outcomes and neither of them asserts "has not
    // earned a specialist". A third literal would have to be added deliberately.
    const outcomes = new Set(
      [
        evaluateTrigger({ minutes: 0, engagements: 0 }),
        evaluateTrigger({ minutes: 480, engagements: 2 }),
      ].map((trigger) => trigger.outcome),
    );
    expect([...outcomes].sort()).toEqual(["earned", "undetermined"]);
  });
});

describe("FR-107 — earned and uncovered is the one actionable state", () => {
  const earned = evaluateTrigger({ minutes: 480, engagements: 2 });
  const undetermined = evaluateTrigger({ minutes: 0, engagements: 1 });

  it("is actionable when earned with no agent named", () => {
    expect(isActionable(earned, null)).toBe(true);
  });

  it("is settled, not actionable, when earned and covered", () => {
    expect(isActionable(earned, "api-integrator")).toBe(false);
  });

  it("is never actionable while undetermined, however uncovered", () => {
    expect(isActionable(undetermined, null)).toBe(false);
  });

  it("treats an empty string as a named agent, because `list.ts` never produces one", () => {
    // `text()` returns the column verbatim and `normaliseAgentCovering` refuses
    // to store `''`, so this case is unreachable through the product's own write
    // path. Pinned so that a future writer of `agent_covering` learns here that
    // an empty string would silently settle a row.
    expect(isActionable(earned, "")).toBe(false);
  });
});
