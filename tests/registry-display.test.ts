// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  describeTotals,
  describeUnknownRefs,
  formatAmount,
  formatDate,
  formatIdentifier,
  joinList,
  MIXED_CURRENCY_TOTAL,
  NOT_RECORDED,
  splitList,
  splitRefs,
  toDateInputValue,
  UNKNOWN_REF_TREATMENT,
} from "@/lib/registry-display";

/**
 * The display rules for the registry, tested where they can go wrong.
 *
 * Every assertion here is about a number or a date that would look right and be
 * wrong: an undecryptable amount shown as `$0`, two currencies added together,
 * an empty engagement described as "mixed currencies", a due date shifted a day
 * by a timezone. Those are the failures this product's own rule names as the
 * worst output available, and they are invisible on inspection.
 */

describe("formatAmount — an amount that did not decrypt is not zero", () => {
  it("renders null as unreadable, never as a currency zero", () => {
    const result = formatAmount(null, "USD");
    expect(result.readable).toBe(false);
    expect(result.text).toBe("unreadable");
    expect(result.text).not.toContain("0");
  });

  it("renders a non-finite amount as unreadable rather than clamping it", () => {
    expect(formatAmount(Number.NaN, "USD").readable).toBe(false);
    expect(formatAmount(Number.POSITIVE_INFINITY, "USD").readable).toBe(false);
  });

  it("renders a real zero as a real zero — the two are different claims", () => {
    const zero = formatAmount(0, "USD");
    expect(zero.readable).toBe(true);
    expect(zero.text).toBe("$0.00");
  });

  it("formats in the stated currency", () => {
    expect(formatAmount(12000, "USD").text).toBe("$12,000.00");
    expect(formatAmount(12000, "EUR").text).toContain("12,000");
  });

  it("keeps the number when the currency code is unrecognised", () => {
    const odd = formatAmount(1500, "ZZZ");
    expect(odd.readable).toBe(true);
    expect(odd.text).toContain("1,500");
    expect(odd.text).toContain("ZZZ");
  });

  /**
   * B32's "subtle" disagreement, pinned directly. Measured with `node -e`
   * against this repo's own `Intl` before writing this test: `ZZZ` is a
   * SYNTACTICALLY well-formed ISO 4217 shape (three letters) that names no
   * real currency, and `Intl.NumberFormat` does not throw for that shape --
   * it treats the code itself as the currency symbol and PREFIXES it, the
   * same position a real symbol like `$` takes. `formatAmount`'s own `catch`
   * branch (built for "an unrecognised currency code is not a reason to drop
   * the number") never fires for a code shaped like this; it fires only for a
   * code `Intl` refuses outright for being the wrong length, which the second
   * test below exercises. A well-formed-but-fictional code is the realistic
   * case a bad ingest would actually produce, and it does not take this
   * module's fallback path at all.
   */
  it("prefixes the code for a well-formed but fictional currency (ZZZ never reaches the catch branch)", () => {
    expect(formatAmount(1500, "ZZZ").text).toBe("ZZZ\u00A01,500.00");
  });

  it("suffixes the code instead, only when Intl refuses the code outright", () => {
    // "US" is two letters -- `Intl.NumberFormat` throws `RangeError` for this
    // shape rather than accepting it as a currency, which is what actually
    // exercises `formatAmount`'s `catch` branch (`${plain} ${currency}`).
    expect(formatAmount(1500, "US").text).toBe("1,500 US");
  });

  it("keeps a negative amount's sign", () => {
    expect(formatAmount(-500, "USD").text).toBe("-$500.00");
  });
});

describe("MIXED_CURRENCY_TOTAL — relocated from the deleted money-display.ts (B32)", () => {
  it("still states why a mixed-currency total prints no figure", () => {
    expect(MIXED_CURRENCY_TOTAL).toContain("not summed");
    expect(MIXED_CURRENCY_TOTAL).toContain("more than one currency");
  });
});

