/**
 * An in-memory stand-in for the slice of PostgREST the answers and the QA
 * persistence use.
 *
 * Hand-written rather than mocked, for the same reason i4's and i8's fakes are:
 * the code under test chains builders and awaits them, and `agentScopedDb`
 * re-wraps whatever each method returns. A fake that is not chainable and
 * thenable would pass tests against a shape the production code never meets.
 *
 * Three behaviours are modelled on purpose, because each one is a way the
 * production code can be wrong while the tests stay green:
 *
 *   * **`maxRows` truncates silently**, exactly as PostgREST's cap does — same
 *     `error: null`, no warning, no signal at the call site. Without this the
 *     paging in `fetchAllRows` is decorative and a mutation removing it passes.
 *   * **`count` is the true total**, not the truncated length, which is what
 *     makes an exact-count termination condition distinguishable from a
 *     short-page one.
 *   * **`unique (engagement_id, file, title)` on `test_case`** is enforced with
 *     a real `23505`, because that constraint is the upsert's conflict target
 *     and a fake that let duplicates through would make the upsert test vacuous.
 */

import type { DbResult } from "@/lib/server/releases/db";

export interface FakeRow {
  [column: string]: unknown;
}

export interface FakeDbOptions {
  tables?: Record<string, FakeRow[]>;
  /** Table name → error to answer with, for the failure paths. */
  fail?: Record<string, { message: string; code?: string }>;
  /** Rows per response. Supabase's real value is 1000. */
  maxRows?: number;
  /** `decrypt_field` behaviour. Default: strip a `enc:` prefix. */
  decrypt?: (ciphertext: string) => string | null;
}

const UNIQUE_KEYS: Record<string, string[]> = {
  test_case: ["engagement_id", "file", "title"],
  engagement: ["slug"],
};

let idCounter = 0;

/** Reset between tests so ids are stable and assertions can name them. */
export function resetFakeAnswerIds(): void {
  idCounter = 0;
}

function nextId(table: string): string {
  idCounter += 1;
  return `${table}-${String(idCounter).padStart(4, "0")}`;
}

interface State {
  tables: Record<string, FakeRow[]>;
  fail: Record<string, { message: string; code?: string }>;
  maxRows: number;
  projections: { table: string; columns: string }[];
  decrypt: (ciphertext: string) => string | null;
}

type OrTerm = { column: string; operator: string; value: string };

class FakeQuery {
  private op: "select" | "insert" | "update" | "upsert" = "select";
  private eqFilters: { column: string; value: unknown }[] = [];
  private inFilters: { column: string; values: readonly unknown[] }[] = [];
  private isFilters: { column: string; value: null | boolean }[] = [];
  private notFilters: { column: string; operator: string; value: unknown }[] = [];
  private orFilters: OrTerm[][] = [];
  private payload: FakeRow[] = [];
  private conflict: string[] = [];
  private wantCount = false;
  private headOnly = false;
  private rangeWindow: [number, number] | null = null;
  private orderColumn: string | null = null;
  private ascending = true;

  constructor(
    private readonly table: string,
    private readonly state: State,
  ) {}

  select(
    columns: string,
    options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): this {
    this.state.projections.push({ table: this.table, columns });
    if (options?.count === "exact") this.wantCount = true;
    if (options?.head === true) this.headOnly = true;
    return this;
  }

  insert(values: unknown): this {
    this.op = "insert";
    this.payload = Array.isArray(values) ? (values as FakeRow[]) : [values as FakeRow];
    return this;
  }

  upsert(values: unknown, options?: { onConflict?: string }): this {
    this.op = "upsert";
    this.payload = Array.isArray(values) ? (values as FakeRow[]) : [values as FakeRow];
    this.conflict = (options?.onConflict ?? "").split(",").map((one) => one.trim());
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.op = "update";
    this.payload = [values];
    return this;
  }

  eq(column: string, value: unknown): this {
    this.eqFilters.push({ column, value });
    return this;
  }

  in(column: string, values: readonly unknown[]): this {
    this.inFilters.push({ column, values });
    return this;
  }

  is(column: string, value: null | boolean): this {
    this.isFilters.push({ column, value });
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    this.notFilters.push({ column, operator, value });
    return this;
  }

  or(filter: string): this {
    this.orFilters.push(
      filter.split(",").map((term) => {
        const [column, operator, ...rest] = term.trim().split(".");
        return { column, operator, value: rest.join(".") };
      }),
    );
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderColumn = column;
    this.ascending = options?.ascending !== false;
    return this;
  }

