import { describe, it, expect } from "vitest";
import { parseWorkUnits } from "./workUnits";
import { validateWorkItem } from "./types";
import { MANIFEST } from "./__fixtures__/manifest";

const byUnit = (text: string) =>
  Object.fromEntries(
    parseWorkUnits(text, "tracker", "zz01").map((item) => [item.unit, item]),
  );

describe("parseWorkUnits", () => {
  it("FR-14 produces one work item per table row", () => {
    expect(parseWorkUnits(MANIFEST, "tracker", "zz01")).toHaveLength(8);
  });

  it("FR-14 produces only valid work items", () => {
    const errors = parseWorkUnits(MANIFEST, "tracker", "zz01").flatMap(validateWorkItem);
    expect(errors).toEqual([]);
  });

  it("FR-16 scopes identifiers by engagement and run", () => {
    expect(byUnit(MANIFEST).i1.id).toBe("tracker:zz01:i1");
  });

  it("FR-42 splits the depends-on cell into unit names", () => {
    expect(byUnit(MANIFEST).i2.dependsOn).toEqual(["i1", "u1"]);
  });

  it("FR-42 reads an em-dash dependency as no dependencies", () => {
    expect(byUnit(MANIFEST).r1.dependsOn).toEqual([]);
  });

  it("FR-19 records the requirements a unit implements", () => {
    expect(byUnit(MANIFEST).u1.implements).toEqual([
      "FR-1", "FR-2", "FR-3", "FR-4", "FR-5",
    ]);
  });

  it("FR-41 hands work blocked on an absent credential back to Erik", () => {
    // d1 is dispatched-to `devops`, but no agent can choose an account.
    expect(byUnit(MANIFEST).d1.executorKind).toBe("erik_gate");
  });

  it("FR-39 leaves a dispatched unit owned by an agent", () => {
    expect(byUnit(MANIFEST).i1.executorKind).toBe("agent");
  });

  it("FR-39 marks every work-unit row as fleet-executed", () => {
    const modes = new Set(
      parseWorkUnits(MANIFEST, "tracker", "zz01").map((i) => i.executionMode),
    );
    expect([...modes]).toEqual(["fleet"]);
  });

  it("FR-15 marks a row with the wrong column count unparsed rather than misaligned", () => {
    const text = "## Work-units\n\n| ID | Type |\n|---|---|\n| x1 | ui |\n";
    expect(parseWorkUnits(text, "tracker", "zz09")[0].status).toBe("unparsed");
  });
});
