import { expect, test } from "@playwright/test";

/**
 * FR-60 — the export screen and the download route.
 *
 * These run against a real `next build && next start` with no Supabase
 * configuration in the environment, which is the honest state of this branch: no
 * credential is present in a fleet worktree and none should be. So what they
 * assert is everything that does not need a database.
 *
 * The last test is the one worth having. `/api/export` is the only route in this
 * product that authenticates a **session cookie** rather than a bearer token —
 * there is no capability that could authorise it, because FR-5 defines exactly
 * two and §7a refuses agent tokens all four of the tables a full export
 * contains. A route that is the exception to the guard is exactly the route
 * where an unauthenticated 200 would go unnoticed, so it is asserted directly
 * and the body is checked for the ledger's own shape rather than only the status
 * being read.
 */

const REFUSALS = /^(sign-in|mfa|no-role|error)$/;

test.describe("export", () => {
  test("/settings/export renders and states the unparsed count (FR-58)", async ({ page }) => {
    const response = await page.goto("/settings/export");
    expect(response?.status()).toBeLessThan(400);

    const unparsed = page.locator("[data-verify-unit='unparsed-count']");
    await expect(unparsed).toBeVisible();
    await expect(unparsed).toHaveAttribute("data-verify-state", /^(zero|nonzero|unknown)$/);
  });

  test("a refused read names its reason rather than showing a blank screen", async ({
    page,
  }) => {
    await page.goto("/settings/export");
    const notice = page.locator("[data-verify-unit='load-notice']");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute("data-verify-reason", REFUSALS);
    await expect(notice).not.toHaveText("");

    // A refused read must not fall through to the empty state. "There is no
    // export" and "nobody could look" are different answers and this screen has
    // to give the second one.
    await expect(page.locator("[data-verify-unit='export-panel']")).toHaveCount(0);
  });

  test("/api/export refuses a caller with no operator session", async ({ request }) => {
    const response = await request.get("/api/export");

    expect(response.status()).toBeGreaterThanOrEqual(400);

    const body = await response.text();
    // Not merely "an error": the body must not be an export. `format` is the
    // first key of the document, so its absence is the assertion that no ledger
    // came back through a refused request.
    expect(body).not.toContain("delivery-ledger-export");
    expect(body).not.toContain("client_name");
  });

  test("/api/export does not let a response be cached by anything in front of it", async ({
    request,
  }) => {
    const response = await request.get("/api/export");
    const cacheControl = response.headers()["cache-control"] ?? "";

    // The body of a successful response is the whole ledger, decrypted. A shared
    // cache holding it is the failure this header exists to prevent, and the
    // refusal path must carry it too — otherwise the header only appears in the
    // case nobody tests.
    expect(cacheControl).toMatch(/no-store|no-cache|private/);
  });
});
