// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  DEFAULT_EXPIRY_DAYS,
  defaultExpiryDay,
  expiryInstant,
  tokenStatus,
} from "@/app/settings/tokens/_lib/status";

/**
 * FR-4's expiry and FR-7's revocation, as pure functions over a supplied clock.
 *
 * No test here contains a real token. Nothing in this file needs one: a token's
 * *status* is derived from two timestamps, and the value it authenticates with
 * never enters the calculation.
 */

const NOW = new Date("2026-08-19T12:00:00.000Z");

describe("tokenStatus", () => {
  it("is active while the expiry is in the future and nothing revoked it", () => {
    expect(
      tokenStatus({ expiresAt: "2026-11-17T23:59:59.999Z", revokedAt: null }, NOW),
    ).toBe("active");
  });

  it("is expired once the expiry has passed", () => {
    expect(
      tokenStatus({ expiresAt: "2026-08-18T23:59:59.999Z", revokedAt: null }, NOW),
    ).toBe("expired");
  });

  it("expires exactly at its expiry rather than a moment after", () => {
    expect(
      tokenStatus({ expiresAt: NOW.toISOString(), revokedAt: null }, NOW),
    ).toBe("expired");
  });

  it("reports revoked over expired, because revocation is a decision", () => {
    // Both are true of this token. Showing "expired" would hide the fact that
    // somebody deliberately withdrew it, and FR-7 exists to make that visible.
    expect(
      tokenStatus(
        { expiresAt: "2026-01-01T00:00:00.000Z", revokedAt: "2026-02-02T00:00:00.000Z" },
        NOW,
      ),
    ).toBe("revoked");
  });

  it("treats an unreadable expiry as expired rather than as active", () => {
    // Both defaults are wrong in some sense. Only one of them presents an
    // unreadable credential as usable.
    expect(tokenStatus({ expiresAt: "whenever", revokedAt: null }, NOW)).toBe(
      "expired",
    );
  });
});

describe("expiryInstant", () => {
  it("puts the expiry at the END of the chosen day", () => {
    // A token whose form said 2026-11-17 must work on the seventeenth. Reading
    // the day as T00:00:00Z kills it the moment the day begins.
    expect(expiryInstant("2026-11-17")?.toISOString()).toBe(
      "2026-11-17T23:59:59.999Z",
    );
  });

  it("refuses anything that is not a calendar day", () => {
    for (const value of ["", "17/11/2026", "2026-11-17T10:00:00Z", "tomorrow"]) {
      expect(expiryInstant(value)).toBeNull();
    }
  });

  it("refuses a date that looks well-formed and does not exist", () => {
    expect(expiryInstant("2026-02-31")).toBeNull();
  });
});

describe("defaultExpiryDay", () => {
  it("prefills ninety days out, the period §7a already uses for this table", () => {
    expect(DEFAULT_EXPIRY_DAYS).toBe(90);
    expect(defaultExpiryDay(NOW)).toBe("2026-11-17");
  });

  it("produces a value the expiry parser accepts", () => {
    expect(expiryInstant(defaultExpiryDay(NOW))).not.toBeNull();
  });
});
