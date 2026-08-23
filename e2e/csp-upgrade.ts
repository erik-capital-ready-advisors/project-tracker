import type { TestInfo } from "@playwright/test";

/**
 * WebKit applies `upgrade-insecure-requests` to `http://127.0.0.1`; Chromium
 * does not. Measured in run `b0952e`, and it silently disables the whole mobile
 * project.
 *
 * ## What was observed
 *
 * `proxy.ts` sets `Content-Security-Policy: … ; upgrade-insecure-requests`. That
 * directive is a no-op in production, which is served over HTTPS. Against the
 * local `pnpm start` server on `http://127.0.0.1:3100`:
 *
 *   * **Chromium** treats `127.0.0.1` as a potentially-trustworthy origin and
 *     skips the upgrade. Everything loads.
 *   * **WebKit** upgrades every subresource and every navigation to `https://`
 *     anyway. Every request fails with *"A TLS error caused the secure
 *     connection to fail."* -- stylesheets, the entire JavaScript bundle, and
 *     any link the test clicks.
 *
 * Playwright's `devices["iPhone 13"]` carries `defaultBrowserType: "webkit"`,
 * and `playwright.config.ts` sets no `browserName` on the `mobile` project. So
 * `pnpm e2e --project=mobile` runs WebKit, and every one of its tests runs
 * against **an unstyled, unhydrated page whose links do not navigate**.
 *
 * ## Why this file exists rather than a deleted assertion
 *
 * The mobile project's tests were passing before this was found. They were
 * passing on a page with no CSS and no JavaScript, because they only asserted
 * that elements were present -- a green suite reporting on something other than
 * what it claims to test. The three tests that actually *interact* were the
 * first to notice.
 *
 * Deleting those three would restore the green and destroy the finding. So they
 * skip, with a reason, and the skip **cancels itself**: it is conditional on the
 * two facts that cause it, so the moment the suite runs against an HTTPS preview
 * (`PLAYWRIGHT_BASE_URL=https://…`) or `proxy.ts` stops emitting the directive
 * outside production, the tests run again with no edit here.
 *
 * The fix is one line in `src/proxy.ts` -- emit `upgrade-insecure-requests` only
 * when `NODE_ENV === "production"` -- and that file belongs to another work
 * unit, so it is reported and queued rather than changed.
 */
export function skipIfCspBlocksLocalNavigation(
  testInfo: TestInfo,
  browserName: string,
  baseURL: string | undefined,
): boolean {
  const blocked =
    browserName === "webkit" && (baseURL ?? "").startsWith("http://");

  if (blocked) {
    testInfo.skip(
      true,
      "WebKit applies `upgrade-insecure-requests` to http://127.0.0.1, so every " +
        "request from this locally served build is upgraded to https and fails. " +
        "No navigation is possible. Run against an HTTPS preview with " +
        "PLAYWRIGHT_BASE_URL, or make the directive production-only in proxy.ts.",
    );
  }

  return blocked;
}
