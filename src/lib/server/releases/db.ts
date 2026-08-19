/**
 * The narrow, structural slice of the Supabase client the release path uses.
 *
 * Written structurally rather than against `ServiceClient` for one reason: the
 * release modules must be testable without a database, and `SupabaseClient`'s
 * generated types are deep enough that a hand-written fake cannot satisfy them
 * without a pile of casts at every call site. This interface is what the code
 * actually calls, so a fake that satisfies it is a fake that exercises the real
 * code path.
 *
 * **Casting `ctx.db` to this does not weaken FR-5.** `agentScopedDb` is a
 * runtime `Proxy`; a compile-time cast cannot see it, let alone remove it. Every
 * `from()` and every `select()` in this file still passes through the
 * forbidden-table and engagement-column scans, and there is a test in
 * `handler.test.ts` that proves it by driving the real `agentScopedDb` wrapper.
 */

export interface DbResult<T = unknown> {
  data: T;
  error: { message: string; code?: string } | null;
  count?: number | null;
}

export interface DbQuery extends PromiseLike<DbResult<Record<string, unknown>[] | null>> {
  select(
    columns: string,
    options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): DbQuery;
  insert(values: unknown): DbQuery;
  update(values: Record<string, unknown>): DbQuery;
  eq(column: string, value: unknown): DbQuery;
  in(column: string, values: readonly unknown[]): DbQuery;
  order(column: string, options?: { ascending?: boolean }): DbQuery;
  range(from: number, to: number): DbQuery;
  maybeSingle(): PromiseLike<DbResult<Record<string, unknown> | null>>;
}

export interface ReleaseDb {
  from(table: string): DbQuery;
}

/**
 * PostgREST answers **HTTP 206 with `error === null`** once a read crosses its
 * `max-rows` setting — 1000 on Supabase — so a truncated read is
 * indistinguishable from a complete one at the call site. Measured on two prior
 * engagements in this practice (Shoe Swap Studio 2026-07-24, Cully Bet
 * 2026-08-11), where it produced plausible, wrong, load-bearing numbers for
 * months.
 *
 * So every unbounded read in this package pages explicitly, with a **stable
 * order**. Without the order, successive `.range()` windows can overlap or skip
 * rows, which trades one silent corruption for another.
 */
export const PAGE_SIZE = 1000;

/**
 * Read every row, and know that you did.
 *
 * Three details, each of which is a way this goes silently wrong:
 *
 *   * **The loop terminates on an exact `count`, not on a short page.** "This
 *     page came back shorter than I asked for" assumes the server's cap equals
 *     the page size. If the project's `max-rows` is ever lowered below
 *     `PAGE_SIZE`, every page is short, the loop stops on the first one, and the
 *     result is a silently truncated read that reports success. Comparing the
 *     rows returned against an exact count is what the incident note prescribes
 *     and it does not make that assumption.
 *   * **The window advances by rows actually received**, not by `PAGE_SIZE`, for
 *     the same reason.
 *   * **A stable ORDER BY is applied on every page.** Without one, successive
 *     `.range()` windows can overlap or skip rows — one silent corruption traded
 *     for another.
 */
export async function fetchAllRows(
  db: ReleaseDb,
  table: string,
  columns: string,
  applyFilters: (query: DbQuery) => DbQuery,
  orderColumn = "id",
  pageSize: number = PAGE_SIZE,
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  const rows: Record<string, unknown>[] = [];

  for (let page = 0; ; page += 1) {
    const from = rows.length;
    const result = await applyFilters(db.from(table).select(columns, { count: "exact" }))
      .order(orderColumn, { ascending: true })
      .range(from, from + pageSize - 1);

    if (result.error) return { rows, error: result.error.message };
    const batch = result.data ?? [];
    rows.push(...batch);

    const total = result.count;
    if (typeof total !== "number") {
      // No count came back. Fall back to the short-page heuristic and say so, so
      // a caller reading this code knows which guarantee it is getting.
      if (batch.length < pageSize) return { rows, error: null };
    } else if (rows.length >= total) {
      return { rows, error: null };
    } else if (batch.length === 0) {
      return {
        rows,
        error: `read stalled at ${rows.length} of ${total} rows in ${table}`,
      };
    }

    // A guard against a pathological loop rather than a real limit: 1000 pages
    // is far past anything this product holds, and an unbounded loop against a
    // misbehaving endpoint is worse than a stated ceiling.
    if (page > 1000) return { rows, error: `read of ${table} exceeded 1000 pages` };
  }
}

/** `.in()` lists are chunked so no single response can reach PostgREST's cap. */
export const IN_CHUNK = 500;

export function chunk<T>(values: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    out.push(values.slice(index, index + size));
  }
  return out;
}
