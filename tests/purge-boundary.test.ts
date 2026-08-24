// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { MigrationFile } from "./schema-analysis";
import {
  cascadeReachable,
  findAppendOnlyCascades,
  findCompositeForeignKeys,
  functionBody,
  parseDeleteRefusingTables,
  parseForeignKeys,
} from "./schema-analysis";

/**
 * CR-002 §2, enforced against the schema rather than against a purge function's
 * good intentions.
 *
 * "It **does not reach** `audit_log` or `test_result`, and it never will."
 *
 * A purge that names only the tables CR-002 §2.1 lists is not evidence of that.
 * A foreign key cascading out of `engagement` reaches whatever it reaches, and
 * the purge's own text stays innocent while it does. So the assertion is on the
 * cascade graph.
 *
 * The synthetic cases come first deliberately: they are the control, and they
 * prove this suite can go red. Frozen strings, never the real corpus.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "supabase", "migrations");

function realMigrations(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

/** The conflict CR-002 §1 states, reduced to the four statements that produce it. */
const CONFLICT = `
  create table public.engagement (id uuid primary key);
  create table public.test_case (
    id uuid primary key,
    engagement_id uuid not null references public.engagement (id) on delete cascade
  );
  create table public.test_result (
    id uuid primary key,
    test_case_id uuid not null references public.test_case (id) on delete cascade
  );
  create trigger test_result_append_only
    before update or delete on public.test_result
    for each row execute function app.deny_mutation();
`;

const RESOLVED = `${CONFLICT}
  alter table public.test_result drop constraint test_result_test_case_id_fkey;
`;

describe("the analyzer can go red — controls", () => {
  it("catches a cascade that reaches an append-only table", () => {
    const violations = findAppendOnlyCascades(
      [{ name: "0001_conflict.sql", sql: CONFLICT }],
      "public.engagement",
    );
    expect(violations).toEqual([
      {
        table: "public.test_result",
        path: "public.engagement → public.test_case → public.test_result",
      },
    ]);
  });

  it("goes green once the foreign key is dropped", () => {
    expect(
      findAppendOnlyCascades([{ name: "0001_resolved.sql", sql: RESOLVED }], "public.engagement"),
    ).toEqual([]);
  });

  it("still deletes test_case — dropping the key decouples the evidence, not the fixture", () => {
    const reached = cascadeReachable(
      [{ name: "0001_resolved.sql", sql: RESOLVED }],
      "public.engagement",
    );
    expect([...reached.keys()]).toEqual(["public.test_case"]);
  });

  it("reads on delete set null as no cascade at all", () => {
    const sql = `
      create table public.engagement (id uuid primary key);
      create table public.work_item (
        id uuid primary key,
        engagement_id uuid references public.engagement (id) on delete set null
      );
    `;
    expect([...cascadeReachable([{ name: "0001.sql", sql }], "public.engagement").keys()]).toEqual(
      [],
    );
  });

  it("finds the append-only set from the trigger, not from a list written here", () => {
    expect(parseDeleteRefusingTables([{ name: "0001.sql", sql: CONFLICT }])).toEqual([
      "public.test_result",
    ]);
  });

  it("does not read a truncate-only trigger as refusing a row delete", () => {
    const sql = `
      create trigger t_no_truncate
        before truncate on public.test_result
        for each statement execute function app.deny_mutation();
    `;
    expect(parseDeleteRefusingTables([{ name: "0001.sql", sql }])).toEqual([]);
  });
});

describe("the real schema — CR-002 §2", () => {
  it("models every foreign key as single-column", () => {
    expect(findCompositeForeignKeys(realMigrations())).toEqual([]);
  });

  it("finds the append-only tables §7a names", () => {
    expect(parseDeleteRefusingTables(realMigrations())).toEqual([
      "public.audit_log",
      "public.test_result",
    ]);
  });

  it("carries no cascade from engagement into a table that refuses deletion", () => {
    expect(findAppendOnlyCascades(realMigrations(), "public.engagement")).toEqual([]);
  });

  it("still cascades into every table CR-002 §2.1 says a purge destroys", () => {
    const reached = [...cascadeReachable(realMigrations(), "public.engagement").keys()].sort();
    expect(reached).toEqual([
      "public.acceptance_criterion",
      "public.blocker",
      "public.contract_milestone",
      "public.defect",
      "public.external_wait",
      "public.fleet_run",
      "public.open_question",
      "public.release",
      "public.release_requirement",
      "public.requirement",
      "public.test_case",
      "public.work_item",
      "public.work_item_dependency",
      "public.work_item_requirement",
      "public.work_session",
    ]);
  });

  it("leaves test_result's test_case_id as a recorded identifier, not a reference", () => {
    const keys = parseForeignKeys(realMigrations());
    const fromTestResult = keys.filter((key) => key.table === "public.test_result");
    expect(fromTestResult).toEqual([]);
  });
});

describe("FR-61 — the purge itself", () => {
  function purgeBody(): string {
    const body = functionBody(realMigrations(), "app.purge_engagement");
    if (body === null) throw new Error("app.purge_engagement() is not defined in any migration");
    return body;
  }

  it("issues exactly one delete, against the engagement row", () => {
    const targets = [...purgeBody().matchAll(/\bdelete\s+from\s+([a-z0-9_.]+)/gi)].map(
      (match) => match[1].toLowerCase(),
    );

    // Everything else goes by cascade, which `findAppendOnlyCascades` above
    // proves cannot reach an append-only table. A purge that names its own
    // tables would drift from the schema the moment one is added.
    expect(targets).toEqual(["public.engagement"]);
  });

  it("records the deletion in the audit log it may not delete from", () => {
    expect(/insert\s+into\s+public\.audit_log/i.test(purgeBody())).toBe(true);
  });

  it("names every table it destroyed, so the blast radius survives the rows", () => {
    const body = purgeBody();
    for (const table of cascadeReachable(realMigrations(), "public.engagement").keys()) {
      expect(body).toContain(table.replace("public.", ""));
    }
  });

  it("refuses an engagement that is not archived — FR-61's 'never the default'", () => {
    expect(purgeBody()).toContain("archived_at");
    expect(purgeBody()).toContain("not_archived");
  });

  it("counts before it deletes, because afterwards there is nothing to count", () => {
    const body = purgeBody();
    expect(body.indexOf("count(*)")).toBeLessThan(body.indexOf("delete from public.engagement"));
  });
});
