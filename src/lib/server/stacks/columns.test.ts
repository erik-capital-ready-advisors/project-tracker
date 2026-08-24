// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CIPHERTEXT_COLUMNS, STACK_PROJECTIONS, projectionColumns } from "./columns";

/**
 * **The §7a boundary on the register, made mechanical.**
 *
 * `work_session` is §7a `sensitive` on `summary` — "a summary of hand-prompted
 * work, which may quote anything Erik was working on" — and this layer reads
 * three clear columns off that table to count hours. The guarantee that it never
 * reads the fourth must be something that fails a build, not a doc comment:
 * `qa-reviewer` found on run `29b583` that widening a `.select()` to name three
 * ciphertext columns was **caught by nothing**.
 *
 * Two independent checks, because either alone has a blind spot. The typed check
 * reads the exported constants and is exact, but only sees projections routed
 * through `columns.ts`. The source scan reads every non-test file in this
 * directory and `src/lib/stacks-load.ts`, finds every projection-shaped literal
 * wherever it was written, and applies the same predicate — which catches the
 * `.select("id, summary")` written inline. `./set-covering.ts` writes exactly
 * such an inline projection, so the second check is not hypothetical here.
 *
 * **Every assertion is paired with a control that plants a violation**, because
 * a guard test has no natural failing case: its green result is uninformative by
 * construction until something demonstrates it bites. Same reasoning, and the
 * same recursive walk and non-empty file-set assertion, as
 * `@/lib/server/runs/columns.test.ts`.
 */

const EXTENSIONS = [".ts", ".tsx"];

/**
 * Test files are excluded. The rule is about code that issues a PostgREST read
 * against a live client; a `.test.ts` drives a fake and reaches no database.
 * Without this the CONTROL fixtures below — violations planted on purpose to
 * prove the predicate bites — are flagged as violations of the rule they exist
 * to demonstrate.
 */
function isTestFile(name: string): boolean {
  return name.endsWith(".test.ts") || name.endsWith(".test.tsx");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    // Recursive on purpose: a non-recursive walk stops enforcing the moment code
    // moves one directory down, and stays green while it does.
    if (entry.isDirectory()) out.push(...walk(full));
    else if (EXTENSIONS.some((ext) => entry.name.endsWith(ext)) && !isTestFile(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Every file this unit wrote that can issue a PostgREST read. */
function guardedFiles(): string[] {
  const here = import.meta.dirname;
  return [...walk(here), join(here, "..", "..", "stacks-load.ts")];
}

/**
 * Every projection-shaped string literal in a source file.
 *
 * Recognised by shape rather than by the call it is passed to, so it is found
 * whether written as a named constant, inline in a `.select(...)`, or
 * concatenated across lines: a quoted run of lowercase column characters
 * **containing a comma**, anchored on a column character at both ends.
 *
 * The comma is what makes this safe to run over `columns.ts` itself — every
 * entry of `CIPHERTEXT_COLUMNS` is a single bare word, so the denylist that
 * defines the rule is not mistaken for a violation of it. The anchors stop a
 * match opening on one literal's closing quote and closing on the next one's
 * opening quote.
 */
function projectionLiterals(source: string): string[] {
  const literals =
    source.match(/"[a-z0-9_][a-z0-9_ ,:()\n]*,[a-z0-9_ ,:()\n]*[a-z0-9_)]"/g) ?? [];
  return literals.map((literal) => literal.slice(1, -1));
}

/** The shared predicate. Returns the ciphertext columns a projection names. */
function violations(projection: string): string[] {
  const named = new Set(projectionColumns(projection));
  return CIPHERTEXT_COLUMNS.filter((column) => named.has(column));
}

describe("§7a — the register names no ciphertext column", () => {
  it("declares a denylist covering every bytea column on the tables it touches", () => {
    // Sourced from `20260819144331_schema_21_entities.sql`. Pinned so that
    // shrinking the denylist is a deliberate edit and not a silent one.
    expect([...CIPHERTEXT_COLUMNS].sort()).toEqual([
      "description",
      "raw_status",
      "summary",
    ]);
  });

  it("names no ciphertext column in any exported projection", () => {
    for (const [name, projection] of Object.entries(STACK_PROJECTIONS)) {
      expect(
        violations(projection),
        `${name} names a §7a ciphertext column. The register counts hours; ` +
          `nothing on it renders prose that may quote a client's codebase.`,
      ).toEqual([]);
    }
  });

  it("checks a non-empty set of projections, so a green result is not an empty one", () => {
    expect(Object.keys(STACK_PROJECTIONS).length).toBeGreaterThanOrEqual(2);
    for (const projection of Object.values(STACK_PROJECTIONS)) {
      expect(projectionColumns(projection).length).toBeGreaterThan(0);
    }
  });

  it("CONTROL — the predicate catches a ciphertext column in a projection", () => {
    // The exact edit this test exists to refuse.
    expect(violations("id, engagement_id, stack_id, duration_minutes, summary")).toEqual([
      "summary",
    ]);
    expect(violations("id, stack_id, description, raw_status")).toEqual([
      "description",
      "raw_status",
    ]);
  });

  it("CONTROL — the predicate does not fire on a clean projection", () => {
    // Proves the control above is discriminating rather than always-positive.
    expect(violations("id, name, agent_covering, first_seen_at, last_seen_at")).toEqual([]);
  });

  it("reads embedded resources too — a column hidden in an embed is still exposed", () => {
    expect(projectionColumns("id, stack:stack_id (name, agent_covering)")).toEqual([
      "id",
      "stack_id",
      "name",
      "agent_covering",
    ]);
    expect(violations("id, session:work_session_id (duration_minutes, summary)")).toEqual([
      "summary",
    ]);
  });
});

describe("§7a — the source scan catches a projection written inline", () => {
  it("scans a non-empty set of files, so a green result is not an empty walk", () => {
    const files = guardedFiles();
    expect(files.length).toBeGreaterThanOrEqual(6);
    // The inline projection in `set-covering.ts` is the reason this scan is not
    // redundant with the typed check above. If this stops matching, the scan has
    // gone blind and its green result means nothing.
    const scanned = files.map((path) => readFileSync(path, "utf8")).join("\n");
    expect(projectionLiterals(scanned)).toContain("id, name, agent_covering");
  });

  it("finds no ciphertext column in any projection literal in this unit's files", () => {
    for (const path of guardedFiles()) {
      const source = readFileSync(path, "utf8");
      for (const literal of projectionLiterals(source)) {
        expect(
          violations(literal),
          `${path} contains the projection "${literal}", which names a §7a ` +
            `ciphertext column.`,
        ).toEqual([]);
      }
    }
  });

  it("CONTROL — the scan finds a planted inline projection and the predicate condemns it", () => {
    const planted = `const q = db.from("work_session").select("id, stack_id, summary");`;
    const found = projectionLiterals(planted);
    expect(found).toContain("id, stack_id, summary");
    expect(violations(found[0])).toEqual(["summary"]);
  });
});
