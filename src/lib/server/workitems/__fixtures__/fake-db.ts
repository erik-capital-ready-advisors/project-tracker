/**
 * A small in-memory stand-in for the Supabase client, for unit `i6`'s
 * persistence tests.
 *
 * It lives under `workitems/` rather than at `src/lib/server/__fixtures__/`
 * because `i5` and `i8` are building in adjacent directories in parallel
 * worktrees, and a fixture at a shared path is a merge conflict waiting to
 * happen. `i6` owns `src/lib/server/workitems/**` outright, so this path cannot
 * collide.
 *
 * ## What it is and is not
 *
 * It is a table store with just enough PostgREST surface for the calls this
 * unit makes: `select` with `eq` / `in` / `is` / `not` / `order` / `limit`,
 * `insert`, `update`, `upsert`, `single`, `maybeSingle`, and `rpc`. It is a
 * thenable builder, like the real one.
 *
 * It is **not** a database. It does not enforce foreign keys, check constraints,
 * or unique indexes beyond the one `onConflict` key an upsert names. So it can
 * prove that this unit's code *asks the database for the right thing*, and it
 * cannot prove the database *does* the right thing. That second half is why the
 * report for this unit carries observations run against the real Postgres
 * project rather than only these tests — a check constraint that this fake knows
 * nothing about is exactly the sort of control that is easy to claim and hard to
 * have.
 */

export type Row = Record<string, unknown>;

export interface FakeResult {
  data: unknown;
  error: { message: string; code?: string } | null;
  /**
   * Present only when the caller asked for `count: "exact"`.
   *
   * `exactCount` in `@/lib/server/answers/db` returns `null` — never `0` —
   * when this is absent or not a number, which is what makes an uncountable
   * table report "unavailable" rather than a clean zero. A fake that omitted
   * it entirely would make every census in a test read `null`, and a test that
   * cannot tell a real count from an unread one cannot check FR-58 at all.
   */
  count?: number | null;
}

interface Filter {
  kind: "eq" | "in" | "is" | "not-is";
  column: string;
  value: unknown;
}

/** One term of a PostgREST `or(...)` disjunction, e.g. `severity.eq.unparsed`. */
interface OrTerm {
  column: string;
  operator: string;
  value: string;
}

function matches(row: Row, filter: Filter): boolean {
  /**
   * A column a seed row simply did not mention is SQL `NULL`, not `undefined`.
   * Without this normalisation `is("resolved_at", null)` matches nothing for a
   * row inserted without that key — which is every freshly-declared wait — and
   * the resulting empty list looks exactly like "there are no open waits".
   */
  const actual = row[filter.column] ?? null;
  switch (filter.kind) {
    case "eq":
      return actual === filter.value;
    case "in":
      return (filter.value as unknown[]).includes(actual);
    case "is":
      return actual === (filter.value ?? null);
    case "not-is":
      return actual !== (filter.value ?? null);
  }
}

export interface FakeDbOptions {
  /** Seed tables. Rows are stored by reference and mutated in place by updates. */
  tables?: Record<string, Row[]>;
  /** Return values for `rpc(name, args)`. A function receives the args. */
  rpc?: Record<string, (args: Row) => unknown>;
  /** Force a failure on the named table's next write, to test the error path. */
  failWriteOn?: string;
  /**
   * Force a failure on every READ of the named table.
   *
   * Added for FR-58: `unparsedCensus` returns a `null` total — never a partial
   * sum — when any one of its three counts fails, and `null` must be omitted
   * from the response envelope rather than sent as `0`. That is the half of the
   * contract that matters most and it is unreachable without a way to make a
   * count fail. `failWriteOn` cannot do it, because a census only ever selects.
   */
  failReadOn?: string;
}

interface State {
  tables: Map<string, Row[]>;
  rpc: Record<string, (args: Row) => unknown>;
  failWriteOn: string | null;
  failReadOn: string | null;
  calls: { table: string; op: string; payload?: unknown; onConflict?: string }[];
  rpcCalls: { name: string; args: Row }[];
  nextId: number;
}

