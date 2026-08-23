import { describe, it, expect } from "vitest";
import { classifyStatus } from "./status";

describe("classifyStatus", () => {
  it("FR-15 returns unparsed for prose it does not recognize", () => {
    // The rule this product exists to hold: a wrong `done` is worse than a
    // loud `unparsed`.
    expect(classifyStatus("**frobnicated** - see the note above").status)
      .toBe("unparsed");
  });

  it("FR-15 reads a bare pending", () => {
    expect(classifyStatus("pending").status).toBe("pending");
  });

  it("FR-15 reads done through a trailing paragraph", () => {
    expect(classifyStatus("**done** — gate PASS, merged `71b9683` (8 files).").status)
      .toBe("done");
  });

  it("FR-29 classifies an absent credential as a carried gap", () => {
    const cell =
      "**BLOCKED — NOT dispatched. No Vercel account is reachable from this " +
      "environment.** Measured, not assumed.";
    expect(classifyStatus(cell)).toMatchObject({
      status: "blocked",
      unautomatedReason: "credential-absent",
      unautomatedDisposition: "carried",
    });
  });

  it("FR-30 classifies superseded work as a closed decision", () => {
    const cell =
      "**superseded by u2 — NOT dispatched.** u2 shipped all four items. " +
      "**Scope moved; this is a decision, not a gap.**";
    expect(classifyStatus(cell)).toMatchObject({
      status: "superseded",
      unautomatedDisposition: "closed",
    });
  });

  it("FR-43 counts named not-verified claims", () => {
    expect(classifyStatus("**done** — 2 NOT VERIFIED, both named").notVerifiedCount)
      .toBe(2);
  });

  it("FR-43 counts an uncounted not-verified mention as one", () => {
    expect(
      classifyStatus("**done (code)** — **All DB-side controls NOT VERIFIED.**")
        .notVerifiedCount,
    ).toBe(1);
  });

  it("FR-43 counts nothing when nothing is claimed", () => {
    expect(classifyStatus("**done** — gate PASS").notVerifiedCount).toBe(0);
  });
});
