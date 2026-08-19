import { describe, it, expect } from "vitest";
import { daysWaiting, isOverdue, projectMilestone } from "./waits";
import type { ExternalWait } from "./types";

const wait = (over: Partial<ExternalWait> = {}): ExternalWait => ({
  id: "tracker:w1", engagement: "tracker", label: "App Store review",
  owner: "Apple", startedAt: "2026-09-01", expectedBy: "2026-09-08",
  resolvedAt: null, blocks: ["tracker:zz01:u2"], ...over,
});

describe("external waits", () => {
  it("FR-34 counts days elapsed since the wait started", () => {
    expect(daysWaiting(wait(), "2026-09-06")).toBe(5);
  });

  it("FR-34 stops counting at the resolution date", () => {
    expect(daysWaiting(wait({ resolvedAt: "2026-09-04" }), "2026-09-20")).toBe(3);
  });

  it("FR-34 flags a wait past its expected-by date", () => {
    expect(isOverdue(wait(), "2026-09-09")).toBe(true);
  });

  it("FR-34 does not flag a wait still inside its window", () => {
    expect(isOverdue(wait(), "2026-09-07")).toBe(false);
  });

  it("FR-36 does not flag a resolved wait, however late it was", () => {
    expect(isOverdue(wait({ resolvedAt: "2026-09-20" }), "2026-10-01")).toBe(false);
  });

  it("FR-37 pushes a milestone out to its latest unresolved wait", () => {
    expect(
      projectMilestone("2026-09-03", [wait()], "2026-09-02"),
    ).toEqual({ projected: "2026-09-08", slippedDays: 5, drivenBy: "tracker:w1" });
  });

  it("FR-37 leaves a milestone alone when every wait resolves before it", () => {
    expect(
      projectMilestone("2026-09-30", [wait()], "2026-09-02"),
    ).toEqual({ projected: "2026-09-30", slippedDays: 0, drivenBy: null });
  });

  it("FR-37 ignores resolved waits", () => {
    const resolved = wait({ resolvedAt: "2026-09-02" });
    expect(
      projectMilestone("2026-09-03", [resolved], "2026-09-02"),
    ).toEqual({ projected: "2026-09-03", slippedDays: 0, drivenBy: null });
  });

  it("FR-37 names the wait driving the date when several are open", () => {
    const waits = [wait(), wait({ id: "tracker:w2", expectedBy: "2026-09-21" })];
    expect(projectMilestone("2026-09-03", waits, "2026-09-02").drivenBy)
      .toBe("tracker:w2");
  });
});
