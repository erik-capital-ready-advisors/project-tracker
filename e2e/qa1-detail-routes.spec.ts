import { expect, test } from "@playwright/test";

/**
 * The eight detail routes, observed unauthenticated — authored by `qa-reviewer`
 * (work-unit `qa1`, run `eb2490`).
 *
 * ## What this exists to catch
 *
 * Run `b0952e` shipped `POST /api/ingest/run` returning 500 on every request
 * with 966 green tests behind it. `tests/m27-gate.test.ts` was written to stop
 * the same thing happening to M2.7, and it is honest about its own limit: it
 * asserts that the routes FR-81 names *exist as files* and that one module
 * decides where a reference points. A route can satisfy every one of those
 * assertions and still throw at request time — a bad import, a module-level
 * crash, a loader selecting a column that is not there. Nothing in the
 * credential-free half of this repository actually *requests* a detail route.
 *
 * This file does. It is the cheapest possible proof that the eight new routes
 * load and execute, and it needs no operator session and no database rows,
 * which is what lets it live in CI beside the structural gate.
 *
 * ## The auth boundary is the second thing it checks, and it is the important one
 *
 * Every detail view reads through `service_role`, which holds BYPASSRLS — B29,
 * accepted by CR-003 Q9. `requireOperator()` inside each `read*Detail` is
 * therefore the *whole* of the authorisation on that path, not a convenience in
 * front of RLS. So "an unauthenticated request reaches no entity data" is a real
 * security assertion here rather than a formality, and it is asserted per route
 * because the gate is per route.
 *
 * Observed on 2026-08-20 against `next dev`: all eight answer `200` and render
 * the sign-in prompt rather than a redirect. That is this application's existing
 * idiom (`src/app/**` renders the prompt in place) and it is asserted as-is —
 * the requirement is that no entity data is served, not that the status is 302.
 *
 * ## FR-85, from the served HTML rather than from the component
 *
 * > every detail view reports the current `unparsed` count
 *
 * `<UnparsedCount>` lives in `AppShell` in the single root layout, so detail
 * routes inherit it structurally. Two things can go wrong and neither is visible
 * to a component test: a view adds a second one, or the count renders `0` when
 * it is merely unknown. A `0` where the truth is "not available" is the exact
 * false-`done` this product refuses, so both are asserted from the response body.
 */

/** FR-81's eight, as `[route segment, expected <title> prefix]`. */
const DETAIL_ROUTES: [string, string][] = [
  ["work-items", "Work item"],
  ["defects", "Defect"],
  ["blockers", "Blocker"],
  ["requirements", "Requirement"],
  ["questions", "Open question"],
  ["waits", "External wait"],
  ["releases", "Release"],
  ["milestones", "Contract milestone"],
];

/** A well-formed uuid that names nothing, so no fixture data is required. */
const ABSENT_ID = "00000000-0000-0000-0000-000000000001";

test.describe("FR-81 — the eight detail routes load and execute", () => {
  for (const [segment, title] of DETAIL_ROUTES) {
    test(`/${segment}/[id] responds without a server error`, async ({ page }) => {
      const response = await page.goto(`/${segment}/${ABSENT_ID}`);

      // The point of the assertion: not 500, and not a build-time-only success.
      expect(response, `no response from /${segment}/${ABSENT_ID}`).not.toBeNull();
      expect(response!.status(), `/${segment}/[id] returned a server error`).toBeLessThan(500);

      // The route is the one we asked for, rather than a rewrite to a 404 shell.
      await expect(page).toHaveTitle(new RegExp(`^${title} —`));
    });
  }
});

test.describe("the operator gate — B29 makes this the only authorisation on the path", () => {
  for (const [segment] of DETAIL_ROUTES) {
    test(`/${segment}/[id] serves no entity data to an anonymous caller`, async ({ page }) => {
      await page.goto(`/${segment}/${ABSENT_ID}`);

      // `requireOperator()` refused, and the refusal is stated to the reader
      // rather than rendered as an empty screen.
      await expect(
        page.getByText("Sign in to read this screen.", { exact: false }),
      ).toBeVisible();

      // Nothing that only a decrypted read could have produced is present.
      // `EntityDetail` emits this wrapper once a row has been loaded.
      await expect(page.locator("[data-verify-unit='entity-detail']")).toHaveCount(0);
    });
  }
});

test.describe("FR-85 — every detail view reports the unparsed count, exactly once", () => {
  for (const [segment] of DETAIL_ROUTES) {
    test(`/${segment}/[id] renders one unparsed count, and an unknown one is not 0`, async ({
      page,
    }) => {
      await page.goto(`/${segment}/${ABSENT_ID}`);

      const count = page.locator("[data-verify-unit='unparsed-count']");
      // Exactly one: `AppShell` supplies it and no view adds a second.
      await expect(count).toHaveCount(1);

      // FR-58's rule, which FR-85 extends here: a count the system could not
      // determine says so. Rendering `0` would assert that nothing failed to
      // classify, which is a different and much worse claim than "unknown".
      const state = await count.getAttribute("data-verify-state");
      expect(state, "the unparsed count carries no state attribute").not.toBeNull();
      if (state === "unknown") {
        await expect(count).not.toHaveText(/^\s*0\s*$/);
      }
    });
  }
});
