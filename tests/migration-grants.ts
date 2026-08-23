/**
 * A pure function over migration SQL that finds the C1 defect class.
 *
 * ## The defect this exists to prevent
 *
 * `20260819165903_i5_ingest_idempotency_and_gates.sql` revoked EXECUTE on
 * `app.gates_are_closed_set(jsonb)` from `public, anon, authenticated` and never
 * granted it back, then put that same function in a CHECK constraint on
 * `public.fleet_run`. A CHECK constraint is evaluated in the CALLER's role, and
 * revoking from PUBLIC removes the implicit EXECUTE that `service_role` was
 * relying on. Result: `POST /api/ingest/run` returned 500 for every payload —
 * the product's primary intake, dead — while `pnpm build`, `pnpm typecheck` and
 * all 919 unit tests stayed green.
 *
 * Nothing in the suite could have caught it, because nothing in the suite looked
 * at a privilege. This does.
 *
 * ## Why a text analyzer rather than a live probe
 *
 * A test that asserts `has_function_privilege(...)` against the real database
 * needs a service-role key, so it cannot run in CI and would be skipped exactly
 * where a regression would slip through. This reads the migration files, which
 * are in the repository, and needs no credential and no network. It is the same
 * discipline the ingest parsers follow: a pure function over text, testable
 * against a frozen string.
 *
 * **It is not evidence that any route works.** The acceptance evidence for the
 * grant being right is an HTTP round trip through the running app; this defends
 * against the grant regressing.
 *
 * ## What it covers, and what it does not
 *
 * Covered — the two caller-role contexts that exist in this schema, confirmed by
 * a census of the live database (`pg_constraint`, `pg_attrdef`, `pg_index`,
 * `pg_policy`, `pg_class` view bodies) on 2026-08-19:
 *
 *   * CHECK constraints. Every write to these tables is made by `service_role`,
 *     so a function named in one must be executable by `service_role`.
 *   * RLS policy expressions. A function named in one must be executable by
 *     every role in the policy's `TO` list.
 *
 * NOT covered: column defaults, generated columns and index expressions (the
 * census found none calling an `app.*` function, and Postgres does not re-check
 * EXECUTE on those at write time anyway), and calls made from inside another
 * function's body (those run in that function's security context, which is the
 * whole reason i1's `public.*` SECURITY DEFINER wrappers work).
 *
 * Overloads are not modelled: functions are keyed by bare name, which is exact
 * for this schema because `app` has no overloaded names. `assertNoOverloads`
 * fails if that ever stops being true, rather than letting the key go silently
 * wrong.
 */

export interface MigrationFile {
  name: string;
  sql: string;
}

export interface GrantFinding {
  /** `app.gates_are_closed_set` */
  fn: string;
  /** The role that cannot execute it but needs to. */
  role: string;
  /** Human-readable caller-role context, e.g. `CHECK constraint on public.fleet_run`. */
  context: string;
  /** The migration that introduced the context. */
  migration: string;
}

/** Roles that write through the application. A CHECK constraint is evaluated as the caller. */
const WRITER_ROLE = "service_role";

/**
 * Remove `--` line comments and `/* *\/` block comments without touching the
 * insides of string literals or dollar-quoted function bodies.
 *
 * This matters more than it looks: the migration that carried the defect
 * discusses `grant`, `revoke` and the function's own name at length in a header
 * comment. A naive regex over the raw text reads that prose as SQL and concludes
 * the grant is present.
 */
