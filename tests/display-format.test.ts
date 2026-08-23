// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  duration,
  elapsedDays,
  isoDay,
  isoMinute,
} from "@/lib/display-format";

/**
 * The display formatters, and the one rule they all share: an absent or
 * unreadable value returns `null` rather than a plausible-looking string.
 *
 * `0m` for a session nobody timed, or `1970-01-01` for a date that would not
 * parse, are the display-layer form of rendering an unknown count as zero.
 */

describe("isoDay", () => {
  it("reduces an instant to its UTC calendar day", () => {
    expect(isoDay("2026-08-19T23:30:00.000Z")).toBe("2026-08-19");
    expect(isoDay("2026-08-19")).toBe("2026-08-19");
  });

  it("returns null for absent or unreadable values", () => {
    for (const value of [null, undefined, "", "not a date"]) {
      expect(isoDay(value)).toBeNull();
    }
  });
});

describe("isoMinute", () => {
  it("renders to the minute, space-separated so it reads in a column", () => {
    expect(isoMinute("2026-08-19T09:07:33.000Z")).toBe("2026-08-19 09:07");
  });

  it("returns null rather than an epoch for an unreadable value", () => {
    expect(isoMinute("nope")).toBeNull();
  });
});

describe("duration", () => {
  it("renders minutes, then hours, then both", () => {
    expect(duration(7)).toBe("7m");
    expect(duration(60)).toBe("1h");
    expect(duration(135)).toBe("2h 15m");
  });

  it("distinguishes 'nobody recorded it' from 'it took no time'", () => {
    expect(duration(null)).toBeNull();
    expect(duration(0)).toBe("0m");
  });

  it("returns null for nonsense rather than clamping it to zero", () => {
    expect(duration(-5)).toBeNull();
    expect(duration(Number.NaN)).toBeNull();
  });
});

describe("elapsedDays", () => {
  it("singularises one day", () => {
    expect(elapsedDays(1)).toBe("1 day");
    expect(elapsedDays(6)).toBe("6 days");
    expect(elapsedDays(0)).toBe("0 days");
  });

  it("returns null for a count that could not be worked out", () => {
    // `listWaits` returns null when a wait's start date could not be read,
    // rather than a NaN. This is the display side of that decision.
    expect(elapsedDays(null)).toBeNull();
    expect(elapsedDays(Number.NaN)).toBeNull();
  });
});
