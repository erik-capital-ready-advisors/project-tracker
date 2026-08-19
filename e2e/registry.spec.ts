import { expect, test } from "@playwright/test";

/**
 * The registry entry flows (FR-9 to FR-13, FR-77, FR-78).
 *
 * These run against a real `next build && next start` with no Supabase
 * configuration in the environment, which is the honest state of this branch:
 * no credential is present in a fleet worktree and none should be. So what these
 * assert is everything that does not need a database — that every registry route
 * renders rather than 500s, that the refusal NAMES ITSELF instead of showing a
 * blank screen, and that the one form in this product where Erik types is fully
 * present and labelled.
 *
 * What they deliberately do NOT assert is anything behind the gate. A test that
 * needs an operator at `aal2` is a test that needs a credential, and inventing
 * one to make a suite look complete is the same move as editing a fixture to
 * make a parser pass.
 */

/** Every gate state that is a refusal. The screen must name one of them. */
const REFUSALS = /^(signin|enrol-mfa|verify-mfa|no-role|unconfigured|error)$/;

const ROUTES = ["/registry", "/registry/new", "/registry/acme/edit", "/registry/acme"];

test.describe("registry screens", () => {
  for (const route of ROUTES) {
    test(`${route} renders and states the unparsed count (FR-58)`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);

      const unparsed = page.locator("[data-verify-unit='unparsed-count']");
      await expect(unparsed).toBeVisible();
      // FR-58: an unknown count says so. It must never render as 0.
      await expect(unparsed).toHaveAttribute("data-verify-state", /^(zero|nonzero|unknown)$/);
    });
  }

  test("a refused read names its reason rather than showing a blank screen", async ({
    page,
  }) => {
    await page.goto("/registry");
    const gate = page.locator("[data-verify-unit='operator-gate']");
    await expect(gate).toBeVisible();
    await expect(gate).toHaveAttribute("data-verify-gate", REFUSALS);
    // Whatever the reason, it has to say something a person can act on.
    await expect(gate).not.toHaveText("");
  });

  test("FR-9 the register-engagement flow is reachable from the list", async ({
    page,
  }) => {
    await page.goto("/registry");
    const link = page.locator("[data-verify-unit='engagement-new-link']");
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/registry/new");

    // Followed by navigation rather than by clicking, so this assertion holds in
    // both projects. See the WebKit note on the click test below — over plain
    // HTTP the mobile project cannot run the client router at all, and a test
    // that silently only ran in one browser would be worse than one that says
    // which part it is testing.
    await page.goto("/registry/new");
    await expect(page.locator("[data-verify-unit='engagement-form']")).toBeVisible();
  });

  test("FR-9 clicking through to the form works client-side", async ({
    page,
    browserName,
  }) => {
    // MEASURED, not assumed: this branch serves `Content-Security-Policy:
    // … upgrade-insecure-requests` (and HSTS). Chromium exempts 127.0.0.1 from
    // the upgrade; WebKit does not, so against `next start` over http every
    // script request becomes https and fails TLS — no JS loads, and there is no
    // client router to do the navigating. That is the security header working,
    // not a defect, and it must not be weakened to make a test pass. Point
    // PLAYWRIGHT_BASE_URL at an https preview deployment to run this on WebKit.
    test.skip(
      browserName === "webkit",
      "CSP upgrade-insecure-requests blocks all client JS over http on WebKit",
    );

    await page.goto("/registry");
    await page.locator("[data-verify-unit='engagement-new-link']").click();
    await expect(page).toHaveURL(/\/registry\/new$/);
    await expect(page.locator("[data-verify-unit='engagement-form']")).toBeVisible();
  });

  test("FR-9 + FR-77 every field Erik types is present and labelled", async ({
    page,
  }) => {
    await page.goto("/registry/new");

    const form = page.locator("[data-verify-unit='engagement-form']");
    await expect(form).toHaveAttribute("data-verify-mode", "create");

    const fields = [
      "clientName",
      "slug",
      "status",
      "contractType",
      "source",
      "repoPath",
      "specPath",
      "fleetDir",
      "stacks",
      // FR-77 — the five provisioning identifiers.
      "dbOrg",
      "dbProjectRef",
      "hostingTeam",
      "hostingProject",
      "productionUrl",
    ];

    for (const field of fields) {
      const control = page.locator(`#${field}`);
      await expect(control, `${field} is missing`).toBeVisible();
      await expect(control, `${field} has no name`).toHaveAttribute("name", field);
      // A labelled control is what makes this usable at all; FR-13 makes it the
      // only data-entry surface in the product.
      const label = page.locator(`label[for='${field}']`);
      await expect(label, `${field} has no label`).toBeVisible();
    }
  });

  test("FR-78 the identifier fields are explained as identifiers, not secrets", async ({
    page,
  }) => {
    await page.goto("/registry/new");
    const body = await page.locator("body").innerText();
    expect(body).toContain("identifiers, never secrets");
  });

  test("no registry field is offered to browser autofill", async ({ page }) => {
    await page.goto("/registry/new");
    // §7a: a client's name, contract terms and provisioning identifiers are not
    // things to leave in a browser's autofill store.
    const controls = page.locator(
      "[data-verify-unit='engagement-form'] input, [data-verify-unit='engagement-form'] textarea",
    );
    const count = await controls.count();
    expect(count).toBeGreaterThan(0);
    for (let index = 0; index < count; index += 1) {
      const control = controls.nth(index);
      const type = await control.getAttribute("type");
      if (type === "hidden") continue;
      await expect(control).toHaveAttribute("autocomplete", "off");
    }
  });

  test("the registry does not scroll the page sideways", async ({ page }) => {
    await page.goto("/registry/new");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    // Wide content scrolls inside its own container; the page body does not.
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("fuchsia stays reserved for unparsed on the registry screens", async ({
    page,
  }) => {
    await page.goto("/registry/new");
    const marked = await page.locator("[class*='state-unparsed']").count();
    expect(marked).toBe(0);
  });
});
