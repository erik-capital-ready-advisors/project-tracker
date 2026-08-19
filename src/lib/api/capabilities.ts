import type { Database } from "@/lib/database.types";

/**
 * FR-5. Exactly two capabilities exist, and this module is the only place that
 * knows how they are spelled.
 *
 * They are spelled two ways and both are load-bearing:
 *
 *   * **On the wire** — `answer:read`, `ingest:write`. This is the spelling the
 *     spec uses (FR-5, FR-57, FR-64), so it is what an agent operator reads in
 *     the token-issue screen and what appears in the audit log.
 *   * **In Postgres** — `answer_read`, `ingest_write`. The `agent_capability`
 *     enum cannot hold a colon comfortably and i1 chose underscores.
 *
 * Converting between them by hand at each call site is how the two drift. Every
 * conversion goes through `toWireCapability` / `toStoredCapability`.
 */

export type StoredCapability = Database["public"]["Enums"]["agent_capability"];

/** `answer:read` may call the six answer endpoints (FR-57, FR-72). */
export const ANSWER_READ = "answer:read" as const;
/** `ingest:write` may post artifacts, sessions and waits (FR-5, FR-33, FR-64). */
export const INGEST_WRITE = "ingest:write" as const;

export const WIRE_CAPABILITIES = [ANSWER_READ, INGEST_WRITE] as const;
export type WireCapability = (typeof WIRE_CAPABILITIES)[number];

const WIRE_TO_STORED: Readonly<Record<WireCapability, StoredCapability>> = {
  [ANSWER_READ]: "answer_read",
  [INGEST_WRITE]: "ingest_write",
};

const STORED_TO_WIRE: Readonly<Record<StoredCapability, WireCapability>> = {
  answer_read: ANSWER_READ,
  ingest_write: INGEST_WRITE,
};

export function toStoredCapability(wire: WireCapability): StoredCapability {
  return WIRE_TO_STORED[wire];
}

export function toWireCapability(stored: StoredCapability): WireCapability {
  return STORED_TO_WIRE[stored];
}

/**
 * Parse a capability that arrived as untrusted text — a query string, a form
 * field, a JSON body.
 *
 * Returns `null` rather than guessing. This is the `unparsed` rule applied to a
 * security decision: a capability string the system does not recognise must
 * never fall through to a default, because the only two defaults available are
 * "grant nothing" (which silently breaks a legitimate token) and "grant
 * something" (which is the bug this whole file exists to prevent).
 */
export function parseWireCapability(raw: unknown): WireCapability | null {
  if (typeof raw !== "string") return null;
  return (WIRE_CAPABILITIES as readonly string[]).includes(raw)
    ? (raw as WireCapability)
    : null;
}

/** Parse a list of capabilities, refusing the whole list if any member is unknown. */
export function parseWireCapabilities(raw: unknown): WireCapability[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const parsed: WireCapability[] = [];
  for (const item of raw) {
    const capability = parseWireCapability(item);
    if (capability === null) return null;
    if (!parsed.includes(capability)) parsed.push(capability);
  }
  return parsed;
}

/**
 * FR-5, second sentence: "Neither may read commercial figures."
 *
 * These are the tables an agent-authenticated request may not touch, and where
 * each entry comes from:
 *
 * | Table                 | Source                                                  |
 * |-----------------------|---------------------------------------------------------|
 * | `contract_milestone`  | spec §7a + FR-5 — "agent tokens are refused this table"  |
 * | `operator`            | spec §7a "who may read" — operator only                 |
 * | `agent_token`         | spec §7a — "never returned by any read endpoint"        |
 * | `audit_log`           | spec §7a "who may read" — operator only                 |
 *
 * FR-5 names only the first. The other three are §7a's `who may read` column,
 * which is equally binding — the spec wrote "operator only" and an agent token
 * is not the operator.
 *
 * **This list is enforced in the application, not in the database.** See
 * `./agent-db.ts` for exactly how far that enforcement reaches and where it
 * stops.
 */
export const AGENT_FORBIDDEN_TABLES = [
  "contract_milestone",
  "operator",
  "agent_token",
  "audit_log",
] as const;

export type AgentForbiddenTable = (typeof AGENT_FORBIDDEN_TABLES)[number];

/**
 * PostgREST lets a caller embed a related resource by its **foreign-key
 * constraint name** as well as by its table name, so
 * `select=*,acceptance_criterion_milestone_id_fkey(*)` reaches
 * `contract_milestone` without the string `contract_milestone` appearing
 * anywhere in the request.
 *
 * This is the complete set of such names in the current schema: exactly one
 * foreign key points at any forbidden table
 * (`acceptance_criterion.milestone_id → contract_milestone.id`; verified against
 * `20260819144331_schema_21_entities.sql`, which contains one
 * `references public.contract_milestone` and no `references public.operator`,
 * `agent_token` or `audit_log` at all).
 *
 * **If a later migration adds a foreign key to a forbidden table, it must be
 * added here.** That coupling is a weakness of application-layer enforcement and
 * is stated rather than hidden.
 */
