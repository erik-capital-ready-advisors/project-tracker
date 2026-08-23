// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * A source file must not contain a raw NUL byte.
 *
 * ## This is not style. It cost a wrong conclusion in this repository.
 *
 * Four files carried a literal U+0000 inside a string or template literal — a
 * NUL-byte filename guard in `ingest/payload.ts`, and NUL composite-key
 * separators in `ingest/plan.ts`, `qa/persist.ts` and `workitems/rules.ts`. All
 * four intents are correct. Writing the byte raw instead of the `\0` escape is
 * what caused the damage:
 *
 *   * `file(1)` reports the file as `data`, not source.
 *   * **`grep` and `git grep` treat it as binary and silently skip it.**
 *
 * That last one is the failure this project's central rule is about, relocated
 * into the tooling. During run b0952e a reviewer grepped for `unknownKeyProblems`,
 * did not see `src/lib/server/ingest/payload.ts` in the results, and concluded
 * that file "rolls its own" implementation. It does not — it had imported the
 * shared module for hours. The grep did not say "I could not read this file"; it
 * returned a shorter list. A remediation instruction was written on that basis.
 *
 * `"\0"` and a raw NUL byte denote exactly the same character, so the escape
 * costs nothing and keeps the file searchable.
 */

const ROOTS = ["src", "tests", "e2e"];
const EXTENSIONS = [".ts", ".tsx", ".sql", ".css", ".md"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext))) out.push(full);
  }
  return out;
}

function sourceFiles(): string[] {
  return ROOTS.flatMap((root) => walk(join(import.meta.dirname, "..", root)));
}

describe("source files stay searchable", () => {
  it("contains no raw NUL byte — use the `\\0` escape, which is the same character", () => {
    const offenders = sourceFiles()
      .filter((path) => readFileSync(path).includes(0x00))
      .map((path) => path.slice(path.indexOf("/src/") + 1 || 0));

    expect(offenders).toEqual([]);
  });

  it("reads a non-empty set of files, so a green result is not an empty one", () => {
    // Without this, a broken walk() makes the assertion above vacuous.
    expect(sourceFiles().length).toBeGreaterThan(100);
  });

  it("detects a NUL when one is present — the control", () => {
    const withNul = Buffer.from([0x61, 0x00, 0x62]);
    expect(withNul.includes(0x00)).toBe(true);
    expect(Buffer.from("ab").includes(0x00)).toBe(false);
  });
});
