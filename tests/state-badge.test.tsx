import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ALL_WORK_STATES,
  StateBadge,
  type WorkState,
} from "@/components/state-badge";

afterEach(cleanup);

/**
 * Reads the styling a state actually renders with, so "these two states look
 * different" is asserted against the emitted class list rather than against the
 * table that produced it. Asserting the map against itself would pass whatever
 * the map said.
 */
function renderedClassOf(state: WorkState): string {
  const { container } = render(<StateBadge state={state} />);
  const el = container.querySelector("[data-verify-unit='state-badge']");
  return el?.className ?? "";
}

describe("semantic state scale (spec 5a)", () => {
  it("FR-43 keeps the four evidence scopes visually distinct", () => {
    const scopes: WorkState[] = [
      "observed-live",
      "observed-elsewhere",
      "asserted",
      "not-verified",
    ];

    const rendered = scopes.map(renderedClassOf);
    expect(new Set(rendered).size).toBe(scopes.length);
  });

  it("FR-49 distinguishes unproven from uncovered", () => {
    expect(renderedClassOf("unproven")).not.toBe(renderedClassOf("uncovered"));
  });

  it("FR-30 distinguishes carried from closed", () => {
    expect(renderedClassOf("carried")).not.toBe(renderedClassOf("closed"));
  });

  it("FR-67 distinguishes wont_fix from verified", () => {
    expect(renderedClassOf("wont_fix")).not.toBe(renderedClassOf("verified"));
  });

  it("FR-58 reserves the unparsed colour for unparsed alone", () => {
    for (const state of ALL_WORK_STATES) {
      if (state === "unparsed") continue;
      expect(renderedClassOf(state)).not.toContain("state-unparsed");
    }
  });

  it("FR-79 renders contested without presenting it as clean", () => {
    expect(renderedClassOf("contested")).not.toBe(renderedClassOf("verified"));
    expect(renderedClassOf("contested")).toContain("state-contested");
  });

  it("FR-43 gives every state in the scale its own rendered treatment", () => {
    // No two states may share a rendering, or the screen collapses states the
    // spec says are distinct.
    const rendered = ALL_WORK_STATES.map(renderedClassOf);
    expect(new Set(rendered).size).toBe(ALL_WORK_STATES.length);
  });
});
