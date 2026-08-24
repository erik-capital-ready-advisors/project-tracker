import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UnparsedCount } from "@/components/unparsed-count";
import {
  unparsedLabel,
  unparsedShortLabel,
  unparsedState,
  unparsedVerifyCount,
  unparsedVerifyScope,
} from "@/lib/unparsed-display";

/**
 * FR-45: a test declares the requirements it covers by naming them in its own
 * title, and the product reads that mapping out of these files. Every test
 * title in this repo therefore opens with the ref it covers.
 */

afterEach(cleanup);

describe("unparsed display semantics (FR-58)", () => {
  it("FR-58 unparsed count renders zero state rather than hiding", () => {
    render(<UnparsedCount count={0} />);
    const el = screen.getByRole("status");

    expect(el).toHaveTextContent("0 unparsed");
    expect(el).toHaveAttribute("data-verify-state", "zero");
    expect(el).toHaveAttribute("data-verify-count", "0");
  });

  it("FR-58 unparsed count renders a non-zero count distinctly from zero", () => {
    render(<UnparsedCount count={7} />);
    const el = screen.getByRole("status");

    expect(el).toHaveTextContent("7 unparsed");
    expect(el).toHaveAttribute("data-verify-state", "nonzero");
    expect(el).toHaveAttribute("data-verify-count", "7");
    // The distinction has to be visible, not only semantic: the non-zero
    // treatment carries the fuchsia state colour that appears nowhere else.
    expect(el.className).toContain("text-state-unparsed");
  });

  it("FR-58 an unknown unparsed count never renders as zero", () => {
    render(<UnparsedCount count={null} />);
    const el = screen.getByRole("status");

    expect(el).toHaveAttribute("data-verify-state", "unknown");
    expect(el).not.toHaveAttribute("data-verify-count");
    expect(el.textContent).not.toMatch(/\b0\b/);
    expect(el).toHaveTextContent("unavailable");
  });

  it("FR-58 classifies counts without collapsing unknown into zero", () => {
    expect(unparsedState(0)).toBe("zero");
    expect(unparsedState(1)).toBe("nonzero");
    expect(unparsedState(null)).toBe("unknown");
    expect(unparsedState(undefined)).toBe("unknown");
    // Nonsense is unknown, never clamped to a clean-looking zero.
    expect(unparsedState(-1)).toBe("unknown");
    expect(unparsedState(Number.NaN)).toBe("unknown");

    expect(unparsedLabel(0)).toBe("0 unparsed");
    expect(unparsedLabel(3)).toBe("3 unparsed");
    expect(unparsedLabel(null)).toBe("unparsed count unavailable");

    expect(unparsedVerifyCount(0)).toBe(0);
    expect(unparsedVerifyCount(null)).toBeNull();
  });
});

/**
 * FR-96a — the count stays ledger-wide under an engagement filter and labels
 * itself as such.
 *
 * The failure it prevents is on the record: M2.8 logged a run's own unparsed
 * count disagreeing with the global badge (badge 0, run `b0952e` 1). A filtered
 * list under an unlabelled global count is that same disagreement one layer up.
 *
 * Whether a filter IS active is `EngagementScope`'s question, tested in
 * `tests/engagement-scope.test.tsx`. This describes only what the label does
 * once it is told.
 */
