import { describe, expect, it } from "vitest";

import { createFakeSupabase } from "./__fixtures__/fake-supabase";
import type { AuditCapableClient } from "./audit";
import { endpointOf, writeAuditLog } from "./audit";
import { ApiError } from "./errors";

describe("endpointOf — FR-59's 'no record contents', enforced", () => {
  it("records the method and the pathname", () => {
    expect(
      endpointOf({
        method: "get",
        url: "https://ledger.example.com/api/answer/blocked",
      }),
    ).toBe("GET /api/answer/blocked");
  });

  it("DROPS the query string, which is where record contents would leak", () => {
    const endpoint = endpointOf({
      method: "GET",
      url: "https://ledger.example.com/api/answer/blocked?client=Acme%20Capital&q=late%20payment",
    });

    expect(endpoint).toBe("GET /api/answer/blocked");
    expect(endpoint).not.toContain("Acme");
    expect(endpoint).not.toContain("client=");
    expect(endpoint).not.toContain("?");
  });

  it("does not record a URL it cannot parse, rather than storing it raw", () => {
    // A raw fallback is exactly how a query string would get in by the back door.
    const endpoint = endpointOf({ method: "POST", url: "/api/x?secret=value" });
    expect(endpoint).toBe("POST unparsed");
    expect(endpoint).not.toContain("secret");
  });
});

describe("writeAuditLog", () => {
  it("writes the FR-6 triple: capability, endpoint, outcome", async () => {
    const fake = createFakeSupabase();
    await writeAuditLog(fake as unknown as AuditCapableClient, {
      actor: "agent_token:0a06472c-1bf8-4b37-a68e-995d4a2ff8ad",
      actorType: "agent",
      action: "api.request",
      capability: "answer:read",
      endpoint: "GET /api/answer/blocked",
      outcome: "allowed",
      status: 200,
    });

    expect(fake.audit).toHaveLength(1);
    expect(fake.audit[0]).toMatchObject({
      actor: "agent_token:0a06472c-1bf8-4b37-a68e-995d4a2ff8ad",
      actor_type: "agent",
      action: "api.request",
      capability: "answer:read",
      endpoint: "GET /api/answer/blocked",
      outcome: "allowed",
      status: 200,
    });
  });

  it("nulls the optional fields rather than omitting them", async () => {
    const fake = createFakeSupabase();
    await writeAuditLog(fake as unknown as AuditCapableClient, {
      actor: "unauthenticated",
      actorType: "agent",
      action: "api.request",
    });

    expect(fake.audit[0]).toMatchObject({
      capability: null,
      endpoint: null,
      outcome: null,
      status: null,
      target_table: null,
      target_id: null,
    });
  });

  it("FAILS CLOSED: a failed audit write throws rather than being swallowed", async () => {
    const fake = createFakeSupabase({ fail: { auditInsert: true } });

    await expect(
      writeAuditLog(fake as unknown as AuditCapableClient, {
        actor: "agent_token:x",
        actorType: "agent",
        action: "api.request",
      }),
    ).rejects.toThrowError(ApiError);
  });

  it("leaks no database message to the caller when it fails", async () => {
    const fake = createFakeSupabase({ fail: { auditInsert: true } });
    try {
      await writeAuditLog(fake as unknown as AuditCapableClient, {
        actor: "a",
        actorType: "agent",
        action: "api.request",
      });
      throw new Error("should have thrown");
    } catch (thrown) {
      expect((thrown as ApiError).code).toBe("internal_error");
      expect((thrown as ApiError).message).not.toContain("audit insert failed");
    }
  });
});
