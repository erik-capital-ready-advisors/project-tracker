import { expect, test } from "@playwright/test";

import { skipIfCspBlocksLocalNavigation } from "./csp-upgrade";

/**
 * FR-32 to FR-36 in the running production build.
 *
 * The same bound as `work-items.spec.ts`: no operator session, no provisioned
 * database, so the reads refuse and the suite asserts what is true rather than
 * what would be true with data. The declaration and resolution flows themselves
 * are covered by `tests/wait-flow.test.tsx`, which drives the real components
 * with the server action in the fake's place.
 */

test.describe("FR-32 external waits", () => {
  test("renders, and states the unparsed count", async ({ page }) => {
    const response = await page.goto("/waits");
    expect(response?.status()).toBeLessThan(400);
    await expect(
      page.locator("[data-verify-unit='unparsed-count']").first(),
    ).toBeVisible();
  });

  test("a refused read renders a refusal and NOT an empty state", async ({
    page,
  }) => {
    await page.goto("/waits");

    const notice = page.locator("[data-verify-unit='load-notice']").first();
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute(
      "data-verify-reason",
      /sign-in|mfa|no-role|error/,
    );

    await expect(page.locator("[data-verify-unit='empty-state']")).toHaveCount(0);
    await expect(
      page.getByText("Nothing is waiting on anyone outside the studio."),
    ).toHaveCount(0);
  });

  test("FR-34 the counts read as unavailable rather than as zero", async ({
    page,
  }) => {
    await page.goto("/waits");
    const summary = page.locator("[data-verify-unit='wait-summary']");
    // "0 overdue" would say nothing is late. Nothing was read.
    await expect(summary).toHaveAttribute("data-verify-open", "unknown");
    await expect(summary).toHaveAttribute("data-verify-overdue", "unknown");
  });

  test("the resolved-history toggle is a link, so it survives a reload", async ({
    page,
    browserName,
    baseURL,
  }, testInfo) => {
    skipIfCspBlocksLocalNavigation(testInfo, browserName, baseURL);
    await page.goto("/waits");
    await page.locator("[data-verify-unit='toggle-resolved']").click();
    await expect(page).toHaveURL(/resolved=1/);
    await expect(
      page.locator("[data-verify-unit='toggle-resolved']"),
    ).toHaveAttribute("data-verify-including-resolved", "true");
  });

  test("offers no declaration form when no engagement could be read", async ({
    page,
  }) => {
    // A picker with no options is a control that cannot succeed. FR-32's form
    // appears once there is something to declare a wait against.
    await page.goto("/waits");
    await expect(
      page.locator("[data-verify-unit='declare-wait-trigger']"),
    ).toHaveCount(0);
  });
});
