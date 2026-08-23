/**
 * A hand-written stand-in for the Supabase client, for the API-primitive tests.
 *
 * It is deliberately not a mock library: `agentScopedDb` wraps the client in a
 * `Proxy` and re-wraps whatever the builder methods return, so the fake has to
 * behave like a real chainable, thenable PostgREST builder or the tests would
 * pass against a shape the production code never sees.
 *
 * It supports exactly the calls this unit's modules make and nothing else. A
 * missing method should fail loudly rather than return undefined, so anything
 * unimplemented throws.
 */

export interface FakeTokenRow {
  id: string;
  label: string;
  token_hash: string;
  capabilities: ("answer_read" | "ingest_write")[];
  expires_at: string;
  revoked_at: string | null;
  last_used_at?: string | null;
  created_at?: string;
}

export interface FakeAuditRow {
  actor: string | null;
  actor_type: string;
  action: string;
  capability: string | null;
  endpoint: string | null;
  outcome: string | null;
  status: number | null;
  target_table: string | null;
  target_id: string | null;
}

export interface FakeOptions {
  tokens?: FakeTokenRow[];
  /** Secrets that `verify_agent_token` should accept, keyed by the stored hash. */
  validSecrets?: Record<string, string>;
  /** Queue of verdicts the rate limiter returns, consumed in order. */
  rateLimitVerdicts?: boolean[];
  /** Force specific failures, to test the fail-closed paths. */
  fail?: {
    auditInsert?: boolean;
    tokenSelect?: boolean;
    verifyRpc?: boolean;
    rateLimitRpc?: boolean;
  };
}

export interface FakeSupabase {
  from(table: string): FakeQuery;
  rpc(name: string, args: Record<string, unknown>): PromiseLike<FakeResult>;
  /** Everything the test wants to assert on afterwards. */
  readonly audit: FakeAuditRow[];
  readonly rpcCalls: { name: string; args: Record<string, unknown> }[];
  readonly updates: { table: string; values: Record<string, unknown> }[];
}

interface FakeResult {
  data: unknown;
  error: { message: string } | null;
}

class FakeQuery implements PromiseLike<FakeResult> {
  private filters: [string, unknown][] = [];
  private op: "select" | "insert" | "update" = "select";
  private payload: Record<string, unknown> | null = null;
  private returning = false;

  constructor(
    private readonly table: string,
    private readonly state: InternalState,
  ) {}

  select(_columns?: string): this {
    if (this.op === "select") this.op = "select";
    else this.returning = true;
    return this;
  }

  insert(values: Record<string, unknown>): this {
    this.op = "insert";
    this.payload = values;
    return this;
  }

  update(values: Record<string, unknown>): this {
    this.op = "update";
    this.payload = values;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  is(column: string, value: unknown): this {
    this.filters.push([column, value]);
    return this;
  }

  order(_column: string, _options?: unknown): this {
    return this;
  }

  maybeSingle(): PromiseLike<FakeResult> {
    return this.run().then((result) => {
      const rows = result.data as unknown[] | null;
      return {
        data: Array.isArray(rows) ? (rows[0] ?? null) : rows,
        error: result.error,
      };
    });
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?:
      | ((value: FakeResult) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<FakeResult> {
    if (this.table === "audit_log") {
      if (this.state.fail.auditInsert) {
        return { data: null, error: { message: "audit insert failed" } };
      }
      if (this.op === "insert" && this.payload) {
        this.state.audit.push(this.payload as unknown as FakeAuditRow);
      }
      return { data: [], error: null };
    }

    if (this.table === "agent_token") {
      if (this.op === "select" && this.state.fail.tokenSelect) {
        return { data: null, error: { message: "token select failed" } };
      }
      if (this.op === "update") {
        this.state.updates.push({
          table: this.table,
          values: this.payload ?? {},
        });
        const matched = this.state.tokens.filter((row) =>
          this.matches(row as unknown as Record<string, unknown>),
        );
        for (const row of matched) Object.assign(row, this.payload);
        return { data: this.returning ? matched : [], error: null };
      }
      if (this.op === "insert" && this.payload) {
        this.state.tokens.push(this.payload as unknown as FakeTokenRow);
        return { data: [], error: null };
      }
      const rows = this.state.tokens.filter((row) =>
        this.matches(row as unknown as Record<string, unknown>),
      );
      return { data: rows, error: null };
    }

    // Any other table: an empty, successful read. Enough for the FR-5 tests,
    // whose whole point is what happens *before* a query is issued.
    return { data: [], error: null };
  }

  private matches(row: Record<string, unknown>): boolean {
    return this.filters.every(([column, value]) => row[column] === value);
  }
}

interface InternalState {
  tokens: FakeTokenRow[];
  audit: FakeAuditRow[];
  updates: { table: string; values: Record<string, unknown> }[];
  fail: NonNullable<FakeOptions["fail"]>;
}

export function createFakeSupabase(options: FakeOptions = {}): FakeSupabase {
  const state: InternalState = {
    tokens: (options.tokens ?? []).map((token) => ({ ...token })),
    audit: [],
    updates: [],
    fail: options.fail ?? {},
  };

  const validSecrets = options.validSecrets ?? {};
  const verdicts = [...(options.rateLimitVerdicts ?? [])];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

  return {
    audit: state.audit,
    rpcCalls,
    updates: state.updates,

    from(table: string) {
      return new FakeQuery(table, state);
    },

    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });

      if (name === "verify_agent_token") {
        if (state.fail.verifyRpc) {
          return Promise.resolve({
            data: null,
            error: { message: "verify failed" },
          });
        }
        const hash = args.p_hash as string;
        return Promise.resolve({
          data: validSecrets[hash] === (args.p_token as string),
          error: null,
        });
      }

      if (name === "check_and_increment_rate_limit") {
        if (state.fail.rateLimitRpc) {
          return Promise.resolve({
            data: null,
            error: { message: "rate limit failed" },
          });
        }
        // Default to allowing, so a test that does not care about limiting
        // does not have to queue a verdict for every request.
        const next = verdicts.length > 0 ? verdicts.shift() : true;
        return Promise.resolve({ data: next ?? true, error: null });
      }

      if (name === "hash_agent_token") {
        return Promise.resolve({
          data: `hashed:${args.p_token as string}`,
          error: null,
        });
      }

      if (name === "decrypt_field" || name === "encrypt_field") {
        // Allowed for agents by §7a ("decrypted server-side"). The fake returns
        // a marker rather than real crypto — these tests are about whether the
        // call is permitted, not about what it computes.
        return Promise.resolve({ data: `${name}:ok`, error: null });
      }

      throw new Error(`FakeSupabase: unimplemented rpc ${name}`);
    },
  };
}
