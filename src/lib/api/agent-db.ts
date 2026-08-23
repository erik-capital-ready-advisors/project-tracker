import {
  AGENT_ENGAGEMENT_COLUMNS,
  AGENT_FORBIDDEN_TABLES,
  embeddedEngagementViolations,
  engagementColumnViolations,
  isAgentForbiddenTable,
  projectionReachesForbiddenTable,
} from "./capabilities";
import { apiError } from "./errors";

/**
 * FR-5's refusal, enforced.
 *
 * ## Read this before trusting it
 *
 * **This control is application-layer, not database-enforced, and the
 * distinction is not academic.** An agent bearer token is not a Postgres role.
 * There is no Supabase session for an agent request, so the route handler reads
 * with the service-role key — and `service_role` holds BYPASSRLS. Every policy
 * in `20260819144540_rls_and_grants.sql` is inert on that path. i1 stated this
 * in the `contract_milestone` table comment and left the obligation here.
 *
 * So §7a's "agent tokens are refused this table entirely" is **weaker than §7a
 * implies**: it is a guard in this file, not a grant in Postgres. Anything that
 * reaches the database without going through `agentScopedDb()` is unguarded.
 * **Scoped Supabase JWTs are the real fix and belong in Phase 2 planning** —
 * they would make the refusal a grant, at which point this file becomes a
 * redundant second layer rather than the only one.
 *
 * ## What it does catch
 *
 *   1. `db.from('contract_milestone')` — refused outright.
 *   2. `db.from('acceptance_criterion').select('*, contract_milestone(*)')` —
 *      refused, because PostgREST embeds are named in the projection string and
 *      the projection is scanned on every `select()`, including the one that
 *      follows an `insert()` or `update()`.
 *   3. `...select('*, acceptance_criterion_milestone_id_fkey(*)')` — refused,
 *      because PostgREST also accepts the foreign-key *constraint* name as an
 *      embed target, and the one such name in this schema is enumerated in
 *      `AGENT_FORBIDDEN_EMBED_ALIASES`.
 *   4. `db.rpc('verify_agent_token', …)` and the other credential/limiter
 *      internals — refused. An agent route has no business inside the token
 *      machinery that authenticated it.
 *
 * ## What it does not catch, stated rather than discovered later
 *
 *   * A handler that calls `createServiceClient()` itself instead of using the
 *     `db` it was handed. Nothing in TypeScript prevents that. Code review and
 *     `guard.ts`'s contract are what stand between an author and this mistake.
 *   * A **future** foreign key to a forbidden table whose constraint name nobody
 *     adds to `AGENT_FORBIDDEN_EMBED_ALIASES`. That list is coupled to the
 *     schema by hand, which is exactly the fragility a database grant would not
 *     have.
 *   * A raw `POST /rest/v1/rpc/...` constructed by hand with `fetch`.
 *
 * `encrypt_field` and `decrypt_field` are deliberately **allowed**: §7a says
 * work-item, blocker, requirement and question prose is read by "operator,
 * agents, decrypted server-side", so an answer endpoint cannot do its job
 * without decrypting. The decryption oracle that creates is bounded by rule 1 —
 * an agent cannot obtain `contract_milestone.amount` ciphertext to feed it.
 */

/**
 * RPCs an agent-scoped handler may not call.
 *
 * Deny-listed rather than allow-listed because the six `public` wrappers are the
 * whole exposed surface and later units will add domain RPCs that agents must be
 * able to call. The four here are the credential and limiter internals.
 */
export const AGENT_FORBIDDEN_RPCS = [
  "hash_agent_token",
  "verify_agent_token",
  "check_and_increment_rate_limit",
  "prune_rate_limit_counters",
] as const;

/**
 * `then`, `catch` and `finally` are passed through unwrapped and bound to the
 * real builder. PostgREST builders are thenable, and wrapping `then` turns
 * `await db.from(...).select(...)` into a proxy of a promise that never settles.
 */
const PASSTHROUGH_METHODS = new Set(["then", "catch", "finally"]);

function refuseTable(table: string): never {
  throw apiError(
    "forbidden_table",
    `An agent token may not read \`${table}\`. Capabilities answer:read and ` +
      `ingest:write both exclude it (FR-5, spec §7a). Use an operator session ` +
      `for this data.`,
  );
}

function refuseEngagementColumns(columns: string[]): never {
  throw apiError(
    "forbidden_table",
    `An agent token may read only ${AGENT_ENGAGEMENT_COLUMNS.join(", ")} from ` +
      `\`engagement\` (spec §7a). Refused: ${columns.join(", ")}. ` +
      `Select the columns explicitly rather than with \`*\`.`,
  );
}

function looksLikeBuilder(value: unknown): value is object {
  return (
    typeof value === "object" &&
    value !== null &&
    "select" in value &&
    typeof (value as { select: unknown }).select === "function"
  );
}

function checkProjection(projection: string, table: string): void {
  const reached = projectionReachesForbiddenTable(projection);
  if (reached) refuseTable(reached);

  const violations =
    table === "engagement"
      ? engagementColumnViolations(projection)
      : embeddedEngagementViolations(projection);

  if (violations.length > 0) refuseEngagementColumns(violations);
}

function wrapBuilder<T extends object>(builder: T, table: string): T {
  return new Proxy(builder, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;

      const method = value as (...args: unknown[]) => unknown;

      if (PASSTHROUGH_METHODS.has(String(property))) {
        return method.bind(target);
      }

      return (...args: unknown[]) => {
        if (property === "select" && typeof args[0] === "string") {
          checkProjection(args[0], table);
        }
        const result = method.apply(target, args);
        return looksLikeBuilder(result) ? wrapBuilder(result, table) : result;
      };
    },
  }) as T;
}

/**
 * Wrap a Supabase client so that an agent-authenticated handler cannot reach a
 * table §7a reserves to the operator.
 *
 * The wrapper is transparent: it is the same client with the same types, so a
 * handler written against `SupabaseClient` needs no changes to use it. That is
 * the point — an enforcement layer a handler has to remember to call is one a
 * handler will forget to call.
 *
 * Refusals `throw` an `ApiError`, which `guard.ts` converts into a `403` and,
 * crucially, into an `audit_log` row. A silently-empty result would look
 * identical to a table with no matching rows.
 */
export function agentScopedDb<T extends object>(client: T): T {
  return new Proxy(client, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;

      if (property === "from" && typeof value === "function") {
        const from = value as (table: string) => object;
        return (table: string) => {
          if (isAgentForbiddenTable(table)) refuseTable(table);
          return wrapBuilder(from.call(target, table), table);
        };
      }

      if (property === "rpc" && typeof value === "function") {
        const rpc = value as (...args: unknown[]) => unknown;
        return (name: string, ...rest: unknown[]) => {
          if ((AGENT_FORBIDDEN_RPCS as readonly string[]).includes(name)) {
            throw apiError(
              "forbidden_table",
              `An agent token may not call the \`${name}\` function. It is part ` +
                `of the credential and rate-limit machinery, not the data API.`,
            );
          }
          const result = rpc.call(target, name, ...rest);
          // An RPC result is not scoped to a table; `""` selects no column
          // policy, and the forbidden-table scan still applies.
          return looksLikeBuilder(result) ? wrapBuilder(result, "") : result;
        };
      }

      return typeof value === "function"
        ? (value as (...a: unknown[]) => unknown).bind(target)
        : value;
    },
  }) as T;
}

/** Exported for the report and for tests that assert the list has not drifted. */
export const AGENT_FORBIDDEN_TABLE_LIST = AGENT_FORBIDDEN_TABLES;
