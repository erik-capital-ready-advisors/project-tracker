import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

/**
 * Acceptance gates for milestones that are not built yet. They need real rows
 * and a signed-in operator, so they cannot run against the credential-free
 * build `pnpm e2e` serves, and they are red by construction until the milestone
 * ships. Kept out of the default projects and run with `pnpm gate:m27:e2e`.
 *
 * `M27_STORAGE_STATE` points at a saved operator session and IS A CREDENTIAL:
 * gitignored, never committed, and produced by Erik signing in rather than by
 * any agent.
 */
const GATE_SPECS = /m27-navigation\.spec\.ts/;
const M27_BASE_URL = process.env.M27_BASE_URL;

/**
 * The end-to-end harness. `qa-reviewer` authors the real flows here.
 *
 * It builds and serves the production app rather than running `next dev`,
 * because a dev-server pass says nothing about what actually ships. Set
 * PLAYWRIGHT_BASE_URL to point at a deployed preview instead.
 *
 * Browsers are not vendored with the repo. Run `pnpm exec playwright install
 * chromium` once before the first `pnpm e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: GATE_SPECS },
    // Spec 5a describes ten-second glances between other work, which happen on
    // a phone as often as at a desk.
    { name: "mobile", use: { ...devices["iPhone 13"] }, testIgnore: GATE_SPECS },
    // Present only when it can actually run. A project that is configured but
    // unrunnable produces a row of skips, and a skipped gate is the same colour
    // as a passing one from a distance — which is blocker B19, exactly.
    ...(M27_BASE_URL
      ? [
          {
            name: "m27-gate",
            testMatch: GATE_SPECS,
            use: {
              ...devices["Desktop Chrome"],
              baseURL: M27_BASE_URL,
              storageState: process.env.M27_STORAGE_STATE,
            },
          },
        ]
      : []),
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${PORT}`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
});
