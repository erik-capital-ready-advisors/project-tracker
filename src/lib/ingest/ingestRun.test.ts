import { describe, it, expect } from "vitest";
import { ingestRun } from "./ingestRun";
import { MANIFEST, MANIFEST_BLOCKED } from "./__fixtures__/manifest";
import { QUESTION_FILES } from "./__fixtures__/questions";

const run = () =>
  ingestRun({
    engagement: "tracker",
    manifests: [
      { name: "manifest-zz01.md", text: MANIFEST },
      { name: "manifest-zz02.md", text: MANIFEST_BLOCKED },
    ],
    questionFiles: QUESTION_FILES,
    specText: "- **FR-1** one\n- **FR-2** two\n",
    testFiles: [],
  });

describe("ingestRun", () => {
  it("FR-22 collects work items from both manifests and the blocked table", () => {
    // 8 from zz01, 1 from zz02, 5 blocked rows from zz02
    expect(run().workItems).toHaveLength(14);
  });

  it("FR-16 keeps colliding unit names distinct across runs", () => {
    const ids = run().workItems.map((item) => item.id);
    expect(ids).toContain("tracker:zz01:r1");
    expect(ids).toContain("tracker:zz02:r1");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("FR-15 reports how many rows it could not classify", () => {
    expect(run().unparsed).toBe(0);
  });

  it("FR-23 produces only valid records", () => {
    expect(run().errors).toEqual([]);
  });

  it("FR-18 carries every question through", () => {
    expect(run().questions).toHaveLength(5);
  });

  it("FR-12 carries every requirement through", () => {
    expect(run().requirements.map((r) => r.ref)).toEqual(["FR-1", "FR-2"]);
  });

  it("FR-22 is idempotent — the same input yields identical output", () => {
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });
});
