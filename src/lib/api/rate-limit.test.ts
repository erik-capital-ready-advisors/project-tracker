import { describe, expect, it } from "vitest";

import { createFakeSupabase } from "./__fixtures__/fake-supabase";
import { ANSWER_READ, INGEST_WRITE } from "./capabilities";
import { ApiError } from "./errors";
import type { RateLimitCapableClient } from "./rate-limit";
import {
  RATE_LIMIT_POLICIES,
  enforceRateLimit,
  policyFor,
  rateLimitedResponse,
} from "./rate-limit";

const TOKEN_ID = "0a06472c-1bf8-4b37-a68e-995d4a2ff8ad";

describe("rate-limit policies", () => {
  it("sits an order of magnitude above §7a's stated peak traffic", () => {
    // §7a: agent reads "tens per day"; ingest "a few dozen during an active
    // fleet run". These are per MINUTE.
    expect(policyFor(ANSWER_READ)).toEqual({ limit: 60, windowSeconds: 60 });
    expect(policyFor(INGEST_WRITE)).toEqual({ limit: 120, windowSeconds: 60 });
  });

  it("covers every capability, so no route can be unmetered by omission", () => {
    for (const capability of [ANSWER_READ, INGEST_WRITE]) {
      expect(RATE_LIMIT_POLICIES[capability].limit).toBeGreaterThan(0);
      expect(RATE_LIMIT_POLICIES[capability].windowSeconds).toBeGreaterThan(0);
    }
  });
});

describe("enforceRateLimit", () => {
  it("allows while under the limit and refuses once over", async () => {
    const client = createFakeSupabase({
      rateLimitVerdicts: [true, true, true, false],
    }) as unknown as RateLimitCapableClient;
    const policy = { limit: 3, windowSeconds: 60 };

    const verdicts: boolean[] = [];
    for (let i = 0; i < 4; i += 1) {
      verdicts.push(
        (await enforceRateLimit(client, TOKEN_ID, policy)).allowed,
      );
    }

    // Mirrors the observed database behaviour: limit 3 → t,t,t,f.
    expect(verdicts).toEqual([true, true, true, false]);
  });

  it("passes the token id through, so the limit is PER TOKEN (FR-8)", async () => {
    const fake = createFakeSupabase({ rateLimitVerdicts: [true] });
    await enforceRateLimit(
      fake as unknown as RateLimitCapableClient,
      TOKEN_ID,
      { limit: 60, windowSeconds: 60 },
    );
    expect(fake.rpcCalls[0]).toEqual({
      name: "check_and_increment_rate_limit",
      args: { p_token_id: TOKEN_ID, p_limit: 60, p_window_seconds: 60 },
    });
  });

  it("FAILS CLOSED when the limiter errors — it does not let the request through", async () => {
    const client = createFakeSupabase({
      fail: { rateLimitRpc: true },
    }) as unknown as RateLimitCapableClient;

    await expect(
      enforceRateLimit(client, TOKEN_ID, { limit: 60, windowSeconds: 60 }),
    ).rejects.toThrowError(ApiError);
  });

  it("computes Retry-After from the fixed window boundary", async () => {
    const client = createFakeSupabase({
      rateLimitVerdicts: [false],
    }) as unknown as RateLimitCapableClient;

    // 12:00:17Z — 17 seconds into a 60-second window, so 43 remain.
    const verdict = await enforceRateLimit(
      client,
      TOKEN_ID,
      { limit: 60, windowSeconds: 60 },
      new Date("2026-08-19T12:00:17Z"),
    );

    expect(verdict.retryAfterSeconds).toBe(43);
  });
});

describe("rateLimitedResponse", () => {
  it("is a 429 carrying the headers a well-behaved client reads", async () => {
    const response = rateLimitedResponse({
      allowed: false,
      policy: { limit: 60, windowSeconds: 60 },
      retryAfterSeconds: 43,
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("43");
    expect(response.headers.get("RateLimit-Limit")).toBe("60");
    expect(response.headers.get("RateLimit-Remaining")).toBe("0");

    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("rate_limited");
  });
});
