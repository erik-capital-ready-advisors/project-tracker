import { expect, test } from "@playwright/test";

/**
 * qa1 / run d4000f — independent review flows for M2.9 (CR-005 §3.1 + §3.3).
 *
 * These are the reviewer's own flows, not a specialist's. They assert against
 * the `data-verify-*` state contracts the components publish rather than CSS
 * hierarchies, so a restyle does not turn them red and a behaviour change does.
 *
 * ## What these can and cannot reach
 *
 * They run in the `m27-gate` project, which carries `M27_STORAGE_STATE` — an
 * operator session at `aal2` that Erik produced by hand. Everything below is
 * therefore behind the operator boundary and observed on screen.
 *
 * **They deliberately assert nothing about the agent-token boundary.** No valid
 * token is obtainable by a review run (`.env.local` is read-denied by design),
 * so the token path is proven to REFUSE by negative control in the report and
 * is NOT proven to admit. A positive-path assertion here would be a claim
 * nothing checked.
 *
 * **FR-91's planned/STALE markers are asserted conditionally.** The ledger holds
 * no planned row today — every `work_item` reports `data-verify-planned="false"`
 * — so the markers cannot be produced on screen by any navigation. The flows
 * below assert the *absence* is honest (no row falsely claims planned) and skip
 * the positive rendering with an explicit reason rather than passing silently on
 * a surface nobody looked at.
 */

const SCREENS = [
  "/next",
  "/committed",
  "/broken",
  "/bottleneck",
  "/blocked",
  "/untested",
  "/work-items",
  "/questions",
  "/waits",
  "/runs",
  "/registry",
] as const;

/** A slug no engagement can hold — FR-96c's input. */
const NONSENSE = "no-such-engagement-qa1-d4000f";

test.describe("FR-96c — an unresolvable filter renders nothing, loudly", () => {
  for (const path of SCREENS) {
    test(`${path} states the slug is unknown and shows no rows`, async ({
      page,
    }) => {
      const response = await page.goto(`${path}?engagement=${NONSENSE}`);

      // Not a 404. FR-96c is "no engagement has this slug", which is a
      // different and weaker claim than "this page does not exist" — the page
      // very much exists.
      expect(response?.status()).toBe(200);

      const notice = page.locator('[data-verify-unit="unknown-engagement"]');
      await expect(notice).toBeVisible();
      await expect(notice).toHaveAttribute("data-verify-slug", NONSENSE);

      // The load-bearing half: it must not silently fall back to the
      // unfiltered list. A screen that looks scoped while showing everything
      // is the same class of lie as a wrong `done`.
      await expect(page.locator("table tbody tr")).toHaveCount(0);
    });
  }

  test("the unfiltered control returns rows, so the assertion above can fail", async ({
    page,
  }) => {
    // Without this the FR-96c suite is indistinguishable from a suite pointed
    // at a screen that renders no rows under any circumstances.
    await page.goto("/work-items");
    await expect(
      page.locator('[data-verify-unit="unknown-engagement"]'),
    ).toHaveCount(0);
    expect(await page.locator("table tbody tr").count()).toBeGreaterThan(0);
  });
});

test.describe("FR-96a — the unparsed badge stays ledger-wide and says so", () => {
  test("an active filter labels the badge (whole ledger)", async ({ page }) => {
    await page.goto("/work-items?engagement=delivery-ledger");
    const badge = page.locator('[data-verify-unit="unparsed-count"]');
    await expect(badge).toBeVisible();

    const state = await badge.getAttribute("data-verify-state");
    if (state === "unknown") {
      // The suffix is deliberately suppressed here: attaching a scope to a
      // number that does not exist gives a reader something to misread.
      await expect(badge).toHaveAttribute("data-verify-scope", "none");
    } else {
      await expect(badge).toHaveAttribute("data-verify-scope", "whole-ledger");
      await expect(badge).toContainText("(whole ledger)");
    }
  });

  test("no filter means no scope label", async ({ page }) => {
    await page.goto("/work-items");
    await expect(
      page.locator('[data-verify-unit="unparsed-count"]'),
    ).toHaveAttribute("data-verify-scope", "none");
  });
});