describe("FR-96a the ledger-wide count says so under a filter", () => {
  it("FR-96a appends the scope to a counted label at both widths", () => {
    expect(unparsedLabel(3, "whole-ledger")).toBe("3 unparsed (whole ledger)");
    // Zero needs it most: "0 unparsed" over a filtered list reads as "this
    // engagement is clean", which is a claim about a scope nothing counted.
    expect(unparsedLabel(0, "whole-ledger")).toBe("0 unparsed (whole ledger)");
    // The compact form carries it too. Dropping it below `sm` would leave the
    // narrow viewport with exactly the misreading this requirement exists to
    // stop, which is not a width the failure gets a pass at.
    expect(unparsedShortLabel(3, "whole-ledger")).toBe(
      "3 unparsed (whole ledger)",
    );
  });

  it("FR-96a leaves every unfiltered label byte-identical", () => {
    // The default is the whole of FR-58's existing behaviour, unchanged. If
    // this drifts, every surface's wording changed for a filter nobody set.
    expect(unparsedLabel(3, "none")).toBe(unparsedLabel(3));
    expect(unparsedLabel(0, "none")).toBe(unparsedLabel(0));
    expect(unparsedShortLabel(null, "none")).toBe(unparsedShortLabel(null));
  });

  it("FR-96a attaches no scope to a count that does not exist", () => {
    // "unparsed count unavailable (whole ledger)" scopes a missing number.
    // There is nothing here to be misread as scoped, and B12's three states
    // stay three.
    expect(unparsedLabel(null, "whole-ledger")).toBe(
      "unparsed count unavailable",
    );
    expect(unparsedShortLabel(null, "whole-ledger")).toBe(
      unparsedShortLabel(null),
    );
    expect(unparsedVerifyScope(null, "whole-ledger")).toBe("none");
    expect(unparsedVerifyScope(3, "whole-ledger")).toBe("whole-ledger");
    expect(unparsedVerifyScope(3, "none")).toBe("none");
  });

  it("FR-96a never changes the number, only what the label says about it", () => {
    render(<UnparsedCount count={3} scope="whole-ledger" />);
    const el = screen.getByRole("status");

    // The count is ledger-wide with or without the label. Scoping it to the
    // filter is the move this requirement explicitly forbids.
    expect(el).toHaveAttribute("data-verify-count", "3");
    expect(el).toHaveAttribute("data-verify-state", "nonzero");
    expect(el).toHaveAttribute("data-verify-scope", "whole-ledger");
    expect(el).toHaveTextContent("3 unparsed (whole ledger)");
  });
});

/**
 * The 375px header fix.
 *
 * The badge was `shrink-0` at 222px wide, which overflowed the app shell's
 * header by 46px at 375px **on every route in the product** — measured on
 * `/work-items` and `/blocked` alike. The fix shortens the one state whose
 * label is long and lets the badge shrink.
 *
 * These tests exist because the tempting fixes are both wrong in the same way:
 * hiding the badge below a breakpoint suppresses the count FR-58 requires on
 * every surface, and ellipsis-truncating it cuts the word that carries the
 * whole meaning. Either would still fit in 375px.
 */
describe("FR-58 the compact form keeps the three states three", () => {
  it("FR-58 shortens only the unknown state, and never into a number", () => {
    // The two counted states are already short enough to keep verbatim, so the
    // reader sees the same words at every width.
    expect(unparsedShortLabel(0)).toBe("0 unparsed");
    expect(unparsedShortLabel(7)).toBe("7 unparsed");

    // The unknown state is the one that overflowed. It stays wordless of any
    // digit, so it cannot be read as a count at any width.
    expect(unparsedShortLabel(null)).not.toMatch(/\d/);
    expect(unparsedShortLabel(null)).not.toBe(unparsedShortLabel(0));
    expect(unparsedShortLabel(undefined)).toBe(unparsedShortLabel(null));
  });

  it("FR-58 renders both spellings so one is visible at each width", () => {
    render(<UnparsedCount count={null} />);
    const el = screen.getByRole("status");

    // Both are in the DOM; CSS picks one per breakpoint, and `display: none` is
    // not announced, so a screen reader hears exactly one.
    const spans = [...el.querySelectorAll("span")].map((s) => s.textContent);
    expect(spans).toContain(unparsedShortLabel(null));
    expect(spans).toContain(unparsedLabel(null));

    // Exactly one is showing at any width, and the pair is complementary: the
    // short one hides at `sm` and up, the long one hides below it. A substring
    // check for "hidden" matches BOTH of those classes, so it is asserted by
    // exact class rather than by inclusion.
    const classes = [...el.querySelectorAll("span")].map((s) => s.className);
    expect(classes).toContain("sm:hidden");
    expect(classes).toContain("hidden sm:inline");
  });

  it("FR-58 the badge is allowed to shrink rather than forcing the header wide", () => {
    // `shrink-0` is what pinned it at 222px inside a 375px header. Asserting
    // its absence is asserting the actual mechanism of the defect — the
    // measured 0px overflow is recorded in the report, and this is what stops
    // it silently coming back.
    render(<UnparsedCount count={null} />);
    const el = screen.getByRole("status");
    expect(el.className).not.toContain("shrink-0");
    expect(el.className).toContain("min-w-0");
  });

  it("FR-58 still reports the count on every surface, never hidden away", () => {
    // The fix must not suppress the badge on small screens. Hiding it would fit
    // in 375px and would break FR-58's "every surface".
    for (const count of [0, 7, null]) {
      cleanup();
      render(<UnparsedCount count={count} />);
      const el = screen.getByRole("status");
      expect(el.className).not.toMatch(/\bhidden\b/);
      expect(el.textContent?.trim()).not.toBe("");
    }
  });
});
