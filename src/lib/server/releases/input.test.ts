// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  RELEASE_INPUT_LIMITS,
  isProblems,
  looksLikeSecret,
  parseReleaseBody,
  sanitizeReleaseUrl,
} from "./input";

function valid(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    engagement: "delivery-ledger",
    identifier: "dpl_9xKq2mVn",
    environment: "preview",
    ...overrides,
  };
}

function parsed(body: Record<string, unknown>) {
  const result = parseReleaseBody(body);
  if (isProblems(result)) {
    throw new Error(`expected a valid parse, got: ${result.problems.join(" | ")}`);
  }
  return result;
}

function problems(body: unknown): string[] {
  const result = parseReleaseBody(body);
  if (!isProblems(result)) throw new Error("expected problems, got a valid parse");
  return result.problems;
}

describe("looksLikeSecret — FR-78 at the release boundary", () => {
  it("refuses a JWT, which is the shape a pasted Supabase key takes", () => {
    expect(
      looksLikeSecret(
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      ),
    ).toBe(true);
  });

  it.each([
    ["sb_secret_", "sb_secret_AbCdEfGhIjKlMnOpQrSt"],
    ["sbp_", "sbp_0123456789abcdef0123456789abcdef01234567"],
    ["github pat", "ghp_16CharactersOfNoiseHere1234"],
    ["aws", "AKIAIOSFODNN7EXAMPLE"],
    ["slack", "xoxb-123456789012-abcdefghijklmnop"],
  ])("refuses a %s prefixed value", (_label, value) => {
    expect(looksLikeSecret(value)).toBe(true);
  });

  it("refuses PEM private key material", () => {
    expect(looksLikeSecret("-----BEGIN RSA PRIVATE KEY-----")).toBe(true);
  });

  it("refuses a long opaque high-entropy blob", () => {
    expect(looksLikeSecret("Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6cXV4Zm9vYmFyYmF6")).toBe(true);
  });

  it("accepts a full 40-character git SHA, which the SQL rule would refuse", () => {
    // The one deliberate divergence from `app.looks_like_secret`. FR-73 says the
    // identifier may be a deploy reference, and a commit SHA is the commonest.
    expect(looksLikeSecret("ec5eab6a1b2c3d4e5f60718293a4b5c6d7e8f900")).toBe(false);
  });

  it("still refuses a 40-character blob that is not lowercase hex", () => {
    expect(looksLikeSecret("EC5EAB6A1B2C3D4E5F60718293A4B5C6D7E8F900")).toBe(true);
  });

  it.each([["v1.4.2"], ["ec5eab6"], ["dpl_9xKq2mVn"], ["2026-08-19-b0952e"]])(
    "accepts %s as an ordinary identifier",
    (value) => {
      expect(looksLikeSecret(value)).toBe(false);
    },
  );
});

describe("sanitizeReleaseUrl", () => {
  it("strips a Vercel protection-bypass token and reports the removal", () => {
    const result = sanitizeReleaseUrl(
      "https://dl-9xkq.vercel.app/?x-vercel-protection-bypass=abcdef0123456789abcdef0123456789",
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.url).toBe("https://dl-9xkq.vercel.app/");
    expect(result.stripped).toEqual(["x-vercel-protection-bypass"]);
  });

  it("strips a parameter whose value is secret-shaped even under a benign name", () => {
    const result = sanitizeReleaseUrl(
      "https://dl.example.com/?build=eyJhbGciOiJIUzI1NiJ9abcdefghijklmnop",
    );
    if ("error" in result) throw new Error(result.error);
    expect(result.stripped).toEqual(["build"]);
    expect(result.url).toBe("https://dl.example.com/");
  });

  it("keeps an ordinary query parameter", () => {
    const result = sanitizeReleaseUrl("https://dl.example.com/?ref=main");
    if ("error" in result) throw new Error(result.error);
    expect(result.stripped).toEqual([]);
    expect(result.url).toBe("https://dl.example.com/?ref=main");
  });

  it("refuses http rather than upgrading it", () => {
    const result = sanitizeReleaseUrl("http://dl.example.com/");
    expect("error" in result && result.error).toContain("https");
  });

  it("refuses credentials in the authority instead of stripping them", () => {
    const result = sanitizeReleaseUrl("https://user:hunter2@dl.example.com/");
    expect("error" in result && result.error).toContain("credentials");
  });
});

describe("parseReleaseBody", () => {
  it("accepts the shape a devops unit posts", () => {
    const result = parsed(
      valid({
        url: "https://dl-9xkq.vercel.app",
        deployed_at: "2026-08-19T18:04:11Z",
        recorded_by: "fleet:b0952e/d1",
        requirement_refs: ["FR-73", "FR-74 to FR-76"],
      }),
    );

    expect(result.refs).toEqual(["FR-73", "FR-74", "FR-75", "FR-76"]);
    expect(result.unparsedRefEntries).toEqual([]);
    expect(result.deployedAt).toBe("2026-08-19T18:04:11.000Z");
    expect(result.recordedBy).toBe("fleet:b0952e/d1");
  });

  it("expands every FR-19 range shape through i2's reader, not a second one", () => {
    expect(parsed(valid({ requirement_refs: ["FR-1–FR-3"] })).refs).toEqual([
      "FR-1",
      "FR-2",
      "FR-3",
    ]);
    expect(parsed(valid({ requirement_refs: ["FR-36, FR-39 to FR-41"] })).refs).toEqual([
      "FR-36",
      "FR-39",
      "FR-40",
      "FR-41",
    ]);
  });

  it("reports an entry it cannot classify instead of guessing at it", () => {
    const result = parsed(
      valid({ requirement_refs: ["FR-73", "the checkout rewrite", "REQ-4"] }),
    );
    expect(result.refs).toEqual(["FR-73"]);
    expect(result.unparsedRefEntries).toEqual(["the checkout rewrite", "REQ-4"]);
  });

  it("refuses a range that expands past the cap rather than writing a million rows", () => {
    expect(problems(valid({ requirement_refs: ["FR-1 to FR-999999"] }))[0]).toContain(
      String(RELEASE_INPUT_LIMITS.expandedRefs),
    );
  });

  it("refuses a secret-shaped identifier (FR-78)", () => {
    expect(
      problems(valid({ identifier: "sb_secret_AbCdEfGhIjKlMnOpQrSt" })).join(" "),
    ).toContain("FR-78");
  });

  it("refuses an unreadable deployed_at rather than storing null", () => {
    // Storing null would be a different and false claim — "no deploy date was
    // recorded" — where the truth is "a date was sent and could not be read".
    expect(problems(valid({ deployed_at: "last tuesday" })).join(" ")).toContain(
      "deployed_at",
    );
  });

  it("does not accept `source` from the wire", () => {
    const result = parsed(valid({ source: "declared" }));
    expect(Object.keys(result)).not.toContain("source");
  });

  it("lists every problem at once rather than the first", () => {
    const found = problems({ environment: "", identifier: 4, deployed_at: "nope" });
    expect(found.length).toBeGreaterThanOrEqual(3);
  });

  it.each([["engagement"], ["identifier"], ["environment"]])(
    "requires %s",
    (field) => {
      const body = valid();
      delete body[field];
      expect(problems(body).join(" ")).toContain(field);
    },
  );

  it("refuses a body that is not a JSON object", () => {
    expect(problems([1, 2, 3])[0]).toContain("JSON object");
  });
});
