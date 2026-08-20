/**
 * A pure function over migration SQL that answers one question: **what does a
 * `DELETE` on this table destroy?**
 *
 * ## The defect this exists to prevent
 *
 * CR-002 resolved FR-61 against §7a's append-only rule and it resolved it
 * absolutely: a hard deletion "does not reach `audit_log` or `test_result`, and
 * it never will". That is a statement about the SHAPE OF THE SCHEMA, not about
 * the SQL a purge function happens to write. A purge that names only the tables
 * CR-002 lists still destroys an append-only table the moment a foreign key
 * cascades into one — and the purge's own text would look correct while it did
 * it.
 *
 * It is not hypothetical. At the time this was written the chain existed:
 *
 *     engagement → test_case (on delete cascade) → test_result (on delete cascade)
 *
 * and `test_result` carries a `before update or delete` trigger calling
 * `app.deny_mutation()`. So `delete from public.engagement` did not quietly
 * destroy evidence — it raised `restrict_violation` and FR-61 was unbuildable,
 * which is precisely the conflict CR-002 §1 states. Either way the invariant is
 * the same one, and it is worth a test rather than a comment: **no cascade path
 * out of `engagement` may reach a table that refuses deletion.**
 *
 * ## Why a text analyzer rather than a live probe
 *
 * The same reasoning as `migration-grants.ts`: a probe against the real database
 * needs the service-role key, so it cannot run in CI and would be skipped in
 * exactly the situation where a regression slips through. The migrations are in
 * the repository, so this needs no credential and no network.
 *
 * **It is not evidence that any purge works.** The acceptance evidence for the
 * deletion path is a purge run against real rows. This defends against a later
 * migration re-introducing a cascade the CR forbids.
 *
 * ## Modelling limits, stated rather than discovered
 *
 * * Only single-column foreign keys are modelled, inline (`references …`) and
 *   as `alter table … add constraint … foreign key (col) references …`. The
 *   schema has no composite foreign key; `assertNoCompositeForeignKeys` fails if
 *   that stops being true rather than letting one go unseen.
 * * A dropped constraint is matched by name. Postgres auto-names a single-column
 *   foreign key `<table>_<column>_fkey`, so an inline reference is registered
 *   under that name and `drop constraint` removes it.
 * * `on delete set null` and `on delete restrict` are recorded but are NOT
 *   cascade edges — they do not propagate a delete. `set null` still writes to
 *   the referencing table, which an append-only trigger also refuses, so
 *   `appendOnlyWritesFrom` reports those separately.
 */

import { splitStatements, stripSqlComments } from "./migration-grants";

export interface MigrationFile {
  name: string;
  sql: string;
}

/** `on delete` behaviour, normalised. `no action` is the Postgres default. */
export type DeleteAction = "cascade" | "set null" | "set default" | "restrict" | "no action";

export interface ForeignKey {
  /** `public.test_result` — the table holding the referencing column. */
  table: string;
  column: string;
  /** `public.test_case` — the table pointed at. */
  references: string;
  onDelete: DeleteAction;
  /** The constraint name, explicit or Postgres's `<table>_<column>_fkey` default. */
  constraint: string;
  migration: string;
}

const CREATE_TABLE = /^create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+\.[a-z0-9_]+)\s*\(/;
const ALTER_TABLE = /^alter\s+table\s+(?:only\s+)?([a-z0-9_]+\.[a-z0-9_]+)\b/;
const CREATE_TRIGGER = /^create\s+trigger\s+([a-z0-9_]+)\s+/;

function normaliseAction(raw: string | undefined): DeleteAction {
  if (!raw) return "no action";
  const action = raw.trim().replace(/\s+/g, " ");
  if (action.startsWith("cascade")) return "cascade";
  if (action.startsWith("set null")) return "set null";
  if (action.startsWith("set default")) return "set default";
  if (action.startsWith("restrict")) return "restrict";
  return "no action";
}

/** Qualify a bare table name with `public`, the only schema this product's tables live in. */
function qualify(name: string): string {
  return name.includes(".") ? name : `public.${name}`;
}

/**
 * The parenthesised group beginning at `open`, respecting nesting and literals.
 * A local copy rather than an import: `migration-grants` keeps its own private.
 */
function balanced(sql: string, open: number): string {
  let depth = 0;
  let i = open;
  while (i < sql.length) {
    if (sql[i] === "'") {
      const end = sql.indexOf("'", i + 1);
      i = end === -1 ? sql.length : end + 1;
      continue;
    }
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) return sql.slice(open + 1, i);
    }
    i += 1;
  }
  return sql.slice(open + 1);
}

