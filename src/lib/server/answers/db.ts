/**
 * The structural slice of the Supabase client the six answers read through.
 *
 * ## Why it extends i8's interface rather than replacing it
 *
 * `src/lib/server/releases/db.ts` already defines the narrow, testable client
 * slice **and** the paging discipline this product needs (`fetchAllRows`), and
 * that discipline is not release-specific — it is the answer to a measured
 * incident about PostgREST's row cap. Writing a second copy here would give this
 * repository two paging helpers that drift, which is the exact failure the
 * "no second range expander" rule exists to prevent.
 *
 * So the dependency arrow points from `answers/` to `releases/db.ts`, which
 * reads backwards. It is stated rather than hidden: `releases/db.ts` is generic
 * infrastructure that happens to live under `releases/` because i8 needed it
 * first. Moving it is a rename with six call sites and no behaviour change, and
 * it was left for a unit that owns those files rather than done in passing here.
 *
 * ## What this file adds
 *
 * Three PostgREST verbs the release path never needed and the answers do:
 * `or` (the FR-58 census asks one table two questions), `is` (open blockers and
 * unresolved waits are `resolved_at is null`), and `not`.
 *
 * **Casting `ctx.db` to these interfaces does not weaken FR-5.** `agentScopedDb`
 * is a runtime `Proxy`; a compile-time cast cannot see it, let alone remove it.
 * Every `from()` and every `select()` still passes through the forbidden-table
 * and engagement-column scans. There is a test in `answers.test.ts` that drives
 * the real wrapper and observes the refusal.
 */

import type { DbQuery, DbResult, ReleaseDb } from "@/lib/server/releases/db";

export { IN_CHUNK, PAGE_SIZE, chunk, fetchAllRows } from "@/lib/server/releases/db";
export type { DbQuery, DbResult, ReleaseDb };

export interface AnswerQuery extends DbQuery {
  select(
    columns: string,
    options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): AnswerQuery;
  insert(values: unknown): AnswerQuery;
  update(values: Record<string, unknown>): AnswerQuery;
  eq(column: string, value: unknown): AnswerQuery;
  in(column: string, values: readonly unknown[]): AnswerQuery;
  order(column: string, options?: { ascending?: boolean }): AnswerQuery;
  range(from: number, to: number): AnswerQuery;
  /** `or("severity.eq.unparsed,status.eq.unparsed")` — PostgREST's disjunction. */
  or(filter: string): AnswerQuery;
  is(column: string, value: null | boolean): AnswerQuery;
  not(column: string, operator: string, value: unknown): AnswerQuery;
  upsert(values: unknown, options?: { onConflict?: string }): AnswerQuery;
}

export interface AnswerDb extends ReleaseDb {
  from(table: string): AnswerQuery;
}

/** The slice `unparsedCensus` needs, and nothing more. */
export interface CensusDb {
  from(table: string): AnswerQuery;
}

/** The slice the QA persistence needs: tables plus the pgcrypto RPCs. */
export interface RpcDb extends AnswerDb {
  rpc(name: string, args?: Record<string, unknown>): PromiseLike<DbResult<unknown>>;
}

/**
 * Read an exact count without reading a single row.
 *
 * `count: "exact", head: true` asks Postgres to count. Reading rows and taking
 * `.length` is the alternative and it is wrong: a read without paging returns at
 * most 1000 rows and reports success, so `.length` silently becomes `1000` on
 * any system large enough to matter. Measured twice in this practice, both
 * times producing plausible wrong numbers for months.
 *
 * Returns `null` — never `0` — when the count could not be read. See
 * `unparsed.ts` for why that distinction is the whole point.
 */
export async function exactCount(
  db: CensusDb,
  table: string,
  applyFilters: (query: AnswerQuery) => AnswerQuery,
): Promise<number | null> {
  const result = await applyFilters(
    db.from(table).select("id", { count: "exact", head: true }),
  );

  if (result.error) return null;
  const count = result.count;
  if (typeof count !== "number" || !Number.isFinite(count) || count < 0) return null;
  return count;
}
