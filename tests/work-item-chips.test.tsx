import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  DispositionChip,
  EvidenceScopeChip,
  ExecutorChip,
  WorkStatusChip,
} from "@/app/work-items/_components/chips";
import {
  EVIDENCE_SCOPES,
  EXECUTOR_KINDS,
  WORK_STATUSES,
} from "@/app/work-items/_lib/labels";
import type { StoredEvidenceScope } from "@/lib/server/workitems/rules";

afterEach(cleanup);

/**
 * The chips FR-43, FR-30, FR-39 and FR-40 are rendered with.
 *
 * Every assertion below reads the DOM the component actually produced rather
 * than the table that produced it. Asserting a lookup map against itself passes
 * whatever the map says, which is exactly the check that would not catch two
 * states quietly collapsing into one.
 */

function markupOf(element: React.ReactElement, selector: string): string {
  const { container } = render(element);
  return container.querySelector(selector)?.outerHTML ?? "";
}

/**
 * The *styling* a chip renders with, and nothing else.
 *
 * `markupOf` compares whole elements, which includes the `data-verify-*`
 * attributes -- so two chips that look identical still differ in its output.
 * Mutation testing caught exactly that: styling `erik_gate` the same as `erik`
 * left every assertion green, because the state contract still distinguished
 * them. Any claim about **visual** distinction has to read the class list alone.
 *
 * Some chips delegate to `StateBadge`, which is where the classes then live, so
 * this reaches through to the badge when there is one.
 */
function classOf(element: React.ReactElement, selector: string): string {
  const { container } = render(element);
  const outer = container.querySelector(selector);
  const badge = outer?.querySelector("[data-verify-unit='state-badge']");
  return (badge ?? outer)?.className ?? "";
}

describe("EvidenceScopeChip — FR-43's four scopes stay four", () => {
  it("renders each of the four distinguishably", () => {
    const rendered = EVIDENCE_SCOPES.map((scope) =>
      classOf(<EvidenceScopeChip scope={scope} />, "[data-verify-unit='evidence-scope']"),
    );

    expect(new Set(rendered).size).toBe(4);
    expect(rendered.every((classes) => classes !== "")).toBe(true);
  });

  it("publishes the stored scope on the wrapper, so a test never guesses", () => {
    for (const scope of EVIDENCE_SCOPES) {
      const { container } = render(<EvidenceScopeChip scope={scope} />);
      expect(
        container
          .querySelector("[data-verify-unit='evidence-scope']")
          ?.getAttribute("data-verify-scope"),
      ).toBe(scope);
    }
  });

  it("does NOT collapse an unrecorded scope into `not verified`", () => {
    // "nobody wrote down a scope" and "somebody recorded that nothing checked"
    // are different facts. This is the single assertion most worth having here.
    // Distinct in what it looks like...
    expect(
      classOf(<EvidenceScopeChip scope={null} />, "[data-verify-unit='evidence-scope']"),
    ).not.toBe(
      classOf(
        <EvidenceScopeChip scope={"not_verified" satisfies StoredEvidenceScope} />,
        "[data-verify-unit='evidence-scope']",
      ),
    );

    // ...and distinct in what it claims.
    expect(
      markupOf(<EvidenceScopeChip scope={null} />, "[data-verify-unit='evidence-scope']"),
    ).toContain('data-verify-scope="not-recorded"');
    expect(
      markupOf(
        <EvidenceScopeChip scope="not_verified" />,
        "[data-verify-unit='evidence-scope']",
      ),
    ).toContain('data-verify-scope="not_verified"');
  });

  it("keeps `asserted` visibly different from `observed live`", () => {
    // The failure this product exists to prevent, in one comparison: someone
    // wrote it down, versus someone watched it happen.
    expect(
      classOf(<EvidenceScopeChip scope="asserted" />, "[data-verify-unit='evidence-scope']"),
    ).not.toBe(
      classOf(
        <EvidenceScopeChip scope="observed_live" />,
        "[data-verify-unit='evidence-scope']",
      ),
    );
  });
});

describe("WorkStatusChip", () => {
  it("renders all seven statuses distinguishably", () => {
    const rendered = WORK_STATUSES.map((status) =>
      classOf(<WorkStatusChip status={status} />, "[data-verify-unit='work-status']"),
    );
    expect(new Set(rendered).size).toBe(WORK_STATUSES.length);
  });

  it("reserves the unparsed colour for `unparsed` and nothing else", () => {
    for (const status of WORK_STATUSES) {
      const markup = markupOf(
        <WorkStatusChip status={status} />,
        "[data-verify-unit='work-status']",
      );
      if (status === "unparsed") expect(markup).toContain("state-unparsed");
      else expect(markup).not.toContain("state-unparsed");
    }
  });

  it("does not paint `done` with the verification colour", () => {
    // `status = done` is a claim an artifact made. FR-43's evidence scope is
    // what says whether anything checked it, and it is a different column.
    // Borrowing `state-verified` here would make the scale mean two things.
    const done = markupOf(
      <WorkStatusChip status="done" />,
      "[data-verify-unit='work-status']",
    );
    expect(done).not.toContain("state-verified");
    expect(done).not.toContain("state-observed-live");
  });

  it("publishes the stored status for assertions", () => {
    for (const status of WORK_STATUSES) {
      const { container } = render(<WorkStatusChip status={status} />);
      expect(
        container
          .querySelector("[data-verify-unit='work-status']")
          ?.getAttribute("data-verify-status"),
      ).toBe(status);
    }
  });
});

describe("DispositionChip — FR-30", () => {
  it("keeps carried, closed and unrecorded three different things", () => {
    const rendered = [
      classOf(<DispositionChip disposition="carried" />, "[data-verify-unit='disposition']"),
      classOf(<DispositionChip disposition="closed" />, "[data-verify-unit='disposition']"),
      classOf(<DispositionChip disposition={null} />, "[data-verify-unit='disposition']"),
    ];
    expect(new Set(rendered).size).toBe(3);
  });
});

describe("ExecutorChip — FR-39 and FR-40", () => {
  it("renders every executor kind", () => {
    for (const kind of EXECUTOR_KINDS) {
      const { container } = render(<ExecutorChip kind={kind} executor={null} />);
      expect(
        container
          .querySelector("[data-verify-unit='executor']")
          ?.getAttribute("data-verify-executor-kind"),
      ).toBe(kind);
    }
  });

  it("gives `erik_gate` its own weight rather than dressing up `erik`", () => {
    // FR-40: an erik_gate is a first-class executor kind, not a note. Compared
    // on the class list alone -- the data contract already distinguishes them,
    // so comparing whole elements would pass even if they looked identical.
    const gate = classOf(
      <ExecutorChip kind="erik_gate" executor={null} />,
      "[data-verify-unit='executor']",
    );
    const erik = classOf(
      <ExecutorChip kind="erik" executor={null} />,
      "[data-verify-unit='executor']",
    );

    expect(gate).not.toBe(erik);
    expect(
      markupOf(
        <ExecutorChip kind="erik_gate" executor={null} />,
        "[data-verify-unit='executor']",
      ),
    ).toContain("Erik gate");
  });

  it("borrows no colour from the semantic state scale", () => {
    // `erik_gate` is who does the work, not what condition the work is in.
    const gate = classOf(
      <ExecutorChip kind="erik_gate" executor={null} />,
      "[data-verify-unit='executor']",
    );
    expect(gate).not.toContain("state-");
  });
});
