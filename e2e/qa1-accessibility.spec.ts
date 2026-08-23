import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * Accessibility, measured rather than asserted — authored by `qa-reviewer` (qa1, run b0952e).
 *
 * Every ui unit in this run carried "contrast ratios — none measured" as an
 * explicit NOT VERIFIED, and nothing in the repo ran an accessibility engine at
 * all. This file is that missing dimension. It runs axe-core against every
 * route the shell links to, in both the desktop and mobile projects the
 * Playwright config already defines.
 *
 * ## What it does NOT do
 *
 * It does not stand in for a screen-reader pass. axe finds machine-checkable
 * violations — contrast, names, roles, landmarks — and is silent on whether the
 * resulting experience makes sense. Two of the four ui units said as much about
 * their own work and they were right to.
 *
 * ## Why the assertion is on `critical` and `serious` only
 *
 * The routes render their refusal state on this branch (no operator session),
 * so `moderate`/`minor` findings on a page that is mostly one notice would be
 * noise. `critical` and `serious` are the ones that block a flow, which is the
 * bar `qa-reviewer` files as `important`. The full count is attached to the
 * report regardless, so a regression in the quieter tiers is still visible.
 */

/** Every route the shell offers, plus the two the operator reaches by hand. */
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
  "/work-items/unassigned",
  "/waits",
  "/settings/tokens",
  "/sign-in",
  "/sign-in/verify",
  "/sign-in/enroll",
];

test.describe("accessibility (axe-core)", () => {
  for (const route of ROUTES) {
    test(`${route} has no critical or serious axe violations`, async ({ page }, testInfo) => {
      const response = await page.goto(route);
      // Fail closed: a route that did not render is not a route that passed.
      expect(
        response?.status(),
        `${route} did not render, so its accessibility was never measured`,
      ).toBeLessThan(400);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const blocking = results.violations.filter(
        (v) => v.impact === "critical" || v.impact === "serious",
      );

      // Attach the full result so the quieter tiers stay visible in the report
      // even when the assertion below passes.
      await testInfo.attach(`axe-${route.replace(/\//g, "_") || "_root"}.json`, {
        body: JSON.stringify(
          {
            route,
            project: testInfo.project.name,
            counts: {
              critical: results.violations.filter((v) => v.impact === "critical").length,
              serious: results.violations.filter((v) => v.impact === "serious").length,
              moderate: results.violations.filter((v) => v.impact === "moderate").length,
              minor: results.violations.filter((v) => v.impact === "minor").length,
            },
            violations: results.violations.map((v) => ({
              id: v.id,
              impact: v.impact,
              help: v.help,
              nodes: v.nodes.map((n) => n.target),
            })),
          },
          null,
          2,
        ),
        contentType: "application/json",
      });

      expect(
        blocking.map((v) => `${v.impact}: ${v.id} — ${v.help}`),
        `${route} (${testInfo.project.name})`,
      ).toEqual([]);
    });
  }
});
