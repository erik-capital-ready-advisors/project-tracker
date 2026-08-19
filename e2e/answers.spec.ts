import { expect, test } from "@playwright/test";

import { skipIfCspBlocksLocalNavigation } from "./csp-upgrade";

/**
 * The six answer screens in the running production build.
 *
 * ## What this suite can and cannot prove, stated rather than implied
 *
 * The build under test has **no operator session and no provisioned database**,
 * so every read on these six screens refuses. That bounds what an end-to-end
 * pass can establish, and claiming more would be the failure this product exists
 * to prevent. So the suite asserts what is actually true of this build:
 *
 *   * the six routes render rather than 500 — which is not free, because the app
 *     shell now runs the FR-58 census on every request and a census that threw
 *     would take every route down with it;
 *   * a refused read renders a **refusal**, never an empty state;
 *   * the unparsed count reads **unavailable** on both surfaces that report it,
 *     never `0`, and publishes no count attribute an assertion could mistake for
 *     one;
 *   * the parts that are pure functions of the URL — the filter bar, the closed
 *     sets it offers, the rejected-filter report — work end to end, because they
 *     run before any read.
 *
 * The rows-on-screen half of every requirement is covered by the component tests
 * in `tests/answer-screens.test.tsx`, and is listed under NOT VERIFIED in the
 * report with what would settle it.
 *
 * Assertions query `data-verify-*` rather than CSS classes, so a restyle does not
 * turn this suite red for reasons that have nothing to do with the code.
 */

const ANSWERS = [
  "/blocked",
  "/next",
  "/committed",
  "/untested",
  "/bottleneck",
  "/broken",
] as const;

const NOTICE = "[data-verify-unit='load-notice']";
const EMPTY = "[data-verify-unit='empty-state']";
const SHELL_COUNT = "[data-verify-unit='unparsed-count']";
const BREAKDOWN = "[data-verify-unit='unparsed-breakdown']";

test.describe("the six answers", () => {
  for (const route of ANSWERS) {
    test(`FR-58 ${route} renders and states the unparsed count`, async ({
      page,
    }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBeLessThan(400);

      // Both surfaces that report FR-58's count are present on every screen.
      await expect(page.locator(SHELL_COUNT)).toBeVisible();
      await expect(page.locator(BREAKDOWN)).toBeVisible();
    });

    test(`${route} reports an unread count as unavailable, never as zero`, async ({
      page,
    }) => {
      await page.goto(route);

      // Each surface names its own count attribute; both must be absent, not
      // zero. `unknown` publishes no count at all, so no assertion — and no
      // reader — can mistake it for a zero.
      const surfaces = [
        { selector: SHELL_COUNT, attribute: "data-verify-count" },
        { selector: BREAKDOWN, attribute: "data-verify-total" },
      ] as const;

      for (const { selector, attribute } of surfaces) {
        const el = page.locator(selector);
        await expect(el).toHaveAttribute("data-verify-state", "unknown");
        await expect(el).not.toHaveAttribute(attribute, /.*/);
        await expect(el).toContainText("unavailable");
      }

      await expect(page.getByText("0 unparsed in the ledger")).toHaveCount(0);
    });

    test(`${route} renders a refusal and NOT an empty state`, async ({ page }) => {
      await page.goto(route);

      const notice = page.locator(NOTICE);
      await expect(notice).toBeVisible();
      await expect(notice).toHaveAttribute(
        "data-verify-reason",
        /sign-in|mfa|no-role|error/,
      );

      // The assertion that matters on every one of these screens. "Nothing is
      // blocked." after a query that never ran is a clean-ledger claim nobody
      // checked.
      await expect(page.locator(EMPTY)).toHaveCount(0);
    });
  }

  test("the two FR-58 surfaces never disagree", async ({ page }) => {
    // One definition, read once per request. If these two ever showed different
    // numbers, the reader would have no way to know which to believe — which is
    // the exact failure the shared definition was created to end.
    for (const route of ANSWERS) {
      await page.goto(route);
      const shell = await page
        .locator(SHELL_COUNT)
        .getAttribute("data-verify-state");
      const strip = await page
        .locator(BREAKDOWN)
        .getAttribute("data-verify-state");
      expect(shell, `state disagreement on ${route}`).toBe(strip);
    }
  });
});

