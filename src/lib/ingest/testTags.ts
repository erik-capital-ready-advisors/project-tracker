import type { TestCase } from "./types";

const TITLE = /\b(?:it|test)\s*\(\s*(['"`])(.+?)\1/g;
const FR = /\bFR-\d+\b/g;

function harnessFor(path: string): TestCase["harness"] {
  const segments = path.split("/");
  return segments.includes("e2e") || segments.includes("playwright")
    ? "playwright"
    : "vitest";
}

/**
 * A test declares what it covers by naming the requirement in its own title:
 *   it("FR-43 assembles twelve agenda items", ...)
 */
export function parseTestTags(
  files: { path: string; source: string }[],
  engagement: string,
): TestCase[] {
  const cases: TestCase[] = [];

  for (const file of files) {
    let index = 0;
    for (const match of file.source.matchAll(TITLE)) {
      const title = match[2];
      cases.push({
        id: `${engagement}:${file.path}:${index}`,
        engagement,
        harness: harnessFor(file.path),
        file: file.path,
        title,
        covers: title.match(FR) ?? [],
        authoredBy: null,
      });
      index += 1;
    }
  }
  return cases;
}
