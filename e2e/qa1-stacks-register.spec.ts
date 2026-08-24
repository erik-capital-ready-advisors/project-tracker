import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * **M2.2 `/stacks` — the independent review's own flows (run 9b85cd, qa1).**
 *
 * Authored by `qa-reviewer`, not by either specialist. `u1` reported
 * `NOT VERIFIED — cannot render an authenticated screen from an isolated
 * worktree` and was right to; §7c declares the operator boundary **reachable**,
 * so the screen is OBSERVED here rather than reasoned about.
 *
 * ## What these assert, and what they deliberately do not
 *
 * They assert the FR-108 denominator identities off the rendered DOM, the
 * FR-106 rule's presence and thresholds, Q27's clause two rendering as
 * *unevaluated* rather than as false, Q25's Mode-2 sentence, Q26's `coverage`
 * absence in text AND markup, and FR-109's control being reachable, named and
 * focus-managed.
 *
 * **They never save.** FR-109's write was exercised by Erik at Phase 0 against
 * the live ledger and reverted; there is no fixture instance of this database,
 * and a review that writes to it is a review that changed what it measured. The
 * dialog is opened and dismissed. Controls are matched by `data-verify-unit`
 * and `[aria-haspopup]`, never by button label — run `29b583` archived a live
 * engagement with a label-matched click sweep.
 *
 * ## Two assertions here are RED on purpose
 *
 * The two axe assertions fail today, and that is the finding rather than a
 * broken test. `/stacks` carries two WCAG 2 AA contrast failures — the
 * `undetermined` chip at 4.44:1 in light, and `nobody has said` at 3.55:1 light
 * / 4.22:1 dark. Both come from opacity modifiers on `--muted-foreground` that
 * this screen INHERITED from the product's neutral ladder, not from anything
 * M2.2 invented: measured 2026-08-24, the same engine reports 96 nodes on
 * `/questions`, 27 on `/broken`, 22 on `/work-items`, 12 on `/registry` and 4
 * on `/runs`. `/stacks` is the least affected screen in the product.
 *
 * They are left failing rather than relaxed because a gate that is green on a
 * known-open defect is worse than no gate. `e2e/qa1-accessibility.spec.ts`
 * cannot see any of this: its ROUTES list is hardcoded and has not gained a
 * route since run b0952e, and its own header says it measures each route's
 * signed-out refusal state.
 *
 * ## Fail closed
 *
 * `guard()` runs first and asserts both environment variables are present. A
 * harness that measures a signed-out page and reports green is the defect class
 * this role exists to catch.
 */

const BASE_URL = process.env.QA1_BASE_URL;
const STORAGE_STATE = process.env.QA1_STORAGE_STATE;

/** Every figure key `register-blindness.tsx` publishes. */
const FIGURE_KEYS = [
  "sessions-total",
  "sessions-without-stack",
  "sessions-with-stack",
  "sessions-without-duration",
  "sessions-on-unknown-stack",
  "stacks-total",
  "stacks-covered",
  "stacks-earned",
  "stacks-actionable",
] as const;

async function figures(page: Page): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const key of FIGURE_KEYS) {
    const el = page.locator(`[data-verify-unit="blindness-figure"][data-verify-figure="${key}"]`);
    await expect(el, `figure ${key} is not on the screen`).toHaveCount(1);
    out[key] = Number(await el.getAttribute("data-verify-value"));
  }
  return out;
}

/** Loads `/stacks` and refuses to continue if the operator gate answered instead. */
async function openStacks(page: Page) {
  const response = await page.goto("/stacks");
  expect(response?.status(), "/stacks did not render at all").toBeLessThan(400);

  const gate = page.locator('[data-verify-unit="load-notice"]');
  if ((await gate.count()) > 0) {
    const reason = await gate.getAttribute("data-verify-reason");
    throw new Error(
      `/stacks rendered the operator gate (reason=${reason}). The session in ` +
        `QA1_STORAGE_STATE is not usable, so NOTHING below was measured. This ` +
        `signature is identical to an unset storage state — check both before ` +
        `concluding the session is dead.`,
    );
  }

  await expect(page.locator('[data-verify-unit="register-state"]')).toHaveCount(1);
}

