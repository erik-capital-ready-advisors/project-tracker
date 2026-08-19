import { describe, it, expect } from "vitest";
import { parseBlocked } from "./blocked";
import { MANIFEST_BLOCKED } from "./__fixtures__/manifest";

const parsed = () => parseBlocked(MANIFEST_BLOCKED, "tracker", "zz02");
const byUnit = () =>
  Object.fromEntries(parsed().items.map((item) => [item.unit, item]));

describe("parseBlocked", () => {
  it("FR-17 produces one work item per blocked row", () => {
    expect(parsed().items).toHaveLength(5);
  });

  it("FR-17 extracts each distinct blocker once", () => {
    expect(parsed().blockers.map((b) => b.id).sort()).toEqual([
      "tracker:B1", "tracker:B3",
    ]);
  });

  it("FR-17 leaves a row naming no blocker without one", () => {
    expect(byUnit()["b-cpy"].blocker).toBeNull();
  });

  it("FR-15 reads a row that says it is not blocked as not dispatched", () => {
    expect(byUnit()["b-m01"].status).toBe("not_dispatched");
  });

  it("FR-30 treats a blocked row as a carried gap", () => {
    expect(byUnit()["b-m11"]).toMatchObject({
      status: "blocked",
      unautomatedDisposition: "carried",
    });
  });

  it("FR-19 reads the requirements a blocked milestone covers", () => {
    expect(byUnit()["b-m11"].implements).toEqual([
      "FR-1", "FR-2", "FR-3", "FR-4", "FR-5",
    ]);
  });

  it("FR-17 yields nothing when there is no blocked table", () => {
    expect(parseBlocked("# empty\n", "tracker", "zz09")).toEqual({
      items: [], blockers: [],
    });
  });
});
