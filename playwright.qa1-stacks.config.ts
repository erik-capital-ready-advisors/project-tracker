import { defineConfig, devices } from "@playwright/test";

/**
 * The independent-review harness for M2.2 `/stacks` (run 9b85cd, qa1).
 *
 * Kept out of `playwright.config.ts` on purpose: that file is shared by the
 * default `pnpm e2e` projects and by the M2.7 gate, and a reviewer's harness
 * should not change what either of those runs. Point it at a running instance
 * and a saved operator session:
 *
 *   QA1_BASE_URL=http://localhost:3000 \
 *   QA1_STORAGE_STATE=.playwright-auth/operator.json \
 *   pnpm exec playwright test --config playwright.qa1-stacks.config.ts
 *
 * ## It fails closed
 *
 * There is no `webServer` and no default base URL. With the two variables
 * unset the suite's first test asserts they are present and the run exits
 * non-zero — it does not skip, and it does not quietly measure a signed-out
 * page and call that a pass. A skipped gate and a passing gate are the same
 * colour from a distance (B19).
 *
 * `QA1_STORAGE_STATE` points at a live operator session at `aal2` and **is a
 * credential**. It is gitignored, never committed, and produced by Erik signing
 * in rather than by any agent.
 */
const BASE_URL = process.env.QA1_BASE_URL;
const STORAGE_STATE = process.env.QA1_STORAGE_STATE;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /qa1-stacks-register\.spec\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "list",
  outputDir: "playwright-report/qa1-9b85cd",
  use: {
    baseURL: BASE_URL ?? "http://127.0.0.1:9",
    storageState: STORAGE_STATE,
    trace: "off",
    // Playwright logs request headers into a failure's error context, and this
    // session's cookie is a live credential (B38). Screenshots and video are
    // taken explicitly by the spec instead.
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "qa1-stacks", use: { ...devices["Desktop Chrome"] } }],
});