export const AGENT_FORBIDDEN_EMBED_ALIASES = [
  "acceptance_criterion_milestone_id_fkey",
] as const;

export function isAgentForbiddenTable(
  table: string,
): table is AgentForbiddenTable {
  return (AGENT_FORBIDDEN_TABLES as readonly string[]).includes(table);
}

/**
 * §7a restricts `engagement` at the COLUMN level for agents, not the table
 * level, and it is the only table it does that to. Two rows say so:
 *
 *   * `engagement` — "operator; **agent tokens may read name and slug**"
 *   * `engagement (new columns)` — "operator; **agent tokens may read them** —
 *     a devops unit needs exactly these"
 *
 * So an agent gets the client's name, the slug, and the CR-001 provisioning
 * identifiers, and not `source`, `contract_type`, `repo_path`, `spec_path`,
 * `fleet_dir`, `status` or `archived_at` — which describe how Erik got the work
 * and where it lives on his disk.
 *
 * `id` is included though §7a does not name it: it is the join key, an agent
 * cannot relate a work item to its engagement without it, and it describes
 * nothing about the client. Stated because it is an addition rather than a
 * reading.
 *
 * **This is enforced fail-closed and it is queued for Erik**, because "name and
 * slug" could be read strictly (as here) or loosely as "the identifying
 * fields". Refusing too much breaks a later unit loudly, in a test, with a
 * message naming the column. Allowing too much leaks quietly. Those are not
 * symmetrical, so the strict reading wins until Erik says otherwise.
 */
export const AGENT_ENGAGEMENT_COLUMNS = [
  "id",
  "slug",
  "client_name",
  "db_org",
  "db_project_ref",
  "hosting_team",
  "hosting_project",
  "production_url",
] as const;

/**
 * Split a PostgREST projection on its top-level commas, ignoring commas nested
 * inside an embed's parentheses.
 */
function splitTopLevel(projection: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const character of projection) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (character === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += character;
  }
  if (current.trim() !== "") parts.push(current);
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}

/** Reduce `total:client_name::text` to `client_name`. */
function bareColumn(token: string): string {
  const withoutAlias = token.includes(":")
    ? token.slice(token.indexOf(":") + 1)
    : token;
  return withoutAlias.split("::")[0].trim();
}

/**
 * Which columns in a projection over `engagement` an agent may not read.
 *
 * `*` counts as a violation: it expands to every column, including the ones §7a
 * withholds, and a wildcard that silently widens as the schema grows is exactly
 * the failure this list exists to prevent.
 */
export function engagementColumnViolations(projection: string): string[] {
  const allowed = new Set<string>(AGENT_ENGAGEMENT_COLUMNS);
  const violations: string[] = [];

  for (const token of splitTopLevel(projection)) {
    // An embed of another table hanging off engagement — governed by the
    // forbidden-table scan, not by this column list.
    if (token.includes("(")) continue;

    const column = bareColumn(token);
    if (column === "*") {
      violations.push("*");
      continue;
    }
    if (column !== "" && !allowed.has(column)) violations.push(column);
  }

  return violations;
}

/**
 * Find every `engagement(...)` embed in a projection and return the columns
 * inside it that an agent may not read.
 *
 * Handles an alias (`client:engagement(...)`) and nesting, by scanning for the
 * identifier and then walking the balanced parentheses that follow it.
 */
export function embeddedEngagementViolations(projection: string): string[] {
  const violations: string[] = [];
  const pattern = /(?<![\w])engagement\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(projection)) !== null) {
    let depth = 1;
    let index = match.index + match[0].length;
    const start = index;
    while (index < projection.length && depth > 0) {
      if (projection[index] === "(") depth += 1;
      if (projection[index] === ")") depth -= 1;
      index += 1;
    }
    const inner = projection.slice(start, Math.max(start, index - 1));
    violations.push(...engagementColumnViolations(inner));
  }

  return violations;
}

/**
 * True when a PostgREST projection string reaches a forbidden table by name or
 * by foreign-key alias.
 *
 * Matching is on identifier boundaries so `contract_milestone_id` — an ordinary
 * column name on a table an agent may read — does not trip it, while
 * `milestones:contract_milestone(amount)` does.
 */
export function projectionReachesForbiddenTable(
  projection: string,
): AgentForbiddenTable | null {
  for (const table of AGENT_FORBIDDEN_TABLES) {
    // (?![\w]) — not followed by another identifier character, so
    // `contract_milestone_id` is not a match but `contract_milestone(` is.
    const pattern = new RegExp(`(?<![\\w])${table}(?![\\w])`);
    if (pattern.test(projection)) return table;
  }
  for (const alias of AGENT_FORBIDDEN_EMBED_ALIASES) {
    if (projection.includes(alias)) return "contract_milestone";
  }
  return null;
}
