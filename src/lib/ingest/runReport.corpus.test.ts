import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

import { parseQaGates } from "./runReport";

/**
 * B58's regression guard, and the answer to the lesson that let B58 ship.
 *
 * The repo's real-artifact fixture tier lives in a GITIGNORED directory behind
 * `describe.skipIf(existsSync(...))`, so on any fresh clone it does not run and
 * does not report -- it reports as nothing. That is how a parser matching **0
 * of 103** real lines sat behind 1817 green tests.
 *
 * These four QA reports are TRACKED (`git ls-files .fleet/qa-report-*.md`), so
 * this suite cannot skip itself. If one is ever removed the test fails rather
 * than evaporating -- which is the whole point.
 */
const REPORTS = ["b0952e", "eb2490", "29b583", "d4000f"] as const;

function read(runId: string): string {
  const path = join(process.cwd(), ".fleet", `qa-report-${runId}.md`);
  return readFileSync(path, "utf8");
}

describe("parseQaGates over the tracked QA report corpus (B58)", () => {
  it("every report this test names is actually present", () => {
    // Fails loudly rather than skipping. A missing artifact is a finding.
    for (const runId of REPORTS) {
      expect(
        existsSync(join(process.cwd(), ".fleet", `qa-report-${runId}.md`)),
        `.fleet/qa-report-${runId}.md is missing`,
      ).toBe(true);
    }
  });

  it.each(REPORTS)("extracts at least one gate outcome from %s", (runId) => {
    const parsed = parseQaGates(read(runId));
    expect(
      Object.keys(parsed.gates).length,
      `no gate outcome read from qa-report-${runId}.md`,
    ).toBeGreaterThan(0);
  });

  it.each(REPORTS)("reads the build gate specifically from %s", (runId) => {
    // Every report in the corpus states a build outcome. If a future report
    // does not, this failing is the correct outcome: it means the artifact
    // changed shape and the parser has not been shown the new one.
    expect(parseQaGates(read(runId)).gates.build).toBeDefined();
  });
});
