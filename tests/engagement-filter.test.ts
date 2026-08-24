import { describe, expect, it } from "vitest";

import { PARAM as ANSWER_PARAM } from "@/lib/answer-query";
import { PARAM as WORK_ITEM_PARAM } from "@/app/work-items/_lib/query";
import {
  ENGAGEMENT_FILTERABLE_PATHS,
  ENGAGEMENT_PARAM,
  ENGAGEMENT_SLUG_LIMIT,
  engagementFilterFrom,
  engagementFilterSlug,
  isEngagementFilterable,
  isEngagementFiltered,
  preservedEngagementParams,
  withEngagementFilter,
} from "@/lib/engagement-filter";
import { ALL_ROUTES } from "@/lib/nav";

/**
 * FR-45: every test title opens with the requirement ref it covers, because the
 * product reads that mapping out of these files.
 *
 * FR-96's filter is a pure function over the URL, so the rules most likely to be
 * got quietly wrong are provable here rather than asserted in a comment. The
 * two that matter most:
 *
 *   * a filter value the system cannot use is REPORTED, never dropped — a
 *     dropped filter renders an unfiltered list under a filtered heading;
 *   * changing the engagement preserves every other filter — a picker that
 *     reset `?severity=critical` on its way past would widen the answer while
 *     looking like it narrowed it.
 */

describe("FR-96 engagement filter — the parameter", () => {
  it("FR-96 spells the parameter the same as the two parsers that predate it", () => {
    // The single spelling authority is only an authority if the parsers that
    // already exist agree with it. If either of these ever diverges, eleven
    // screens quietly stop honouring the shell picker.
    expect(ENGAGEMENT_PARAM).toBe(ANSWER_PARAM.engagement);
    expect(ENGAGEMENT_PARAM).toBe(WORK_ITEM_PARAM.engagement);
  });

  it("FR-96 reads a slug from a plain searchParams record and from URLSearchParams", () => {
    expect(engagementFilterFrom({ engagement: "acme" })).toEqual({
      kind: "slug",
      slug: "acme",
    });
    expect(
      engagementFilterFrom(new URLSearchParams("engagement=acme")),
    ).toEqual({ kind: "slug", slug: "acme" });
  });

  it("FR-96 keeps the unfiltered cross-engagement view as the default", () => {
    expect(engagementFilterFrom({})).toEqual({ kind: "none" });
    expect(engagementFilterSlug(engagementFilterFrom({}))).toBeNull();
    expect(isEngagementFiltered(engagementFilterFrom({}))).toBe(false);
  });

  it("FR-96 treats an empty value as cleared rather than as an error", () => {
    // `?engagement=` is what the picker's "every engagement" option submits.
    // Refusing it would make clearing the filter an error state.
    expect(engagementFilterFrom({ engagement: "" })).toEqual({ kind: "none" });
    expect(engagementFilterFrom({ engagement: "   " })).toEqual({
      kind: "none",
    });
  });

  it("FR-96 rejects an over-long slug rather than truncating it", () => {
    const tooLong = "a".repeat(ENGAGEMENT_SLUG_LIMIT + 1);
    const filter = engagementFilterFrom({ engagement: tooLong });

    expect(filter.kind).toBe("rejected");
    // A truncated slug is a DIFFERENT slug. Filtering by it would answer a
    // question nobody asked, which is the widening failure with an extra step.
    expect(engagementFilterSlug(filter)).toBeNull();
    expect(isEngagementFiltered(filter)).toBe(false);
  });

  it("FR-96 accepts a slug exactly at the registry's own 128-character cap", () => {
    const atCap = "a".repeat(ENGAGEMENT_SLUG_LIMIT);
    expect(engagementFilterFrom({ engagement: atCap })).toEqual({
      kind: "slug",
      slug: atCap,
    });
  });

  it("FR-96 takes the first value when a parameter is repeated", () => {
    expect(engagementFilterFrom({ engagement: ["acme", "beta"] })).toEqual({
      kind: "slug",
      slug: "acme",
    });
  });
});

