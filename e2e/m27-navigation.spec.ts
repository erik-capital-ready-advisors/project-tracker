import { expect, test, type Page } from "@playwright/test";

/**
 * **M2.7's acceptance gate. Written before M2.7 is dispatched, RED on purpose,
 * and not run by `pnpm e2e`.** It runs only when `M27_BASE_URL` points at an
 * instance with real rows and `M27_STORAGE_STATE` at a signed-in operator
 * session. See `pnpm gate:m27:e2e`.
 *
 * ## The contract this declares
 *
 * A gate that dictates nothing can check nothing, so this one names the markup
 * contract that makes FR-80 and FR-83 decidable, and names it in one place:
 *
 *   data-verify-unit="entity-ref"
 *   data-verify-kind   one of FR-81's eight entities
 *   data-verify-ref    the reference as rendered (`FR-42`, `u4`, `D-7`)
 *   data-verify-known  "true" | "false" — NEVER absent
 *
 * `data-verify-known` has no third value and no default. A reference whose
 * resolution nobody determined is `unparsed`, and this product's rule is that
 * `unparsed` is loud. An absent attribute would let a view that never checked
 * render a link, which is exactly FR-83's failure.
 *
 * ## Why it fails instead of skipping
 *
 * B19 is the precedent and it is the reason this paragraph exists: the Tier-2
 * corpus assertions "never ran — `fixtures-local/` is absent on this machine",
 * and were reported as SKIPPED. A skipped gate and a passing gate are the same
 * colour from a distance. So if this suite is pointed at an instance where the
 * screens are gated or empty, it FAILS and says which, rather than reporting a
 * tidy row of skips over eight unbuilt views.
 *
 * ## `M27_STORAGE_STATE` is a credential
 *
 * It holds a live operator session at `aal2`. It is not committed, it is
 * gitignored, and no agent writes one — Erik signs in and saves it. Treat it the
 * way CLAUDE.md tells you to treat a service-role key.
 */

/** CR-003 FR-81. */
const ENTITY_KINDS = [
  "work_item",
  "defect",
  "blocker",
  "requirement",
  "open_question",
  "external_wait",
  "release",
  "contract_milestone",
];

const ANSWER_SCREENS = ["/blocked", "/next", "/committed", "/untested", "/bottleneck", "/broken"];

const REF = "[data-verify-unit='entity-ref']";

/**
 * Fail — loudly, and naming which — if this run cannot see what it is here to
 * check. A gate that quietly reports "0 references, all correct" is worse than
 * no gate, because it produces a green tick over an unbuilt milestone.
 */
async function requirePopulatedOperatorView(page: Page, route: string): Promise<void> {
  const gate = page.locator("[data-verify-unit='load-notice'], [data-verify-unit='operator-gate']");
  if ((await gate.count()) > 0) {
    const reason =
      (await gate.first().getAttribute("data-verify-reason")) ??
      (await gate.first().getAttribute("data-verify-gate")) ??
      "unstated";
    throw new Error(
      `${route} rendered the operator gate (${reason}), so this gate saw no data. ` +
        "Point M27_STORAGE_STATE at a signed-in operator session at aal2. This is a " +
        "failure and not a skip on purpose: an unrun gate must never look like a pass.",
    );
  }

  const empty = page.locator("[data-verify-unit='empty-state']");
  if ((await empty.count()) > 0) {
    throw new Error(
      `${route} rendered its empty state, so there is nothing here to navigate from. ` +
        "Point M27_BASE_URL at an instance carrying a real ingested run.",
    );
  }
}

test.describe("FR-80 / FR-83 — every reference goes somewhere, or is visibly a reference to nothing", () => {
  for (const route of ANSWER_SCREENS) {
    test(`${route} renders entity references and every one of them resolves`, async ({
      page,
      request,
    }) => {
      await page.goto(route);
      await requirePopulatedOperatorView(page, route);

      const refs = page.locator(REF);
      const count = await refs.count();

      // FR-80 says "every entity reference rendered on any screen". A populated
      // answer screen with none has not adopted the contract — which reads
      // identical to a screen that is perfectly navigable, so it must fail.
      expect(count, `${route} rendered no ${REF} at all`).toBeGreaterThan(0);

      for (let i = 0; i < count; i += 1) {
        const ref = refs.nth(i);
        const kind = await ref.getAttribute("data-verify-kind");
        const name = await ref.getAttribute("data-verify-ref");
        const known = await ref.getAttribute("data-verify-known");
        const where = `${route} → ${kind}:${name}`;

        expect(ENTITY_KINDS, `${where} names a kind FR-81 does not`).toContain(kind);
        expect(["true", "false"], `${where} left data-verify-known absent`).toContain(known);

        const insideAnchor = await ref.evaluate((el) => el.closest("a") !== null);

        if (known === "false") {
          // FR-83, the whole of it: "renders in FR-12's dangling-reference
          // treatment and is never a link. It is not a 404, not a search, and
          // not silently plain text."
          expect(insideAnchor, `${where} dangles and is a link anyway`).toBe(false);
          await expect(ref, `${where} dangles without FR-12's treatment`).toHaveAttribute(
            "data-verify-treatment",
            "dangling",
          );
          continue;
        }

        expect(insideAnchor, `${where} resolves and is not navigable`).toBe(true);
        const href = await ref.evaluate((el) => el.closest("a")?.getAttribute("href") ?? "");
        expect(href, `${where} is an anchor with no href`).not.toBe("");

        const response = await request.get(href);
        expect(response.status(), `${where} links to ${href}, which answered`).toBeLessThan(400);
      }
    });
  }
});

