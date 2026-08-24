import { defineConfig, devices } from "@playwright/test";

/**
 * qa1's own harness for run d4000f. Separate from `playwright.config.ts` so the
 * reviewer's flows cannot alter the shape of the gates they are reviewing.
 *
 * FAILS CLOSED. If the operator session or the base URL is absent the suite
 * cannot observe anything, and a suite that cannot run must not exit 0 — a
 * skipped check is the same colour as a passing one from a distance.
 */
const BASE_URL = process.env.M27_BASE_URL;
const STORAGE = process.env.M27_STORAGE_STATE;

if (!BASE_URL || !STORAGE) {
  throw new Error(
    "qa1 harness cannot run: set M27_BASE_URL and M27_STORAGE_STATE. " +
      "Refusing to exit 0 on a suite that observed nothing.",
  );
}

export default defineConfig({
  testDir: "./e2e-review",
  
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: { ...devices["Desktop Chrome"], baseURL: BASE_URL, storageState: STORAGE, screenshot: "only-on-failure" },
});
