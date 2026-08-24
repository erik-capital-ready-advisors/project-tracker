import { describe, expect, it } from "vitest";

import { ENGAGEMENT_PARAM } from "@/lib/engagement-filter";
import { withListFlag } from "@/lib/list-toggle-link";

/**
 * `withListFlag` — the toggle link on `/questions` and `/waits`.
 *
 * The rule worth proving is not the flag; it is everything the flag must NOT
 * disturb. Both screens carried a literal pair (`"/waits"` / `"/waits?resolved=1"`)
 * that was correct while those screens had exactly one parameter, and would
 * have silently dropped FR-96's engagement filter the moment they gained a
 * second — widening the list back to every engagement while the shell picker
 * still read one client's name.
 */
describe("withListFlag", () => {
  it("turns the flag on, and the URL says so", () => {
    expect(withListFlag("/waits", {}, "resolved", true)).toBe(
      "/waits?resolved=1",
    );
  });

  it("turns the flag off by removing it, not by setting it to 0", () => {
    // `?resolved=0` would be a second spelling of the default and would make
    // the "off" view a different URL from the bare path.
    expect(withListFlag("/waits", { resolved: "1" }, "resolved", false)).toBe(
      "/waits",
    );
  });

  it("carries the engagement filter across the toggle", () => {
    const href = withListFlag(
      "/questions",
      { [ENGAGEMENT_PARAM]: "acme" },
      "answered",
      true,
    );

    expect(href).toContain(`${ENGAGEMENT_PARAM}=acme`);
    expect(href).toContain("answered=1");
  });

  it("carries an engagement value that resolves to nothing", () => {
    // FR-96c's notice must still be on screen after the click. A filter that
    // vanished when an unrelated button was pressed is a filter nobody can
    // trust — and it would look exactly like the screen deciding the slug was
    // a mistake on the operator's behalf.
    expect(
      withListFlag("/waits", { engagement: "ghost" }, "resolved", true),
    ).toContain("engagement=ghost");
  });

  it("keeps every other parameter, including a repeated one", () => {
    const href = withListFlag(
      "/questions",
      { engagement: "acme", tag: ["a", "b"] },
      "answered",
      false,
    );

    expect(href).toBe("/questions?engagement=acme&tag=a&tag=b");
  });

  it("never emits the flag twice when the URL already carried it", () => {
    expect(
      withListFlag("/waits", { resolved: "1", engagement: "acme" }, "resolved", true),
    ).toBe("/waits?resolved=1&engagement=acme");
  });

  it("returns the bare path when nothing survives", () => {
    expect(withListFlag("/questions", { answered: "1" }, "answered", false)).toBe(
      "/questions",
    );
  });

  it("produces the same string for the same state, so two links to one view match", () => {
    const params = { engagement: "acme", answered: "1" };

    expect(withListFlag("/questions", params, "answered", false)).toBe(
      withListFlag("/questions", params, "answered", false),
    );
  });
});
