// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  DEFAULT_DIRECTION,
  DEFAULT_SORT,
  nextDirection,
  parseWorkItemQuery,
  withParams,
} from "@/app/work-items/_lib/query";

/**
 * FR-44's filter state.
 *
 * The tests that matter here are the refusals. A filter parser that falls back
 * to "no filter" for a value it does not recognise renders MORE rows than were
 * asked for while looking like it answered the question -- the URL-shaped
 * version of widening a regex to make a stubborn row classify, which `CLAUDE.md`
 * names as the failure this product exists to prevent.
 */

describe("parseWorkItemQuery — the unparsed discipline, applied to a URL", () => {
  it("reports an unrecognised executor rather than ignoring it", () => {
    const query = parseWorkItemQuery({ executor: "bob" });

    expect(query.executorKind).toBeNull();
    expect(query.rejected).toEqual([{ field: "executor", value: "bob" }]);
    // And crucially: the screen is NOT reporting itself as filtered, so it
    // cannot claim to be answering the narrower question.
    expect(query.filtered).toBe(false);
  });

  it("reports every unrecognised value, not just the first", () => {
    const query = parseWorkItemQuery({
      mode: "telepathy",
      status: "finished",
      evidence: "vibes",
    });

    expect(query.rejected.map((entry) => entry.field)).toEqual([
      "mode",
      "status",
      "evidence",
    ]);
  });

  it("accepts the closed sets' own aliases without inventing new ones", () => {
    expect(parseWorkItemQuery({ executor: "erik-gate" }).executorKind).toBe(
      "erik_gate",
    );
    expect(parseWorkItemQuery({ mode: "hand-prompted" }).executionMode).toBe(
      "hand",
    );
    expect(parseWorkItemQuery({ status: "in-flight" }).status).toBe("in_flight");
  });

  it("FR-43 accepts all four evidence scopes and no fifth", () => {
    for (const [wire, stored] of [
      ["observed-live", "observed_live"],
      ["observed-elsewhere", "observed_elsewhere"],
      ["asserted", "asserted"],
      ["not-verified", "not_verified"],
    ] as const) {
      expect(parseWorkItemQuery({ evidence: wire }).evidenceScope).toBe(stored);
    }
    expect(parseWorkItemQuery({ evidence: "observed" }).evidenceScope).toBeNull();
  });

  it("FR-30 accepts both dispositions, so neither is the implicit default", () => {
    expect(parseWorkItemQuery({ disposition: "carried" }).disposition).toBe(
      "carried",
    );
    expect(parseWorkItemQuery({ disposition: "closed" }).disposition).toBe(
      "closed",
    );
  });

  it("refuses a mistyped boolean instead of reading it as false", () => {
    const query = parseWorkItemQuery({ blocked: "ture" });
    expect(query.blockedOnly).toBe(false);
    expect(query.rejected).toEqual([{ field: "blocked", value: "ture" }]);
  });

  it("refuses a sort column outside §7a's clear-column allowlist", () => {
    const query = parseWorkItemQuery({ sort: "description" });
    expect(query.sort).toBe(DEFAULT_SORT);
    expect(query.rejected).toEqual([{ field: "sort", value: "description" }]);
  });

  it("refuses a page that is not a positive integer", () => {
    for (const value of ["0", "-3", "1.5", "abc"]) {
      const query = parseWorkItemQuery({ page: value });
      expect(query.page).toBe(1);
      expect(query.rejected).toEqual([{ field: "page", value }]);
    }
  });

  it("defaults to the newest work first and says so explicitly", () => {
    const query = parseWorkItemQuery({});
    expect(query.sort).toBe(DEFAULT_SORT);
    expect(query.direction).toBe(DEFAULT_DIRECTION);
    expect(query.filtered).toBe(false);
    expect(query.rejected).toEqual([]);
  });

  it("treats a repeated parameter as its first value rather than throwing", () => {
    expect(parseWorkItemQuery({ mode: ["fleet", "hand"] }).executionMode).toBe(
      "fleet",
    );
  });

  it("marks the screen filtered as soon as any filter applies", () => {
    expect(parseWorkItemQuery({ blocked: "1" }).filtered).toBe(true);
    expect(parseWorkItemQuery({ engagement: "acme" }).filtered).toBe(true);
  });
});

describe("withParams", () => {
  it("returns to page one whenever the contents change", () => {
    const query = parseWorkItemQuery({ page: "7", mode: "fleet" });
    expect(query.page).toBe(7);

    const href = withParams(query, { sort: "unit", dir: "asc" });
    expect(href).not.toContain("page=");
    expect(href).toContain("mode=fleet");
  });

  it("keeps the page when only the page changes", () => {
    const query = parseWorkItemQuery({ page: "2", status: "blocked" });
    expect(withParams(query, { page: 3 })).toContain("page=3");
  });

  it("omits defaults so a clean list is a clean URL", () => {
    expect(withParams(parseWorkItemQuery({}), {})).toBe("/work-items");
  });

  it("drops a parameter when the change is null", () => {
    const query = parseWorkItemQuery({ mode: "fleet" });
    expect(withParams(query, { mode: null })).toBe("/work-items");
  });
});

describe("nextDirection", () => {
  it("flips the column already sorted and starts a new one descending", () => {
    const query = parseWorkItemQuery({ sort: "unit", dir: "desc" });
    expect(nextDirection(query, "unit")).toBe("asc");
    expect(nextDirection(query, "status")).toBe("desc");
  });
});
