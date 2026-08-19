/**
 * A recording stand-in for the Supabase client, for asserting WHAT the writer
 * sends rather than what the database does with it.
 *
 * ## What this can and cannot prove — stated, because the distinction is the
 * ## whole reason the report separates two kinds of evidence
 *
 * It CAN prove that `persistPlan` upserts against the intended conflict targets,
 * that it routes every §7a-encrypted field through `encrypt_field` and never
 * writes a plaintext into one of those columns, and that an unanswered question
 * omits the answer columns entirely.
 *
 * It CANNOT prove that those conflict targets are idempotent in Postgres. A
 * mock agrees with whatever the code does; only the database disagrees. The
 * `ON CONFLICT` inference behaviour that broke this unit's first design —
 * `42P10` against a partial unique index — is invisible to any double, and was
 * caught by executing SQL against the real project. Both halves are in the
 * report, labelled.
 */

interface Result {
  data: unknown;
  error: unknown;
}

export interface RecordedCall {
  table: string;
  op: "select" | "upsert" | "insert" | "update" | "delete";
  rows?: Record<string, unknown>[];
  onConflict?: string;
}

export interface FakeDb {
  calls: RecordedCall[];
  encrypted: (string | null)[];
  /** Rows a `select` on this table resolves to. */
  seed: (table: string, rows: Record<string, unknown>[]) => void;
  client: unknown;
}

const ENCRYPTED_PREFIX = "\\xENC:";

/**
 * What the fake `encrypt_field` returns.
 *
 * The payload is base64 and NOT the plaintext, which matters more than it
 * looks: an earlier version of this double returned `\xENC:<plaintext>`, and
 * under it the assertion "no work-item prose reaches the column in the clear"
 * failed against correct code — the prose was right there in the double's own
 * output. A double that cannot represent the property under test turns a real
 * check into a false red, and the reverse mistake (a double that satisfies the
 * property for free) turns it into a false green.
 *
 * Real ciphertext was separately observed on the project: `pgp_sym_encrypt`
 * output carries the OpenPGP prefix `c30d0407`, contains no plaintext
 * substring, and is non-deterministic. This is opaque and reversible, which is
 * as close as a double gets.
 */
export function fakeCiphertext(plaintext: string): string {
  return `${ENCRYPTED_PREFIX}${Buffer.from(plaintext, "utf8").toString("base64")}`;
}

export function isFakeCiphertext(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(ENCRYPTED_PREFIX);
}

export function createFakeDb(): FakeDb {
  const calls: RecordedCall[] = [];
  const encrypted: (string | null)[] = [];
  const seeded = new Map<string, Record<string, unknown>[]>();

  const builder = (table: string) => {
    let op: RecordedCall["op"] = "select";
    let rows: Record<string, unknown>[] | undefined;
    let onConflict: string | undefined;
    let single = false;

    const record = (): Result => {
      calls.push({ table, op, rows, onConflict });
      if (op === "select" || op === "upsert" || op === "insert" || op === "update") {
        const data = seeded.get(table) ?? (op === "select" ? [] : rows ?? []);
        return single ? { data: data[0] ?? null, error: null } : { data, error: null };
      }
      return { data: null, error: null };
    };

    const self: Record<string, unknown> = {};
    const chain = () => self;

    self.select = () => chain();
    self.eq = () => chain();
    self.in = () => chain();
    self.order = () => chain();
    self.range = () => chain();
    self.upsert = (r: Record<string, unknown>[] | Record<string, unknown>, o?: { onConflict?: string }) => {
      op = "upsert";
      rows = Array.isArray(r) ? r : [r];
      onConflict = o?.onConflict;
      return chain();
    };
    self.insert = (r: Record<string, unknown>) => {
      op = "insert";
      rows = [r];
      return chain();
    };
    self.update = (r: Record<string, unknown>) => {
      op = "update";
      rows = [r];
      return chain();
    };
    self.delete = () => {
      op = "delete";
      return chain();
    };
    self.single = () => {
      single = true;
      return chain();
    };
    self.maybeSingle = () => {
      single = true;
      return chain();
    };
    self.then = (onFulfilled: (value: Result) => unknown) =>
      Promise.resolve(record()).then(onFulfilled);

    return self;
  };

  return {
    calls,
    encrypted,
    seed: (table, rows) => seeded.set(table, rows),
    client: {
      from: (table: string) => builder(table),
      rpc: (name: string, args: Record<string, unknown>) => {
        if (name === "encrypt_field") {
          const plaintext = args.plaintext as string;
          encrypted.push(plaintext);
          return Promise.resolve({ data: fakeCiphertext(plaintext), error: null });
        }
        if (name === "decrypt_field") {
          const ciphertext = args.ciphertext as string;
          return Promise.resolve({
            data: ciphertext.startsWith(ENCRYPTED_PREFIX)
              ? Buffer.from(
                  ciphertext.slice(ENCRYPTED_PREFIX.length),
                  "base64",
                ).toString("utf8")
              : ciphertext,
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: { message: `no rpc ${name}` } });
      },
    },
  };
}
