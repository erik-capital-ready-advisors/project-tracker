import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { UnparsedBreakdown } from "@/components/unparsed-breakdown";

afterEach(cleanup);

const strip = (container: HTMLElement) =>
  container.querySelector("[data-verify-unit='unparsed-breakdown']");

/**
 * FR-58's rule, in the one component that could most easily break it.
 *
 * The failure this guards is not a wrong number, it is a **clean-looking**
 * number. `0 unparsed in the ledger` is a positive claim that the system
 * classified everything it was given; rendering it for a count that was never
 * read makes that claim without checking, which is the founding failure of this
 * product expressed as a string.
 */

describe("the three states are three", () => {
  it("renders an unknown total as unavailable and publishes no count", () => {
    const { container } = render(
      <UnparsedBreakdown
        census={{ total: null, workItems: null, defects: null, testResults: null }}
      />,
    );
    const el = strip(container);
    expect(el).toHaveAttribute("data-verify-state", "unknown");
    // Absent, not zero: an assertion must not be able to read this as a count.
    expect(el).not.toHaveAttribute("data-verify-total");
    expect(el?.textContent).toContain("unavailable");
    expect(el?.textContent).not.toContain("0 unparsed in the ledger");
  });

  it("renders a genuine zero as a stated claim", () => {
    const { container } = render(
      <UnparsedBreakdown
        census={{ total: 0, workItems: 0, defects: 0, testResults: 0 }}
      />,
    );
    const el = strip(container);
    expect(el).toHaveAttribute("data-verify-state", "zero");
    expect(el).toHaveAttribute("data-verify-total", "0");
  });

  it("renders a non-zero total in the reserved colour", () => {
    const { container } = render(
      <UnparsedBreakdown
        census={{ total: 7, workItems: 4, defects: 2, testResults: 1 }}
      />,
    );
    const el = strip(container);
    expect(el).toHaveAttribute("data-verify-state", "nonzero");
    expect(el).toHaveAttribute("data-verify-total", "7");
    expect(el?.className).toContain("state-unparsed");
  });

  it("does not paint a zero or unknown total in the reserved colour", () => {
    // Fuchsia means "the system could not classify something". A zero has
    // classified everything and an unknown has classified nothing knowingly —
    // neither is the thing fuchsia names.
    const zero = render(
      <UnparsedBreakdown
        census={{ total: 0, workItems: 0, defects: 0, testResults: 0 }}
      />,
    );
    expect(strip(zero.container)?.className).not.toContain("state-unparsed");
    cleanup();

    const unknown = render(
      <UnparsedBreakdown
        census={{ total: null, workItems: null, defects: null, testResults: null }}
      />,
    );
    expect(strip(unknown.container)?.className).not.toContain("state-unparsed");
  });
});

describe("the per-table breakdown", () => {
  it("names all three tables the census counts", () => {
    const { container } = render(
      <UnparsedBreakdown
        census={{ total: 7, workItems: 4, defects: 2, testResults: 1 }}
      />,
    );
    const parts = [
      ...container.querySelectorAll("[data-verify-unit='unparsed-part']"),
    ].map((el) => [
      el.getAttribute("data-verify-part"),
      el.getAttribute("data-verify-count"),
    ]);
    expect(parts).toEqual([
      ["workItems", "4"],
      ["defects", "2"],
      ["testResults", "1"],
    ]);
  });

  it("adds up to the total it displays", () => {
    // Two numbers for the same state is the failure the shared definition
    // exists to end. If the parts and the total ever disagree, the reader has
    // no way to know which to believe.
    const census = { total: 7, workItems: 4, defects: 2, testResults: 1 };
    const { container } = render(<UnparsedBreakdown census={census} />);
    const parts = [
      ...container.querySelectorAll("[data-verify-unit='unparsed-part']"),
    ].map((el) => Number(el.getAttribute("data-verify-count")));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(
      Number(strip(container)?.getAttribute("data-verify-total")),
    );
  });

  it("shows an uncounted part as absent rather than as zero", () => {
    const { container } = render(
      <UnparsedBreakdown
        census={{ total: null, workItems: 4, defects: null, testResults: 1 }}
      />,
    );
    const defects = container.querySelector(
      "[data-verify-unit='unparsed-part'][data-verify-part='defects']",
    );
    expect(defects).not.toHaveAttribute("data-verify-count");
    expect(defects?.textContent).toContain("—");
    // And the total stays unknown rather than becoming the partial sum of 5.
    expect(strip(container)).toHaveAttribute("data-verify-state", "unknown");
  });
});
