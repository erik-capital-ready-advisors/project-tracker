import { describe, expect, it } from "vitest";

import { createFakeSupabase } from "./__fixtures__/fake-supabase";
import { agentScopedDb } from "./agent-db";
import { ApiError } from "./errors";

/**
 * FR-5, the refusal: "agent tokens are refused this table entirely."
 *
 * These tests are about the guard, not about the database. §7a's refusal is
 * enforced in the application because agent tokens are not Postgres roles and
 * the handler reads with a service-role key that holds BYPASSRLS — so this file
 * is the *only* thing standing between an agent route and a client's contract
 * amounts, and it is tested accordingly.
 */

function scoped() {
  return agentScopedDb(createFakeSupabase() as unknown as Record<string, never>);
}

describe("agentScopedDb — direct table access", () => {
  it.each([
    ["contract_milestone"],
    ["operator"],
    ["agent_token"],
    ["audit_log"],
  ])("refuses .from(%s)", (table) => {
    const db = scoped() as unknown as { from(t: string): unknown };
    expect(() => db.from(table)).toThrowError(ApiError);
    try {
      db.from(table);
    } catch (thrown) {
      expect((thrown as ApiError).code).toBe("forbidden_table");
      expect((thrown as ApiError).status).toBe(403);
    }
  });

  it("POSITIVE CONTROL: allows a table an agent may read", () => {
    const db = scoped() as unknown as { from(t: string): unknown };
    expect(() => db.from("work_item")).not.toThrow();
  });

  it("still resolves an allowed query end to end", async () => {
    const db = scoped() as unknown as {
      from(t: string): { select(c: string): PromiseLike<unknown> };
    };
    await expect(db.from("work_item").select("id")).resolves.toEqual({
      data: [],
      error: null,
    });
  });
});

describe("agentScopedDb — PostgREST embeds", () => {
  it("refuses a forbidden table embedded in a projection", () => {
    const db = scoped() as unknown as {
      from(t: string): { select(c: string): unknown };
    };
    expect(() =>
      db.from("acceptance_criterion").select("*, contract_milestone(*)"),
    ).toThrowError(/may not read `contract_milestone`/);
  });

  it("refuses an aliased embed", () => {
    const db = scoped() as unknown as {
      from(t: string): { select(c: string): unknown };
    };
    expect(() =>
      db.from("acceptance_criterion").select("id, money:contract_milestone(amount)"),
    ).toThrowError(/contract_milestone/);
  });

  it("refuses an embed by foreign-key constraint name, which carries no table name", () => {
    const db = scoped() as unknown as {
      from(t: string): { select(c: string): unknown };
    };
    // This string does not contain "contract_milestone" anywhere. PostgREST
    // still resolves it to that table, which is why the alias list exists.
    const projection = "*, acceptance_criterion_milestone_id_fkey(*)";
    expect(projection).not.toContain("contract_milestone");
    expect(() =>
      db.from("acceptance_criterion").select(projection),
    ).toThrowError(/contract_milestone/);
  });

  it("refuses a forbidden embed on the select that FOLLOWS an insert", () => {
    // `.insert()` returns a different builder object than `.from()` did, so this
    // only passes because the wrapper re-wraps what each method returns.
    const db = scoped() as unknown as {
      from(t: string): {
        insert(v: Record<string, unknown>): { select(c: string): unknown };
      };
    };
    expect(() =>
      db
        .from("acceptance_criterion")
        .insert({ requirement_ref: "FR-1" })
        .select("*, contract_milestone(*)"),
    ).toThrowError(/contract_milestone/);
  });

  it("does not trip on a column name that merely starts with a forbidden table name", () => {
    const db = scoped() as unknown as {
      from(t: string): { select(c: string): unknown };
    };
    expect(() =>
      db.from("acceptance_criterion").select("id, contract_milestone_id"),
    ).not.toThrow();
  });
});

describe("agentScopedDb — §7a's column restriction on engagement", () => {
  function selectEngagement(projection: string) {
    const db = scoped() as unknown as {
      from(t: string): { select(c: string): unknown };
    };
    return () => db.from("engagement").select(projection);
  }

  it("allows the columns §7a names: name, slug, and the provisioning identifiers", () => {
    expect(
      selectEngagement("id, slug, client_name, db_project_ref, production_url"),
    ).not.toThrow();
  });

  it("refuses `*`, which would silently widen as the schema grows", () => {
    expect(selectEngagement("*")).toThrowError(/Refused: \*/);
  });

  it.each([
    ["source", "id, source"],
    ["repo_path", "id, repo_path"],
    ["contract_type", "slug, contract_type"],
    ["spec_path", "spec_path"],
  ])("refuses %s, which describes how Erik got the work", (column, projection) => {
    expect(selectEngagement(projection)).toThrowError(
      new RegExp(`Refused: ${column}`),
    );
  });

  it("sees through an alias and a cast", () => {
    expect(selectEngagement("name:source::text")).toThrowError(/Refused: source/);
  });

  it("applies the same restriction to an EMBEDDED engagement", () => {
    const db = scoped() as unknown as {
      from(t: string): { select(c: string): unknown };
    };
    expect(() =>
      db.from("work_item").select("id, engagement(client_name, repo_path)"),
    ).toThrowError(/Refused: repo_path/);
  });

  it("allows a legitimate embed of the permitted columns", () => {
    const db = scoped() as unknown as {
      from(t: string): { select(c: string): unknown };
    };
    expect(() =>
      db.from("work_item").select("id, engagement(client_name, slug)"),
    ).not.toThrow();
  });

  it("refuses an aliased embed of a withheld column", () => {
    const db = scoped() as unknown as {
      from(t: string): { select(c: string): unknown };
    };
    expect(() =>
      db.from("work_item").select("id, client:engagement(repo_path)"),
    ).toThrowError(/repo_path/);
  });
});

describe("agentScopedDb — rpc", () => {
  it.each([
    ["hash_agent_token"],
    ["verify_agent_token"],
    ["check_and_increment_rate_limit"],
    ["prune_rate_limit_counters"],
  ])("refuses the credential/limiter internal %s", (name) => {
    const db = scoped() as unknown as {
      rpc(n: string, a: Record<string, unknown>): unknown;
    };
    expect(() => db.rpc(name, {})).toThrowError(ApiError);
  });

  it("POSITIVE CONTROL: allows decrypt_field, which §7a requires for agents", () => {
    // §7a: work_item / blocker / requirement / open_question prose is read by
    // "operator, agents, decrypted server-side". Blocking this would break the
    // answer endpoints.
    const db = scoped() as unknown as {
      rpc(n: string, a: Record<string, unknown>): unknown;
    };
    expect(() => db.rpc("decrypt_field", { ciphertext: "\\xdead" })).not.toThrow();
  });
});
