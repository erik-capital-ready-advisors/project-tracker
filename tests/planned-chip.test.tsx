import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExecutionModeChip } from "@/app/work-items/_components/chips";
import { WorkItemTable } from "@/app/work-items/_components/work-item-table";
import { parseWorkItemQuery } from "@/app/work-items/_lib/query";
import { PlannedChip } from "@/components/planned-chip";
import { ALL_WORK_STATES } from "@/components/state-badge";
import { EXECUTION_MODE_UNPARSED } from "@/lib/ingest/types";
import type { ListedWorkItem } from "@/lib/server/workitems/list";
import { PLANNED_STALE_AFTER_DAYS } from "@/lib/server/workitems/planned";

const QUERY = parseWorkItemQuery({});

afterEach(cleanup);

/**
 * FR-91's visual treatment, and the D-1 symptom on the screen it reached.
 *
 * ## Why this file exists at all
 *
 * `ExecutionModeChip` shipped with **no test of its own**. That is why a NULL
 * `execution_mode` could reach `EXECUTION_MODE_LABELS[…]`, come back `undefined`
 * and render an empty chip on `/work-items` with the whole suite green — the
 * same shape as B43 and B46, where a component nothing ever mounted was broken
 * for every reader and provably fine to every test.
 *
 * Every assertion below reads the DOM the component produced. Asserting a lookup
 * table against itself passes whatever the table says, which is precisely the
 * check that cannot catch two states collapsing into one.
 */

function draw(element: React.ReactElement): HTMLElement {
  const { container } = render(element);
  return container;
}

function chip(container: HTMLElement, unit: string): HTMLElement | null {
  return container.querySelector(`[data-verify-unit="${unit}"]`);
}

const TODAY = "2026-08-24";

/** A planned row last touched `days` before `TODAY`. */
function touchedDaysAgo(days: number): { planned: boolean; updatedAt: string } {
  const asOf = new Date(`${TODAY}T00:00:00Z`);
  asOf.setUTCDate(asOf.getUTCDate() - days);
  return { planned: true, updatedAt: asOf.toISOString() };
}

describe("ExecutionModeChip — no input renders blank", () => {
  it("names an absent mode on a planned row instead of drawing nothing", () => {
    // The D-1 symptom: `EXECUTION_MODE_LABELS[null]` is `undefined`.
    const container = draw(<ExecutionModeChip mode={null} planned />);
    const rendered = chip(container, "execution-mode");

    expect(rendered).not.toBeNull();
    expect(rendered?.textContent?.trim()).not.toBe("");
    expect(rendered?.getAttribute("data-verify-mode")).toBe("none");
  });

  it("does not claim a planned row is fleet work", () => {
    const container = draw(<ExecutionModeChip mode={null} planned />);
    expect(container.textContent).not.toContain("fleet");
  });

  it("says unparsed when a mode is absent and nothing explains why", () => {
    const container = draw(<ExecutionModeChip mode={null} planned={false} />);
    expect(chip(container, "execution-mode")?.getAttribute("data-verify-mode")).toBe(
      "unparsed",
    );
  });

  it("says unparsed for a value it could not read", () => {
    const container = draw(
      <ExecutionModeChip mode={EXECUTION_MODE_UNPARSED} planned={false} />,
    );
    expect(chip(container, "execution-mode")?.getAttribute("data-verify-mode")).toBe(
      "unparsed",
    );
  });

  it("renders each real mode as itself", () => {
    for (const mode of ["fleet", "hand", "external"] as const) {
      cleanup();
      const container = draw(<ExecutionModeChip mode={mode} planned={false} />);
      const rendered = chip(container, "execution-mode");
      expect(rendered?.getAttribute("data-verify-mode")).toBe(mode);
      expect(rendered?.textContent).toContain(mode);
    }
  });

  /**
   * The two read paths hand this chip the same row in different shapes — the
   * listing passes the raw NULL, the domain loaders pass the `unparsed`
   * sentinel. A planned row must draw the same chip either way, or
   * `/work-items` and `/work-items/<id>` disagree about one row.
   */
  it("draws one chip for a planned row whichever shape the row arrives in", () => {
    const fromListing = draw(<ExecutionModeChip mode={null} planned />);
    const listingMode = chip(fromListing, "execution-mode")?.outerHTML;
    cleanup();
    const fromDomain = draw(
      <ExecutionModeChip mode={EXECUTION_MODE_UNPARSED} planned />,
    );
    expect(chip(fromDomain, "execution-mode")?.outerHTML).toBe(listingMode);
  });
});

