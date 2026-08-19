import { expect, test } from "@playwright/test";

/**
 * FR-4 and FR-7 in the running production build, plus the assertion this screen
 * exists to make impossible to fail quietly.
 *
 * ## The leak check is the point of this file
 *
 * §7a: `agent_token` is `sensitive` -- "operator only; **never returned by any
 * read endpoint**", and the plaintext is "shown once at creation and never
 * stored". A regression that put a token value into the page -- a debug
 * attribute, a serialised prop, an error message quoting the row -- would be
 * invisible to every other test in this repo and catastrophic. So this suite
 * greps the whole served document for the token prefix and for anything shaped
 * like a secret segment.
 *
 * **No real token is created, typed, or asserted on here.** The check looks for
 * a *shape*, and passes precisely because nothing of that shape is present.
 */

/** `dl_<uuid>_<64 hex>` -- the shape `mintAgentToken` produces. */
const TOKEN_SHAPE = /dl_[0-9a-f-]{36}_[0-9a-f]{64}/i;
/** The secret segment on its own, in case a prefix were ever stripped. */
const SECRET_SHAPE = /\b[0-9a-f]{64}\b/i;

test.describe("FR-4 / FR-7 agent tokens", () => {
  test("renders, and states the unparsed count", async ({ page }) => {
    const response = await page.goto("/settings/tokens");
    expect(response?.status()).toBeLessThan(400);
    await expect(
      page.locator("[data-verify-unit='unparsed-count']").first(),
    ).toBeVisible();
  });

  test("a refused read renders a refusal and NOT an empty state", async ({
    page,
  }) => {
    await page.goto("/settings/tokens");

    const notice = page.locator("[data-verify-unit='load-notice']");
    await expect(notice).toBeVisible();
    await expect(notice).toHaveAttribute(
      "data-verify-reason",
      /sign-in|mfa|no-role|error/,
    );

    // "No agent tokens issued." is a claim that nobody holds a credential. It
    // must not be made by a screen that could not read the table.
    await expect(page.locator("[data-verify-unit='empty-state']")).toHaveCount(0);
    await expect(page.getByText("No agent tokens issued.")).toHaveCount(0);
  });

  test("§7a — nothing token-shaped appears anywhere in the served document", async ({
    page,
  }) => {
    await page.goto("/settings/tokens");

    const html = await page.content();
    expect(html).not.toMatch(TOKEN_SHAPE);
    expect(html).not.toMatch(SECRET_SHAPE);
    expect(html).not.toContain("token_hash");
  });

  test("§7a — no data-verify attribute carries anything token-shaped", async ({
    page,
  }) => {
    await page.goto("/settings/tokens");

    const values = await page.evaluate(() =>
      Array.from(document.querySelectorAll("*")).flatMap((element) =>
        Array.from(element.attributes)
          .filter((attribute) => attribute.name.startsWith("data-verify-"))
          .map((attribute) => attribute.value),
      ),
    );

    for (const value of values) {
      expect(value).not.toMatch(TOKEN_SHAPE);
      expect(value).not.toMatch(SECRET_SHAPE);
    }
  });

  test("offers no affordance that claims to show a stored token again", async ({
    page,
  }) => {
    await page.goto("/settings/tokens");
    // There is nothing to reveal: the value is not in the database. A control
    // implying otherwise would be a promise the system cannot keep.
    await expect(page.getByRole("button", { name: /reveal/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /show token/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /copy token/i })).toHaveCount(0);
  });
});
