/**
 * An in-memory stand-in for the Supabase client that **actually applies its
 * filters**.
 *
 * ## Why not the recording double in `server/ingest/__fixtures__/fakeDb.ts`
 *
 * That one is built to assert *what the writer sends* — its `eq`, `in` and
 * `order` are no-ops that return the chain. That is the right tool for
 * "did persistPlan name the correct conflict target", and it is the wrong tool
 * here, because the property under test in `markPlanCollisions` **is the
 * filtering**: that the update touches only `unreconciled` rows, only in the
 * given engagement, and only the ids the rule chose. Against a double whose
 * filters do nothing, deleting `.eq("plan_reconciliation", "unreconciled")`
 * from the production code changes no assertion — the test would be green on
 * code that resets a `keyed` row. So this double filters for real.
 *
 * ## What it still cannot prove
 *
 * It is not Postgres. It cannot show that the `(engagement_id, plan_ref)`
 * unique index is PLAIN, that `ON CONFLICT DO NOTHING` behaves as `supabase-js`
 * documents, or that a `check` constraint fires. Those were established against
 * the live database by project-lead in a rolled-back transaction and are
 * inherited, not re-proven here. A mock agrees with whatever the code does.
 */

interface Filter {
  kind: "eq" | "in";
  column: string;
  value: unknown;
}

export interface RecordedCall {
  table: string;
  op: "select" | "update" | "insert" | "upsert";
  filters: Filter[];
  patch?: Record<string, unknown>;
  rows?: Record<string, unknown>[];
  onConflict?: string;
  ignoreDuplicates?: boolean;
}

export interface FakePlannedDb {
  calls: RecordedCall[];
  /** Every plaintext handed to `encrypt_field`, in order. */
  encrypted: string[];
  rows: (table: string) => Record<string, unknown>[];
  seed: (table: string, rows: Record<string, unknown>[]) => void;
  /** Make the next operation on this table answer with an error. */
  failNext: (table: string, message: string) => void;
  client: unknown;
}

const ENCRYPTED_PREFIX = "\\xENC:";

/**
 * What the fake `encrypt_field` returns.
 *
 * Base64, deliberately NOT the plaintext. A double that echoed the plaintext
 * back would fail the assertion "no work-item prose reaches the column in the
 * clear" against correct code — the prose would be right there in the double's
 * own output. Real ciphertext was separately observed on this project as an
 * OpenPGP packet prefixed `c30d0407`.
 */
export function fakeCiphertext(plaintext: string): string {
  return `${ENCRYPTED_PREFIX}${Buffer.from(plaintext, "utf8").toString("base64")}`;
}

