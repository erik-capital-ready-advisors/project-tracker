import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ListingUnparsed } from "@/app/work-items/_components/listing-unparsed";

afterEach(cleanup);

/**
 * FR-58 for the rows on screen.
 *
 * Three display states, deliberately never two. The one that matters is
 * `unknown`: "0 unparsed on this page" is a positive claim that every row
 * classified, and making it about a page that was never read is precisely the
 * failure FR-58 exists to prevent.
 */

function read(count: number | null) {
  const { container } = render(<ListingUnparsed count={count} />);
  return container.querySelector("[data-verify-unit='listing-unparsed']");
}

describe("ListingUnparsed", () => {
  it("never renders an unknown count as zero", () => {
    const element = read(null);
    expect(element?.getAttribute("data-verify-state")).toBe("unknown");
    expect(element?.getAttribute("data-verify-count")).toBeNull();
    expect(element?.textContent).toContain("unavailable");
    expect(element?.textContent).not.toContain("0 unparsed");
  });

  it("states a real zero rather than hiding it", () => {
    // The absence of a warning has to be a statement, not a blank.
    const element = read(0);
    expect(element?.getAttribute("data-verify-state")).toBe("zero");
    expect(element?.getAttribute("data-verify-count")).toBe("0");
    expect(element?.textContent).toContain("0 unparsed on this page");
  });

  it("reserves the fuchsia treatment for a non-zero count", () => {
    expect(read(3)?.className).toContain("state-unparsed");
    expect(read(0)?.className).not.toContain("state-unparsed");
    expect(read(null)?.className).not.toContain("state-unparsed");
  });

  it("renders the three states distinguishably", () => {
    const rendered = [read(null), read(0), read(2)].map(
      (element) => element?.className ?? "",
    );
    expect(new Set(rendered).size).toBe(3);
  });
});
