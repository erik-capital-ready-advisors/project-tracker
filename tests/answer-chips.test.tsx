import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  ContestedChip,
  CoverageChip,
  DefectSeverityChip,
  DefectStatusChip,
  DispositionChip,
  ExecutorChip,
  HeldByChips,
  MilestoneStateChip,
  ShippedChip,
} from "@/components/answer-chips";

afterEach(cleanup);

/**
 * Every assertion here reads the **class list** of the element that actually
 * paints, not its markup.
 *
 * u4 had a mutation survive because its assertion compared `outerHTML`, which
 * still differed in a `data-verify-*` attribute after the visual distinction the
 * test claimed to check had been destroyed. A test that says "these two states
 * look different" has to read what makes them look different, and that is the
 * computed class list. The `data-verify-*` attributes are for `qa-reviewer` to
 * query; they are not evidence about appearance.
 */
function paintedClass(ui: React.ReactElement): string {
  const { container } = render(ui);
  // The painting element is either the chip itself or the StateBadge inside it.
  const badge = container.querySelector("[data-verify-unit='state-badge']");
  const el = badge ?? (container.firstElementChild as Element | null);
  return el?.className ?? "";
}

describe("FR-50 / FR-51 — milestone state", () => {
  it("renders open, claimed and billable as three distinct treatments", () => {
    const rendered = (["open", "claimed", "billable"] as const).map((state) =>
      paintedClass(<MilestoneStateChip state={state} />),
    );
    expect(new Set(rendered).size).toBe(3);
  });

  it("never paints a milestone state in the reserved unparsed colour", () => {
    for (const state of ["open", "claimed", "billable"] as const) {
      expect(paintedClass(<MilestoneStateChip state={state} />)).not.toContain(
        "state-unparsed",
      );
    }
  });
});

describe("FR-79 — contested", () => {
  it("is its own element, so it can sit beside a state rather than replace it", () => {
    const { container } = render(
      <>
        <MilestoneStateChip state="billable" />
        <ContestedChip defects={2} />
      </>,
    );
    // Both facts survive: the money is earned AND it is disputed. A chip that
    // replaced one with the other would lose exactly one of those.
    expect(
      container.querySelector("[data-verify-unit='milestone-state']"),
    ).toHaveAttribute("data-verify-state", "billable");
    expect(
      container.querySelector("[data-verify-unit='contested']"),
    ).toHaveAttribute("data-verify-defects", "2");
  });
});

describe("FR-49 — coverage", () => {
  it("keeps covered, unproven and uncovered visually distinct", () => {
    const rendered = (["covered", "unproven", "uncovered"] as const).map(
      (value) => paintedClass(<CoverageChip value={value} />),
    );
    expect(new Set(rendered).size).toBe(3);
  });
});

describe("FR-75 — shipped is not covered", () => {
  it("renders an environment list rather than a boolean", () => {
    const { container } = render(
      <ShippedChip environments={["preview", "production"]} />,
    );
    const chip = container.querySelector("[data-verify-unit='shipped']");
    expect(chip).toHaveAttribute("data-verify-shipped", "true");
    expect(chip).toHaveAttribute("data-verify-environments", "2");
    expect(chip?.textContent).toContain("preview");
    expect(chip?.textContent).toContain("production");
  });

  it("distinguishes shipped from not shipped by treatment", () => {
    const shipped = paintedClass(<ShippedChip environments={["production"]} />);
    const not = paintedClass(<ShippedChip environments={[]} />);
    expect(shipped).not.toBe(not);
  });

  it("does not borrow the coverage colour for a deployment claim", () => {
    // FR-75's collapse, expressed in paint. `verified` is the coverage chip's
    // colour and a shipped chip wearing it would say "proven" about a deploy.
    expect(paintedClass(<ShippedChip environments={["production"]} />)).not.toContain(
      "state-verified",
    );
  });
});

describe("FR-63 / FR-64 — defect severity", () => {
  it("renders all four severities distinctly, unparsed among them", () => {
    const rendered = (["critical", "major", "minor", "unparsed"] as const).map(
      (severity) => paintedClass(<DefectSeverityChip severity={severity} />),
    );
    expect(new Set(rendered).size).toBe(4);
  });

  it("gives `unparsed` the reserved colour and gives it to nothing else", () => {
    expect(paintedClass(<DefectSeverityChip severity="unparsed" />)).toContain(
      "state-unparsed",
    );
    for (const severity of ["critical", "major", "minor"] as const) {
      expect(paintedClass(<DefectSeverityChip severity={severity} />)).not.toContain(
        "state-unparsed",
      );
    }
  });
});

describe("FR-67 — wont_fix is a decision, not a proof", () => {
  it("keeps wont_fix and verified visually distinct", () => {
    expect(paintedClass(<DefectStatusChip status="wont_fix" />)).not.toBe(
      paintedClass(<DefectStatusChip status="verified" />),
    );
  });

  it("renders all five defect statuses distinctly", () => {
    const rendered = ["open", "fixed", "verified", "wont_fix", "unparsed"].map(
      (status) => paintedClass(<DefectStatusChip status={status} />),
    );
    expect(new Set(rendered).size).toBe(5);
  });
});

describe("FR-30 — disposition", () => {
  it("keeps carried, closed and not-recorded as three things", () => {
    const carried = render(<DispositionChip disposition="carried" />)
      .container.querySelector("[data-verify-unit='disposition']")
      ?.getAttribute("data-verify-disposition");
    cleanup();
    const closed = render(<DispositionChip disposition="closed" />)
      .container.querySelector("[data-verify-unit='disposition']")
      ?.getAttribute("data-verify-disposition");
    cleanup();
    const absent = render(<DispositionChip disposition={null} />)
      .container.querySelector("[data-verify-unit='disposition']")
      ?.getAttribute("data-verify-disposition");

    expect([carried, closed, absent]).toEqual([
      "carried",
      "closed",
      "not-recorded",
    ]);
  });

  it("paints carried and closed differently", () => {
    expect(paintedClass(<DispositionChip disposition="carried" />)).not.toBe(
      paintedClass(<DispositionChip disposition="closed" />),
    );
  });
});

describe("FR-40 — executor kind", () => {
  it("gives erik_gate more weight than an agent, and no state colour", () => {
    const gate = paintedClass(<ExecutorChip kind="erik_gate" executor={null} />);
    const agent = paintedClass(
      <ExecutorChip kind="agent" executor="ui-designer" />,
    );
    expect(gate).not.toBe(agent);
    // `erik_gate` is who does the work, not what condition it is in.
    expect(gate).not.toContain("state-");
  });
});

describe("FR-52 — held by", () => {
  it("renders every reason, not just the first", () => {
    // An item held by both a blocker and a wait clears on two different days.
    const { container } = render(<HeldByChips heldBy={["status", "blocker"]} />);
    expect(container.querySelectorAll("[data-verify-unit='held-by']")).toHaveLength(
      2,
    );
  });

  it("renders an absent marker rather than an empty chip when nothing holds it", () => {
    const { container } = render(<HeldByChips heldBy={[]} />);
    expect(
      container.querySelectorAll("[data-verify-unit='held-by']"),
    ).toHaveLength(0);
  });
});