describe("FR-96 engagement filter — which screens honour it", () => {
  it("FR-96 covers exactly the eleven screens CR-005 §3.3 names", () => {
    expect([...ENGAGEMENT_FILTERABLE_PATHS].sort()).toEqual(
      [
        "/blocked",
        "/bottleneck",
        "/broken",
        "/committed",
        "/next",
        "/questions",
        "/registry",
        "/runs",
        "/untested",
        "/waits",
        "/work-items",
      ].sort(),
    );
  });

  /**
   * Screens that are navigable and deliberately NOT filterable, each with the
   * reason it is out.
   *
   * Every entry here is a decision someone made and wrote down, which is the
   * whole point of the tripwire below.
   */
  const DELIBERATELY_UNFILTERED: readonly string[] = [
    /*
     * CR-007 §3 / M2.2. `/stacks` is a **ledger-wide register by construction**,
     * and this is a decision rather than an omission.
     *
     * FR-104 asks for every stack the ledger has ever observed, and
     * `readStackRegister()` takes no argument at all — `@/lib/stacks-load`
     * documents the argument-free signature as load-bearing for its `cache()`
     * memoisation. More importantly, FR-106 compares each row's **engagement
     * count** against a threshold of two. Narrowing the register to one
     * engagement would leave that threshold in place while making the number it
     * is compared against mean something else entirely: every stack would show
     * at most one engagement and nothing could ever cross the line. A filter
     * that silently guarantees one half of a rule can never fire is worse than
     * no filter, and it is the same class of error FR-96c exists to prevent.
     *
     * The screen states this in words rather than leaving the missing picker to
     * be read as a gap (`data-verify-unit="ledger-wide-note"`).
     */
    "/stacks",
  ];

  it("FR-96 is every navigable screen except the settings pages and the ledger-wide ones", () => {
    /*
     * A tripwire, not a derivation. The list above is written out literally so
     * that appending a nav entry does NOT silently enrol a new screen into
     * honouring `?engagement=` — a screen that accepts the parameter without
     * applying it is exactly FR-96c's lie. This test is what makes that
     * decision visible: add a route to `nav.ts` and it fails until someone says
     * which side of the line the new screen is on.
     *
     * It kept working. `/stacks` (M2.2) tripped it, and the answer is recorded
     * in `DELIBERATELY_UNFILTERED` above rather than by widening the expectation.
     */
    const navigable = ALL_ROUTES.map((route) => route.href)
      .filter((href) => !href.startsWith("/settings/"))
      .filter((href) => !DELIBERATELY_UNFILTERED.includes(href))
      .sort();

    expect([...ENGAGEMENT_FILTERABLE_PATHS].sort()).toEqual(navigable);
  });

  it("every deliberately-unfiltered screen is a real route, and really is unfiltered", () => {
    // Without this, the exclusion list could hide a typo or outlive its screen
    // and quietly stop protecting anything.
    for (const href of DELIBERATELY_UNFILTERED) {
      expect(ALL_ROUTES.map((route) => route.href)).toContain(href);
      expect(isEngagementFilterable(href)).toBe(false);
    }
  });

  it("FR-96 matches paths exactly, so no detail view is enrolled by prefix", () => {
    expect(isEngagementFilterable("/registry")).toBe(true);
    // CR-005 §3.3 point 1: a detail view already IS one record, and filtering
    // it can only produce a page that hides itself.
    expect(isEngagementFilterable("/registry/acme")).toBe(false);
    expect(isEngagementFilterable("/registry/new")).toBe(false);
    expect(isEngagementFilterable("/work-items/unassigned")).toBe(false);
    expect(isEngagementFilterable("/work-items/abc-123")).toBe(false);
    expect(isEngagementFilterable("/settings/tokens")).toBe(false);
    expect(isEngagementFilterable("/")).toBe(false);
  });
});

describe("FR-96 engagement filter — building the link", () => {
  it("FR-96 makes a filtered view a link", () => {
    expect(withEngagementFilter("/next", {}, "acme")).toBe(
      "/next?engagement=acme",
    );
  });

  it("FR-96 clears the filter by removing the parameter, not emptying it", () => {
    expect(
      withEngagementFilter("/next", { engagement: "acme" }, null),
    ).toBe("/next");
  });

  it("FR-96 preserves every other filter when the engagement changes", () => {
    const href = withEngagementFilter(
      "/broken",
      new URLSearchParams("engagement=acme&severity=critical"),
      "beta",
    );

    // Widening `severity` back to every severity while looking narrowed is the
    // same class of failure as a widened regex.
    expect(href).toContain("severity=critical");
    expect(href).toContain("engagement=beta");
    expect(href).not.toContain("acme");
  });

  it("FR-96 returns to page one whenever the filter changes", () => {
    // Page seven of a list that just got shorter renders an empty page that
    // reads exactly like an empty ledger. `withParams` in the work-items query
    // module already made this call; the shell must not disagree with it.
    const href = withEngagementFilter(
      "/work-items",
      new URLSearchParams("page=7&sort=started_at"),
      "acme",
    );

    expect(href).not.toContain("page=");
    expect(href).toContain("sort=started_at");
  });

  it("FR-96 keeps repeated parameters as repeats", () => {
    const href = withEngagementFilter(
      "/work-items",
      { engagement: "acme", tag: ["a", "b"] },
      "beta",
    );

    expect(href).toContain("tag=a");
    expect(href).toContain("tag=b");
  });

  it("FR-96 preserves the same set the picker re-emits as hidden fields", () => {
    // The form's hidden inputs and any href built beside them must not disagree
    // about what survives a filter change, so both read this one function.
    const params = new URLSearchParams(
      "engagement=acme&page=3&severity=minor&limit=100",
    );

    expect(preservedEngagementParams(params)).toEqual([
      ["severity", "minor"],
      ["limit", "100"],
    ]);
  });
});
