import { describe, expect, it } from "vitest";

import { createFakeSupabase } from "./__fixtures__/fake-supabase";
import type { FakeTokenRow } from "./__fixtures__/fake-supabase";
import {
  assertCapability,
  authenticateAgentRequest,
} from "./authenticate";
import type { AuthCapableClient } from "./authenticate";
import { ANSWER_READ, INGEST_WRITE } from "./capabilities";
import { mintAgentToken } from "./tokens";

const UUID = "0a06472c-1bf8-4b37-a68e-995d4a2ff8ad";
const HASH = "hash-for-the-live-token";
const NOW = new Date("2026-08-19T12:00:00Z");

function row(overrides: Partial<FakeTokenRow> = {}): FakeTokenRow {
  return {
    id: UUID,
    label: "fleet reader",
    token_hash: HASH,
    capabilities: ["answer_read"],
    expires_at: "2026-12-31T00:00:00Z",
    revoked_at: null,
    ...overrides,
  };
}

function request(authorization?: string): {
  headers: { get(name: string): string | null };
} {
  const headers = new Headers();
  if (authorization !== undefined) headers.set("authorization", authorization);
  return { headers };
}

function clientFor(token: { secret: string }, overrides: Partial<FakeTokenRow> = {}) {
  return createFakeSupabase({
    tokens: [row(overrides)],
    validSecrets: { [HASH]: token.secret },
  }) as unknown as AuthCapableClient;
}

describe("authenticateAgentRequest — the happy path", () => {
  it("accepts a valid token and returns its capabilities in wire spelling", async () => {
    const token = mintAgentToken(UUID);
    const result = await authenticateAgentRequest(
      request(`Bearer ${token.plaintext}`),
      clientFor(token),
      NOW,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");
    expect(result.token.id).toBe(UUID);
    expect(result.token.capabilities).toEqual([ANSWER_READ]);
  });
});

describe("authenticateAgentRequest — refusals before proof of possession", () => {
  it("refuses a missing header", async () => {
    const token = mintAgentToken(UUID);
    const result = await authenticateAgentRequest(
      request(),
      clientFor(token),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("missing_authorization");
    expect(result.error.status).toBe(401);
  });

  it("refuses a header that is not a Delivery Ledger token", async () => {
    const token = mintAgentToken(UUID);
    const result = await authenticateAgentRequest(
      request("Bearer not-our-token"),
      clientFor(token),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("malformed_authorization");
  });

  it("answers an UNKNOWN id and a WRONG secret identically, so ids cannot be enumerated", async () => {
    const real = mintAgentToken(UUID);
    const unknownId = mintAgentToken("11111111-2222-4333-8444-555555555555");
    const wrongSecret = mintAgentToken(UUID);

    const unknown = await authenticateAgentRequest(
      request(`Bearer ${unknownId.plaintext}`),
      clientFor(real),
      NOW,
    );
    const wrong = await authenticateAgentRequest(
      request(`Bearer ${wrongSecret.plaintext}`),
      clientFor(real),
      NOW,
    );

    expect(unknown.ok).toBe(false);
    expect(wrong.ok).toBe(false);
    if (unknown.ok || wrong.ok) throw new Error("unreachable");
    expect(unknown.error.code).toBe("invalid_token");
    expect(wrong.error.code).toBe("invalid_token");
    // Byte-identical, not merely the same code.
    expect(unknown.error.message).toBe(wrong.error.message);
    expect(unknown.error.status).toBe(wrong.error.status);
  });
});

describe("authenticateAgentRequest — refusals after proof of possession", () => {
  it("says token_revoked only once the secret verified", async () => {
    const token = mintAgentToken(UUID);
    const result = await authenticateAgentRequest(
      request(`Bearer ${token.plaintext}`),
      clientFor(token, { revoked_at: "2026-08-18T00:00:00Z" }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("token_revoked");
  });

  it("says token_expired for a past expiry", async () => {
    const token = mintAgentToken(UUID);
    const result = await authenticateAgentRequest(
      request(`Bearer ${token.plaintext}`),
      clientFor(token, { expires_at: "2026-08-01T00:00:00Z" }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("token_expired");
  });

  it("treats the expiry instant itself as expired", async () => {
    const token = mintAgentToken(UUID);
    const result = await authenticateAgentRequest(
      request(`Bearer ${token.plaintext}`),
      clientFor(token, { expires_at: NOW.toISOString() }),
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("token_expired");
  });

  it("checks revocation BEFORE the secret, never after — a revoked token with a wrong secret is invalid_token", async () => {
    const token = mintAgentToken(UUID);
    const other = mintAgentToken(UUID);
    const result = await authenticateAgentRequest(
      request(`Bearer ${other.plaintext}`),
      createFakeSupabase({
        tokens: [row({ revoked_at: "2026-08-18T00:00:00Z" })],
        validSecrets: { [HASH]: token.secret },
      }) as unknown as AuthCapableClient,
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // Not token_revoked: the caller never proved possession, so it learns nothing.
    expect(result.error.code).toBe("invalid_token");
  });
});

describe("authenticateAgentRequest — fails closed on infrastructure errors", () => {
  it("does not authenticate when the token lookup errors", async () => {
    const token = mintAgentToken(UUID);
    const result = await authenticateAgentRequest(
      request(`Bearer ${token.plaintext}`),
      createFakeSupabase({
        tokens: [row()],
        validSecrets: { [HASH]: token.secret },
        fail: { tokenSelect: true },
      }) as unknown as AuthCapableClient,
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("internal_error");
  });

  it("does not authenticate when the verify RPC errors", async () => {
    const token = mintAgentToken(UUID);
    const result = await authenticateAgentRequest(
      request(`Bearer ${token.plaintext}`),
      createFakeSupabase({
        tokens: [row()],
        validSecrets: { [HASH]: token.secret },
        fail: { verifyRpc: true },
      }) as unknown as AuthCapableClient,
      NOW,
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.error.code).toBe("internal_error");
  });
});

describe("assertCapability", () => {
  const token = {
    id: UUID,
    label: "reader",
    capabilities: [ANSWER_READ],
    expiresAt: "2026-12-31T00:00:00Z",
  };

  it("passes when the capability is present", () => {
    expect(assertCapability(token, ANSWER_READ)).toBeNull();
  });

  it("refuses with 403 when it is not", () => {
    const error = assertCapability(token, INGEST_WRITE);
    expect(error?.code).toBe("insufficient_capability");
    expect(error?.status).toBe(403);
  });

  it("refuses a token with no capabilities at all", () => {
    const error = assertCapability({ ...token, capabilities: [] }, ANSWER_READ);
    expect(error?.code).toBe("insufficient_capability");
    expect(error?.message).toContain("no capabilities");
  });
});
