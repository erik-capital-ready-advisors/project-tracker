import { expect, test } from "@playwright/test";

/**
 * FR-1 and FR-2 -- the operator's way in.
 *
 * ## What is deliberately NOT done here
 *
 * No account is created, no signup endpoint is called, and no credential is
 * typed. `disable_signup` is already verified true by observation on the
 * project, and probing it by creating an account would leave a row behind and
 * re-open the thing that was closed. These tests assert the *interface's*
 * claims -- that it offers no signup, that it renders in every state including
 * an unconfigured one, and that no secret-shaped value reaches the page.
 *
 * The routing logic itself -- and in particular the first-run case, where the
 * operator's own row is unreadable at `aal1` -- is covered by
 * `tests/auth-steps.test.ts` and `tests/mfa-forms.test.tsx`, which drive the
 * real components against a fake GoTrue.
 */

/** A TOTP secret is base32; an agent token's secret segment is 64 hex. Neither belongs in a page. */
const BASE32_SECRET = /\b[A-Z2-7]{32,}\b/;
const HEX_SECRET = /\b[0-9a-f]{64}\b/i;

const ROUTES = ["/sign-in", "/sign-in/verify", "/sign-in/enroll"];

test.describe("FR-1 / FR-2 the authentication path", () => {
  for (const route of ROUTES) {
    test(`${route} renders`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);
      await expect(page.locator("[data-verify-unit='auth-shell']")).toBeVisible();
    });

    test(`${route} carries nothing secret-shaped`, async ({ page }) => {
      await page.goto(route);
      const html = await page.content();
      expect(html).not.toMatch(HEX_SECRET);
      expect(html).not.toMatch(BASE32_SECRET);
    });
  }

  test("FR-1 offers no signup affordance of any kind", async ({ page }) => {
    await page.goto("/sign-in");

    // `disable_signup` is set on the project. A control here would imply a door
    // that is bolted shut.
    await expect(page.getByRole("button", { name: /sign ?up/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /sign ?up/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /create.*account/i })).toHaveCount(0);
    await expect(page.locator("a[href*='signup']")).toHaveCount(0);
    // Nor a self-service reset, which is not built.
    await expect(page.getByRole("link", { name: /forgot/i })).toHaveCount(0);
  });

  test("says an unconfigured deployment is unconfigured, rather than blanking", async ({
    page,
  }) => {
    // This build has no Supabase environment. The sign-in screen is the one
    // route with nothing else to click, so it must degrade to a message.
    await page.goto("/sign-in");
    const error = page.locator("[data-verify-unit='auth-error']");
    await expect(error).toBeVisible();
    await expect(error).toContainText("NEXT_PUBLIC_SUPABASE");
  });

  test("the enrolment screen exists and is reachable at aal1", async ({ page }) => {
    // The first-run trap: enrolment must not sit behind a conclusion that the
    // account does not exist. The route rendering at all is the floor.
    const response = await page.goto("/sign-in/enroll");
    expect(response?.status()).toBeLessThan(400);
    await expect(
      page.locator("[data-verify-unit='auth-shell']"),
    ).toHaveAttribute("data-verify-screen", "Enrol a second factor");
  });
});
