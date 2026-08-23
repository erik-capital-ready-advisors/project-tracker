import { describe, it, expect } from "vitest";
import { milestoneState } from "./billing";
import type { CoverageIndex } from "./coverage";
import type { Milestone } from "./types";

const MILESTONE: Milestone = {
  id: "tracker:M1.6", engagement: "tracker", name: "Ingest",
  amount: 2000, due: "2026-09-01", acceptance: ["FR-1", "FR-2"],
  submitted: null, paid: null,
};

const index = (
  covered: string[], claimed: string[], selfCertified: string[] = [],
): CoverageIndex => ({
  covered: new Set(covered),
  claimed: new Set(claimed),
  selfCertified: new Set(selfCertified),
  unproven: new Set(),
});

describe("milestoneState", () => {
  it("FR-50 is open when an acceptance criterion has no test at all", () => {
    expect(milestoneState(MILESTONE, index([], []))).toEqual({
      state: "open", missing: ["FR-1", "FR-2"],
    });
  });

  it("FR-50 is open when only some criteria are covered", () => {
    expect(milestoneState(MILESTONE, index(["FR-1"], ["FR-1"]))).toEqual({
      state: "open", missing: ["FR-2"],
    });
  });

  it("FR-51 is claimed when every criterion passes but the certifier built it", () => {
    expect(milestoneState(MILESTONE, index([], ["FR-1", "FR-2"], ["t1"]))).toEqual({
      state: "claimed", missing: ["FR-1", "FR-2"],
    });
  });

  it("FR-50 is billable when every criterion is independently certified", () => {
    expect(
      milestoneState(MILESTONE, index(["FR-1", "FR-2"], ["FR-1", "FR-2"])),
    ).toEqual({ state: "billable", missing: [] });
  });

  it("FR-50 is billable when a milestone names no acceptance criteria", () => {
    // Vacuous, and worth pinning: an empty acceptance list must not be a way
    // to make a milestone look earned.
    const empty = { ...MILESTONE, acceptance: [] };
    expect(milestoneState(empty, index([], []))).toEqual({
      state: "billable", missing: [],
    });
  });
});