/** Split a `create table` body on top-level commas — column and constraint clauses. */
function splitClauses(body: string): string[] {
  const clauses: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of body) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      clauses.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim() !== "") clauses.push(current);
  return clauses.map((clause) => clause.trim()).filter((clause) => clause.length > 0);
}

const INLINE_REFERENCES =
  /^([a-z0-9_]+)\s+[a-z0-9_[\]]+(?:\s*\([^)]*\))?[\s\S]*?\breferences\s+([a-z0-9_.]+)\s*(?:\([^)]*\))?\s*([\s\S]*)$/;

const CONSTRAINT_FK =
  /\bforeign\s+key\s*\(\s*([a-z0-9_]+)\s*\)\s*references\s+([a-z0-9_.]+)\s*(?:\([^)]*\))?\s*([\s\S]*)$/;

function deleteActionFrom(tail: string): DeleteAction {
  const match = /\bon\s+delete\s+([a-z ]+)/.exec(tail);
  return normaliseAction(match?.[1]);
}

/**
 * Every single-column foreign key the migrations leave in place, in order, with
 * `alter table … drop constraint` applied.
 */
export function parseForeignKeys(files: MigrationFile[]): ForeignKey[] {
  const live = new Map<string, ForeignKey>();
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));

  for (const file of ordered) {
    for (const raw of splitStatements(stripSqlComments(file.sql))) {
      const statement = raw.replace(/\s+/g, " ").trim();
      const lower = statement.toLowerCase();
      if (lower.startsWith("comment on")) continue;

      const created = CREATE_TABLE.exec(lower);
      if (created) {
        const table = qualify(created[1]);
        const body = balanced(statement, created[0].length - 1);
        for (const clause of splitClauses(body)) {
          const inline = INLINE_REFERENCES.exec(clause.toLowerCase());
          if (inline && !clause.toLowerCase().trim().startsWith("constraint")) {
            const column = inline[1];
            const key = `${table}.${column}_fkey`;
            live.set(key, {
              table,
              column,
              references: qualify(inline[2]),
              onDelete: deleteActionFrom(inline[3]),
              constraint: `${created[1].split(".").pop()}_${column}_fkey`,
              migration: file.name,
            });
            continue;
          }
          const named = CONSTRAINT_FK.exec(clause.toLowerCase());
          if (named) {
            const column = named[1];
            const explicit = /^constraint\s+([a-z0-9_]+)/.exec(clause.toLowerCase().trim())?.[1];
            const constraint = explicit ?? `${created[1].split(".").pop()}_${column}_fkey`;
            live.set(`${table}.${constraint}`, {
              table,
              column,
              references: qualify(named[2]),
              onDelete: deleteActionFrom(named[3]),
              constraint,
              migration: file.name,
            });
          }
        }
        continue;
      }

      const altered = ALTER_TABLE.exec(lower);
      if (!altered) continue;
      const table = qualify(altered[1]);

      const dropped = /\bdrop\s+constraint\s+(?:if\s+exists\s+)?([a-z0-9_]+)/.exec(lower);
      if (dropped) {
        const name = dropped[1];
        // Registered either under its explicit name or under the synthesised
        // `<table>.<column>_fkey` key an inline reference produced.
        live.delete(`${table}.${name}`);
        for (const [key, fk] of [...live.entries()]) {
          if (fk.table === table && fk.constraint === name) live.delete(key);
        }
        continue;
      }

      const added = CONSTRAINT_FK.exec(lower);
      if (added) {
        const column = added[1];
        const explicit = /\badd\s+constraint\s+([a-z0-9_]+)/.exec(lower)?.[1];
        const constraint = explicit ?? `${altered[1].split(".").pop()}_${column}_fkey`;
        live.set(`${table}.${constraint}`, {
          table,
          column,
          references: qualify(added[2]),
          onDelete: deleteActionFrom(added[3]),
          constraint,
          migration: file.name,
        });
      }
    }
  }

  return [...live.values()];
}