test.describe("FR-96b — one picker in the shell, and the URL is the whole state", () => {
  test("the picker is in the chrome on every filterable screen", async ({
    page,
  }) => {
    for (const path of SCREENS) {
      await page.goto(path);
      const picker = page.locator('[data-verify-unit="engagement-picker"]');

      // The picker legitimately suppresses itself when it can offer nothing
      // AND there is no filter to clear — a control that cannot change
      // anything is not rendered. So assert the CONDITION, not the presence:
      // wherever the roster has options, the picker must be there.
      const roster = await page
        .locator("[data-verify-roster]")
        .first()
        .getAttribute("data-verify-roster")
        .catch(() => null);

      if (roster === "ok") {
        await expect(picker, `picker missing on ${path}`).toBeVisible();
      } else {
        // An operator session that reads no roster is a finding about the
        // environment, not about this screen. Recorded, not passed over.
        test
          .info()
          .annotations.push({
            type: "roster",
            description: `${path}: roster=${roster ?? "absent"}`,
          });
      }
    }
  });

  test("a filtered view is a link, and carries no hidden stickiness", async ({
    page,
    context,
  }) => {
    await page.goto("/work-items?engagement=delivery-ledger");
    // With a filter in the URL the picker must render even under a failed or
    // gated roster read — it must never strand a filter with no way out.
    await expect(
      page.locator('[data-verify-unit="engagement-picker"]'),
    ).toHaveAttribute("data-verify-filter", "delivery-ledger");

    // CR-005 §3.3 point 3: no cookie, no session-stored last filter. Navigating
    // to the bare path must show the unfiltered view, or two operators on one
    // URL see different data.
    await page.goto("/work-items");
    const cleared = page.locator('[data-verify-unit="engagement-picker"]');
    if ((await cleared.count()) > 0) {
      await expect(cleared).toHaveAttribute("data-verify-filter", "none");
    }

    const stored = await page.evaluate(() => ({
      local: window.localStorage.length,
      session: window.sessionStorage.length,
    }));
    expect(stored.local).toBe(0);
    expect(stored.session).toBe(0);

    const cookies = await context.cookies();
    expect(cookies.filter((c) => /engagement/i.test(c.name))).toHaveLength(0);
  });

  test("a detail view does NOT take the filter", async ({ page }) => {
    await page.goto("/work-items");
    const first = page.locator("table tbody tr a").first();
    await first.click();
    await page.waitForLoadState("networkidle");
    await expect(
      page.locator('[data-verify-unit="engagement-scope"]'),
    ).toHaveCount(0);
  });
});

test.describe("FR-91 / FR-87 — planned rows are distinguishable, and absent rows are honest", () => {
  test("no row claims to be planned while the ledger holds none", async ({
    page,
  }) => {
    await page.goto("/work-items");
    const rows = page.locator("[data-verify-planned]");
    const total = await rows.count();
    expect(total).toBeGreaterThan(0);

    const planned = await page
      .locator('[data-verify-planned="true"]')
      .count();

    if (planned === 0) {
      // The honest state. D-1 was exactly this reading going the other way: a
      // planned row rendering as fleet work. Assert no row carries a STALE
      // marker either, since staleness is derived only for planned rows.
      await expect(
        page.locator('[data-verify-planned-state="stale"]'),
      ).toHaveCount(0);
      test.info().annotations.push({
        type: "not-verified",
        description:
          "FR-91's planned and STALE markers were NOT observed rendering: " +
          `the ledger holds no planned row (${total} rows, 0 planned). ` +
          "Their absence is asserted; their presence is not.",
      });
    } else {
      // If a planned row ever exists, it must be visibly marked.
      await expect(
        page.locator('[data-verify-planned="true"]').first(),
      ).toBeVisible();
    }
  });

  test("the hand-entry form renders and refuses an empty engagement", async ({
    page,
  }) => {
    await page.goto("/work-items/new");
    const form = page.locator('[data-verify-unit="planned-work-form"]');
    await expect(form).toBeVisible();
    await expect(form).toHaveAttribute("data-verify-status", "idle");

    // FR-87 as amended by Q14: there is no unassigned planned row. The form
    // offers a real roster or says it could not read one — never a silent
    // empty select that looks like "no engagements exist".
    const offered = await form.getAttribute("data-verify-engagements");
    expect(offered).not.toBeNull();
  });
});
