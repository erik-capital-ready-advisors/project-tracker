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
/**
 * An answer screen has TWO correct shapes, and until 2026-08-24 this file knew
 * only one.
 *
 * `populated` — rows to navigate from. `accounted-empty` — no rows, **and the
 * screen says what it set aside and why**. The second is not a lesser answer:
 * FR-53's whole point is that "nothing is startable" and "eleven things are
 * held by a dependency" are different facts, and `/next` renders its
 * `set-aside` counts even when the list is empty precisely so they can be told
 * apart. A screen that is empty and says nothing is still a failure.
 */
type OperatorViewState = "populated" | "accounted-empty";

/**
 * Fail — loudly, and naming which — if this run cannot see what it is here to
 * check. A gate that quietly reports "0 references, all correct" is worse than
 * no gate, because it produces a green tick over an unbuilt milestone.
 */
async function readOperatorView(page: Page, route: string): Promise<OperatorViewState> {
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
  if ((await empty.count()) === 0) return "populated";

  // Empty. The ONLY thing that makes that acceptable is the screen accounting
  // for its own emptiness in machine-readable form. A failed read never lands
  // here — `loadForOperator` renders the load notice, caught above — so an
  // empty state with accounting is a successful read over genuinely nothing.
  const counts = await page
    .locator("[data-verify-unit='set-aside'] [data-verify-unit='set-aside-count']")
    .evaluateAll((nodes) =>
      nodes.map((el) => ({
        label: el.getAttribute("data-verify-label"),
        count: el.getAttribute("data-verify-count"),
      })),
    );

  if (counts.length === 0) {
    throw new Error(
      `${route} rendered its empty state and accounted for nothing. An empty answer is ` +
        "only correct when the screen says what it set aside and why — an empty list with " +
        "eleven items held by a dependency is a different fact from an empty one with " +
        "nothing held at all. Expected [data-verify-unit='set-aside'] to carry counts.",
    );
  }

  for (const one of counts) {
    expect(one.label, `${route} has a set-aside count with no label`).toBeTruthy();
    expect(
      one.count === null ? Number.NaN : Number(one.count),
      `${route} set-aside "${one.label}" is not a number: ${one.count}`,
    ).toBeGreaterThanOrEqual(0);
  }

  return "accounted-empty";
}

/**
 * The strict form, for the screens where empty IS the failure — a detail view,
 * a filtered work-item list, an uncovered-requirement list. Behaviour here is
 * unchanged from before 2026-08-24, deliberately: only the six answer screens
 * gained the second correct shape.
 */