  range(from: number, to: number): this {
    this.rangeWindow = [from, to];
    return this;
  }

  async maybeSingle(): Promise<DbResult<FakeRow | null>> {
    const result = await this.run();
    if (result.error) return { data: null, error: result.error };
    return { data: (result.data ?? [])[0] ?? null, error: null };
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
      this.eqFilters.every((one) => row[one.column] === one.value) &&
      this.inFilters.every((one) => one.values.includes(row[one.column])) &&
      this.isFilters.every((one) =>
        one.value === null
          ? row[one.column] === null || row[one.column] === undefined
          : row[one.column] === one.value,
      ) &&
      this.notFilters.every((one) =>
        one.operator === "is" && one.value === null
          ? row[one.column] !== null && row[one.column] !== undefined
          : row[one.column] !== one.value,
      ) &&
      this.orFilters.every((terms) =>
        terms.some((term) => term.operator === "eq" && row[term.column] === term.value),
      )
    );
  }

  private async run(): Promise<DbResult<FakeRow[] | null>> {
    const failure = this.state.fail[this.table];
    if (failure) return { data: null, error: failure };

    if (this.op === "insert" || this.op === "upsert") {
      const unique = UNIQUE_KEYS[this.table];
      const written: FakeRow[] = [];

      for (const value of this.payload) {
        const keys = this.op === "upsert" && this.conflict.length > 0
          ? this.conflict
          : unique;
        const existing =
          keys === undefined
            ? undefined
            : this.rows().find((row) => keys.every((key) => row[key] === value[key]));

        if (existing !== undefined) {
          if (this.op === "insert") {
            return {
              data: null,
              error: {
                message: "duplicate key value violates unique constraint",
                code: "23505",
              },
            };
          }
          // An upsert merges rather than replaces, so a column the payload omits
          // keeps whatever was already there — which is what makes "an absent
          // author must not erase a recorded one" testable.
          Object.assign(existing, value);
          written.push(existing);
          continue;
        }

        const row: FakeRow = { id: nextId(this.table), ...value };
        this.rows().push(row);
        written.push(row);
      }
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
      const direction = this.ascending ? 1 : -1;
      matched = [...matched].sort(
        (a, b) => direction * String(a[column]).localeCompare(String(b[column])),
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
    if (matched.length > this.state.maxRows) {
      matched = matched.slice(0, this.state.maxRows);
    }

    return { data: matched, error: null, count: this.wantCount ? total : null };
  }
}

export interface FakeAnswerDb {
  from(table: string): FakeQuery;
  rpc(name: string, args?: Record<string, unknown>): Promise<DbResult<unknown>>;
  readonly tables: Record<string, FakeRow[]>;
  readonly projections: { table: string; columns: string }[];
  readonly rpcCalls: { name: string; args?: Record<string, unknown> }[];
}

export function createFakeAnswerDb(options: FakeDbOptions = {}): FakeAnswerDb {
  const state: State = {
    tables: Object.fromEntries(
      Object.entries(options.tables ?? {}).map(([table, rows]) => [
        table,
        rows.map((row) => ({ ...row })),
      ]),
    ),
    fail: options.fail ?? {},
    maxRows: options.maxRows ?? 1000,
    projections: [],
    // `enc:` is a stand-in for pgcrypto ciphertext. It is a prefix and not real
    // encryption on purpose: a test fixture must never carry anything that could
    // be mistaken for a key, and what is under test is the decrypt *call path*,
    // not the cipher.
    decrypt: options.decrypt ?? ((ciphertext) => ciphertext.replace(/^enc:/, "")),
  };

  const rpcCalls: { name: string; args?: Record<string, unknown> }[] = [];

  return {
    from: (table: string) => new FakeQuery(table, state),
    rpc: async (name: string, args?: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (name === "decrypt_field") {
        const ciphertext = String(args?.ciphertext ?? "");
        const plaintext = state.decrypt(ciphertext);
        return plaintext === null
          ? { data: null, error: { message: "could not decrypt" } }
          : { data: plaintext, error: null };
      }
      if (name === "encrypt_field") {
        return { data: `enc:${String(args?.plaintext ?? "")}`, error: null };
      }
      return { data: null, error: { message: `unknown function ${name}` } };
    },
    get tables() {
      return state.tables;
    },
    get projections() {
      return state.projections;
    },
    get rpcCalls() {
      return rpcCalls;
    },
  };
}
