import type { DbQuery, DbResult, ReleaseDb } from "../db";

/**
 * An in-memory stand-in for the slice of PostgREST the release path uses.
 *
 * Hand-written rather than mocked, for the same reason i4's fake is: the code
 * under test chains builders and awaits them, and `agentScopedDb` re-wraps
 * whatever each method returns. A fake that is not chainable and thenable would
 * pass tests against a shape the production code never meets.
 *
 * It enforces the two unique constraints the real schema carries —
 * `release (engagement_id, identifier, environment)` and
 * `release_requirement (release_id, requirement_ref)` — by answering `23505`,
 * because those constraints *are* the idempotency mechanism and a fake that let
 * duplicates through would make the idempotency test vacuous.
 *
 * It also honours PostgREST's row cap when asked to, so the paging code has
 * something that can actually truncate.
 */

export interface FakeRow {
  [column: string]: unknown;
}

export interface FakeDbOptions {
  engagement?: FakeRow[];
  requirement?: FakeRow[];
  release?: FakeRow[];
  release_requirement?: FakeRow[];
  work_item?: FakeRow[];
  /** Table name → error to answer with, for the failure paths. */
  fail?: Record<string, { message: string; code?: string }>;
  /** Rows per response. Supabase's real value is 1000. */
  maxRows?: number;
}

export interface FakeReleaseDb extends ReleaseDb {
  readonly tables: Record<string, FakeRow[]>;
  readonly projections: { table: string; columns: string }[];
  /** Every `insert` the code issued, in order, for duplicate assertions. */
  readonly inserts: { table: string; values: FakeRow[] }[];
}

const UNIQUE_KEYS: Record<string, string[]> = {
  release: ["engagement_id", "identifier", "environment"],
  release_requirement: ["release_id", "requirement_ref"],
};

let idCounter = 0;
function nextId(table: string): string {
  idCounter += 1;
  return `${table}-${String(idCounter).padStart(4, "0")}`;
}

/** Reset between tests so ids are stable and assertions can name them. */
export function resetFakeIds(): void {
  idCounter = 0;
}

interface State {
  tables: Record<string, FakeRow[]>;
  fail: Record<string, { message: string; code?: string }>;
  maxRows: number;
  projections: { table: string; columns: string }[];
  inserts: { table: string; values: FakeRow[] }[];
}

class FakeQuery implements DbQuery {
  private op: "select" | "insert" | "update" = "select";
  private filters: { kind: "eq"; column: string; value: unknown }[] = [];
  private inFilters: { column: string; values: readonly unknown[] }[] = [];
  private orFilters: { column: string; operator: string; value: string }[][] = [];
  private payload: FakeRow[] = [];
  private wantCount = false;
  private headOnly = false;
  private rangeWindow: [number, number] | null = null;
  private orderColumn: string | null = null;

  constructor(
    private readonly table: string,
    private readonly state: State,
  ) {}

  select(
    columns: string,
    options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): DbQuery {
    this.state.projections.push({ table: this.table, columns });
    if (options?.count === "exact") this.wantCount = true;
    if (options?.head === true) this.headOnly = true;
    return this;
  }

  insert(values: unknown): DbQuery {
    this.op = "insert";
    this.payload = Array.isArray(values) ? (values as FakeRow[]) : [values as FakeRow];
    return this;
  }

  update(values: Record<string, unknown>): DbQuery {
    this.op = "update";
    this.payload = [values];
    return this;
  }

  eq(column: string, value: unknown): DbQuery {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, values: readonly unknown[]): DbQuery {
    this.inFilters.push({ column, values });
    return this;
  }

  /**
   * PostgREST's disjunction, as `or("severity.eq.unparsed,status.eq.unparsed")`.
   *
   * Added by i7: the FR-58 census asks `defect` one question spanning two
   * columns, so that a row unparsed in both is counted once rather than twice.
   * Only the `eq` operator is understood, which is all the census uses; an
   * unrecognised term matches nothing rather than everything, so a typo shows up
   * as a missing row instead of as a silently inflated count.
   */
  or(filter: string): DbQuery {
    this.orFilters.push(
      filter.split(",").map((term) => {
        const [column, operator, ...rest] = term.trim().split(".");
        return { column, operator, value: rest.join(".") };
      }),
    );
    return this;
  }

