// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { MigrationFile } from "./migration-grants";
import { findMissingGrants, findOverloadedFunctions, stripSqlComments } from "./migration-grants";

/**
 * The regression gate for defect C1 (run b0952e).
 *
 * i5 revoked EXECUTE on `app.gates_are_closed_set(jsonb)` from PUBLIC and put
 * the function in a CHECK constraint on `public.fleet_run`. CHECK constraints
 * evaluate in the caller's role; every application write is `service_role`; so
 * `POST /api/ingest/run` — the product's primary intake — returned 500 for every
 * payload while typecheck, build and all 919 unit tests stayed green.
 *
 * The synthetic cases below come first deliberately. They are the control: they
 * prove this suite can go red, which is the thing that was missing when the
 * defect shipped. `tests/fixtures/`-style frozen strings, not the real corpus.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "supabase", "migrations");

function realMigrations(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

/** The shape of the defect, reduced to the four statements that produce it. */
const DEFECT = `
  create or replace function app.gate_check(v jsonb) returns boolean language sql as $$
    select v is not null;
  $$;
  revoke execute on function app.gate_check(jsonb) from public, anon, authenticated;
  create table public.fleet_run (id uuid primary key, gates jsonb not null default '{}'::jsonb);
  alter table public.fleet_run add constraint fleet_run_gates check (app.gate_check(gates));
`;

const FIXED = `${DEFECT}\n grant execute on function app.gate_check(jsonb) to service_role;`;

describe("the analyzer can go red — controls", () => {
  it("catches the exact i5 defect", () => {
    const findings = findMissingGrants([{ name: "0001_defect.sql", sql: DEFECT }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      fn: "app.gate_check",
      role: "service_role",
      context: "CHECK constraint on public.fleet_run",
    });
  });

  it("goes green once the grant is added", () => {
    expect(findMissingGrants([{ name: "0001_fixed.sql", sql: FIXED }])).toEqual([]);
  });

  it("goes red again if the grant is later revoked", () => {
    const regressed = `${FIXED}\n revoke execute on function app.gate_check(jsonb) from service_role;`;
    expect(findMissingGrants([{ name: "0001_regressed.sql", sql: regressed }])).toHaveLength(1);
  });

  it("catches the same defect in an RLS policy, against the policy's own roles", () => {
    const sql = `
      create or replace function app.is_operator() returns boolean language sql as $$ select true; $$;
      revoke execute on function app.is_operator() from public;
      create table public.thing (id uuid primary key);
      create policy thing_select on public.thing for select to authenticated using (app.is_operator());
    `;
    const findings = findMissingGrants([{ name: "0002_policy.sql", sql }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ fn: "app.is_operator", role: "authenticated" });
  });

  it("is not fooled by a header comment that merely discusses the grant", () => {
    // The migration that shipped the defect talks about `grant`, `revoke` and the
    // function's own name for sixty lines before the SQL. A text check that reads
    // prose as SQL concludes the grant is present and reports nothing.
    const prose = `
      -- grant execute on function app.gate_check(jsonb) to service_role;
      /* grant execute on function app.gate_check(jsonb) to service_role; */
      ${DEFECT}
    `;
    expect(findMissingGrants([{ name: "0003_prose.sql", sql: prose }])).toHaveLength(1);
  });

  it("does not mistake a COMMENT ON body for a constraint", () => {
    const sql = `${FIXED}
      comment on constraint fleet_run_gates on public.fleet_run is
        'a check (app.gate_check(gates)) that a later writer must not widen';`;
    expect(findMissingGrants([{ name: "0004_comment.sql", sql }])).toEqual([]);
  });

  it("preserves privileges across CREATE OR REPLACE, as Postgres does", () => {
    const sql = `${FIXED}
      create or replace function app.gate_check(v jsonb) returns boolean language sql as $$
        select v is not null;
      $$;`;
    expect(findMissingGrants([{ name: "0005_replace.sql", sql }])).toEqual([]);
  });

  it("strips comments without eating dollar-quoted bodies or literals", () => {
    const stripped = stripSqlComments(`select 1; -- gone\n$$ -- kept $$ '-- kept'`);
    expect(stripped).not.toContain("gone");
    expect(stripped.match(/kept/g)).toHaveLength(2);
  });
});

describe("this repository's migrations", () => {
  it("grants every function reached from a caller-role context to the roles that reach it", () => {
    const findings = findMissingGrants(realMigrations());
    expect(
      findings.map((f) => `${f.fn} unreachable by ${f.role} — ${f.context} (${f.migration})`),
    ).toEqual([]);
  });

  it("keeps function names unique, which is what makes bare-name keying exact", () => {
    expect(findOverloadedFunctions(realMigrations())).toEqual([]);
  });

  it("reads a non-empty set of migrations, so a green result is not an empty one", () => {
    // Without this, deleting supabase/migrations/ makes the suite pass.
    expect(realMigrations().length).toBeGreaterThanOrEqual(8);
  });
});