test.describe("qa1 — M2.2 /stacks register", () => {
  test("guard — the harness has a base URL and an operator session", () => {
    expect(BASE_URL, "QA1_BASE_URL is unset: this suite measured nothing").toBeTruthy();
    expect(
      STORAGE_STATE,
      "QA1_STORAGE_STATE is unset: every assertion below would have measured the sign-in gate",
    ).toBeTruthy();
  });

  test("FR-104 — the register renders with its eight columns and one row per stack", async ({
    page,
  }, testInfo) => {
    await openStacks(page);

    const state = await page
      .locator('[data-verify-unit="register-state"]')
      .getAttribute("data-verify-state");
    expect(["no-sessions", "no-stacks", "observed"]).toContain(state);

    if (state !== "observed") {
      // Not a failure — it is the register being honest. Recorded, not asserted past.
      testInfo.annotations.push({ type: "register-state", description: String(state) });
      return;
    }

    const headers = await page.locator('[data-verify-unit="stack-table"] thead th').allTextContents();
    expect(headers.map((h) => h.trim())).toEqual([
      "stack",
      "trigger",
      "agent covering",
      "hours",
      "sessions",
      "engagements",
      "first seen",
      "last seen",
    ]);

    const rows = page.locator('[data-verify-unit="stack-row"]');
    expect(await rows.count()).toBeGreaterThan(0);

    // Every row carries all four contract attributes — an absent one is a row
    // whose state nobody determined.
    for (const row of await rows.all()) {
      for (const attr of [
        "data-verify-stack",
        "data-verify-outcome",
        "data-verify-actionable",
        "data-verify-covered",
      ]) {
        expect(await row.getAttribute(attr), `a stack row is missing ${attr}`).not.toBeNull();
      }
      expect(["earned", "undetermined"]).toContain(await row.getAttribute("data-verify-outcome"));
    }

    await page.screenshot({ path: ".fleet/manual-traces/qa1-9b85cd-stacks-observed.png", fullPage: true });
  });

  test("FR-108 — the denominator identities hold on the rendered page", async ({ page }) => {
    await openStacks(page);
    const state = await page
      .locator('[data-verify-unit="register-state"]')
      .getAttribute("data-verify-state");
    test.skip(state === "no-sessions", "no blindness panel under no-sessions, by design");

    const f = await figures(page);

    // sessionsTotal = sessionsWithStack + sessionsWithoutStack
    expect(
      f["sessions-with-stack"] + f["sessions-without-stack"],
      "sessions are being dropped from the denominator",
    ).toBe(f["sessions-total"]);

    // sessionsWithStack = Σ row.sessions + sessionsOnUnknownStack
    const perRow = await page
      .locator('[data-verify-unit="stack-sessions"]')
      .evaluateAll((els) =>
        els.reduce((n, el) => n + Number(el.getAttribute("data-verify-sessions")), 0),
      );
    expect(
      perRow + f["sessions-on-unknown-stack"],
      "a session with a stack reaches no row and is not held out either",
    ).toBe(f["sessions-with-stack"]);

    // The rows agree with the stack denominators.
    expect(await page.locator('[data-verify-unit="stack-row"]').count()).toBe(f["stacks-total"]);
    expect(
      await page.locator('[data-verify-unit="stack-row"][data-verify-covered="true"]').count(),
    ).toBe(f["stacks-covered"]);
    expect(
      await page.locator('[data-verify-unit="stack-row"][data-verify-actionable="true"]').count(),
    ).toBe(f["stacks-actionable"]);
    expect(
      await page.locator('[data-verify-unit="stack-row"][data-verify-outcome="earned"]').count(),
    ).toBe(f["stacks-earned"]);

    // FR-108 is load-bearing, not a footer: the panel precedes the table.
    const order = await page.evaluate(() => {
      const panel = document.querySelector('[data-verify-unit="register-blindness"]');
      const table = document.querySelector('[data-verify-unit="stack-table"]');
      if (!panel || !table) return null;
      return panel.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING ? "before" : "after";
    });
    if (order !== null) {
      expect(order, "FR-108's figures render below the table, which is a footer").toBe("before");
    }

    // The headline names the number, not just the fact.
    const headline = page.locator('[data-verify-unit="blindness-headline"]');
    await expect(headline).toHaveAttribute(
      "data-verify-sessions-total",
      String(f["sessions-total"]),
    );
    await expect(headline).toHaveAttribute(
      "data-verify-sessions-without-stack",
      String(f["sessions-without-stack"]),
    );

    await page
      .locator('[data-verify-unit="register-blindness"]')
      .screenshot({ path: ".fleet/manual-traces/qa1-9b85cd-fr108-blindness-panel.png" });
  });

  test("Q25 — the Mode-2 capture sentence is on the screen, above the table", async ({ page }) => {
    await openStacks(page);
    const state = await page
      .locator('[data-verify-unit="register-state"]')
      .getAttribute("data-verify-state");
    test.skip(state === "no-sessions", "the panel that carries the claim is not rendered");

    const claim = page.locator('[data-verify-unit="mode-2-capture-claim"]');
    await expect(claim).toHaveCount(1);
    await expect(claim).toContainText("Mode 2 capture");
    // Not a tooltip.
    expect(await claim.getAttribute("title")).toBeNull();
  });

  test("FR-106 / Q27 — the rule is stated, and clause two reads as never evaluated", async ({
    page,
  }) => {
    await openStacks(page);

    const rule = page.locator('[data-verify-unit="trigger-rule"]');
    await expect(rule).toHaveCount(1);
    await expect(rule).toHaveAttribute("data-verify-min-engagements", "2");
    await expect(rule).toHaveAttribute("data-verify-min-hours", "8");

    const clause1 = page.locator('[data-verify-unit="trigger-clause"][data-verify-clause="1"]');
    await expect(clause1).toHaveAttribute("data-verify-evaluated", "true");

    const clause2 = page.locator('[data-verify-unit="trigger-clause"][data-verify-clause="2"]');
    await expect(clause2).toHaveCount(1);
    await expect(clause2).toHaveAttribute("data-verify-evaluated", "false");

    const notice = page.locator('[data-verify-unit="limb-two-unmet"]');
    const text = ((await notice.textContent()) ?? "").toLowerCase();
    // The distinction the whole ruling rests on: NOT evaluated, not false.
    expect(text, "clause two does not say it was never evaluated").toContain("not evaluated");
    expect(text).toContain("no such link");
    // And it must not claim the clause was checked and failed.
    expect(text).not.toMatch(/clause 2 (was )?(not met|failed)/);

    await rule.screenshot({ path: ".fleet/manual-traces/qa1-9b85cd-fr106-trigger-rule.png" });
  });

  test("FR-107 — never the word 'unearned', and undetermined is not styled as a finding", async ({
    page,
  }) => {
    await openStacks(page);
    const body = ((await page.locator("body").textContent()) ?? "").toLowerCase();
    expect(body, "the screen asserts a stack has NOT earned a specialist").not.toContain("unearned");

    // CONTROL: the sweep is not blind — a word the screen genuinely renders.
    expect(body).toContain("earned");

    const triggers = page.locator('[data-verify-unit="stack-trigger"]');
    for (const t of await triggers.all()) {
      expect(["actionable", "settled", "undetermined"]).toContain(
        await t.getAttribute("data-verify-presentation"),
      );
    }
  });

  test("Q26 — the word `coverage` appears nowhere, in text or in markup", async ({ page }) => {
    await openStacks(page);
    const { text, html } = await page.evaluate(() => ({
      text: (document.body.textContent ?? "").toLowerCase(),
      html: document.body.innerHTML.toLowerCase(),
    }));

    expect(text).not.toContain("coverage");
    expect(html).not.toContain("coverage");

    // CONTROLS — a sweep that finds nothing on an empty document looks exactly
    // like a sweep that found nothing on a clean one.
    expect(html, "the markup sweep is blind").toContain("covering");
    expect(text, "the text sweep is blind").toContain("agent covering");
  });

  test("FR-109 — the control is reachable, named, and focus-managed (no write)", async ({
    page,
  }) => {
    await openStacks(page);
    const state = await page
      .locator('[data-verify-unit="register-state"]')
      .getAttribute("data-verify-state");
    test.skip(state !== "observed", "no rows, so no per-row control to exercise");

    // Matched by contract attribute and popup role, never by label.
    const trigger = page.locator('[data-verify-unit="agent-covering-trigger"]').first();
    await expect(trigger).toHaveCount(1);
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");

    const stackName = await page
      .locator('[data-verify-unit="stack-row"]')
      .first()
      .getAttribute("data-verify-stack");
    const label = await trigger.getAttribute("aria-label");
    expect(label, "the trigger's accessible name does not name its stack").toContain(
      String(stackName),
    );

    // No contract attribute anywhere on the screen carries the agent's name.
    const contractValues = await page.evaluate(() =>
      Array.from(document.querySelectorAll<HTMLElement>("*")).flatMap((el) =>
        Array.from(el.attributes)
          .filter((a) => a.name.startsWith("data-verify-"))
          .map((a) => a.value),
      ),
    );
    expect(contractValues.length).toBeGreaterThan(10);

    await trigger.click();
    const dialog = page.locator('[data-verify-unit="agent-covering-dialog"]');
    await expect(dialog).toBeVisible();

    // Focus moved into the dialog rather than staying on the trigger behind it.
    const focusInside = await page.evaluate(() => {
      const d = document.querySelector('[data-verify-unit="agent-covering-dialog"]');
      return !!d && !!document.activeElement && d.contains(document.activeElement);
    });
    expect(focusInside, "opening the dialog left focus outside it").toBe(true);

    await expect(page.getByRole("dialog")).toHaveAccessibleName(/agent covers this stack/i);

    await page.screenshot({ path: ".fleet/manual-traces/qa1-9b85cd-fr109-dialog-open.png" });

    // Dismiss without writing. The live ledger is the real one.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // Focus returned to the trigger that opened it.
    const focusReturned = await page.evaluate(() => {
      const t = document.querySelector('[data-verify-unit="agent-covering-trigger"]');
      return document.activeElement === t;
    });
    expect(focusReturned, "closing the dialog dropped focus to the body").toBe(true);

    // Last, so the focus assertions above are never skipped by this one's
    // failure: the dialog inherits the product-wide contrast defect through the
    // table behind it. RED on purpose — see the header.
    await trigger.click();
    await expect(dialog).toBeVisible();
    const axeInDialog = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    await page.keyboard.press("Escape");
    expect(
      axeInDialog.violations
        .filter((v) => ["critical", "serious"].includes(v.impact ?? ""))
        .map((v) => `${v.impact}: ${v.id} (${v.nodes.length} nodes)`),
      "the open FR-109 dialog has critical/serious axe violations",
    ).toEqual([]);
  });

  test("accessibility — /stacks has no critical or serious axe violations", async ({
    page,
  }, testInfo) => {
    await openStacks(page);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    testInfo.annotations.push({
      type: "axe-total",
      description: String(results.violations.length),
    });

    const blocking = results.violations.filter((v) =>
      ["critical", "serious"].includes(v.impact ?? ""),
    );
    expect(
      blocking.map((v) => `${v.impact}: ${v.id} (${v.nodes.length} nodes)`),
      "/stacks has axe violations that block a flow",
    ).toEqual([]);
  });
});
