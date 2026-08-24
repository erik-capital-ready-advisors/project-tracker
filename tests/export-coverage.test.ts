// @vitest-environment node
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { MigrationFile } from "./schema-analysis";
import { encryptedColumns, functionBody, parseTables } from "./schema-analysis";

/**
 * FR-60, asserted against the schema instead of against the export's good
 * intentions.
 *
 * > "A full export produces **every record** in one machine-readable document,
 * > read through a single database function rather than table by table."
 *
 * §7a's own reasoning for the single function is that "a table-by-table export
 * ships silently incomplete the day any table crosses the API's row cap". The
 * failure mode it names — **silently incomplete** — survives the fix. One
 * function that forgets a table is exactly as incomplete as twenty-one requests
 * that lose one, and it looks exactly as finished.
 *
 * So the expected table list is not written here. It is read out of the
 * migrations, which means a 22nd table fails this test on the day it is created
 * rather than going missing from a file nobody opens until they need it.
 *
 * The same argument covers the encrypted columns. An export that returns a
 * `bytea` unchanged looks complete, weighs the same, and is unreadable without
 * the Vault key — which is gone in every scenario that makes an export the
 * thing you reach for.
 */

const MIGRATIONS_DIR = join(import.meta.dirname, "..", "supabase", "migrations");

function realMigrations(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

/**
 * The tables an export must carry: everything in `public`.
 *
 * `app.rate_limit_counters` is deliberately not among them, and the reason is
 * worth naming rather than letting the count quietly work out. It is a token id,
 * a window and a counter — ephemeral throttling state that is meaningless an
 * hour after it is written, describes no client and no delivery, and would be
 * actively misleading in a document titled "every record". It is also the
 * unclassified 22nd table behind open blocker **B24**; excluding it here does
 * not settle that, and must not be read as settling it.
 */
function exportedTables(): string[] {
  return [...parseTables(realMigrations()).keys()]
    .filter((table) => table.startsWith("public."))
    .sort();
}

function exportBody(): string {
  const body = functionBody(realMigrations(), "app.export_document");
  if (body === null) throw new Error("app.export_document() is not defined in any migration");
  return body;
}

describe("the reader can go red — controls", () => {
  it("finds a function body and not the prose above it", () => {
    const sql = `
      -- create or replace function app.decoy() returns void as $$ wrong $$;
      create or replace function app.real() returns int language sql as $$ select 1 $$;
    `;
    expect(functionBody([{ name: "0001.sql", sql }], "app.real")?.trim()).toBe("select 1");
    expect(functionBody([{ name: "0001.sql", sql }], "app.decoy")).toBeNull();
  });

  it("reads a bytea column out of an alter table as well as a create table", () => {
    const sql = `
      create table public.thing (id uuid primary key, secret bytea);
      alter table public.thing add column later_secret bytea;
    `;
    expect(encryptedColumns([{ name: "0001.sql", sql }])).toEqual([
      "public.thing.later_secret",
      "public.thing.secret",
    ]);
  });

  it("reads every column of a multi-column alter, not just the first", () => {
    const sql = `
      create table public.thing (id uuid primary key);
      alter table public.thing add column one bytea, add column two bytea;
    `;
    expect(encryptedColumns([{ name: "0001.sql", sql }])).toEqual([
      "public.thing.one",
      "public.thing.two",
    ]);
  });

  it("does not read a constraint clause as a column", () => {
    const sql = `
      create table public.thing (
        id uuid primary key,
        constraint thing_shape check (id is not null)
      );
    `;
    expect(parseTables([{ name: "0001.sql", sql }]).get("public.thing")).toEqual([
      { name: "id", type: "uuid" },
    ]);
  });
});

describe("FR-60 — the export reaches every record", () => {
  it("reads all 21 tables, named individually", () => {
    const body = exportBody();
    const missing = exportedTables()
      .filter((table) => !new RegExp(`\\bfrom\\s+${table.replace(".", "\\.")}\\b`).test(body))
      .sort();

    expect(missing).toEqual([]);
  });

  it("covers exactly the 21 entities §7a classifies, with nothing extra", () => {
    expect(exportedTables()).toHaveLength(21);
  });

  it("leaves the unclassified 22nd table out, and it is the only one left out", () => {
    const all = [...parseTables(realMigrations()).keys()].sort();
    expect(all.filter((table) => !table.startsWith("public."))).toEqual([
      "app.rate_limit_counters",
    ]);
  });

  it("decrypts every encrypted column rather than emitting ciphertext", () => {
    const body = exportBody();
    const undecrypted = encryptedColumns(realMigrations())
      .filter((qualified) => qualified.startsWith("public."))
      .filter((qualified) => {
      const column = qualified.split(".").pop();
      return !new RegExp(`app\\.decrypt_field\\s*\\(\\s*[a-z0-9_]+\\.${column}\\s*\\)`).test(body);
    });

    expect(undecrypted).toEqual([]);
  });

  it("withholds the agent-token hash, and says so in the document", () => {
    const body = exportBody();

    // §7a: `agent_token` "never returned by any read endpoint". A bcrypt hash in
    // a file on a laptop is an offline cracking target, and nothing about an
    // export needs one — the plaintext was shown once and stored nowhere.
    expect(/to_jsonb\s*\(\s*[a-z0-9_]+\s*\)\s*-\s*'token_hash'/.test(body)).toBe(true);
    expect(body).toContain("agent_token.token_hash");
  });

  it("declares what it is, so a file found later can be identified", () => {
    const body = exportBody();
    expect(body).toContain("delivery-ledger-export");
    expect(body).toContain("'decrypted'");
  });

  it("carries a per-table count beside the rows, so a truncated file is detectable", () => {
    expect(exportBody()).toContain("'counts'");
  });
});