/**
 * Tables carrying a row-level trigger that refuses `delete` — the append-only
 * set, read out of the schema rather than restated as a list here.
 *
 * Matched on `before ... delete on <table> ... execute function app.deny_mutation()`,
 * which is how §7a's append-only guarantee is actually spelled in this schema.
 */
export function parseDeleteRefusingTables(files: MigrationFile[]): string[] {
  const refusing = new Set<string>();
  for (const file of files) {
    for (const raw of splitStatements(stripSqlComments(file.sql))) {
      const statement = raw.replace(/\s+/g, " ").trim().toLowerCase();
      if (!CREATE_TRIGGER.test(statement)) continue;
      if (!/\bexecute\s+function\s+app\.deny_mutation\s*\(/.test(statement)) continue;
      if (!/\bbefore\b[\s\S]*?\bdelete\b/.test(statement.split(" on ")[0] + " on ")) {
        // The event list sits between `before` and `on <table>`; a truncate-only
        // trigger must not be read as refusing row deletes.
        const events = /\bbefore\s+([a-z or]+?)\s+on\s+/.exec(statement)?.[1] ?? "";
        if (!/\bdelete\b/.test(events)) continue;
      }
      const table = /\bon\s+([a-z0-9_.]+)\s+for\b/.exec(statement)?.[1];
      if (table) refusing.add(qualify(table));
    }
  }
  return [...refusing].sort();
}

export interface CascadeStep {
  from: string;
  to: string;
  via: string;
}

/**
 * Every table a `DELETE` on `root` destroys, and the path it takes to get there.
 *
 * Breadth-first over `on delete cascade` edges only. The root itself is not
 * included — it is being deleted by the caller, not by a cascade.
 */
export function cascadeReachable(
  files: MigrationFile[],
  root: string,
): Map<string, CascadeStep[]> {
  const keys = parseForeignKeys(files);
  const reached = new Map<string, CascadeStep[]>();
  const queue: [string, CascadeStep[]][] = [[qualify(root), []]];

  while (queue.length > 0) {
    const [table, path] = queue.shift()!;
    for (const fk of keys) {
      if (fk.references !== table) continue;
      if (fk.onDelete !== "cascade") continue;
      if (reached.has(fk.table) || fk.table === qualify(root)) continue;
      const step: CascadeStep = { from: table, to: fk.table, via: fk.column };
      const next = [...path, step];
      reached.set(fk.table, next);
      queue.push([fk.table, next]);
    }
  }

  return reached;
}

export interface CascadeViolation {
  table: string;
  path: string;
}

/**
 * CR-002 §2 as an assertion. Empty means the schema cannot carry a delete on
 * `root` into a table that refuses one.
 */
export function findAppendOnlyCascades(
  files: MigrationFile[],
  root: string,
): CascadeViolation[] {
  const refusing = new Set(parseDeleteRefusingTables(files));
  const violations: CascadeViolation[] = [];
  for (const [table, path] of cascadeReachable(files, root)) {
    if (!refusing.has(table)) continue;
    violations.push({
      table,
      path: [qualify(root), ...path.map((step) => step.to)].join(" → "),
    });
  }
  return violations.sort((a, b) => a.table.localeCompare(b.table));
}

/** Bare single-column modelling is exact only while no composite foreign key exists. */
export function findCompositeForeignKeys(files: MigrationFile[]): string[] {
  const found: string[] = [];
  for (const file of files) {
    for (const raw of splitStatements(stripSqlComments(file.sql))) {
      const statement = raw.replace(/\s+/g, " ").trim().toLowerCase();
      for (const match of statement.matchAll(/\bforeign\s+key\s*\(([^)]*)\)/g)) {
        if (match[1].includes(",")) found.push(`${file.name}: foreign key (${match[1]})`);
      }
    }
  }
  return found;
}

