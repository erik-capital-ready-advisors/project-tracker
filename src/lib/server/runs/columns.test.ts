// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CIPHERTEXT_COLUMNS,
  RUN_PROJECTIONS,
  projectionColumns,
} from "./columns";

/**
 * **The §7a boundary on the run screens, made mechanical.**
 *
 * ## Why this file exists at all
 *
 * `qa-reviewer` found on run `29b583` that adding `question, best_guess, answer`
 * to the `/questions` select was **caught by nothing**. The whole of that
 * screen's §7a ciphertext-exposure guarantee rested on a doc comment explaining
 * why the columns were absent — and a doc comment does not fail a build. M2.8
 * adds two more listing surfaces over four `sensitive` tables, so it adds the
 * same hole twice unless something asserts the boundary.
 *
 * ## Two independent checks, because either one alone has a blind spot
 *
 *   1. **The typed check** reads the exported projection constants and asserts
 *      no ciphertext column is named. It is exact and it cannot be fooled by
 *      formatting — but it only sees projections that were routed through
 *      `columns.ts` in the first place.
 *   2. **The source scan** reads every file in this directory and
 *      `src/lib/runs-load.ts`, finds every projection-shaped string literal
 *      wherever it was written, and applies the same predicate. It catches the
 *      case the typed check structurally cannot: a `.select("id, raw_status")`
 *      written inline, bypassing the constants entirely.
 *
 * ## Every check here is proven against a planted violation
 *
 * *A guard test is the purest form of the "gates fail by passing" family,
 * because it has no natural failing case: nothing ever demonstrates it can fail,
 * so its green result is uninformative by construction until someone plants a
 * violation.* That is `Knowledge/Gates fail by passing in exactly the case they
 * exist to catch`, instance 11, and this file takes it literally — every
 * assertion below is paired with a control that feeds the same predicate a
 * violation and asserts it is caught. A green run of this file means the checks
 * ran **and** that they bite.
 *
 * The recursive walk and the non-empty file-set assertion are from the same
 * note: instance 11 was a guard test whose `readdirSync` was non-recursive, so
 * it stopped enforcing the moment code moved one directory down and stayed
 * green at 87/87.
 */

const EXTENSIONS = [".ts", ".tsx"];

/**
 * Test files are excluded, and the first run of this file is why.
 *
 * The scan flagged the CONTROL fixtures below — `"id, unit, raw_status"`, a
 * violation planted on purpose to prove the predicate bites — as violations of
 * the rule they exist to demonstrate. That is instance 9 of
 * `Knowledge/Gates fail by passing`: a detector built to catch bad work
 * punishing good work that shares a surface shape with the bad-work signature.
 *
 * The exclusion is sound rather than a convenience: the rule is about code that
 * **issues a PostgREST read against a live client**, and a `.test.ts` file
 * drives a fake. A projection literal in a test reaches no database.
 */
function isTestFile(name: string): boolean {
  return name.endsWith(".test.ts") || name.endsWith(".test.tsx");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    // Recursive on purpose — see the header note on instance 11.
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
  return [...walk(here), join(here, "..", "..", "runs-load.ts")];
}

