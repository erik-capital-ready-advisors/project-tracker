import { describe, expect, it } from "vitest";

import { ALL_ROUTES, ANSWER_ROUTES, OPERATOR_ROUTES } from "@/lib/nav";

/**
 * B43 -- until this file existed, breaking B36's nav entry left the entire
 * suite green. `/questions/[id]` had been unreachable because nothing in
 * navigation pointed at an `open_question`; run 29b583 added the `/questions`
 * list and this array entry, and nothing asserted the entry.
 *
 * No test in the repo referenced `OPERATOR_ROUTES` or `ANSWER_ROUTES` at all
 * before this one.
 */

describe("nav routes (B36, B43)", () => {
  it("OPERATOR_ROUTES contains the /questions entry", () => {
    const questions = OPERATOR_ROUTES.find(
      (item) => item.href === "/questions",
    );

    expect(questions).toBeDefined();
    expect(questions?.label).toBe("Questions");
  });

  /**
   * CR-007 §3 / M2.2. Same tripwire as the `/questions` assertion above and for
   * the same reason: `/stacks` is reachable only through this array — the
   * sidebar, the mobile drawer and the command palette all enumerate it, and
   * `stacks/page.tsx` reads its own entry from it with a non-null assertion.
   * Deleting the entry would make the route unreachable AND throw at import, and
   * without this assertion nothing would say which of those happened.
   */
  it("OPERATOR_ROUTES contains the /stacks entry (CR-007, Q26)", () => {
    const stacks = OPERATOR_ROUTES.find((item) => item.href === "/stacks");

    expect(stacks).toBeDefined();
    expect(stacks?.label).toBe("Stacks");
    // Q26 RULED: `coverage` is not reused on this surface.
    expect(stacks?.label.toLowerCase()).not.toContain("coverage");
    expect(stacks?.question.toLowerCase()).not.toContain("coverage");
    expect(stacks?.requirements).toContain("FR-104");
    expect(stacks?.requirements).toContain("FR-109");
  });

  it("every route carries the metadata the shell renders", () => {
    for (const item of ALL_ROUTES) {
      expect(item.href.startsWith("/")).toBe(true);
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.question.length).toBeGreaterThan(0);
      expect(item.requirements.length).toBeGreaterThan(0);
    }
  });

  it("no href appears twice, so no screen can shadow another", () => {
    const hrefs = ALL_ROUTES.map((item) => item.href);

    expect(new Set(hrefs).size).toBe(hrefs.length);
  });

  it("ALL_ROUTES is the two groups, in order", () => {
    expect(ALL_ROUTES).toHaveLength(
      ANSWER_ROUTES.length + OPERATOR_ROUTES.length,
    );
    expect(ALL_ROUTES.slice(0, ANSWER_ROUTES.length)).toEqual(ANSWER_ROUTES);
  });

  /**
   * B44 is the open blocker: five pages read this array by POSITIONAL INDEX
   * (`OPERATOR_ROUTES[0]` through `[4]`), so inserting an entry mid-array
   * silently renders a screen under another screen's title and requirement
   * list. Run 29b583 appended `/questions` at the end precisely to avoid that.
   *
   * This pins the five indices those pages depend on. It is NOT a fix for B44
   * -- the fix is to make those call sites look up their own href -- but it
   * turns a silent title swap into a failing test in the meantime.
   */
  it("pins the five indices the positional call sites read (B44)", () => {
    expect(OPERATOR_ROUTES[0]?.href).toBe("/registry");
    expect(OPERATOR_ROUTES[1]?.href).toBe("/work-items");
    expect(OPERATOR_ROUTES[2]?.href).toBe("/waits");
    expect(OPERATOR_ROUTES[3]?.href).toBe("/settings/tokens");
    expect(OPERATOR_ROUTES[4]?.href).toBe("/settings/export");
  });
});
