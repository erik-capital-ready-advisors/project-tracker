import { describe, expect, it } from "vitest";

import {
  AGENT_TOKEN_PREFIX,
  bearerFromAuthorizationHeader,
  describeTokenForLog,
  mintAgentToken,
  mintAgentTokenWithNewId,
  parseAgentToken,
} from "./tokens";

const UUID = "0a06472c-1bf8-4b37-a68e-995d4a2ff8ad";

describe("mintAgentToken", () => {
  it("produces dl_<uuid>_<64 hex> and keeps the secret out of the id", () => {
    const token = mintAgentToken(UUID);

    expect(token.plaintext).toMatch(/^dl_[0-9a-f-]{36}_[0-9a-f]{64}$/);
    expect(token.id).toBe(UUID);
    expect(token.secret).toHaveLength(64);
    expect(token.plaintext).toBe(`${AGENT_TOKEN_PREFIX}_${UUID}_${token.secret}`);
  });

  it("keeps the hashed segment inside bcrypt's 72-byte input limit", () => {
    // Measured against this project's Postgres: `crypt(…, gen_salt('bf', …))`
    // truncates at exactly 72 bytes. Only `secret` is hashed, so it must fit.
    const token = mintAgentTokenWithNewId();
    expect(new TextEncoder().encode(token.secret).length).toBeLessThanOrEqual(72);
    // …and the full plaintext must NOT, which is the whole reason for the split.
    expect(new TextEncoder().encode(token.plaintext).length).toBeGreaterThan(72);
  });

  it("never repeats a secret", () => {
    const secrets = new Set(
      Array.from({ length: 50 }, () => mintAgentTokenWithNewId().secret),
    );
    expect(secrets.size).toBe(50);
  });

  it("refuses a row id that is not a uuid", () => {
    expect(() => mintAgentToken("not-a-uuid")).toThrow(/lowercase uuid/);
  });
});

describe("parseAgentToken", () => {
  it("accepts a well-formed token", () => {
    const token = mintAgentToken(UUID);
    expect(parseAgentToken(token.plaintext)).toEqual({
      id: UUID,
      secret: token.secret,
    });
  });

  it.each([
    ["wrong prefix", `xx_${UUID}_${"a".repeat(64)}`],
    ["no prefix", `${UUID}_${"a".repeat(64)}`],
    ["id is not a uuid", `dl_nope_${"a".repeat(64)}`],
    ["secret too short", `dl_${UUID}_${"a".repeat(63)}`],
    ["secret too long", `dl_${UUID}_${"a".repeat(65)}`],
    ["secret not hex", `dl_${UUID}_${"z".repeat(64)}`],
    ["uppercase hex", `dl_${UUID}_${"A".repeat(64)}`],
    ["extra segment", `dl_${UUID}_${"a".repeat(64)}_x`],
    ["empty", ""],
  ])("returns null rather than guessing: %s", (_label, raw) => {
    expect(parseAgentToken(raw)).toBeNull();
  });

  it("returns null for non-strings instead of coercing", () => {
    for (const value of [null, undefined, 42, {}, []]) {
      expect(parseAgentToken(value)).toBeNull();
    }
  });
});

describe("bearerFromAuthorizationHeader", () => {
  it("accepts the scheme case-insensitively, per RFC 7235", () => {
    expect(bearerFromAuthorizationHeader("Bearer abc")).toBe("abc");
    expect(bearerFromAuthorizationHeader("bearer abc")).toBe("abc");
    expect(bearerFromAuthorizationHeader("BEARER abc")).toBe("abc");
  });

  it("tolerates surrounding and inner whitespace", () => {
    expect(bearerFromAuthorizationHeader("  Bearer   abc  ")).toBe("abc");
  });

  it.each([
    ["Basic abc"],
    ["Bearer"],
    ["Bearer "],
    ["Bearer a b"],
    [""],
  ])("returns null for %s", (header) => {
    expect(bearerFromAuthorizationHeader(header)).toBeNull();
  });
});

describe("describeTokenForLog", () => {
  it("names the id and never any part of the secret", () => {
    const token = mintAgentToken(UUID);
    const described = describeTokenForLog({
      id: token.id,
      secret: token.secret,
    });

    expect(described).toBe(`agent_token:${UUID}`);
    expect(described).not.toContain(token.secret);
    // Not even a prefix of it. A truncated credential is still a credential.
    expect(described).not.toContain(token.secret.slice(0, 4));
  });

  it("says unauthenticated when nothing parsed", () => {
    expect(describeTokenForLog(null)).toBe("unauthenticated");
  });
});
