import { describe, it, expect } from "vitest";

import { parseBlocked } from "./blocked";
import { parseProdMd } from "./prodMd";
import { parseWorkUnits } from "./workUnits";

/**
 * B59. Four table parsers, one rule between them -- and only one obeyed it.
 *
 * `workUnits.ts` answers a wrong column count by emitting a record with
 * `status: "unparsed"` and the raw cells preserved. `blocked.ts` and the two
 * tables in `prodMd.ts` answered it with a bare `continue`: the row left no
 * record AND no count, so it was missing from both the numerator and the
 * denominator of every unparsed figure. A malformed row shortened a list on
 * screen with nothing anywhere saying so.
 *
 * The reference case is first, so a regression in the one that was already
 * right fails here too.
 */
describe("a malformed table row is never silently dropped (B59)", () => {
  it("REFERENCE: workUnits emits an unparsed record for a short row", () => {
    const text = `## Work-units\n\n| ID | Type |\n| --- | --- |\n| u1 | ui |\n`;
    const items = parseWorkUnits(text, "tracker", "zz01");
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("unparsed");
    expect(items[0].rawStatus).toContain("u1");
  });

  it("blocked: a short row still produces a record, marked unparsed", () => {
    const text = `## Blocked\n\n| ID | Type | Milestone | Blocker | Status |\n| --- | --- | --- | --- | --- |\n| u9 | ui | M1 |\n`;
    const { items } = parseBlocked(text, "tracker", "zz01");
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe("unparsed");
  });

  it("blocked: the raw cells survive so the row can be read by a human", () => {
    const text = `## Blocked\n\n| ID | Type | Milestone | Blocker | Status |\n| --- | --- | --- | --- | --- |\n| u9 | ui | M1 |\n`;
    const { items } = parseBlocked(text, "tracker", "zz01");
    expect(items[0].rawStatus).toContain("M1");
  });

  it("prodMd: a malformed milestone row is counted, not dropped", () => {
    const good = `## Milestone tracker\n\n| Milestone | Status | Notes |\n| --- | --- | --- |\n| M1 | Done | fine |\n`;
    const bad = `## Milestone tracker\n\n| Milestone | Status | Notes |\n| --- | --- | --- |\n| M1 | Done | fine |\n| M2 | Done |\n`;
    expect(parseProdMd(good, "tracker").unparsed).toBe(0);
    expect(parseProdMd(bad, "tracker").unparsed).toBe(1);
  });

  it("prodMd: a malformed blocker row is counted, not dropped", () => {
    const bad = `## Active blockers\n\n| id | Blocker | Owner | Blocks | Resolution path |\n| --- | --- | --- | --- | --- |\n| B1 | a | erik | b | c |\n| B2 | a | erik |\n`;
    expect(parseProdMd(bad, "tracker").unparsed).toBe(1);
  });
});
