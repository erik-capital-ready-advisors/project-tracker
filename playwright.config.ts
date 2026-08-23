import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

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
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // Spec 5a describes ten-second glances between other work, which happen on
    // a phone as often as at a desk.
    { name: "mobile", use: { ...devices["iPhone 13"] } },
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
