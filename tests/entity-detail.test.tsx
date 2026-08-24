import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DetailField,
  DetailFields,
  DetailSection,
  EntityDetail,
  NO_IDENTIFIER,
} from "@/components/entity-detail";

afterEach(cleanup);

describe("EntityDetail", () => {
  it("publishes the state contract the e2e gate queries", () => {
    const { container } = render(
      <EntityDetail
        kind="requirement"
        title="FR-42"
        question="What implements this, what proves it, what violates it, and what shipped it?"
        identifier="FR-42"
      >
        <p>body</p>
      </EntityDetail>,
    );
    const detail = container.querySelector("[data-verify-unit='entity-detail']");
    expect(detail).toHaveAttribute("data-verify-kind", "requirement");
  });

  it("renders exactly one entity-detail element, so the assertion is unambiguous", () => {
    const { container } = render(
      <EntityDetail kind="defect" title="D-7" question="What is broken?" identifier="D-7">
        <p>body</p>
      </EntityDetail>,
    );
    expect(
      container.querySelectorAll("[data-verify-unit='entity-detail']"),
    ).toHaveLength(1);
  });

  it("mounts no unparsed count of its own — FR-85 is the shell's job", () => {
    // AppShell carries the one UnparsedCount, in the root layout, so every
    // detail route reports it. A second one here would be two elements
    // answering one selector and, worse, potentially two different numbers.
    const { container } = render(
      <EntityDetail
        kind="release"
        title="v1.4.0"
        question="What shipped?"
        identifier="v1.4.0"
      >
        <p>body</p>
      </EntityDetail>,
    );
    expect(
      container.querySelector("[data-verify-unit='unparsed-count']"),
    ).toBeNull();
  });

  it("states an absent identifier rather than rendering a blank", () => {
    const { container } = render(
      <EntityDetail
        kind="blocker"
        title="B29"
        question="What is held?"
        identifier={NO_IDENTIFIER}
      >
        <p>body</p>
      </EntityDetail>,
    );
    const row = container.querySelector("[data-verify-unit='entity-detail']");
    expect(row?.textContent ?? "").toContain("—");
  });
});

/**
 * B34. The prop used to be `identifier?: string | null`, so a caller who simply
 * forgot it got the positive claim "This <entity> carries no reference of its
 * own." about the row, with a green type-check and nothing asserting on it.
 *
 * These four pin the shape rather than the styling: omission does not compile,
 * a blank string is not an invisible slot, and the two "there is no reference
 * here" inputs — deliberate and failed — do not render the same DOM.
 */
describe("EntityDetail identifier (B34)", () => {
  it("does not compile when the identifier is omitted", () => {
    // A TYPE-level assertion, and deliberately never rendered: the element is
    // only constructed. `tsc --noEmit` fails with "Unused '@ts-expect-error'
    // directive" the moment the prop goes optional again, which is the pin.
    const omitted = (
      // @ts-expect-error `identifier` is required: omitting it used to render
      // "carries no reference of its own" as a fact about the row.
      <EntityDetail kind="work_item" title="Ship the thing" question="What is this?">
        <p>body</p>
      </EntityDetail>
    );
    expect(omitted).toBeDefined();
  });

  it("never renders an empty identifier as an invisible slot", () => {
    const { container } = render(
      <EntityDetail kind="work_item" title="Ship the thing" question="What is this?" identifier="">
        <p>body</p>
      </EntityDetail>,
    );
    const row = container.querySelector("[data-verify-unit='entity-detail']");
    expect(row?.textContent ?? "").toContain("unreadable");
    expect(
      container.querySelector("[data-verify-unit='entity-identifier']"),
    ).toHaveAttribute("data-verify-state", "unreadable");
  });

  it("distinguishes a stated absence from a reference that could not be read", () => {
    const stated = render(
      <EntityDetail
        kind="blocker"
        title="B29"
        question="What is held?"
        identifier={NO_IDENTIFIER}
      >
        <p>body</p>
      </EntityDetail>,
    ).container.querySelector("[data-verify-unit='entity-detail']");
    const statedHtml = stated?.innerHTML ?? "";
    cleanup();

    const unread = render(
      <EntityDetail kind="blocker" title="B29" question="What is held?" identifier={null}>
        <p>body</p>
      </EntityDetail>,
    ).container.querySelector("[data-verify-unit='entity-detail']");
    const unreadHtml = unread?.innerHTML ?? "";

    expect(statedHtml).not.toBe("");
    expect(statedHtml).toContain("carries no reference of its own");
    expect(unreadHtml).toContain("unreadable");
    expect(unreadHtml).not.toContain("carries no reference of its own");
    expect(statedHtml).not.toBe(unreadHtml);
  });

  it("renders the literal string 'none' as the entity's reference, not as a claim", () => {
    // The sentinel is an object precisely so an ingested reference spelled
    // `none` can never be mistaken for the caller stating there is none.
    const { container } = render(
      <EntityDetail kind="external_wait" title="none" question="What is waited on?" identifier="none">
        <p>body</p>
      </EntityDetail>,
    );
    const row = container.querySelector("[data-verify-unit='entity-detail']");
    expect(row?.textContent ?? "").toContain("none");
    expect(row?.innerHTML ?? "").not.toContain("carries no reference of its own");
  });
});

describe("DetailField", () => {
  it("renders a value that was never recorded as absent, with a stated reason", () => {
    const { container } = render(
      <DetailFields>
        <DetailField label="Resolved" absent="No resolution date was recorded." />
      </DetailFields>,
    );
    const value = container.querySelector("dd");
    expect(value?.textContent).toBe("—");
    expect(value?.querySelector("[title]")).toHaveAttribute(
      "title",
      "No resolution date was recorded.",
    );
  });

  it("never renders an absent value as zero or as an empty cell", () => {
    const { container } = render(
      <DetailFields>
        <DetailField label="Amount" absent="Nothing recorded." />
      </DetailFields>,
    );
    const text = container.querySelector("dd")?.textContent ?? "";
    expect(text).not.toBe("");
    expect(text).not.toBe("0");
  });

  it("renders a recorded value as itself", () => {
    const { container } = render(
      <DetailFields>
        <DetailField label="Status" absent="Nothing recorded.">
          blocked
        </DetailField>
      </DetailFields>,
    );
    expect(container.querySelector("dd")?.textContent).toBe("blocked");
  });
});

describe("DetailSection", () => {
  it("passes a verify unit through, which is how FR-82 names its four sections", () => {
    const { container } = render(
      <DetailSection heading="Work items" verifyUnit="requirement-work-items">
        <p>body</p>
      </DetailSection>,
    );
    expect(
      container.querySelector("[data-verify-unit='requirement-work-items']"),
    ).not.toBeNull();
  });

  it("labels the section by its heading, so the landmark is announced", () => {
    const { container } = render(
      <DetailSection heading="Defects">
        <p>body</p>
      </DetailSection>,
    );
    const section = container.querySelector("section");
    const labelledBy = section?.getAttribute("aria-labelledby") ?? "";
    expect(labelledBy).not.toBe("");
    expect(container.querySelector(`#${labelledBy}`)?.textContent).toBe("Defects");
  });
});
