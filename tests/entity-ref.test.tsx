import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { EntityRef, EntityRefList } from "@/components/entity-ref";

afterEach(cleanup);

const ID = "d4f0c2a6-0000-4000-8000-000000000001";

/** The element the markup contract is written against. */
function refToken(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>("[data-verify-unit='entity-ref']");
  if (el === null) throw new Error("no [data-verify-unit='entity-ref'] was rendered");
  return el;
}

describe("FR-80 — a resolved reference is navigable", () => {
  it("puts the anchor ABOVE the span, which is what closest('a') answers", () => {
    // `e2e/m27-navigation.spec.ts` asserts `el.closest("a") !== null` on the
    // span itself. `closest()` includes the element it is called on, so an
    // anchor that WAS the span would satisfy the resolved case and destroy the
    // dangling one — the same expression has to answer false there. This test
    // is the reason the two elements are kept distinct.
    const { container } = render(
      <EntityRef kind="work_item" label="u4" id={ID} />,
    );
    const anchor = refToken(container).closest("a");
    expect(anchor).not.toBeNull();
    expect(anchor).not.toBe(refToken(container));
    expect(anchor).toHaveAttribute("href", `/work-items/${ID}`);
  });

  it("carries the kind, the rendered reference, and known=true", () => {
    const { container } = render(
      <EntityRef kind="defect" label="D-7" id={ID} />,
    );
    const token = refToken(container);
    expect(token).toHaveAttribute("data-verify-kind", "defect");
    expect(token).toHaveAttribute("data-verify-ref", "D-7");
    expect(token).toHaveAttribute("data-verify-known", "true");
    expect(token).not.toHaveAttribute("data-verify-treatment");
  });

  it("shows the human reference and never the database id", () => {
    // §7a: a requirement is matched and displayed by `FR-nn`. The uuid is what
    // the route resolves; it is not what a reader is shown or asserted against.
    const { container } = render(
      <EntityRef kind="requirement" label="FR-42" id={ID} />,
    );
    expect(refToken(container).textContent).toBe("FR-42");
    expect(refToken(container).getAttribute("data-verify-ref")).toBe("FR-42");
  });
});

describe("FR-83 — a reference to nothing is never a link", () => {
  const dangling = [
    ["a null id", null],
    ["a blank id", "   "],
  ] as const;

  for (const [why, id] of dangling) {
    it(`renders ${why} with no anchor in the ancestry it creates`, () => {
      const { container } = render(
        <EntityRef kind="blocker" label="B29" id={id} />,
      );
      const token = refToken(container);
      expect(token.closest("a")).toBeNull();
      expect(token).toHaveAttribute("data-verify-known", "false");
      expect(token).toHaveAttribute("data-verify-treatment", "dangling");
    });
  }

  it("takes FR-12's existing dangling treatment, dashed and semibold", () => {
    const { container } = render(
      <EntityRef kind="release" label="v1.4.0" id={null} />,
    );
    const painted = refToken(container).className;
    expect(painted).toContain("border-dashed");
    expect(painted).toContain("font-semibold");
    expect(painted).toContain("state-blocked");
  });

  it("is NOT painted in the reserved unparsed colour", () => {
    // The reasoning on UNKNOWN_REF_TREATMENT, asserted rather than trusted:
    // fuchsia means "the system could not classify this" and a dangling
    // reference is the opposite — it parsed perfectly and points at nothing.
    const { container } = render(
      <EntityRef kind="open_question" label="Q9" id={null} />,
    );
    expect(refToken(container).className).not.toContain("state-unparsed");
  });

  it("says why it dangles, on hover, rather than looking like a styling choice", () => {
    const { container } = render(
      <EntityRef kind="external_wait" label="W-2" id={null} />,
    );
    expect(refToken(container).getAttribute("title") ?? "").not.toBe("");
  });
});

describe("data-verify-known is computed and never absent", () => {
  it("is present in both states and holds only true or false", () => {
    for (const id of [ID, null]) {
      const { container } = render(
        <EntityRef kind="contract_milestone" label="M-1" id={id} />,
      );
      const value = refToken(container).getAttribute("data-verify-known");
      expect(["true", "false"]).toContain(value);
      cleanup();
    }
  });
});

describe("EntityRefList", () => {
  it("renders one token per reference, resolved and dangling side by side", () => {
    const { container } = render(
      <EntityRefList
        empty="No work item names this requirement."
        refs={[
          { kind: "work_item", label: "u1", id: ID },
          { kind: "work_item", label: "u9", id: null },
        ]}
      />,
    );
    const tokens = container.querySelectorAll("[data-verify-unit='entity-ref']");
    expect(tokens).toHaveLength(2);
    expect(tokens[0].closest("a")).not.toBeNull();
    expect(tokens[1].closest("a")).toBeNull();
  });

  it("states why an empty list is empty rather than rendering a blank", () => {
    const { container } = render(
      <EntityRefList refs={[]} empty="No release names this requirement." />,
    );
    expect(container.querySelector("[data-verify-unit='entity-ref']")).toBeNull();
    expect(container.textContent?.trim()).not.toBe("");
    expect(
      container.firstElementChild?.getAttribute("title"),
    ).toBe("No release names this requirement.");
  });
});
