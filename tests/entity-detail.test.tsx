import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DetailField,
  DetailFields,
  DetailSection,
  EntityDetail,
} from "@/components/entity-detail";

afterEach(cleanup);

describe("EntityDetail", () => {
  it("publishes the state contract the e2e gate queries", () => {
    const { container } = render(
      <EntityDetail
        kind="requirement"
        title="FR-42"
        question="What implements this, what proves it, what violates it, and what shipped it?"
      >
        <p>body</p>
      </EntityDetail>,
    );
    const detail = container.querySelector("[data-verify-unit='entity-detail']");
    expect(detail).toHaveAttribute("data-verify-kind", "requirement");
  });

  it("renders exactly one entity-detail element, so the assertion is unambiguous", () => {
    const { container } = render(
      <EntityDetail kind="defect" title="D-7" question="What is broken?">
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
      <EntityDetail kind="release" title="v1.4.0" question="What shipped?">
        <p>body</p>
      </EntityDetail>,
    );
    expect(
      container.querySelector("[data-verify-unit='unparsed-count']"),
    ).toBeNull();
  });

  it("states an absent identifier rather than rendering a blank", () => {
    const { container } = render(
      <EntityDetail kind="blocker" title="B29" question="What is held?" identifier={null}>
        <p>body</p>
      </EntityDetail>,
    );
    const row = container.querySelector("[data-verify-unit='entity-detail']");
    expect(row?.textContent ?? "").toContain("—");
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
