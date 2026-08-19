import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIMIT,
  parseBlockedQuery,
  parseBottleneckQuery,
  parseBrokenQuery,
  parseCommittedQuery,
  parseNextQuery,
  parseUntestedQuery,
} from "@/lib/answer-query";

/**
 * The one rule these parsers exist to keep: **an unrecognised value is never
 * silently dropped.**
 *
 * The failure being tested against is not a crash, it is a plausible answer. A
 * screen that ignores `?severity=crit` renders every severity under a heading
 * that claims to be filtered, and nothing about the result looks wrong. So every
 * test below asserts two things together — that the filter did **not** apply,
 * and that the rejection was **recorded** — because either one alone passes for
 * the broken implementation.
 */

describe("FR-52 blocked filters", () => {
  it("records an unrecognised disposition rather than ignoring it", () => {
    const query = parseBlockedQuery({ disposition: "carreid" });
    expect(query.disposition).toBeNull();
    expect(query.rejected).toEqual([
      { field: "disposition", value: "carreid" },
    ]);
    // The screen must not claim to be filtered by a filter it did not apply.
    expect(query.filtered).toBe(false);
  });

  it("accepts both dispositions, because FR-30 says they are two", () => {
    expect(parseBlockedQuery({ disposition: "carried" }).disposition).toBe(
      "carried",
    );
    expect(parseBlockedQuery({ disposition: "closed" }).disposition).toBe(
      "closed",
    );
  });

  it("keeps owner as free text, since §7a leaves the vocabulary open", () => {
    const query = parseBlockedQuery({ owner: "a-vendor-nobody-enumerated" });
    expect(query.owner).toBe("a-vendor-nobody-enumerated");
    expect(query.rejected).toEqual([]);
  });

  it("rejects an over-long value rather than truncating it to a different one", () => {
    const query = parseBlockedQuery({ engagement: "x".repeat(201) });
    expect(query.engagement).toBeNull();
    expect(query.rejected).toHaveLength(1);
  });
});

describe("FR-53 / FR-56 limits", () => {
  it("defaults to the endpoint's own default", () => {
    expect(parseNextQuery({}).limit).toBe(DEFAULT_LIMIT);
    expect(parseBottleneckQuery({}).limit).toBe(DEFAULT_LIMIT);
  });

  it("rejects a limit outside the offered set rather than clamping it", () => {
    const query = parseNextQuery({ limit: "9999" });
    expect(query.limit).toBe(DEFAULT_LIMIT);
    expect(query.rejected).toEqual([{ field: "limit", value: "9999" }]);
  });

  it("does not count a row limit as a filter", () => {
    // A limit changes how much of the answer is shown, not which rows qualify.
    // Counting it would make the screen say "filtered" about an unfiltered
    // answer, and offer a Clear link that clears nothing.
    expect(parseNextQuery({ limit: "100" }).filtered).toBe(false);
    expect(parseNextQuery({ engagement: "acme" }).filtered).toBe(true);
  });
});

describe("FR-51 committed filters", () => {
  it("accepts all three milestone states separately", () => {
    for (const state of ["open", "claimed", "billable"] as const) {
      expect(parseCommittedQuery({ state }).state).toBe(state);
    }
  });

  it("records an unrecognised state rather than defaulting to one", () => {
    const query = parseCommittedQuery({ state: "invoiceable" });
    expect(query.state).toBeNull();
    expect(query.rejected).toEqual([{ field: "state", value: "invoiceable" }]);
  });
});

describe("FR-63 broken filters", () => {
  it("offers `unparsed` as a severity like any other", () => {
    // FR-64 puts an ungraded defect in the unparsed population. Making it
    // unfilterable would make it unfindable, which is the diagnostics-page
    // failure FR-58's second sentence rules out.
    expect(parseBrokenQuery({ severity: "unparsed" }).severity).toBe("unparsed");
  });

  it("records an unrecognised severity rather than ignoring it", () => {
    const query = parseBrokenQuery({ severity: "crit" });
    expect(query.severity).toBeNull();
    expect(query.rejected).toEqual([{ field: "severity", value: "crit" }]);
  });
});

describe("shared behaviour", () => {
  it("treats an empty parameter as absent rather than as a rejection", () => {
    // `?engagement=` is how the "any" option in a select submits. Rejecting it
    // would make clearing one filter impossible without clearing them all.
    const query = parseUntestedQuery({ engagement: "" });
    expect(query.engagement).toBeNull();
    expect(query.rejected).toEqual([]);
  });

  it("takes the first value when a parameter is repeated", () => {
    expect(parseUntestedQuery({ engagement: ["acme", "northwind"] }).engagement).toBe(
      "acme",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(parseUntestedQuery({ engagement: "  acme  " }).engagement).toBe("acme");
  });
});
