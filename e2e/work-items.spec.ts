import { expect, test } from "@playwright/test";

import { skipIfCspBlocksLocalNavigation } from "./csp-upgrade";

/**
 * FR-44's list and FR-26's queue, in the running production build.
 *
 * ## What this suite can and cannot prove, stated rather than implied
 *
 * The build under test has **no operator session and no provisioned database**,
 * so every read on these screens refuses. That bounds what an end-to-end pass
 * can establish, and pretending otherwise would be the exact failure this
 * product exists to prevent -- so the suite asserts what is actually true:
 *
 *   * the routes render rather than 500,
 *   * a refused read renders a **refusal**, never an empty state,
 *   * the parts that are pure functions of the URL -- the filter bar, the
 *     rejected-filter report, sort links -- work end to end, because they run
 *     before any read.
 *
 * The rows-on-screen half of FR-44 is covered by the component tests and is
 * listed under NOT VERIFIED in the report, with what would settle it.
 *
 * Assertions query `data-verify-*` rather than CSS classes, so a restyle does
 * not turn this suite red for reasons that have nothing to do with the code.
 */

const NOTICE = "[data-verify-unit='load-notice']";
const EMPTY = "[data-verify-unit='empty-state']";

test.describe("FR-44 work items", () => {
  test("renders, and states the unparsed count", async ({ page }) => {
    const response = await page.goto("/work-items");
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator("[data-verify-unit='unparsed-count']")).toBeVisible();
  });

  test("a refused read renders a refusal and NOT an empty state", async ({
    page,
  }) => {
    await page.goto("/work-items");

    const notice = page.locator(NOTICE);
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute(
      "data-verify-reason",
      /sign-in|mfa|no-role|error/,
    );

    // The assertion that matters. "No work items recorded." after a query that
    // never ran is a clean-ledger claim nobody checked.
    await expect(page.locator(EMPTY)).toHaveCount(0);
    await expect(page.getByText("No work items recorded.")).toHaveCount(0);
  });

  test("reports the unparsed count as unavailable rather than as zero", async ({
    page,
  }) => {
    await page.goto("/work-items");
    const unparsed = page.locator("[data-verify-unit='unparsed-count']");
    await expect(unparsed).toHaveAttribute("data-verify-state", "unknown");
    // `unknown` publishes no count at all, so an assertion cannot mistake it
    // for a zero.
    await expect(unparsed).not.toHaveAttribute("data-verify-count", /.*/);
    await expect(unparsed).toContainText("unavailable");
  });

  test("makes no claim about the rows on a page it never fetched", async ({
    page,
  }) => {
    await page.goto("/work-items");
    // The per-page count is absent rather than zero. Absent says nothing;
    // "0 unparsed on this page" would say every row classified, about a page
    // that was never read.
    await expect(
      page.locator("[data-verify-unit='listing-unparsed']"),
    ).toHaveCount(0);
  });

  test("FR-44 the filter bar offers every closed set the requirements name", async ({
    page,
  }) => {
    await page.goto("/work-items");

    // FR-43: all four evidence scopes, separately selectable. A single
    // verified/not-verified toggle here would be the collapse the requirement
    // forbids, expressed as a control.
    const evidence = page.locator("#filter-evidence");
    await expect(evidence.locator("option")).toHaveCount(5); // four + "any"

    // FR-30: both dispositions are filterable.
    await expect(page.locator("#filter-disposition option")).toHaveCount(3);

    // FR-39: three execution modes, as one filter on one list -- not three tabs.
    await expect(page.locator("#filter-mode option")).toHaveCount(4);
    await expect(page.locator("#filter-executor option")).toHaveCount(7);
  });

  test("FR-44 filtering is a GET that lands in the URL", async ({
    page,
    browserName,
    baseURL,
  }, testInfo) => {
    skipIfCspBlocksLocalNavigation(testInfo, browserName, baseURL);
    await page.goto("/work-items");

    await page.selectOption("#filter-mode", "fleet");
    await page.selectOption("#filter-executor", "erik_gate");
    await page.getByRole("button", { name: "Apply" }).click();

    await expect(page).toHaveURL(/mode=fleet/);
    await expect(page).toHaveURL(/executor=erik_gate/);

    // The state survives a reload, because it is in the URL and nowhere else.
    await page.reload();
    await expect(page.locator("#filter-mode")).toHaveValue("fleet");
    await expect(page.locator("#filter-executor")).toHaveValue("erik_gate");
    await expect(
      page.locator("[data-verify-unit='work-item-filters']"),
    ).toHaveAttribute("data-verify-filtered", "true");
  });

  test("an unrecognised filter is reported, not silently dropped", async ({
    page,
  }) => {
    await page.goto("/work-items?executor=bob&sort=description");

    const rejected = page.locator("[data-verify-unit='rejected-filters']");
    await expect(rejected).toBeVisible();
    await expect(rejected).toHaveAttribute("data-verify-count", "2");
    await expect(rejected).toContainText("executor=bob");
    await expect(rejected).toContainText("sort=description");

    // And the screen does not claim to be filtered by something it ignored.
    await expect(
      page.locator("[data-verify-unit='work-item-filters']"),
    ).toHaveAttribute("data-verify-filtered", "false");

    // Fuchsia is reserved exclusively for `unparsed` records, and Erik approved
    // that reservation. A rejected filter is a warning about the query, not an
    // unparsed record.
    await expect(rejected).not.toHaveClass(/state-unparsed/);
  });

  test("a clean list produces a clean URL and no rejection report", async ({
    page,
  }) => {
    await page.goto("/work-items");
    await expect(page.locator("[data-verify-unit='rejected-filters']")).toHaveCount(
      0,
    );
  });
});

test.describe("FR-26 unassigned session queue", () => {
  test("is reachable from the work-item list", async ({
    page,
    browserName,
    baseURL,
  }, testInfo) => {
    skipIfCspBlocksLocalNavigation(testInfo, browserName, baseURL);
    await page.goto("/work-items");
    await page
      .locator("[data-verify-unit='work-item-tab'][data-verify-tab='queue']")
      .click();
    await expect(page).toHaveURL(/\/work-items\/unassigned$/);
  });

  test("renders a refusal rather than an empty queue", async ({ page }) => {
    const response = await page.goto("/work-items/unassigned");
    expect(response?.status()).toBeLessThan(400);

    await expect(page.locator(NOTICE).first()).toBeVisible();
    await expect(page.locator(EMPTY)).toHaveCount(0);
    await expect(
      page.getByText("Nothing is waiting to be attributed."),
    ).toHaveCount(0);
  });

  test("shows no queue count when the queue was never read", async ({ page }) => {
    await page.goto("/work-items/unassigned");
    const tab = page.locator(
      "[data-verify-unit='work-item-tab'][data-verify-tab='queue']",
    );
    // A `0` beside the tab would say the queue is empty. It was not read.
    await expect(tab).not.toContainText("0");
  });
});
