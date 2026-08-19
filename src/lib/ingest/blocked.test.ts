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

describe("FR-52 blocker ownership defaults to Erik, not to the client", () => {
  it("FR-52 gives an unattributed blocker to Erik", () => {
    // Settled by Erik, overriding `plan.md` Task 6's hardcoded `"client"`.
    // The Blocked screen groups by owner to separate Erik's rows from a
    // client's; defaulting to `client` sent every provisioning and
    // infrastructure blocker — which CLAUDE.md says are Erik's — into the
    // client bucket on the screen that answers "what is Erik the bottleneck
    // on". i2 flagged this as the highest-value open item in its report.
    expect(parsed().blockers.length).toBeGreaterThan(0);
    for (const blocker of parsed().blockers) {
      expect(blocker.owner).toBe("erik");
    }
  });

  it("FR-52 does not infer ownership from the blocker's prose", () => {
    // A regex hunting for a client's name in the description would be exactly
    // the widening the unparsed rule forbids. Ownership comes from a field or
    // from the default; it is never guessed from text.
    const text = [
      "## Blocked",
      "",
      "| ID | Type | Milestone | Blocker | Status |",
      "|---|---|---|---|---|",
      "| b-1 | ui | M1 | B7 waiting on the client to send their vendor key | carried |",
      "",
    ].join("\n");
    const { blockers } = parseBlocked(text, "tracker", "zz10");
    expect(blockers).toHaveLength(1);
    expect(blockers[0].owner).toBe("erik");
  });
});
