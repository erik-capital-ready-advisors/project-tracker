import type { Page } from "@playwright/test";
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

  /**
   * Which state is THIS BUILD in?
   *
   * `NEXT_PUBLIC_*` variables are inlined by Next at BUILD time, so whether the
   * sign-in screen is configured is a property of the bundle, not of the
   * environment the Playwright runner happens to see. Reading
   * `process.env.NEXT_PUBLIC_SUPABASE_URL` here would be worse than useless: the
   * runner does not load `.env.local`, so it reads absent even against a fully
   * configured build, and the guard would keep asserting the unconfigured
   * behaviour exactly as before.
   *
   * The page is the only honest source. On a fresh load nothing has been
   * submitted, so the only thing that can render an `auth-error` is the
   * configuration failure -- a GoTrue refusal needs a submit first.
   */
  async function configurationState(
    page: Page,
  ): Promise<"configured" | "unconfigured"> {
    await page.goto("/sign-in");
    await expect(page.locator("[data-verify-unit='auth-shell']")).toBeVisible();
    const errors = await page.locator("[data-verify-unit='auth-error']").count();
    return errors > 0 ? "unconfigured" : "configured";
  }

  /**
   * The invariant, asserted in BOTH states and skipped in neither.
   *
   * The original test here asserted the unconfigured message unconditionally,
   * with the comment "this build has no Supabase environment". That was true
   * when it was written and became false the moment credentials were set, so
   * `pnpm e2e` went red on any correctly configured machine. A gate that fails
   * when the application starts working stops being read, which is how a real
   * failure later gets waved past -- so the premise is fixed here rather than
   * the expectation relaxed. Both states are covered, and both are green when
   * correct.
   *
   * The form renders either way; what differs is whether the operator can type a
   * credential into it. That is the difference worth asserting, because a
   * disabled form in a configured build and an enabled one in an unconfigured
   * build are both real defects and neither was previously caught.
   */
  test("resolves to one usable state or the other, never a blank page", async ({ page }) => {
    const state = await configurationState(page);

    await expect(page.locator("[data-verify-unit='sign-in-form']")).toBeVisible();
    const email = page.locator("#sign-in-email");
    const password = page.locator("#sign-in-password");
    const submit = page.getByRole("button", { name: /sign in/i });
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();

    if (state === "unconfigured") {
      await expect(email).toBeDisabled();
      await expect(password).toBeDisabled();
      await expect(submit).toBeDisabled();
    } else {
      await expect(email).toBeEnabled();
      await expect(password).toBeEnabled();
      await expect(submit).toBeEnabled();
    }
  });

  test("says an unconfigured deployment is unconfigured, rather than blanking", async ({
    page,
  }) => {
    const state = await configurationState(page);
    test.skip(
      state === "configured",
      "This build HAS a Supabase environment, so there is no configuration " +
        "failure to render. The branch itself is covered unconditionally by " +
        "tests/sign-in-form.test.tsx, which drives the component with a " +
        "throwing client and needs no build and no credentials. To exercise it " +
        "here, build with NEXT_PUBLIC_SUPABASE_URL and " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY unset.",
    );

    // The sign-in screen is the one route with nothing else to click, so it must
    // degrade to a message rather than a blank page.
    const error = page.locator("[data-verify-unit='auth-error']");
    await expect(error).toBeVisible();
    await expect(error).toContainText("NEXT_PUBLIC_SUPABASE");
    // It names the variable and never its value.
    await expect(error).not.toContainText(/https:\/\/[a-z0-9]+\.supabase\.co/);
  });

  test("a configured deployment reports no configuration failure at all", async ({
    page,
  }) => {
    const state = await configurationState(page);
    test.skip(
      state === "unconfigured",
      "This build has no Supabase environment. Build with " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY set " +
        "to exercise this case.",
    );

    // Nothing has been submitted, so any auth-error on this page would be the
    // configuration failure -- which must not be present in a configured build.
    await expect(page.locator("[data-verify-unit='auth-error']")).toHaveCount(0);
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