export function stripSqlComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const end = sql.indexOf("\n", i);
      i = end === -1 ? sql.length : end;
      continue;
    }
    if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      i = end === -1 ? sql.length : end + 2;
      continue;
    }
    if (sql[i] === "'") {
      const end = findQuoteEnd(sql, i);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      out += sql.slice(i, stop);
      i = stop;
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

/** Index just past the closing quote of the single-quoted literal starting at `start`. */
function findQuoteEnd(sql: string, start: number): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === "'") {
      if (sql[i + 1] === "'") {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return sql.length;
}

/** Split on top-level `;`, ignoring separators inside literals and dollar-quoted bodies. */
export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      const end = findQuoteEnd(sql, i);
      current += sql.slice(i, end);
      i = end;
      continue;
    }
    const dollar = /^\$[A-Za-z_]*\$/.exec(sql.slice(i));
    if (dollar) {
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? sql.length : end + tag.length;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (sql[i] === ";") {
      statements.push(current);
      current = "";
      i += 1;
      continue;
    }
    current += sql[i];
    i += 1;
  }
  statements.push(current);
  return statements.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** The parenthesised group beginning at `open`, respecting nesting and literals. */
function balanced(sql: string, open: number): string {
  let depth = 0;
  let i = open;
  while (i < sql.length) {
    if (sql[i] === "'") {
      i = findQuoteEnd(sql, i);
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

/** Every `app.<name>` or `public.<name>` invoked as a function inside an expression. */
function functionsCalledIn(expression: string): string[] {
  const found = new Set<string>();
  for (const match of expression.matchAll(/\b(app|public)\.([a-z0-9_]+)\s*\(/g)) {
    found.add(`${match[1]}.${match[2]}`);
  }
  return [...found];
}

interface Privilege {
  /** Roles holding an explicit GRANT that has not been revoked since. */
  explicit: Set<string>;
  /** True until an explicit `revoke ... from public`. Every function starts with it. */
  publicGrant: boolean;
}

interface CallerContext {
  expression: string;
  roles: string[];
  label: string;
  migration: string;
  /** Statement ordinal, so a grant later in the same run still counts. */
  order: number;
}

const CREATE_FN = /^create\s+(?:or\s+replace\s+)?function\s+([a-z0-9_]+)\.([a-z0-9_]+)\s*\(/;
const GRANT_FN = /^grant\s+execute\s+on\s+function\s+([a-z0-9_]+)\.([a-z0-9_]+)\s*\(/;
const REVOKE_FN = /^revoke\s+execute\s+on\s+function\s+([a-z0-9_]+)\.([a-z0-9_]+)\s*\(/;

function rolesAfter(statement: string, keyword: "to" | "from", fromIndex: number): string[] {
  const tail = statement.slice(fromIndex);
  const match = new RegExp(`\\b${keyword}\\s+([^()]+)$`).exec(tail);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((role) => role.trim().replace(/;$/, ""))
    .filter((role) => role.length > 0);
}

/**
 * Report every caller-role context whose function is not executable by a role
 * that reaches it. An empty array means the migrations are consistent.
 */
export function findMissingGrants(files: MigrationFile[]): GrantFinding[] {
  const privileges = new Map<string, Privilege>();
  const contexts: CallerContext[] = [];
  let order = 0;

  const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name));

  for (const file of ordered) {
    for (const raw of splitStatements(stripSqlComments(file.sql))) {
      order += 1;
      const statement = raw.replace(/\s+/g, " ").trim().toLowerCase();

      // A comment body is prose. It is stripped of `--` comments but a COMMENT ON
      // statement's string literal survives, and this repo's literals discuss
      // constraints at length.
      if (statement.startsWith("comment on")) continue;

      const created = CREATE_FN.exec(statement);
      if (created) {
        const key = `${created[1]}.${created[2]}`;
        // CREATE OR REPLACE FUNCTION *preserves* existing privileges in Postgres,
        // so a replacement must not reset what earlier migrations granted. Only a
        // name seen for the first time gets the default (PUBLIC holds EXECUTE).
        if (!privileges.has(key)) {
          privileges.set(key, { explicit: new Set(), publicGrant: true });
        }
        // A function body is not a caller-role context; nothing else to do here.
        continue;
      }

      const granted = GRANT_FN.exec(statement);
      if (granted) {
        const key = `${granted[1]}.${granted[2]}`;
        const privilege = privileges.get(key) ?? { explicit: new Set(), publicGrant: true };
        for (const role of rolesAfter(statement, "to", granted[0].length)) {
          if (role === "public") privilege.publicGrant = true;
          else privilege.explicit.add(role);
        }
        privileges.set(key, privilege);
        continue;
      }

      const revoked = REVOKE_FN.exec(statement);
      if (revoked) {
        const key = `${revoked[1]}.${revoked[2]}`;
        const privilege = privileges.get(key) ?? { explicit: new Set(), publicGrant: true };
        for (const role of rolesAfter(statement, "from", revoked[0].length)) {
          if (role === "public") privilege.publicGrant = false;
          else privilege.explicit.delete(role);
        }
        privileges.set(key, privilege);
        continue;
      }

      if (statement.startsWith("create policy")) {
        const table = /\bon\s+([a-z0-9_.]+)/.exec(statement)?.[1] ?? "an unnamed table";
        const roleClause = /\bto\s+([a-z0-9_, ]+?)\s+(?:using|with check)\b/.exec(statement);
        const roles = (roleClause?.[1] ?? "public")
          .split(",")
          .map((role) => role.trim())
          .filter((role) => role.length > 0);
        for (const [keyword, index] of expressionStarts(statement, ["using", "with check"])) {
          contexts.push({
            expression: balanced(statement, index),
            roles,
            label: `RLS policy ${keyword.toUpperCase()} on ${table}`,
            migration: file.name,
            order,
          });
        }
        continue;
      }

      // Anything else that carries a bare `check (` is a table constraint.
      const table =
        /\b(?:alter|create)\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)/.exec(statement)?.[1] ??
        "an unnamed table";
      for (const [, index] of expressionStarts(statement, ["check"])) {
        contexts.push({
          expression: balanced(statement, index),
          roles: [WRITER_ROLE],
          label: `CHECK constraint on ${table}`,
          migration: file.name,
          order,
        });
      }
    }
  }

  const findings: GrantFinding[] = [];
  for (const context of contexts) {
    for (const fn of functionsCalledIn(context.expression)) {
      const privilege = privileges.get(fn);
      // A function this repo never declares is out of scope — a Postgres builtin
      // or an extension, neither of which this analyzer governs.
      if (!privilege) continue;
      for (const role of context.roles) {
        if (role === "public") continue;
        if (privilege.publicGrant || privilege.explicit.has(role)) continue;
        findings.push({ fn, role, context: context.label, migration: context.migration });
      }
    }
  }
  return findings;
}

/**
 * Offsets of the `(` opening each named expression keyword. `with check` is
 * matched before `check` so a policy's WITH CHECK is not also counted as a bare
 * constraint.
 */
function expressionStarts(
  statement: string,
  keywords: readonly string[],
): [string, number][] {
  const starts: [string, number][] = [];
  for (const keyword of keywords) {
    const pattern = new RegExp(`(?:^|[\\s,)])${keyword}\\s*\\(`, "g");
    for (const match of statement.matchAll(pattern)) {
      starts.push([keyword, match.index + match[0].length - 1]);
    }
  }
  return starts;
}

/** Bare-name keying is exact only while no schema overloads a function name. */
export function findOverloadedFunctions(files: MigrationFile[]): string[] {
  const signatures = new Map<string, Set<string>>();
  for (const file of files) {
    for (const raw of splitStatements(stripSqlComments(file.sql))) {
      const statement = raw.replace(/\s+/g, " ").trim().toLowerCase();
      const created = CREATE_FN.exec(statement);
      if (!created) continue;
      const key = `${created[1]}.${created[2]}`;
      const args = balanced(statement, created[0].length - 1).trim();
      const set = signatures.get(key) ?? new Set<string>();
      set.add(args);
      signatures.set(key, set);
    }
  }
  return [...signatures.entries()]
    .filter(([, args]) => args.size > 1)
    .map(([name]) => name);
}
