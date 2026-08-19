import { ANSWER_READ, INGEST_WRITE } from "./capabilities";
import type { WireCapability } from "./capabilities";
import { apiError } from "./errors";

/**
 * FR-8: "All ingest and answer endpoints are rate-limited per token."
 *
 * The counting happens in Postgres — `public.check_and_increment_rate_limit`,
 * which i1 built as a fixed-window counter. It is in the database rather than in
 * the function for two reasons i1 recorded: Vercel's WAF can only key a rule on
 * IP or JA4 below the Enterprise plan, and an in-memory limiter does not survive
 * Vercel's ephemeral function instances, so two requests a second apart can land
 * on two instances that have never heard of each other.
 *
 * ## Where the numbers come from
 *
 * §7a states the **traffic shape** and not the limits: "one human opening the
 * dashboard perhaps forty times a day; agent reads on the order of tens per day;
 * ingest a few times per day, spiking to a few dozen during an active fleet
 * run." So the shape is the spec's and **the numbers below are mine**, chosen to
 * sit an order of magnitude above the stated peak and far below anything that
 * would matter as abuse.
 *
 *   * `answer:read` — 60 requests / minute. Stated peak is tens per *day*.
 *   * `ingest:write` — 120 requests / minute. A fleet run posting a manifest, a
 *     checkpoint and a report per unit is the burstiest legitimate caller, and
 *     "a few dozen" per run fits inside one window with room to spare.
 *
 * There is no per-call money cost anywhere in this product — §7a: "No
 * language-model or metered third-party API is called" — so these limits exist
 * to bound abuse and runaway loops, not spend.
 *
 * The fixed window carries the standard boundary burst: a caller can spend a
 * full window's allowance at the end of one window and again at the start of the
 * next, so the true worst case is 2x nominal across a boundary. i1 stated this in
 * the migration and it is restated here rather than left in SQL nobody reads.
 */

export interface RateLimitPolicy {
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_POLICIES: Readonly<
  Record<WireCapability, RateLimitPolicy>
> = {
  [ANSWER_READ]: { limit: 60, windowSeconds: 60 },
  [INGEST_WRITE]: { limit: 120, windowSeconds: 60 },
};

export function policyFor(capability: WireCapability): RateLimitPolicy {
  return RATE_LIMIT_POLICIES[capability];
}

/** Structural client surface, so tests need no real Supabase client. */
export interface RateLimitCapableClient {
  rpc(
    name: "check_and_increment_rate_limit",
    args: { p_token_id: string; p_limit: number; p_window_seconds: number },
  ): PromiseLike<{ data: boolean | null; error: { message: string } | null }>;
}

export interface RateLimitVerdict {
  allowed: boolean;
  policy: RateLimitPolicy;
  /** Seconds until the current fixed window closes. Sent as `Retry-After`. */
  retryAfterSeconds: number;
}

/**
 * Count this request against the token's window and say whether it may proceed.
 *
 * **Fails closed.** An RPC error or a null return refuses the request with
 * `internal_error` rather than letting it through. A limiter that opens when the
 * database hiccups is a limiter that is absent exactly when something is wrong,
 * and this one guards an unauthenticated-adjacent surface.
 *
 * `now` is injectable so `retryAfterSeconds` is testable at a known point in the
 * window.
 */
export async function enforceRateLimit(
  client: RateLimitCapableClient,
  tokenId: string,
  policy: RateLimitPolicy,
  now: Date = new Date(),
): Promise<RateLimitVerdict> {
  const { data, error } = await client.rpc("check_and_increment_rate_limit", {
    p_token_id: tokenId,
    p_limit: policy.limit,
    p_window_seconds: policy.windowSeconds,
  });

  if (error || data === null) {
    throw apiError(
      "internal_error",
      "The request could not be rate-limited, so it was refused rather than " +
        "served unmetered. Retry shortly.",
    );
  }

  // Mirrors the SQL: the window boundary is the epoch floored to the window
  // width, so every caller agrees on which bucket they are in.
  const epochSeconds = Math.floor(now.getTime() / 1000);
  const windowStart =
    Math.floor(epochSeconds / policy.windowSeconds) * policy.windowSeconds;
  const retryAfterSeconds = windowStart + policy.windowSeconds - epochSeconds;

  return { allowed: data, policy, retryAfterSeconds };
}

/** The 429 a refused request gets, with the headers a well-behaved client reads. */
export function rateLimitedResponse(verdict: RateLimitVerdict): Response {
  return apiError(
    "rate_limited",
    `This token has used its ${verdict.policy.limit} requests for the current ` +
      `${verdict.policy.windowSeconds}-second window. Retry in ` +
      `${verdict.retryAfterSeconds}s.`,
  ).toResponse({
    "Retry-After": String(verdict.retryAfterSeconds),
    "RateLimit-Limit": String(verdict.policy.limit),
    "RateLimit-Remaining": "0",
    "RateLimit-Reset": String(verdict.retryAfterSeconds),
  });
}