  order(column: string): DbQuery {
    this.orderColumn = column;
    return this;
  }

  range(from: number, to: number): DbQuery {
    this.rangeWindow = [from, to];
    return this;
  }

  async maybeSingle(): Promise<DbResult<FakeRow | null>> {
    const result = await this.run();
    if (result.error) return { data: null, error: result.error };
    const rows = result.data ?? [];
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = DbResult<FakeRow[] | null>, TResult2 = never>(
    onfulfilled?:
      | ((value: DbResult<FakeRow[] | null>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private rows(): FakeRow[] {
    return (this.state.tables[this.table] ??= []);
  }

  private matches(row: FakeRow): boolean {
    return (
      this.filters.every((filter) => row[filter.column] === filter.value) &&
      this.inFilters.every((filter) => filter.values.includes(row[filter.column])) &&
      // Each `or()` call is one conjunct; its terms are disjoined within it.
      this.orFilters.every((terms) =>
        terms.some(
          (term) => term.operator === "eq" && row[term.column] === term.value,
        ),
      )
    );
  }

  private async run(): Promise<DbResult<FakeRow[] | null>> {
    const failure = this.state.fail[this.table];
    if (failure) return { data: null, error: failure };

    if (this.op === "insert") {
      const unique = UNIQUE_KEYS[this.table];
      const written: FakeRow[] = [];
      for (const value of this.payload) {
        if (
          unique &&
          this.rows().some((row) => unique.every((key) => row[key] === value[key]))
        ) {
          return {
            data: null,
            error: { message: "duplicate key value violates unique constraint", code: "23505" },
          };
        }
        const row: FakeRow = { id: nextId(this.table), ...value };
        this.rows().push(row);
        written.push(row);
      }
      this.state.inserts.push({ table: this.table, values: written });
      return { data: written, error: null };
    }

    if (this.op === "update") {
      const matched = this.rows().filter((row) => this.matches(row));
      for (const row of matched) Object.assign(row, this.payload[0]);
      return { data: matched, error: null };
    }

    let matched = this.rows().filter((row) => this.matches(row));
    if (this.orderColumn !== null) {
      const column = this.orderColumn;
      matched = [...matched].sort((a, b) =>
        String(a[column]).localeCompare(String(b[column])),
      );
    }

    const total = matched.length;
    if (this.headOnly) {
      return { data: null, error: null, count: this.wantCount ? total : null };
    }

    if (this.rangeWindow !== null) {
      const [from, to] = this.rangeWindow;
      matched = matched.slice(from, to + 1);
    }
    // PostgREST's cap, applied last and silently — exactly as the real one does.
    if (matched.length > this.state.maxRows) matched = matched.slice(0, this.state.maxRows);

    return { data: matched, error: null, count: this.wantCount ? total : null };
  }
}

export function createFakeReleaseDb(options: FakeDbOptions = {}): FakeReleaseDb {
  const state: State = {
    tables: {
      engagement: (options.engagement ?? []).map((row) => ({ ...row })),
      requirement: (options.requirement ?? []).map((row) => ({ ...row })),
      release: (options.release ?? []).map((row) => ({ ...row })),
      release_requirement: (options.release_requirement ?? []).map((row) => ({ ...row })),
      work_item: (options.work_item ?? []).map((row) => ({ ...row })),
    },
    fail: options.fail ?? {},
    maxRows: options.maxRows ?? 1000,
    projections: [],
    inserts: [],
  };

  return {
    tables: state.tables,
    projections: state.projections,
    inserts: state.inserts,
    from(table: string): DbQuery {
      return new FakeQuery(table, state);
    },
  };
}
