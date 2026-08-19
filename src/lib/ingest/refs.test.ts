import { describe, it, expect } from "vitest";
import { requirementRefs } from "./refs";

describe("requirementRefs", () => {
  it("FR-19 expands a `to` range", () => {
    expect(requirementRefs("Agenda assembly. FR-43 to FR-46")).toEqual([
      "FR-43", "FR-44", "FR-45", "FR-46",
    ]);
  });

  it("FR-19 expands an en-dash range", () => {
    // The blocked table uses this form where the work-unit table uses `to`.
    expect(requirementRefs("Foundation (FR-1–FR-3)")).toEqual([
      "FR-1", "FR-2", "FR-3",
    ]);
  });

  it("FR-19 expands a mixed list and range", () => {
    expect(requirementRefs("Capture UI. FR-36, FR-39 to FR-41")).toEqual([
      "FR-36", "FR-39", "FR-40", "FR-41",
    ]);
  });

  it("FR-19 sorts numerically rather than lexically", () => {
    expect(requirementRefs("FR-2 and FR-10")).toEqual(["FR-2", "FR-10"]);
  });

  it("FR-19 deduplicates", () => {
    expect(requirementRefs("FR-5, FR-5, FR-4 to FR-5")).toEqual(["FR-4", "FR-5"]);
  });

  it("FR-19 returns nothing for text naming no requirement", () => {
    expect(requirementRefs("Roster bulk import")).toEqual([]);
    expect(requirementRefs(null)).toEqual([]);
  });
});
