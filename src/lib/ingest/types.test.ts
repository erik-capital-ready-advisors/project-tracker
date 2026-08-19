import { describe, it, expect } from "vitest";
import { validateWorkItem } from "./types";

describe("validateWorkItem", () => {
  const valid = {
    id: "tracker:r1:i1",
    engagement: "tracker",
    executionMode: "fleet",
    executorKind: "agent",
    status: "done",
  };

  it("FR-39 accepts a work item carrying an execution mode and an executor kind", () => {
    expect(validateWorkItem(valid)).toEqual([]);
  });

  it("FR-39 rejects a work item with no executor kind", () => {
    const { executorKind: _dropped, ...missing } = valid;
    expect(validateWorkItem(missing)).toEqual([
      "work_item tracker:r1:i1: missing executorKind",
    ]);
  });

  it("FR-15 rejects a status outside the known set", () => {
    const errors = validateWorkItem({ ...valid, status: "finished" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("status");
  });

  it("FR-40 accepts erik_gate as an executor kind", () => {
    expect(validateWorkItem({ ...valid, executorKind: "erik_gate" })).toEqual([]);
  });

  it("FR-30 rejects a disposition outside carried and closed", () => {
    const errors = validateWorkItem({ ...valid, unautomatedDisposition: "maybe" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("unautomatedDisposition");
  });
});
