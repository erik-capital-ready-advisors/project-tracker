import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { ingestRun } from "./ingestRun";

const DIR = join(process.cwd(), "fixtures-local");
const present = existsSync(DIR);

// The only place in this package that touches a filesystem, and it is a test.
const read = (pattern: RegExp) =>
  readdirSync(DIR)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(DIR, name), "utf8") }));

describe.skipIf(!present)("ingestRun against the real corpus", () => {
  const result = () =>
    ingestRun({
      engagement: "danish",
      manifests: read(/^manifest-.*\.md$/),
      questionFiles: read(/^questions-.*\.jsonl$/),
      specText: readFileSync(join(DIR, "spec-approved.md"), "utf8"),
      testFiles: [],
    });

  it("FR-14 reads 31 work items across two runs and one blocked table", () => {
    expect(result().workItems).toHaveLength(31);
  });

  it("FR-15 classifies every status cell in the corpus", () => {
    expect(result().unparsed).toBe(0);
  });

  it("FR-18 normalizes all 45 questions", () => {
    expect(result().questions).toHaveLength(45);
  });

  it("FR-18 finds the three answered questions", () => {
    expect(result().questions.filter((q) => q.status === "answered")).toHaveLength(3);
  });

  it("FR-12 finds all 61 requirements", () => {
    expect(result().requirements).toHaveLength(61);
  });

  it("FR-23 produces no invalid record from real input", () => {
    expect(result().errors).toEqual([]);
  });
});