/**
 * Every projection-shaped string literal in a source file.
 *
 * A projection is recognised by its shape rather than by the call it is passed
 * to, so it is found whether it was written as a named constant, inline in a
 * `.select(...)`, or concatenated across lines: a quoted run of lowercase column
 * characters **containing a comma**.
 *
 * The comma is what makes this safe to run over `columns.ts` itself. Every entry
 * of `CIPHERTEXT_COLUMNS` is a single bare word — `"raw_status"`, `"question"` —
 * so the denylist that defines the rule is not mistaken for a violation of it,
 * while a real projection (`"id, unit, raw_status"`) matches and is checked.
 *
 * The literal must **begin and end on a column character**. Without that anchor
 * the match can open on one literal's closing quote and close on the next
 * literal's opening quote, so `fetchWhere(db, "work_item", "id, unit")` yields a
 * phantom `", "`. That was the first run of this file, and it is the ordinary
 * under-anchoring failure the same note describes.
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

describe("§7a — the run screens name no ciphertext column", () => {
  it("declares a denylist covering every bytea column on the tables it reads", () => {
    // Sourced from `20260819144331_schema_21_entities.sql`. Pinned so that
    // shrinking the denylist is a deliberate edit and not a silent one.
    expect([...CIPHERTEXT_COLUMNS].sort()).toEqual([
      "answer",
      "best_guess",
      "description",
      "question",
      "raw_status",
      "text",
      "wont_fix_reason",
    ]);
  });

  it("names no ciphertext column in any exported projection", () => {
    for (const [name, projection] of Object.entries(RUN_PROJECTIONS)) {
      expect(
        violations(projection),
        `${name} names a §7a ciphertext column. A run screen is a listing ` +
          `surface: it says which row to open, and the M2.7 detail view for ` +
          `that row is where prose is decrypted.`,
      ).toEqual([]);
    }
  });

  it("checks a non-empty set of projections, so a green result is not an empty one", () => {
    expect(Object.keys(RUN_PROJECTIONS).length).toBeGreaterThanOrEqual(5);
    for (const projection of Object.values(RUN_PROJECTIONS)) {
      expect(projectionColumns(projection).length).toBeGreaterThan(0);
    }
  });

  it("CONTROL — the predicate catches a ciphertext column in a projection", () => {
    // The exact edit this test exists to refuse, for each table it reads.
    expect(violations("id, unit, status, raw_status")).toEqual(["raw_status"]);
    expect(violations("id, run, unit, question, best_guess, answer")).toEqual([
      "question",
      "best_guess",
      "answer",
    ]);
    expect(violations("id, ref, title, description")).toEqual(["description"]);
    expect(violations("id, ref, section, text")).toEqual(["text"]);
    expect(violations("id, ref, status, wont_fix_reason")).toEqual([
      "wont_fix_reason",
    ]);
  });

  it("CONTROL — the predicate does not fire on a clean projection", () => {
    // Proves the control above is discriminating rather than always-positive.
    expect(violations("id, engagement_id, run_id, branch, mode, verdict")).toEqual(
      [],
    );
  });

  it("reads embedded resources too — a column hidden in an embed is still exposed", () => {
    expect(projectionColumns("id, engagement:engagement_id (slug, client_name)")).toEqual([
      "id",
      "engagement_id",
      "slug",
      "client_name",
    ]);
    expect(violations("id, work_item:work_item_id (unit, description)")).toEqual([
      "description",
    ]);
  });
});

describe("§7a — the source scan catches a projection written inline", () => {
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

  it("reads a non-empty set of files and finds real projections in them", () => {
    // Without both halves a broken walk or a broken extractor makes the
    // assertion above vacuously green — instance 11's exact failure.
    const files = guardedFiles();
    expect(files.length).toBeGreaterThanOrEqual(5);

    const found = files.flatMap((path) =>
      projectionLiterals(readFileSync(path, "utf8")),
    );
    expect(found.length).toBeGreaterThanOrEqual(5);
    // A projection the extractor must be seeing if it is working at all.
    expect(found.some((literal) => literal.includes("fixing_work_item_id"))).toBe(
      true,
    );
  });

  it("CONTROL — the extractor finds a violating inline select, and ignores the denylist", () => {
    const planted = [
      'const rows = await fetchWhere(db, "work_item", "id, unit, raw_status", "x", y);',
    ].join("\n");

    const literals = projectionLiterals(planted);
    expect(literals).toContain("id, unit, raw_status");
    expect(literals.flatMap(violations)).toEqual(["raw_status"]);

    // And the denylist's own single-word entries are not read as projections,
    // which is what makes it safe to scan `columns.ts` with this extractor.
    const denylist = '"description",\n  "raw_status",\n  "question",';
    expect(projectionLiterals(denylist)).toEqual([]);
  });
});
