import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * qa1 / run d4000f — axe-core over the surfaces M2.9 changed.
 *
 * Machine-checkable violations only. This does not stand in for a screen-reader
 * pass, and it says so rather than implying coverage it does not have.
 */
const SURFACES = [
  "/work-items/new",
  "/work-items?engagement=delivery-ledger",
  "/work-items?engagement=no-such-engagement-qa1",
  "/next?engagement=delivery-ledger",
  "/registry?engagement=delivery-ledger",
  "/runs?engagement=delivery-ledger",
  "/questions?engagement=delivery-ledger",
];

for (const path of SURFACES) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const { violations } = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const summary = violations.map(
      (v) => `${v.id} (${v.impact}) x${v.nodes.length}`,
    );
    expect(summary, `axe violations on ${path}`).toEqual([]);
  });
}
