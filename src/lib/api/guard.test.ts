import { describe, expect, it } from "vitest";

import { createFakeSupabase } from "./__fixtures__/fake-supabase";
import type { FakeOptions, FakeSupabase } from "./__fixtures__/fake-supabase";
import { ANSWER_READ, INGEST_WRITE } from "./capabilities";
import { apiError, apiOk } from "./errors";
import { createAgentRouteGuard } from "./guard";
import type { ServiceClient } from "@/lib/supabase/service";
import { mintAgentToken } from "./tokens";

/**
 * End-to-end tests for the wrapper every agent route goes through.
 *
 * The load-bearing assertion in almost all of these is that **exactly one
 * audit_log row exists afterwards, on every path** — FR-6 says every token use
 * is recorded, and "every" includes the refusals, which is the half that is easy
 * to lose.
 */

const UUID = "0a06472c-1bf8-4b37-a68e-995d4a2ff8ad";
const HASH = "stored-hash";
const NOW = new Date("2026-08-19T12:00:17Z");

function build(options: FakeOptions = {}) {
  const fake = createFakeSupabase(options);
  const guard = createAgentRouteGuard({
    createClient: () => fake as unknown as ServiceClient,
    now: () => NOW,
  });
  return { fake, guard };
}

function liveToken() {
  const token = mintAgentToken(UUID);
  return {
    token,
    options: {
      tokens: [
        {
          id: UUID,
          label: "fleet reader",
          token_hash: HASH,
          capabilities: ["answer_read" as const],
          expires_at: "2026-12-31T00:00:00Z",
          revoked_at: null,
        },
      ],
      validSecrets: { [HASH]: token.secret },
    } satisfies FakeOptions,
  };
}

function get(authorization?: string, url = "https://l.example.com/api/answer/blocked") {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new Request(url, { method: "GET", headers });
}

function onlyAudit(fake: FakeSupabase) {
  expect(fake.audit).toHaveLength(1);
  return fake.audit[0];
}

describe("withAgentRoute — allowed", () => {
  it("runs the handler and records an allowed audit row", async () => {
    const { token, options } = liveToken();
    const { fake, guard } = build(options);

    const route = guard(ANSWER_READ, async () => apiOk({ items: [] }, { unparsed: 0 }));
    const response = await route(get(`Bearer ${token.plaintext}`));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: { items: [] },
      unparsed: 0,
    });

    expect(onlyAudit(fake)).toMatchObject({
      actor: `agent_token:${UUID}`,
      actor_type: "agent",
      action: "api.request",
      capability: ANSWER_READ,
      endpoint: "GET /api/answer/blocked",
      outcome: "allowed",
      status: 200,
    });
  });

  it("updates last_used_at after serving", async () => {
    const { token, options } = liveToken();
    const { fake, guard } = build(options);

    await guard(ANSWER_READ, async () => apiOk(null))(
      get(`Bearer ${token.plaintext}`),
    );

    expect(fake.updates).toContainEqual({
      table: "agent_token",
      values: { last_used_at: NOW.toISOString() },
    });
  });

  it("hands the handler a db that refuses contract_milestone", async () => {
    const { token, options } = liveToken();
    const { fake, guard } = build(options);

    const route = guard(ANSWER_READ, async ({ db }) => {
      // FR-5. This is the mistake the scoping exists to catch.
      (db as unknown as { from(t: string): unknown }).from("contract_milestone");
      return apiOk("unreachable");
    });

    const response = await route(get(`Bearer ${token.plaintext}`));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden_table");
    // …and the refusal is recorded, not silently swallowed.
    expect(onlyAudit(fake)).toMatchObject({ outcome: "refused", status: 403 });
  });
});