describe("formatDate — a due date must not move", () => {
  it("passes a plain ISO date through untouched", () => {
    // Round-tripping this through `Date` applies the runtime's offset and shows
    // 2026-08-18 west of UTC, which is a contractual date rendered wrong.
    expect(formatDate("2026-08-19")).toBe("2026-08-19");
  });

  it("reduces a zoned timestamp to its ISO date", () => {
    expect(formatDate("2026-08-19T00:00:00.000Z")).toBe("2026-08-19");
  });

  it("does not let the host timezone move a zone-less timestamp", () => {
    // Measured: `new Date("2026-09-01T00:00:00")` reads as LOCAL time, and at
    // UTC+14 `.toISOString()` gives 2026-08-31 — a milestone shown as submitted
    // the day before it was, on some machines and not others. Run the suite
    // under `TZ=Pacific/Kiritimati` to see this assertion bite.
    expect(formatDate("2026-09-01T00:00:00")).toBe("2026-09-01");
    expect(formatDate("2026-09-01T23:30:00.000")).toBe("2026-09-01");
  });

  it("reports absence rather than inventing a date", () => {
    expect(formatDate(null)).toBe(NOT_RECORDED);
    expect(formatDate("   ")).toBe(NOT_RECORDED);
    expect(formatDate("not a date")).toBe(NOT_RECORDED);
  });

  it("gives a date input an empty string rather than the words", () => {
    expect(toDateInputValue(null)).toBe("");
    expect(toDateInputValue("2026-08-19")).toBe("2026-08-19");
  });
});

describe("formatIdentifier — absent is stated, never blank", () => {
  it("reports an absent identifier", () => {
    expect(formatIdentifier(null)).toEqual({ text: NOT_RECORDED, recorded: false });
    expect(formatIdentifier("  ")).toEqual({ text: NOT_RECORDED, recorded: false });
  });

  it("trims a recorded one", () => {
    expect(formatIdentifier(" abcdefgh ")).toEqual({
      text: "abcdefgh",
      recorded: true,
    });
  });
});

describe("list fields", () => {
  it("splits on commas and newlines, trims, and de-duplicates", () => {
    expect(splitList("nextjs, supabase\nvercel, nextjs")).toEqual([
      "nextjs",
      "supabase",
      "vercel",
    ]);
  });

  it("returns nothing for an empty field rather than one empty entry", () => {
    expect(splitList("")).toEqual([]);
    expect(splitList("  ,  \n ")).toEqual([]);
  });

  it("uppercases acceptance refs so casing is never reported as unknown", () => {
    expect(splitRefs("fr-10, FR-11  fr-10")).toEqual(["FR-10", "FR-11"]);
  });

  it("round-trips a list back into its field", () => {
    expect(joinList(splitList("a, b"))).toBe("a, b");
  });
});

describe("describeTotals — the two reasons a total has no currency", () => {
  const base = { committed: 100, submitted: 50, paid: 25, unreadable: 0 };

  it("states a single currency's totals", () => {
    const display = describeTotals({ ...base, currency: "USD" }, 3);
    expect(display.qualifier).toBeNull();
    expect(display.committed).toBe("$100.00");
    expect(display.paid).toBe("$25.00");
  });

  it("distinguishes an engagement with no milestones from mixed currencies", () => {
    // `milestoneTotals()` answers `currency: null` for both. Reporting "mixed
    // currencies" for an engagement that has none is a statement about data
    // that is not there.
    expect(describeTotals({ ...base, currency: null }, 0).qualifier).toBe("empty");
    expect(describeTotals({ ...base, currency: null }, 2).qualifier).toBe("mixed");
  });

  it("refuses to print a figure across mixed currencies", () => {
    const mixed = describeTotals({ ...base, currency: null }, 2);
    expect(mixed.committed).toBe("not summed");
    expect(mixed.submitted).toBe("not summed");
    expect(mixed.paid).toBe("not summed");
  });

  it("carries the unreadable count out rather than folding it into a total", () => {
    const display = describeTotals(
      { ...base, currency: "USD", unreadable: 2 },
      4,
    );
    expect(display.unreadable).toBe(2);
    expect(display.committed).toBe("$100.00");
  });
});

describe("describeUnknownRefs — FR-12 is reported, not swallowed", () => {
  it("says nothing when every reference resolves", () => {
    expect(describeUnknownRefs([])).toBeNull();
  });

  it("names the reference, singular and plural", () => {
    expect(describeUnknownRefs(["FR-99"])).toContain("FR-99");
    expect(describeUnknownRefs(["FR-99"])).toContain("names a requirement");
    expect(describeUnknownRefs(["FR-99", "D-4"])).toContain("FR-99, D-4");
    expect(describeUnknownRefs(["FR-99", "D-4"])).toContain("name requirements");
  });
});

describe("fuchsia is reserved for unparsed", () => {
  it("does not dress a dangling reference in the unparsed colour", () => {
    // A dangling ref parsed perfectly and points at nothing — the opposite of
    // an unparsed record. Fuchsia means one thing in this product.
    expect(UNKNOWN_REF_TREATMENT).not.toContain("unparsed");
    expect(UNKNOWN_REF_TREATMENT).toContain("state-blocked");
  });
});
