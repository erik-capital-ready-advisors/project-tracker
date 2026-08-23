// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  STEP_PATH,
  isWellFormedTotp,
  nextAuthStep,
} from "@/app/sign-in/_lib/steps";

/**
 * The routing rule for the authentication path.
 *
 * The test that matters most is the first-run one. `i1` left no MFA-enrolment
 * carve-out in row-level security, so at `aal1` the operator's own row in
 * `public.operator` returns zero rows -- and a screen that reads zero rows as
 * "no account" locks Erik out of his own product, with the enrolment he needs
 * sitting behind that conclusion.
 */

describe("nextAuthStep", () => {
  it("asks for a password when there is no session", () => {
    expect(
      nextAuthStep({ signedIn: false, currentLevel: null, nextLevel: null }),
    ).toBe("password");
  });

  it("FIRST RUN — a signed-in operator with no factor is sent to enrol, not refused", () => {
    // aal1 with nextLevel aal1: no second factor exists at all. Their operator
    // row is unreadable in this state, and that fact must change nothing here.
    expect(
      nextAuthStep({ signedIn: true, currentLevel: "aal1", nextLevel: "aal1" }),
    ).toBe("enroll");
  });

  it("sends an operator holding a factor to present it", () => {
    expect(
      nextAuthStep({ signedIn: true, currentLevel: "aal1", nextLevel: "aal2" }),
    ).toBe("verify");
  });

  it("lets a fully-authenticated operator through", () => {
    expect(
      nextAuthStep({ signedIn: true, currentLevel: "aal2", nextLevel: "aal2" }),
    ).toBe("ready");
  });

  it("treats an absent assurance reading as enrolment rather than as access", () => {
    // GoTrue returning nothing useful must not resolve to `ready`. Both wrong
    // answers are wrong; only one of them hands out a session it should not.
    expect(
      nextAuthStep({
        signedIn: true,
        currentLevel: undefined,
        nextLevel: undefined,
      }),
    ).toBe("enroll");
    expect(
      nextAuthStep({ signedIn: true, currentLevel: null, nextLevel: null }),
    ).toBe("enroll");
  });

  it("never resolves to `ready` on anything short of aal2", () => {
    for (const level of ["aal1", "aal3", "", "AAL2", null, undefined]) {
      expect(
        nextAuthStep({ signedIn: true, currentLevel: level, nextLevel: "aal2" }),
      ).not.toBe("ready");
    }
  });
});

describe("STEP_PATH", () => {
  it("points every step at a route that exists", () => {
    expect(STEP_PATH).toEqual({
      password: "/sign-in",
      verify: "/sign-in/verify",
      enroll: "/sign-in/enroll",
      ready: "/",
    });
  });
});

describe("isWellFormedTotp", () => {
  it("accepts six digits, with surrounding whitespace", () => {
    expect(isWellFormedTotp("123456")).toBe(true);
    expect(isWellFormedTotp("  123456 ")).toBe(true);
  });

  it("refuses anything else, and decides nothing about correctness", () => {
    for (const value of ["", "12345", "1234567", "12345a", "abcdef"]) {
      expect(isWellFormedTotp(value)).toBe(false);
    }
  });
});