describe("withAgentRoute — every refusal is still audited", () => {
  it("records a missing Authorization header as unauthenticated", async () => {
    const { options } = liveToken();
    const { fake, guard } = build(options);

    const response = await guard(ANSWER_READ, async () => apiOk(null))(get());

    expect(response.status).toBe(401);
    expect(onlyAudit(fake)).toMatchObject({
      actor: "unauthenticated",
      capability: null,
      outcome: "refused",
      status: 401,
    });
  });

  it("records an invalid token without writing any part of the secret", async () => {
    const { options } = liveToken();
    const { fake, guard } = build(options);
    const attacker = mintAgentToken(UUID);

    await guard(ANSWER_READ, async () => apiOk(null))(
      get(`Bearer ${attacker.plaintext}`),
    );

    const row = onlyAudit(fake);
    expect(row.actor).toBe(`agent_token:${UUID}`);
    expect(JSON.stringify(row)).not.toContain(attacker.secret);
    expect(JSON.stringify(row)).not.toContain(attacker.secret.slice(0, 8));
  });

  it("records a capability refusal as 403 and does not run the handler", async () => {
    const { token, options } = liveToken();
    const { fake, guard } = build(options);
    let ran = false;

    // The token carries answer:read; this route demands ingest:write.
    const response = await guard(INGEST_WRITE, async () => {
      ran = true;
      return apiOk(null);
    })(get(`Bearer ${token.plaintext}`));

    expect(response.status).toBe(403);
    expect(ran).toBe(false);
    expect(onlyAudit(fake)).toMatchObject({
      outcome: "refused",
      status: 403,
      capability: INGEST_WRITE,
    });
  });

  it("records a rate-limit refusal as 429 and does not run the handler", async () => {
    const { token, options } = liveToken();
    const { fake, guard } = build({ ...options, rateLimitVerdicts: [false] });
    let ran = false;

    const response = await guard(ANSWER_READ, async () => {
      ran = true;
      return apiOk(null);
    })(get(`Bearer ${token.plaintext}`));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("43");
    expect(ran).toBe(false);
    expect(onlyAudit(fake)).toMatchObject({ outcome: "refused", status: 429 });
  });

  it("rate-limits AFTER authenticating, so an unknown token cannot burn a real one's window", async () => {
    const { options } = liveToken();
    const { fake, guard } = build(options);
    const stranger = mintAgentToken("11111111-2222-4333-8444-555555555555");

    await guard(ANSWER_READ, async () => apiOk(null))(
      get(`Bearer ${stranger.plaintext}`),
    );

    expect(
      fake.rpcCalls.filter((c) => c.name === "check_and_increment_rate_limit"),
    ).toHaveLength(0);
  });
});

describe("withAgentRoute — handler failures", () => {
  it("converts a thrown ApiError into its own status and audits it", async () => {
    const { token, options } = liveToken();
    const { fake, guard } = build(options);

    const response = await guard(ANSWER_READ, async () => {
      throw apiError("invalid_request", "The `since` parameter is not a date.");
    })(get(`Bearer ${token.plaintext}`));

    expect(response.status).toBe(400);
    expect(onlyAudit(fake)).toMatchObject({ outcome: "refused", status: 400 });
  });

  it("converts an unexpected throw into a 500 that leaks no mechanism", async () => {
    const { token, options } = liveToken();
    const { fake, guard } = build(options);

    const response = await guard(ANSWER_READ, async () => {
      throw new Error(
        'duplicate key value violates unique constraint "agent_token_token_hash_key"',
      );
    })(get(`Bearer ${token.plaintext}`));

    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("internal_error");
    expect(body.error.message).not.toContain("agent_token_token_hash_key");
    expect(body.error.message).not.toContain("duplicate key");
    expect(onlyAudit(fake)).toMatchObject({ outcome: "error", status: 500 });
  });

  it("refuses to serve at all when the audit write fails", async () => {
    const { token, options } = liveToken();
    const { guard } = build({ ...options, fail: { auditInsert: true } });
    let ran = false;

    const response = await guard(ANSWER_READ, async () => {
      ran = true;
      return apiOk({ secret: "data" });
    })(get(`Bearer ${token.plaintext}`));

    // The handler runs, but its response is discarded rather than served
    // unrecorded — FR-6 says every token use is written.
    expect(ran).toBe(true);
    expect(response.status).toBe(500);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("internal_error");
    await expect(Promise.resolve(body)).resolves.not.toHaveProperty("data");
  });
});