export interface Column {
  name: string;
  /** Lower-cased declared type, e.g. `bytea`, `uuid`, `text`. */
  type: string;
}

const RESERVED_CLAUSE = /^(constraint|primary|foreign|unique|check|exclude|like)\b/;

/**
 * Every `public` table the migrations create, with its columns — `create table`
 * plus any `alter table … add column` that follows.
 *
 * This is what makes "the export covers every table" an assertion rather than a
 * hope: the expected set is read out of the schema, so a 22nd table is a test
 * failure on the day it is created rather than a silently missing section in a
 * file nobody reads until they need it.
 */
export function parseTables(files: MigrationFile[]): Map<string, Column[]> {
  const tables = new Map<string, Column[]>();
  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));

  for (const file of ordered) {
    for (const raw of splitStatements(stripSqlComments(file.sql))) {
      const statement = raw.replace(/\s+/g, " ").trim();
      const lower = statement.toLowerCase();
      if (lower.startsWith("comment on")) continue;

      const created = CREATE_TABLE.exec(lower);
      if (created) {
        const columns: Column[] = [];
        for (const clause of splitClauses(balanced(statement, created[0].length - 1))) {
          const normalised = clause.replace(/\s+/g, " ").trim().toLowerCase();
          if (RESERVED_CLAUSE.test(normalised)) continue;
          const match = /^([a-z0-9_]+)\s+([a-z0-9_]+(?:\s*\[\s*\])?)/.exec(normalised);
          if (match) columns.push({ name: match[1], type: match[2].replace(/\s+/g, "") });
        }
        tables.set(qualify(created[1]), columns);
        continue;
      }

      const altered = ALTER_TABLE.exec(lower);
      if (!altered) continue;
      const table = qualify(altered[1]);
      const columns = tables.get(table);
      if (!columns) continue;
      // ALL of them: `alter table t add column a bytea, add column b text` is one
      // statement, and matching once would let the second column through unseen.
      for (const added of lower.matchAll(
        /\badd\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+([a-z0-9_]+(?:\s*\[\s*\])?)/g,
      )) {
        columns.push({ name: added[1], type: added[2].replace(/\s+/g, "") });
      }
    }
  }

  return tables;
}

/** Every `<table>.<column>` in the schema whose declared type is `bytea` — §7a's encrypted set. */
export function encryptedColumns(files: MigrationFile[]): string[] {
  const found: string[] = [];
  for (const [table, columns] of parseTables(files)) {
    for (const column of columns) {
      if (column.type === "bytea") found.push(`${table}.${column.name}`);
    }
  }
  return found.sort();
}

/**
 * The dollar-quoted body of a named function, or null.
 *
 * Comments are NOT stripped from the returned body — a function's own prose is
 * part of what a reader checks — but the statement is located after stripping,
 * so a header comment discussing the function cannot be mistaken for it.
 */
export function functionBody(files: MigrationFile[], name: string): string | null {
  const pattern = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${name.replace(".", "\\.")}\\s*\\(`,
    "i",
  );
  for (const file of files) {
    for (const raw of splitStatements(stripSqlComments(file.sql))) {
      if (!pattern.test(raw)) continue;
      const tag = /\$[A-Za-z_]*\$/.exec(raw);
      if (!tag) continue;
      const start = raw.indexOf(tag[0]) + tag[0].length;
      const end = raw.indexOf(tag[0], start);
      return end === -1 ? raw.slice(start) : raw.slice(start, end);
    }
  }
  return null;
}