test.describe("filters, which run before any read", () => {
  test("FR-63 Broken offers all four severities, `unparsed` among them", async ({
    page,
  }) => {
    await page.goto("/broken");
    // four + "any". Leaving `unparsed` out of the control would make an ungraded
    // defect unfindable, which is the diagnostics-page failure FR-58 rules out.
    await expect(page.locator("#filter-severity option")).toHaveCount(5);
    await expect(
      page.locator("#filter-severity option[value='unparsed']"),
    ).toHaveCount(1);
  });

  test("FR-51 Committed offers open, claimed and billable separately", async ({
    page,
  }) => {
    await page.goto("/committed");
    // A single "invoiceable?" toggle here would merge `claimed` into
    // `billable`, which is precisely what FR-51 forbids, expressed as a control.
    await expect(page.locator("#filter-state option")).toHaveCount(4);
    for (const value of ["open", "claimed", "billable"]) {
      await expect(
        page.locator(`#filter-state option[value='${value}']`),
      ).toHaveCount(1);
    }
  });

  test("FR-30 Blocked offers both dispositions", async ({ page }) => {
    await page.goto("/blocked");
    await expect(page.locator("#filter-disposition option")).toHaveCount(3);
  });

  test("an unrecognised filter value is reported, not silently dropped", async ({
    page,
  }) => {
    // The screen shows MORE than was asked for. Saying so is the whole point:
    // quietly dropping `?severity=crit` renders every severity under a heading
    // that claims to be filtered.
    await page.goto("/broken?severity=crit");

    const rejected = page.locator("[data-verify-unit='rejected-filters']");
    await expect(rejected).toBeVisible();
    await expect(rejected).toHaveAttribute("data-verify-count", "1");
    await expect(rejected).toContainText("severity=crit");

    // The select fell back to "any" rather than to some other severity.
    await expect(page.locator("#filter-severity")).toHaveValue("");
  });

  test("a recognised filter value applies and is not reported as rejected", async ({
    page,
  }) => {
    // The negative control. Without it, a parser that rejected *everything*
    // would pass the test above.
    await page.goto("/broken?severity=critical");
    await expect(
      page.locator("[data-verify-unit='rejected-filters']"),
    ).toHaveCount(0);
    await expect(page.locator("#filter-severity")).toHaveValue("critical");
  });

  test("an out-of-range row limit is reported rather than clamped", async ({
    page,
  }) => {
    await page.goto("/next?limit=9999");
    const rejected = page.locator("[data-verify-unit='rejected-filters']");
    await expect(rejected).toBeVisible();
    await expect(rejected).toContainText("limit=9999");
  });
});

test.describe("the filter bar is a GET form", () => {
  test("submitting it puts the filter in the URL", async ({
    page,
    browserName,
    baseURL,
  }, testInfo) => {
    // WebKit applies `upgrade-insecure-requests` to http://127.0.0.1, so no
    // navigation is possible against a locally served build. Measured in this
    // run; the skip cancels itself against an HTTPS preview. See ./csp-upgrade.
    if (skipIfCspBlocksLocalNavigation(testInfo, browserName, baseURL)) return;

    await page.goto("/broken");
    await page.selectOption("#filter-severity", "major");
    await page.getByRole("button", { name: "Apply" }).click();

    await page.waitForURL(/severity=major/);
    // A filtered answer is a link Erik can paste into a note, and the back
    // button steps through filter changes correctly. That is what the GET form
    // buys and it is why there is no client-side router push here.
    await expect(page.locator("#filter-severity")).toHaveValue("major");
    await expect(
      page.locator("[data-verify-unit='rejected-filters']"),
    ).toHaveCount(0);
  });
});