test.describe("FR-81 / FR-85 — the eight detail views", () => {
  test("every reference target renders a detail view that states its unparsed count", async ({
    page,
  }) => {
    await page.goto("/blocked");
    await requirePopulatedOperatorView(page, "/blocked");

    const first = page.locator(`${REF}[data-verify-known='true']`).first();
    const href = await first.evaluate((el) => el.closest("a")?.getAttribute("href") ?? "");
    await page.goto(href);

    // FR-85: "FR-58 extends to detail views: every detail view reports the
    // current unparsed count." Same assertion the six answer screens already
    // carry, for the same reason — an unknown count must never render as 0.
    const unparsed = page.locator("[data-verify-unit='unparsed-count']");
    await expect(unparsed).toBeVisible();
    await expect(unparsed).toHaveAttribute("data-verify-state", /^(zero|nonzero|unknown)$/);

    await expect(page.locator("[data-verify-unit='entity-detail']")).toHaveAttribute(
      "data-verify-kind",
      /^(work_item|defect|blocker|requirement|open_question|external_wait|release|contract_milestone)$/,
    );
  });
});

test.describe("FR-82 — a requirement shows its four relationships together", () => {
  test("work items, tests, defects and releases appear on one page", async ({ page }) => {
    await page.goto("/untested");
    await requirePopulatedOperatorView(page, "/untested");

    const requirement = page
      .locator(`${REF}[data-verify-kind='requirement'][data-verify-known='true']`)
      .first();
    const href = await requirement.evaluate((el) => el.closest("a")?.getAttribute("href") ?? "");
    await page.goto(href);

    // "Nothing new is derived — these four relationships are already parsed and
    // stored; this requirement is that they be SHOWN TOGETHER, which is the
    // de-siloing the product is for." So all four, on one page, or it fails.
    for (const relation of ["work-items", "tests", "defects", "releases"]) {
      await expect(
        page.locator(`[data-verify-unit='requirement-${relation}']`),
        `FR-82: a requirement detail view with no ${relation} section`,
      ).toBeVisible();
    }
  });
});

test.describe("FR-55 — an uncovered requirement links to what implements it", () => {
  test("Untested's uncovered requirements are hyperlinks, not just a data relationship", async ({
    page,
  }) => {
    await page.goto("/untested");
    await requirePopulatedOperatorView(page, "/untested");

    // Q11 ruled FR-55's "links" a hyperlink, which is what made it PARTIALLY MET
    // rather than met. The join M1.8 built is correct; this is the other half.
    const uncovered = page.locator("[data-verify-unit='uncovered-requirement']").first();
    await expect(uncovered).toBeVisible();

    const implementer = uncovered.locator(`${REF}[data-verify-kind='work_item']`).first();
    await expect(
      implementer,
      "FR-55: an uncovered requirement naming no navigable implementing work item",
    ).toBeVisible();
  });
});

test.describe("FR-84 — coming back costs nothing", () => {
  test("the filter state of the screen a detail view was entered from is restored", async ({
    page,
  }) => {
    const filtered = "/work-items?mode=fleet&status=blocked";
    await page.goto(filtered);
    await requirePopulatedOperatorView(page, filtered);

    const before = new URL(page.url()).search;
    expect(before, "the filtered screen dropped its own query string").not.toBe("");

    await page.locator(`${REF}[data-verify-known='true']`).first().click();
    await page.waitForURL((url) => url.pathname !== "/work-items");
    await page.goBack();

    // "A thirty-second glance that costs a re-filter on the way back has spent
    // the saving."
    expect(new URL(page.url()).search, "FR-84: the filters were lost on the way back").toBe(
      before,
    );
  });
});
