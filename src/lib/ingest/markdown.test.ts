import { describe, it, expect } from "vitest";
import { tableRows } from "./markdown";
import { MANIFEST } from "./__fixtures__/manifest";

describe("tableRows", () => {
  it("FR-14 returns one array per data row", () => {
    expect(tableRows(MANIFEST, "## Work-units")).toHaveLength(8);
  });

  it("FR-14 drops the header row and the separator row", () => {
    expect(tableRows(MANIFEST, "## Work-units")[0][0]).toBe("r1");
  });

  it("FR-14 splits a row into its cells", () => {
    expect(tableRows(MANIFEST, "## Work-units")[0]).toHaveLength(7);
  });

  it("FR-14 stops at the next section heading", () => {
    const ids = tableRows(MANIFEST, "## Work-units").map((r) => r[0]);
    expect(ids).not.toContain("M1.1 Foundation");
  });

  it("FR-14 returns nothing when the heading is absent", () => {
    expect(tableRows(MANIFEST, "## Blocked")).toEqual([]);
  });
});