class FakeQuery implements PromiseLike<FakeResult> {
  private filters: Filter[] = [];
  private op: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  private payload: Row[] = [];
  private onConflict: string[] = [];
  private limitValue: number | null = null;
  private offsetValue = 0;
  private orderBy: { column: string; ascending: boolean }[] = [];
  private projection: string | null = null;
  private orFilters: OrTerm[][] = [];
  private countMode: "exact" | "planned" | "estimated" | null = null;
  private headOnly = false;

  constructor(
    private readonly table: string,
    private readonly state: State,
  ) {}

  select(
    columns?: string,
    options?: { count?: "exact" | "planned" | "estimated"; head?: boolean },
  ): this {
    if (columns !== undefined) this.projection = columns;
    if (options?.count !== undefined) this.countMode = options.count;
    if (options?.head === true) this.headOnly = true;
    return this;
  }

  /**
   * PostgREST's disjunction, as `or("severity.eq.unparsed,status.eq.unparsed")`.
   *
   * A row matches the group when ANY term matches, and several `or()` calls are
   * ANDed together — PostgREST's own semantics. An unrecognised operator
   * matches nothing rather than everything, so a typo shows up as a missing row
   * instead of as a silently inflated count. i7's rule, kept identical here so
   * the two fakes cannot disagree about what a census counts.
   */
  or(filter: string): this {
    this.orFilters.push(
      filter.split(",").map((term) => {
        const [column, operator, ...rest] = term.trim().split(".");
        return { column, operator, value: rest.join(".") };
      }),
    );
    return this;
  }

  insert(values: Row | Row[]): this {
    this.op = "insert";
    this.payload = Array.isArray(values) ? values : [values];
    return this;
  }