async function requirePopulatedOperatorView(page: Page, route: string): Promise<void> {
  if ((await readOperatorView(page, route)) !== "populated") {
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
      /**
       * Raised from Playwright's 30s default on measured grounds, not by
       * guessing until it went green.
       *
       * `/untested` renders **195 references over 91 unique targets** (counted
       * against the running app). Each is a real HTTP request, and under the
       * five workers this project runs they cost ~1.7s apiece — so even
       * deduplicated and four-way concurrent the screen needs ~40s. It cannot
       * fit in 30s in any arrangement, and the 30s failure said "Test timeout"
       * while meaning "this screen has more references than the default budget",
       * which reads as a broken product.
       *
       * The assertions are untouched: every one of the 91 targets is still
       * fetched and still required to answer under 400. What changed is only the
       * wall-clock the harness allows. 120s is ~3x the measured need, so an
       * actual regression still fails rather than creeping under the wire.
       */
      test.setTimeout(120_000);

      await page.goto(route);

      /**
       * ## The PASS CONDITION changed here on 2026-08-24, and by an agent
       *
       * The two earlier edits to this file were **gathering only, no assertion
       * changed**, and said so. **This one is different and must not be read as
       * the same kind of change: it makes a previously-failing state pass.**
       * Erik authorised it explicitly, in those terms, after being shown what
       * would change and why. B39.
       *
       * **What was wrong.** `/next` and `/bottleneck` were red on every run
       * since 2026-08-20 and neither was a defect: no work item is `pending`
       * and **zero** carry `erik`/`erik_gate`, so those answers are genuinely
       * empty — and **nothing inside the product can populate them**, because
       * there is no create-work-item route. Two rows that can never go green.
       *
       * **Why that is worth fixing rather than tolerating.** B19's rule holds —
       * a skip must never look like a pass. Its mirror is just as real: a gate
       * carrying rows that can never go green is a gate people stop reading,
       * and this file already lost that argument once (see the 2026-08-20 note
       * below on the 30s timeout).
       *
       * **Why this is not "the gate went red so I changed the gate".** The gate
       * is STRICTER after this edit, not looser. Before, an empty answer screen
       * failed for the right reason by accident and no version of empty was
       * ever inspected. Now `accounted-empty` has to EARN the pass: the screen
       * must render `set-aside` counts, every one labelled, every value a
       * non-negative number. An empty screen that accounts for nothing — which
       * is what a genuinely broken answer looks like — now fails on an
       * assertion that did not exist before. A failed read cannot reach that
       * branch at all; it renders the load notice and is caught earlier.
       *
       * **What did NOT change:** every assertion below, and the strict
       * `requirePopulatedOperatorView` used by FR-81, FR-82, FR-55 and FR-84,
       * where empty IS the failure.
       */
      if ((await readOperatorView(page, route)) === "accounted-empty") return;

      /**
       * ## This block was rewritten on 2026-08-20, and by an agent
       *
       * This is a gate file, and this project treats an agent editing one as an
       * integrity violation — "the gate went red so I changed the gate" is the
       * exact shape of the thing that rule exists to stop. **Erik authorised
       * this edit explicitly**, after being shown what would change and why. The
       * record belongs here, not only in `prod.md`.
       *
       * **No assertion was added, removed, weakened or reordered.** Every
       * reference is still checked for an FR-81 kind, a present
       * `data-verify-known`, FR-83's dangling treatment, navigability, a
       * non-empty href, and a sub-400 response. Only the gathering changed:
       *
       * 1. One `evaluateAll` reads every reference's attributes in a single
       *    round trip, instead of four round trips per reference.
       * 2. Target URLs are deduplicated — an answer screen names the same
       *    requirement many times — and fetched concurrently, not one by one.
       *
       * **Why it needed changing.** On `/untested` the serial version issued
       * ~300 sequential requests and blew the 30s timeout. That was never a
       * product defect: the detail routes answer in 35–120ms, measured against
       * the running app. It was a red row that meant nothing, and a gate
       * carrying a known-meaningless red is a gate nobody reads — which costs
       * more than the row it protects.
       */
      const seen = await page.locator(REF).evaluateAll((nodes) =>
        nodes.map((el) => ({
          kind: el.getAttribute("data-verify-kind"),
          name: el.getAttribute("data-verify-ref"),
          known: el.getAttribute("data-verify-known"),
          treatment: el.getAttribute("data-verify-treatment"),
          insideAnchor: el.closest("a") !== null,
          href: el.closest("a")?.getAttribute("href") ?? "",
        })),
      );

      // FR-80 says "every entity reference rendered on any screen". A populated
      // answer screen with none has not adopted the contract — which reads
      // identical to a screen that is perfectly navigable, so it must fail.
      expect(seen.length, `${route} rendered no ${REF} at all`).toBeGreaterThan(0);

      /** href -> every reference label pointing at it, so a failure names a place. */
      const targets = new Map<string, string[]>();

      for (const ref of seen) {
        const where = `${route} → ${ref.kind}:${ref.name}`;

        expect(ENTITY_KINDS, `${where} names a kind FR-81 does not`).toContain(ref.kind);
        expect(["true", "false"], `${where} left data-verify-known absent`).toContain(ref.known);

        if (ref.known === "false") {
          // FR-83, the whole of it: "renders in FR-12's dangling-reference
          // treatment and is never a link. It is not a 404, not a search, and
          // not silently plain text."
          expect(ref.insideAnchor, `${where} dangles and is a link anyway`).toBe(false);
          expect(ref.treatment, `${where} dangles without FR-12's treatment`).toBe("dangling");
          continue;
        }

        expect(ref.insideAnchor, `${where} resolves and is not navigable`).toBe(true);
        expect(ref.href, `${where} is an anchor with no href`).not.toBe("");

        const existing = targets.get(ref.href);
        if (existing === undefined) targets.set(ref.href, [where]);
        else existing.push(where);
      }

      /**
       * Deduplicated, and concurrent **with a bound**. Same URLs, same sub-400
       * assertion.
       *
       * The bound is the part worth explaining, because the first version of
       * this fix omitted it and was measurably worse than the serial code it
       * replaced — 7 failures where there had been 3. An unbounded `Promise.all`
       * over ~80 unique targets fires all of them at once, and the gate runs
       * against a single-process `next dev` that compiles routes on demand, with
       * five Playwright workers already sharing it. The flood starved the other
       * workers, so screens that had passed comfortably began timing out. Making
       * a gate faster is not the goal; making it *truthful* is, and a fix that
       * introduces new red rows has failed at that regardless of its speed.
       */
      const POOL = 4;
      const hrefs = [...targets.keys()];
      const answered: { href: string; status: number }[] = [];

      for (let i = 0; i < hrefs.length; i += POOL) {
        const batch = await Promise.all(
          hrefs.slice(i, i + POOL).map(async (href) => ({
            href,
            status: (await request.get(href)).status(),
          })),
        );
        answered.push(...batch);
      }

      for (const { href, status } of answered) {
        const where = (targets.get(href) as string[]).join(", ");
        expect(status, `${where} links to ${href}, which answered`).toBeLessThan(400);
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