describe("PlannedChip — FR-91's four states", () => {
  it("renders nothing for a row that is not planned", () => {
    const container = draw(
      <PlannedChip item={{ planned: false, updatedAt: null }} asOf={TODAY} />,
    );
    expect(chip(container, "planned")).toBeNull();
  });

  it("labels a fresh planned row and says how old it is", () => {
    const container = draw(<PlannedChip item={touchedDaysAgo(3)} asOf={TODAY} />);
    const rendered = chip(container, "planned");

    expect(rendered?.getAttribute("data-verify-planned-state")).toBe("fresh");
    expect(rendered?.getAttribute("data-verify-days-untouched")).toBe("3");
    expect(rendered?.textContent).toContain("planned");
    expect(rendered?.textContent).toContain("3d");
  });

  it("surfaces a planned row untouched for thirty days as stale", () => {
    const container = draw(
      <PlannedChip item={touchedDaysAgo(PLANNED_STALE_AFTER_DAYS)} asOf={TODAY} />,
    );
    const rendered = chip(container, "planned");

    expect(rendered?.getAttribute("data-verify-planned-state")).toBe("stale");
    expect(rendered?.textContent).toContain("stale");
  });

  /** The boundary is inclusive, so the day before it is not stale. */
  it("does not call the twenty-ninth day stale", () => {
    const container = draw(
      <PlannedChip
        item={touchedDaysAgo(PLANNED_STALE_AFTER_DAYS - 1)}
        asOf={TODAY}
      />,
    );
    expect(chip(container, "planned")?.getAttribute("data-verify-planned-state")).toBe(
      "fresh",
    );
  });

  /**
   * i4's deliberate fourth state. Collapsing it into `fresh` hides a row that
   * may have sat for a year; collapsing it into `stale` cries wolf. Either is
   * the same class of lie as a wrong `done`.
   */
  it("draws an unreadable timestamp as its own state, not as fresh or stale", () => {
    const container = draw(
      <PlannedChip item={{ planned: true, updatedAt: null }} asOf={TODAY} />,
    );
    const rendered = chip(container, "planned");

    expect(rendered).not.toBeNull();
    expect(rendered?.getAttribute("data-verify-planned-state")).toBe("unknown");
    expect(rendered?.getAttribute("data-verify-days-untouched")).toBe("unknown");
    expect(rendered?.textContent).not.toContain("stale");
  });

  it("gives the three rendered states three different treatments", () => {
    const markup = new Set<string>();
    const items = [
      touchedDaysAgo(1),
      touchedDaysAgo(PLANNED_STALE_AFTER_DAYS + 10),
      { planned: true, updatedAt: null },
    ];
    for (const item of items) {
      cleanup();
      const rendered = chip(draw(<PlannedChip item={item} asOf={TODAY} />), "planned");
      markup.add(rendered?.getAttribute("class") ?? "");
    }
    expect(markup.size).toBe(3);
  });
});

/**
 * A component with a test of its own that no screen ever mounts is the B43/B46
 * shape: green suite, broken product. So the wiring is asserted through the real
 * table rather than trusted.
 */
describe("/work-items mounts the chip on a real row", () => {
  function listedPlannedRow(): ListedWorkItem {
    return {
      id: "a1000000-0000-4000-8000-000000000001",
      engagementId: "e1000000-0000-4000-8000-000000000001",
      engagementSlug: "northwind",
      unit: "u9",
      // FR-87: a planned row has no mode. This is the raw column.
      executionMode: null,
      executorKind: "unassigned",
      executor: null,
      status: "pending",
      workType: "ui",
      phase: 1,
      disposition: null,
      unautomatedReason: null,
      evidenceScope: null,
      notVerifiedCount: 0,
      stackName: null,
      blockerId: null,
      externalWaitId: null,
      startedAt: null,
      endedAt: null,
      description: null,
      planned: true,
      updatedAt: touchedDaysAgo(PLANNED_STALE_AFTER_DAYS + 4).updatedAt,
    };
  }

  it("draws the planned chip and no blank mode chip", () => {
    const container = draw(
      <WorkItemTable items={[listedPlannedRow()]} query={QUERY} asOf={TODAY} />,
    );

    expect(chip(container, "planned")?.getAttribute("data-verify-planned-state")).toBe(
      "stale",
    );
    const mode = chip(container, "execution-mode");
    expect(mode?.getAttribute("data-verify-mode")).toBe("none");
    expect(mode?.textContent?.trim()).not.toBe("");
  });

  it("publishes the row's planned state for the reviewer to assert against", () => {
    const container = draw(
      <WorkItemTable items={[listedPlannedRow()]} query={QUERY} asOf={TODAY} />,
    );
    const row = container.querySelector('[data-verify-unit="work-item-row"]');
    expect(row?.getAttribute("data-verify-planned")).toBe("true");
    expect(row?.getAttribute("data-verify-mode")).toBe("none");
  });
});

/**
 * Spec 5a's recorded B11 decision fixes the state scale at sixteen tokens and
 * reserves fuchsia for `unparsed` alone. FR-91's treatment introduces no
 * seventeenth, and STALE does not reach for the reserved one.
 */
describe("FR-91 introduces no new state colour", () => {
  it("leaves the state scale at its sixteen members", () => {
    expect(ALL_WORK_STATES).toHaveLength(16);
    expect(ALL_WORK_STATES).not.toContain("planned");
    expect(ALL_WORK_STATES).not.toContain("stale");
  });

  it("does not paint STALE with the token reserved for unparsed", () => {
    const rendered = chip(
      draw(
        <PlannedChip
          item={touchedDaysAgo(PLANNED_STALE_AFTER_DAYS + 5)}
          asOf={TODAY}
        />,
      ),
      "planned",
    );
    expect(rendered?.getAttribute("class")).not.toContain("state-unparsed");
  });

  it("takes STALE's colour from a token the scale already defines", () => {
    const rendered = chip(
      draw(
        <PlannedChip
          item={touchedDaysAgo(PLANNED_STALE_AFTER_DAYS + 5)}
          asOf={TODAY}
        />,
      ),
      "planned",
    );
    expect(rendered?.getAttribute("class")).toContain("state-contested");
  });
});
