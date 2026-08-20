import { expect, test } from "@playwright/test";

/**
 * A smoke pass proving the harness runs and the shell holds together. The real
 * flows are `qa-reviewer`'s to author.
 *
 * Assertions query `data-verify-*` attributes rather than CSS classes, because
 * a suite built on class names goes red the next time anyone restyles a badge --
 * which is how a green suite starts reporting on the wrong thing.
 */

const ROUTES = [
  "/",
  "/blocked",
  "/next",
  "/committed",
  "/untested",
  "/bottleneck",
  "/broken",
  "/registry",
  "/work-items",
  "/waits",
  "/settings/tokens",
];

test.describe("app shell", () => {
  for (const route of ROUTES) {
    test(`FR-58 ${route} renders and states the unparsed count`, async ({
      page,
    }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);

      const unparsed = page.locator("[data-verify-unit='unparsed-count']");
      await expect(unparsed).toBeVisible();
      await expect(unparsed).toHaveAttribute("data-verify-state", /.+/);
    });
  }

  test("FR-52 the six answers are all reachable from the index", async ({
    page,
  }) => {
    await page.goto("/");
    const cards = page.locator("[data-verify-unit='answer-card']");
    // six answers plus five record surfaces (Export joined them at M1.10)
    await expect(cards).toHaveCount(11);
  });
});
