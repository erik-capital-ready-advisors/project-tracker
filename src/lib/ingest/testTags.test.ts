import { describe, it, expect } from "vitest";
import { parseTestTags } from "./testTags";

const FILES = [
  {
    path: "src/lib/agenda.test.ts",
    source: [
      `it("FR-43 assembles twelve agenda items in order", () => {});`,
      `it("renders a PDF", () => {});`,
      `test("FR-44 and FR-45 are both covered here", () => {});`,
    ].join("\n"),
  },
  {
    path: "e2e/signin.spec.ts",
    source: `test("FR-1 refuses an unauthenticated route", async () => {});`,
  },
];

describe("parseTestTags", () => {
  it("FR-45 finds every test title", () => {
    expect(parseTestTags(FILES, "tracker")).toHaveLength(4);
  });

  it("FR-45 records the requirements a title names", () => {
    const [first] = parseTestTags(FILES, "tracker");
    expect(first.covers).toEqual(["FR-43"]);
  });

  it("FR-45 lets one title cover more than one requirement", () => {
    const multi = parseTestTags(FILES, "tracker").find((t) =>
      t.title.includes("both covered"),
    );
    expect(multi?.covers).toEqual(["FR-44", "FR-45"]);
  });

  it("FR-45 leaves an untagged test covering nothing", () => {
    const untagged = parseTestTags(FILES, "tracker").find(
      (t) => t.title === "renders a PDF",
    );
    expect(untagged?.covers).toEqual([]);
  });

  it("FR-46 reads a spec file under e2e as a Playwright test", () => {
    const harnesses = new Set(parseTestTags(FILES, "tracker").map((t) => t.harness));
    expect(harnesses).toEqual(new Set(["vitest", "playwright"]));
  });

  it("FR-47 leaves every parsed test uncertified", () => {
    expect(parseTestTags(FILES, "tracker").every((t) => t.authoredBy === null)).toBe(true);
  });
});
