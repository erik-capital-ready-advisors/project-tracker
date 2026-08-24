import { globSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * B63 — accessibility measured on the screens a signed-in operator actually sees.
 *
 * ## Why this file exists beside `qa1-accessibility.spec.ts`
 *
 * That suite scans each route's **signed-out** state, which for every operator
 * route is a single notice. It has no violations and never will, so the suite
 * reported green while the product carried **164 serious nodes** — `/questions`
 * 96, `/broken` 27, `/work-items` 22, `/registry` 12, `/runs` 4, `/stacks` 2,
 * measured 2026-08-24. The gate was never broken. It was pointed at a different
 * page from the one anybody uses, and nothing in its output said so.
 *
 * ## Two things are derived rather than listed
 *
 * **The routes come from the filesystem**, not an array. The old list had not
 * gained a route since run `b0952e`, so four milestones' worth of screens were
 * never scanned even in the signed-out state. A list goes stale silently and its
 * staleness looks exactly like coverage.
 *
 * **The project only exists when it can run.** `playwright.config.ts` gates it on
 * `A11Y_BASE_URL`, the same way `m27-gate` is gated, because a configured-but-
 * unrunnable project produces a row of skips and a skipped gate is the same
 * colour as a passing one from a distance — blocker B19, exactly.
 *
 * ## It fails rather than skips when it cannot measure
 *
 * If a route answers with the operator gate, the credential is dead or unset and
 * **nothing below was measured**. That is a failure, not a skip. The signature is
 * identical to an unset storage state, so the message says to check both before
 * concluding the session is revoked — that inference was drawn wrongly once
 * already, on 2026-08-23.
 */

const BASE_URL = process.env.A11Y_BASE_URL;
const STORAGE_STATE = process.env.A11Y_STORAGE_STATE;

test.use({
  ...(BASE_URL ? { baseURL: BASE_URL } : {}),
  ...(STORAGE_STATE ? { storageState: STORAGE_STATE } : {}),
});

/** Every `page.tsx` under `src/app`, as a route. Dynamic segments are excluded. */
function routes(): { visitable: string[]; dynamic: string[] } {
  const visitable: string[] = [];
  const dynamic: string[] = [];
  for (const file of globSync("src/app/**/page.tsx", { cwd: process.cwd() })) {
    const route =
      "/" +
      file
        .replace(/^src\/app\//, "")
        .replace(/\/page\.tsx$/, "")
        .replace(/\(.*?\)\//g, "");
    const clean = route === "/page.tsx" ? "/" : route;
    if (clean.includes("[")) dynamic.push(clean);
    else visitable.push(clean === "" ? "/" : clean);
  }
  return { visitable: [...new Set(visitable)].sort(), dynamic: dynamic.sort() };
}

const { visitable, dynamic } = routes();

test("the sweep has a credential and a base URL, or it measured nothing", () => {
  expect(BASE_URL, "A11Y_BASE_URL is unset: this suite measured nothing").toBeTruthy();
  expect(
    STORAGE_STATE,
    "A11Y_STORAGE_STATE is unset: every scan below would have measured the sign-in page",
  ).toBeTruthy();
});

test("the route list came from the filesystem and is not empty", () => {
  // A glob that matched nothing would make every scan below pass vacuously,
  // which is the failure mode this file was written to end.
  expect(visitable.length).toBeGreaterThan(10);
});

test("dynamic routes are reported, not silently uncovered", async () => {
  // Named rather than hidden: these need a real id and are NOT scanned here.
  // Silent truncation reads as "covered everything" when it did not.
  // `test.info()` rather than a `testInfo` parameter: Playwright requires the
  // first callback argument to be an object destructuring pattern, and oxlint's
  // no-empty-pattern rejects the `({}, testInfo)` form that satisfies it.
  test.info().annotations.push({
    type: "not-scanned",
    description: `${dynamic.length} dynamic route(s) need an id and are out of scope: ${dynamic.join(", ")}`,
  });
  expect(dynamic.every((r) => r.includes("["))).toBe(true);
});

for (const route of visitable) {
  test(`${route} has no critical or serious axe violations, signed in`, async ({ page }, testInfo) => {
    const response = await page.goto(route);
    expect(
      response?.status(),
      `${route} did not render, so its accessibility was never measured`,
    ).toBeLessThan(400);

    const gate = page.locator('[data-verify-unit="load-notice"]');
    if ((await gate.count()) > 0) {
      const reason = await gate.getAttribute("data-verify-reason");
      throw new Error(
        `${route} rendered the operator gate (reason=${reason}), so NOTHING was ` +
          `measured. This signature is identical to an unset A11Y_STORAGE_STATE — ` +
          `check both before concluding the session is revoked.`,
      );
    }

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === "critical" || v.impact === "serious",
    );

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
      blocking.map((v) => `${v.impact}: ${v.id} (${v.nodes.length} nodes) — ${v.help}`),
      `${route} (${testInfo.project.name})`,
    ).toEqual([]);
  });
}