  upsert(values: Row | Row[], options?: { onConflict?: string }): this {
    this.op = "upsert";
    this.payload = Array.isArray(values) ? values : [values];
    this.onConflict = (options?.onConflict ?? "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    return this;
  }

  update(values: Row): this {
    this.op = "update";
    this.payload = [values];
    return this;
  }

  delete(): this {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push({ kind: "eq", column, value });
    return this;
  }

  in(column: string, value: unknown[]): this {
    this.filters.push({ kind: "in", column, value });
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push({ kind: "is", column, value });
    return this;
  }

  not(column: string, _operator: string, value: unknown): this {
    this.filters.push({ kind: "not-is", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  range(from: number, to: number): this {
    this.offsetValue = from;
    this.limitValue = to - from + 1;
    return this;
  }

  single(): PromiseLike<FakeResult> {
    return this.run().then((result) => {
      const rows = (result.data as Row[] | null) ?? [];
      if (result.error) return result;
      if (rows.length !== 1) {
        return {
          data: null,
          error: {
            message: `expected exactly one row, got ${rows.length}`,
            code: "PGRST116",
          },
        };
      }
      return { data: rows[0], error: null };
    });
  }

  maybeSingle(): PromiseLike<FakeResult> {
    return this.run().then((result) => {
      const rows = (result.data as Row[] | null) ?? [];
      return { data: result.error ? null : (rows[0] ?? null), error: result.error };
    });
  }

  then<A = FakeResult, B = never>(
    onfulfilled?: ((value: FakeResult) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.run().then(onfulfilled, onrejected);
  }

  /**
   * Fill in the plain columns the projection named but the row does not carry.
   *
   * PostgREST returns a selected NULL column as `null`; it never omits it. A
   * fake that omits it lets `row.resolved_at !== null` be true for a row whose
   * column is NULL, which is the opposite of what production sees — and that
   * mistake reads as a real bug in the code under test. Embedded relations
   * (anything with parentheses) are left alone; the store seeds those directly.
   */
  private project(row: Row): Row {
    if (this.projection === null || this.projection.trim() === "*") return { ...row };

    // Split on top-level commas only: an embed carries its own commas inside
    // parentheses.
    const tokens: string[] = [];
    let depth = 0;
    let current = "";
    for (const character of this.projection) {
      if (character === "(") depth += 1;
      if (character === ")") depth -= 1;
      if (character === "," && depth === 0) {
        tokens.push(current);
        current = "";
        continue;
      }
      current += character;
    }
    if (current.trim() !== "") tokens.push(current);

    const projected: Row = {};
    for (const raw of tokens) {
      const token = raw.trim();
      if (token === "") continue;

      if (token.includes("(")) {
        // `engagement:engagement_id (slug)` -> `engagement`; `work_item (…)` -> `work_item`.
        const head = token.slice(0, token.indexOf("(")).trim();
        const key = head.includes(":") ? head.slice(0, head.indexOf(":")).trim() : head;
        projected[key] = key in row ? row[key] : null;
        continue;
      }

      const column = token.includes(":") ? token.split(":")[1].trim() : token;
      if (column === "*") return { ...row };
      projected[column] = column in row ? row[column] : null;
    }
    return projected;
  }

  private rows(): Row[] {
    let rows = this.state.tables.get(this.table) ?? [];
    this.state.tables.set(this.table, rows);
    for (const filter of this.filters) rows = rows.filter((r) => matches(r, filter));
    for (const group of this.orFilters) {
      rows = rows.filter((row) =>
        group.some((term) =>
          term.operator === "eq" ? (row[term.column] ?? null) === term.value : false,
        ),
      );
    }
    return rows;
  }

  private async run(): Promise<FakeResult> {
    this.state.calls.push({
      table: this.table,
      op: this.op,
      payload: this.payload.length > 0 ? this.payload : undefined,
      // Recorded because the store cannot otherwise detect a wrong conflict
      // target: this fake is single-threaded and has no unique indexes, so an
      // upsert naming the wrong key still behaves. Real Postgres would refuse
      // it. Asserting the argument is how a test sees that difference.
      onConflict: this.onConflict.length > 0 ? this.onConflict.join(",") : undefined,
    });

    if (this.state.failWriteOn === this.table && this.op !== "select") {
      return {
        data: null,
        error: { message: `injected failure writing ${this.table}` },
      };
    }

    if (this.state.failReadOn === this.table && this.op === "select") {
      return {
        data: null,
        error: { message: `injected failure reading ${this.table}` },
      };
    }

    const all = this.state.tables.get(this.table) ?? [];
    this.state.tables.set(this.table, all);

    if (this.op === "select") {
      let rows = [...this.rows()];
      for (const { column, ascending } of [...this.orderBy].reverse()) {
        rows.sort((a, b) => {
          const x = a[column] as string | number | null;
          const y = b[column] as string | number | null;
          if (x === y) return 0;
          if (x === null) return 1;
          if (y === null) return -1;
          return (x < y ? -1 : 1) * (ascending ? 1 : -1);
        });
      }
      // The exact count is taken BEFORE the range window, as Postgres does:
      // `count: "exact"` reports how many rows match the filters, not how many
      // this page returned. Counting after the slice is how a paged read
      // reports its page size as the table's size.
      const exact = rows.length;

      rows = rows.slice(
        this.offsetValue,
        this.limitValue === null ? undefined : this.offsetValue + this.limitValue,
      );

      if (this.headOnly) {
        // `head: true` returns no row contents at all — which is what lets the
        // FR-58 census count two `sensitive` tables without reading either.
        return { data: null, error: null, count: this.countMode ? exact : null };
      }

      return {
        data: rows.map((row) => this.project(row)),
        error: null,
        ...(this.countMode === null ? {} : { count: exact }),
      };
    }

    if (this.op === "insert") {
      const inserted = this.payload.map((values) => {
        const row: Row = { id: `fake-${this.state.nextId++}`, ...values };
        all.push(row);
        return row;
      });
      return { data: inserted, error: null };
    }

    if (this.op === "upsert") {
      const result = this.payload.map((values) => {
        const existing =
          this.onConflict.length > 0
            ? all.find((row) =>
                this.onConflict.every((key) => row[key] === values[key]),
              )
            : undefined;
        if (existing) {
          Object.assign(existing, values);
          return existing;
        }
        const row: Row = { id: `fake-${this.state.nextId++}`, ...values };
        all.push(row);
        return row;
      });
      return { data: result, error: null };
    }

    if (this.op === "update") {
      const target = this.rows();
      for (const row of target) Object.assign(row, this.payload[0]);
      return { data: target, error: null };
    }

    // delete
    const doomed = new Set(this.rows());
    const kept = all.filter((row) => !doomed.has(row));
    this.state.tables.set(this.table, kept);
    return { data: [...doomed], error: null };
  }
}

export interface FakeDb {
  from(table: string): FakeQuery;
  rpc(name: string, args: Row): PromiseLike<FakeResult>;
  /** Everything a test asserts on afterwards. */
  readonly tables: Map<string, Row[]>;
  readonly calls: {
    table: string;
    op: string;
    payload?: unknown;
    onConflict?: string;
  }[];
  readonly rpcCalls: { name: string; args: Row }[];
  rowsIn(table: string): Row[];
}

/**
 * `encrypt_field` / `decrypt_field` stand-ins.
 *
 * The prefix is deliberately visible so a test can assert that what reached the
 * column is ciphertext rather than the plaintext it was handed. The real
 * function returns a `\xc30d…` PGP packet.
 *
 * The payload is **base64, not the plaintext with a prefix on it.** That matters
 * more than it looks: with a passthrough payload, an assertion like
 * `expect(stored).not.toContain("lead-router")` passes only by accident of
 * wording and fails for a value that is genuinely encrypted-shaped. Obscuring
 * it means a test that says "the client's prose is not in this column" is
 * actually testing that.
 */
export const FAKE_CIPHER_PREFIX = "\\xENC:";

function fakeEncrypt(plaintext: string): string {
  return `${FAKE_CIPHER_PREFIX}${Buffer.from(plaintext, "utf8").toString("base64")}`;
}

/** Exported so a test can seed a column with something the fake can read back. */
export function fakeCiphertext(plaintext: string): string {
  return fakeEncrypt(plaintext);
}

export function createFakeDb(options: FakeDbOptions = {}): FakeDb {
  /**
   * Seed rows are **copied**, not referenced.
   *
   * Updates mutate rows in place, so sharing a row literal between two tests
   * would let the first one's writes leak into the second. That is not a
   * hypothetical: it produced two false failures the first time this fixture
   * was used, and the failures looked like production bugs rather than like
   * shared state.
   */
  const seeded = new Map<string, Row[]>();
  for (const [table, rows] of Object.entries(options.tables ?? {})) {
    seeded.set(table, rows.map((row) => ({ ...row })));
  }

  const state: State = {
    tables: seeded,
    rpc: {
      encrypt_field: (args) => fakeEncrypt(String(args.plaintext)),
      decrypt_field: (args) => {
        const value = String(args.ciphertext);
        if (!value.startsWith(FAKE_CIPHER_PREFIX)) return null;
        return Buffer.from(
          value.slice(FAKE_CIPHER_PREFIX.length),
          "base64",
        ).toString("utf8");
      },
      ...options.rpc,
    },
    failWriteOn: options.failWriteOn ?? null,
    failReadOn: options.failReadOn ?? null,
    calls: [],
    rpcCalls: [],
    nextId: 1,
  };

  return {
    from: (table) => new FakeQuery(table, state),
    rpc(name, args) {
      state.rpcCalls.push({ name, args });
      const handler = state.rpc[name];
      if (!handler) {
        return Promise.resolve({
          data: null,
          error: { message: `fake db has no rpc named ${name}` },
        });
      }
      return Promise.resolve({ data: handler(args), error: null });
    },
    tables: state.tables,
    calls: state.calls,
    rpcCalls: state.rpcCalls,
    rowsIn: (table) => state.tables.get(table) ?? [],
  };
}
