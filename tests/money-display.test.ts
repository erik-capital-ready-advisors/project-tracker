import { describe, expect, it } from "vitest";

import { money } from "@/lib/money-display";

describe("money", () => {
  it("formats identically regardless of the ambient locale", () => {
    // The reason this module exists. A server render and a browser rehydrate
    // must produce the same string, and `1.250,00` vs `1,250.00` is a factor of
    // a thousand read wrong at a glance.
    // U+202F narrow no-break space between groups: it cannot be confused with a
    // decimal comma, and it does not widen the monospace column.
    expect(money(1250, "EUR")).toBe("1 250.00 EUR");
    expect(money(1250000, "USD")).toBe("1 250 000.00 USD");
  });

  it("keeps zero and unreadable apart", () => {
    // One of these is a number Erik would put on an invoice.
    expect(money(0, "EUR")).toBe("0.00 EUR");
    expect(money(null, "EUR")).toBeNull();
    expect(money(undefined, "EUR")).toBeNull();
  });

  it("returns null for a non-finite value rather than printing NaN", () => {
    expect(money(Number.NaN, "EUR")).toBeNull();
    expect(money(Number.POSITIVE_INFINITY, "EUR")).toBeNull();
  });

  it("never emits a three-digit cent field", () => {
    // A hand-rolled `Math.round((n - floor(n)) * 100)` can produce 100 and print
    // `1.100`. This asserts the shape rather than a particular rounding, because
    // the rounding is the platform's and float64 already decided it upstream:
    // `1.005` is stored as slightly less than 1.005 and correctly renders 1.00.
    for (const value of [1.005, 0.999, 2.675, 1e6 - 0.005]) {
      expect(money(value, "EUR")).toMatch(/^[\d ]+\.\d{2} EUR$/);
    }
    expect(money(0.999, "EUR")).toBe("1.00 EUR");
  });

  it("keeps a negative sign", () => {
    expect(money(-500, "EUR")).toBe("-500.00 EUR");
  });

  it("pads a single-digit cent value", () => {
    expect(money(10.5, "EUR")).toBe("10.50 EUR");
    expect(money(10.05, "EUR")).toBe("10.05 EUR");
  });
});
