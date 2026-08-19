import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UnparsedCount } from "@/components/unparsed-count";
import {
  unparsedLabel,
  unparsedState,
  unparsedVerifyCount,
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
