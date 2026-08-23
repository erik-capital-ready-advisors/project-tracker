import { expect, test } from "@playwright/test";

/**
 * The served security header block — authored by `qa-reviewer` (qa1, run b0952e).
 *
 * i4 observed this block once, by hand, with `curl` against a local `next start`.
 * d1 observed it again on the preview. Neither observation is in the repository,
 * so nothing would notice if a future edit moved the `headers()` entry to a
 * place that compiles and serves nothing — which is precisely the defect i4
 * caught in itself when `proxy.ts` sat at the repo root and was silently ignored.
 *
 * This file makes that observation a standing check.
 *
 * ## Read from a real response, never from the config
 *
 * Every assertion below reads `response.headers()`. Reading `next.config.ts`
 * would prove the intent and not the behaviour, and the whole reason this file
 * exists is that the two came apart once already.
 *
 * ## Why `preload` is asserted ABSENT
 *
 * `next.config.ts` deliberately omits it, and d1 measured that Vercel's own SSO
 * interstitial sets HSTS *with* `preload`. So `preload` present is the tell that
 * a probe is reading the edge's headers rather than the application's. Asserting
 * its absence keeps this test honest about which server answered.
 */

/** Static headers come from `next.config.ts`; the CSP carries a per-request nonce from `src/proxy.ts`. */
const STATIC_HEADERS: [string, string][] = [
  ["strict-transport-security", "max-age=63072000; includeSubDomains"],
  ["x-content-type-options", "nosniff"],
  ["referrer-policy", "strict-origin-when-cross-origin"],
  ["x-frame-options", "DENY"],
  ["cross-origin-opener-policy", "same-origin"],
  ["x-dns-prefetch-control", "off"],
];

test.describe("security headers, observed in a real response", () => {
  test("every static header is served on a page route", async ({ page }) => {
    const response = await page.goto("/sign-in");
    expect(response, "no response — the header block was never observed").not.toBeNull();
    const headers = response!.headers();

    for (const [key, value] of STATIC_HEADERS) {
      expect(headers[key], `${key} missing or wrong`).toBe(value);
    }
    expect(headers["permissions-policy"], "Permissions-Policy missing").toContain("camera=()");
    expect(headers["x-powered-by"], "X-Powered-By should be dropped").toBeUndefined();
  });

  test("HSTS carries no `preload`, so this is the app answering and not Vercel SSO", async ({
    page,
  }) => {
    const response = await page.goto("/sign-in");
    expect(response!.headers()["strict-transport-security"]).not.toContain("preload");
  });

  test("the CSP is served, is nonce-based, and the nonce changes per request", async ({ page }) => {
    const first = await page.goto("/sign-in");
    const csp1 = first!.headers()["content-security-policy"];
    expect(csp1, "no CSP served — `src/proxy.ts` may not be in effect").toBeTruthy();
    expect(csp1).toContain("default-src 'self'");
    expect(csp1).toContain("frame-ancestors 'none'");
    expect(csp1).toContain("'strict-dynamic'");
    expect(csp1, "CSP must not be wide open").not.toContain("script-src 'self' 'unsafe-inline'");

    const nonce1 = /'nonce-([^']+)'/.exec(csp1)?.[1];
    expect(nonce1, "the CSP carries no nonce").toBeTruthy();

    const second = await page.goto("/sign-in?cachebust=" + Date.now());
    const nonce2 = /'nonce-([^']+)'/.exec(
      second!.headers()["content-security-policy"] ?? "",
    )?.[1];
    expect(nonce2, "the second response carries no nonce").toBeTruthy();
    expect(nonce2, "the nonce is reused across requests, which defeats it").not.toBe(nonce1);
  });

  test("every script tag in the served document carries the nonce", async ({ page }) => {
    await page.goto("/sign-in");
    const counts = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll("script"));
      return { total: scripts.length, withNonce: scripts.filter((s) => s.nonce).length };
    });
    // The detector must be able to fail: a page with no scripts proves nothing.
    expect(counts.total, "no script tags found, so this check proved nothing").toBeGreaterThan(0);
    expect(counts.withNonce, "a script tag is missing its nonce").toBe(counts.total);
  });

  test("the headers are served on an error response too, not only on 200s", async ({ request }) => {
    // An API route with no credentials refuses; the header block must still be there.
    const response = await request.get("/api/answer/blocked");
    expect(response.status()).toBeGreaterThanOrEqual(400);
    const headers = response.headers();
    expect(headers["strict-transport-security"]).toBe("max-age=63072000; includeSubDomains");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
  });

  test("no CORS grant is offered on an authenticated API route", async ({ request }) => {
    const response = await request.get("/api/answer/blocked", {
      headers: { origin: "https://evil.example.com" },
    });
    expect(response.headers()["access-control-allow-origin"]).toBeUndefined();
  });
});