export function isFakeCiphertext(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

/**
 * Column defaults the real schema applies on insert, which application code
 * therefore never sends.
 *
 * `work_item.plan_reconciliation` is `not null default 'unreconciled'` in i1's
 * migration, and u2's insert primitive deliberately omits it. Without this the
 * double produced rows carrying `undefined` there, which is a value Postgres
 * cannot store — and it made the FR-90 marking tests fail against correct code.
 * A double that cannot represent the column under test turns a real check into
 * a false red.
 */
const DEFAULTS: Record<string, Record<string, unknown>> = {
  work_item: { plan_reconciliation: "unreconciled" },
};

function matches(row: Record<string, unknown>, filters: Filter[]): boolean {
  return filters.every((filter) => {
    const actual = row[filter.column] ?? null;
    if (filter.kind === "eq") return actual === filter.value;
    return (filter.value as unknown[]).includes(actual);
  });
}

export function createFakePlannedDb(): FakePlannedDb {
  const calls: RecordedCall[] = [];
  const encrypted: string[] = [];
  const tables = new Map<string, Record<string, unknown>[]>();
  const failures = new Map<string, string>();
  let nextId = 0;

  const builder = (table: string) => {
    const filters: Filter[] = [];
    let op: RecordedCall["op"] = "select";
    let patch: Record<string, unknown> | undefined;
    let pending: Record<string, unknown>[] | undefined;
    let onConflict: string | undefined;
    let ignoreDuplicates = false;
    let wantCount = false;
    let single = false;
    let window: { from: number; to: number } | null = null;
    let orderBy: string | null = null;

    const run = () => {
      calls.push({
        table,
        op,
        filters: [...filters],
        patch,
        rows: pending,
        onConflict,
        ignoreDuplicates,
      });

      const failure = failures.get(table);
      if (failure !== undefined) {
        failures.delete(table);
        return { data: null, error: { message: failure }, count: null };
      }

      const all = tables.get(table) ?? [];

      if (op === "insert" || op === "upsert") {
        const store = tables.get(table) ?? [];
        tables.set(table, store);
        const keys = (onConflict ?? "").split(",").map((key) => key.trim()).filter(Boolean);
        const written: Record<string, unknown>[] = [];

        for (const row of pending ?? []) {
          /**
           * NULLS DISTINCT, which is Postgres's default and what i1's index
           * relies on: a row whose conflict key contains a NULL never conflicts
           * with anything, so two planned rows with no `plan_ref` both insert.
           * Verified against the live database by project-lead in a rolled-back
           * transaction — `nulls_distinct_inserted=2`,
           * `duplicate_keyed_inserted=0`.
           */
          const keyable =
            op === "upsert" &&
            keys.length > 0 &&
            keys.every((key) => (row[key] ?? null) !== null);

          const clash =
            keyable &&
            store.some((existing) => keys.every((key) => existing[key] === row[key]));

          if (clash && ignoreDuplicates) continue;

          nextId += 1;
          const created = { id: `wi-${nextId}`, ...(DEFAULTS[table] ?? {}), ...row };
          store.push(created);
          written.push({ ...created });
        }

        return { data: written, error: null, count: null };
      }

      const hit = all.filter((row) => matches(row, filters));

      if (op === "update") {
        for (const row of hit) Object.assign(row, patch);
        return { data: hit.map((row) => ({ ...row })), error: null, count: null };
      }

      // Captured to a const: TypeScript cannot narrow a mutable `let` inside
      // the comparator closure.
      const sortColumn = orderBy;
      const ordered =
        sortColumn === null
          ? hit
          : [...hit].sort((a, b) =>
              String(a[sortColumn] ?? "").localeCompare(String(b[sortColumn] ?? "")),
            );

      const page =
        window === null ? ordered : ordered.slice(window.from, window.to + 1);
      const data = page.map((row) => ({ ...row }));

      if (single) return { data: data[0] ?? null, error: null, count: null };
      return { data, error: null, count: wantCount ? hit.length : null };
    };

    const self: Record<string, unknown> = {};
    const chain = () => self;

    self.select = (_columns: string, options?: { count?: string }) => {
      if (options?.count) wantCount = true;
      return chain();
    };
    self.update = (values: Record<string, unknown>) => {
      op = "update";
      patch = values;
      return chain();
    };
    self.insert = (values: Record<string, unknown> | Record<string, unknown>[]) => {
      op = "insert";
      pending = Array.isArray(values) ? values : [values];
      return chain();
    };
    self.upsert = (
      values: Record<string, unknown> | Record<string, unknown>[],
      options?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => {
      op = "upsert";
      pending = Array.isArray(values) ? values : [values];
      onConflict = options?.onConflict;
      ignoreDuplicates = options?.ignoreDuplicates ?? false;
      return chain();
    };
    self.eq = (column: string, value: unknown) => {
      filters.push({ kind: "eq", column, value });
      return chain();
    };
    self.in = (column: string, values: readonly unknown[]) => {
      filters.push({ kind: "in", column, value: [...values] });
      return chain();
    };
    self.order = (column: string) => {
      orderBy = column;
      return chain();
    };
    self.range = (from: number, to: number) => {
      window = { from, to };
      return chain();
    };
    self.maybeSingle = () => {
      single = true;
      return chain();
    };
    self.then = (onFulfilled: (value: unknown) => unknown) =>
      Promise.resolve(run()).then(onFulfilled);

    return self;
  };

  return {
    calls,
    encrypted,
    rows: (table) => tables.get(table) ?? [],
    seed: (table, rows) => tables.set(table, rows.map((row) => ({ ...row }))),
    failNext: (table, message) => failures.set(table, message),
    client: {
      from: (table: string) => builder(table),
      rpc: (name: string, args: Record<string, unknown>) => {
        if (name === "encrypt_field") {
          const plaintext = args.plaintext as string;
          encrypted.push(plaintext);
          return Promise.resolve({ data: fakeCiphertext(plaintext), error: null });
        }
        return Promise.resolve({ data: null, error: { message: `no rpc ${name}` } });
      },
    },
  };
}
