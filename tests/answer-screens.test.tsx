import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BlockedGroup } from "@/app/blocked/_components/blocked-group";
import { BottleneckTable } from "@/app/bottleneck/_components/bottleneck-table";
import { EngagementBroken } from "@/app/broken/_components/engagement-broken";
import { CommittedTable } from "@/app/committed/_components/committed-table";
import { CommittedTotalsStrip } from "@/app/committed/_components/committed-totals";
import { NextTable } from "@/app/next/_components/next-table";
import { EngagementCoverage } from "@/app/untested/_components/engagement-coverage";
import {
  DegradedOrderNotice,
  RejectedFilters,
  SetAsideCounts,
  UnknownEngagementNotice,
} from "@/components/answer-notices";
import type { RefLookup } from "@/lib/answer-screen-refs";

import {
  BLOCKED,
  BOTTLENECK,
  BROKEN,
  COMMITTED,
  COVERAGE,
  NEXT,
  NEXT_DEGRADED,
} from "./answer-samples";

afterEach(cleanup);

/**
 * The reference resolution these components render against (CR-003 FR-80).
 *
 * Every text reference resolves here, so these tests keep asserting what they
 * were written to assert and nothing about them was weakened to accommodate
 * `<EntityRef>`. FR-83's two states — resolved and dangling — are asserted
 * where they belong, in `answer-screen-refs.test.tsx`.
 */
const REFS: RefLookup = (kind, engagement, ref) =>
  `resolved-${kind}-${engagement}-${ref}`;

const q = (c: HTMLElement, s: string) => c.querySelector(s);
const all = (c: HTMLElement, s: string) => [...c.querySelectorAll(s)];

/* ------------------------------------------------------------------ FR-52 */

describe("Blocked (FR-52)", () => {
  it("groups by owner and carries each group's elapsed figure", () => {
    const { container } = render(<BlockedGroup group={BLOCKED.groups[0]} refs={REFS} />);
    const group = q(container, "[data-verify-unit='blocked-group']");
    expect(group).toHaveAttribute("data-verify-owner", "erik");
    expect(group).toHaveAttribute("data-verify-longest-days", "21");
  });

  it("keeps FR-30's carried and closed apart on the rows", () => {
    const { container } = render(<BlockedGroup group={BLOCKED.groups[0]} refs={REFS} />);
    const dispositions = all(container, "[data-verify-unit='blocked-item']").map(
      (row) => row.getAttribute("data-verify-disposition"),
    );
    expect(dispositions).toEqual(["carried", "closed"]);
  });

  it("renders an unrecorded disposition as a third thing, not as closed", () => {
    const { container } = render(<BlockedGroup group={BLOCKED.groups[1]} refs={REFS} />);
    expect(q(container, "[data-verify-unit='blocked-item']")).toHaveAttribute(
      "data-verify-disposition",
      "not-recorded",
    );
  });

  it("renders every reason an item is held, not only the first", () => {
    const { container } = render(<BlockedGroup group={BLOCKED.groups[0]} refs={REFS} />);
    expect(q(container, "[data-verify-unit='blocked-item']")).toHaveAttribute(
      "data-verify-held",
      "status,blocker",
    );
  });

  it("shows a missing elapsed count as absent rather than as zero days", () => {
    // "nobody recorded when this started" and "this started today" are
    // different facts, and only one of them is good news.
    const { container } = render(<BlockedGroup group={BLOCKED.groups[1]} refs={REFS} />);
    const row = q(container, "[data-verify-unit='blocked-item']");
    expect(row?.textContent).not.toContain("0 days");
  });

  it("puts work items and waits in separately labelled tables", () => {
    // Observed on the running app: stacked with no label, two tables whose
    // columns do not align read as one table that has gone wrong.
    const { container } = render(<BlockedGroup group={BLOCKED.groups[0]} refs={REFS} />);
    expect(q(container, "[data-verify-unit='blocked-items']")).not.toBeNull();
    expect(q(container, "[data-verify-unit='blocked-waits']")).not.toBeNull();
    expect(container.textContent).toContain("Blocked work items");
    expect(container.textContent).toContain("Open external waits");
  });

  it("marks an overdue wait", () => {
    const { container } = render(<BlockedGroup group={BLOCKED.groups[0]} refs={REFS} />);
    expect(q(container, "[data-verify-unit='blocked-wait']")).toHaveAttribute(
      "data-verify-overdue",
      "true",
    );
  });
});

/* ------------------------------------------------------------------ FR-53 */

describe("Next (FR-53)", () => {
  it("publishes the ordering it actually computed", () => {
    const { container } = render(<NextTable answer={NEXT} refs={REFS} />);
    expect(q(container, "[data-verify-unit='next-table']")).toHaveAttribute(
      "data-verify-ordering",
      "milestone-due-date",
    );
  });

  it("drops the ordering marker when the ordering is a fallback", () => {
    // A sort arrow on a column the list is not sorted by is a small lie the
    // reader would act on.
    const ordered = render(<NextTable answer={NEXT} refs={REFS} />);
    const orderedHeader = [...ordered.container.querySelectorAll("th")].find(
      (th) => th.textContent?.includes("nearest milestone"),
    );
    expect(orderedHeader?.getAttribute("aria-sort")).toBe("ascending");
    cleanup();

    const degraded = render(<NextTable answer={NEXT_DEGRADED} refs={REFS} />);
    const degradedHeader = [...degraded.container.querySelectorAll("th")].find(
      (th) => th.textContent?.includes("nearest milestone"),
    );
    expect(degradedHeader?.getAttribute("aria-sort")).toBe("none");
  });

  it("distinguishes an undated milestone from no milestone at all", () => {
    const { container } = render(<NextTable answer={NEXT} refs={REFS} />);
    const rows = all(container, "[data-verify-unit='next-item']");
    // Row 2 serves an undated milestone; row 3 serves none.
    expect(rows[1]).toHaveAttribute("data-verify-milestone", "m-2");
    expect(rows[1]?.textContent).toContain("no due date");
    expect(rows[2]).toHaveAttribute("data-verify-milestone", "none");
  });

  it("states the degradation with the payload's own reason", () => {
    const { container } = render(
      <DegradedOrderNotice
        reason={NEXT_DEGRADED.orderingUnavailableReason as string}
        what="ordering"
      />,
    );
    expect(q(container, "[data-verify-unit='degraded-order']")).toHaveAttribute(
      "data-verify-what",
      "ordering",
    );
    expect(container.textContent).toContain("contract_milestone.due_date");
  });

  it("counts what it set aside instead of dropping it silently", () => {
    const { container } = render(
      <SetAsideCounts
        counts={[
          { label: "held by a dependency", value: NEXT.heldByDependency },
          { label: "held by a blocker or wait", value: NEXT.heldByBlocker },
          {
            label: "status could not be classified",
            value: NEXT.unparsedCandidates,
            unparsed: true,
          },
        ]}
      />,
    );
    const counts = all(container, "[data-verify-unit='set-aside-count']").map(
      (el) => el.getAttribute("data-verify-count"),
    );
    expect(counts).toEqual(["6", "2", "4"]);
  });
});

/* --------------------------------------------------------------- FR-54/75 */

describe("Committed (FR-54, FR-51, FR-75, FR-79)", () => {
  it("reports covered and shipped as two separate answers", () => {
    const { container } = render(<CommittedTable milestones={COMMITTED} refs={REFS} />);
    const first = all(container, "[data-verify-unit='committed-row']")[0];
    // Fully covered, shipped to nothing. A single "done" column would have to
    // pick one of these and would be wrong either way.
    expect(first).toHaveAttribute("data-verify-covered", "2");
    expect(first).toHaveAttribute("data-verify-shipped", "0");
    expect(first).toHaveAttribute("data-verify-acceptance", "2");
  });

  it("paints the covered fraction and the shipped fraction in their own columns", () => {
    // The attributes above survive the two fractions being rendered into each
    // other's columns; the numbers on screen do not. FR-75 is a claim about
    // what Erik reads, so this reads what is painted.
    const { container } = render(<CommittedTable milestones={COMMITTED} refs={REFS} />);
    const first = all(container, "[data-verify-unit='committed-row']")[0];
    expect(
      first?.querySelector("[data-verify-unit='fraction-coverage']")?.textContent,
    ).toBe("2/2");
    expect(
      first?.querySelector("[data-verify-unit='fraction-shipped']")?.textContent,
    ).toBe("0/2");
  });

  it("keeps claimed distinct from billable (FR-51)", () => {
    const { container } = render(<CommittedTable milestones={COMMITTED} refs={REFS} />);
    const states = all(container, "[data-verify-unit='committed-row']").map((r) =>
      r.getAttribute("data-verify-state"),
    );
    expect(states).toEqual(["billable", "claimed", "billable", "open"]);
  });

  it("renders a contested milestone as billable AND flagged (FR-79)", () => {
    const { container } = render(<CommittedTable milestones={COMMITTED} refs={REFS} />);
    const contested = all(container, "[data-verify-unit='committed-row']")[2];
    expect(contested).toHaveAttribute("data-verify-state", "billable");
    expect(contested).toHaveAttribute("data-verify-contested", "true");
    // Both elements present: the money is earned and it is disputed.
    expect(q(container, "[data-verify-unit='contested']")).not.toBeNull();
  });

  it("keeps a zero amount and an unreadable amount apart", () => {
    const { container } = render(<CommittedTable milestones={COMMITTED} refs={REFS} />);
    const rows = all(container, "[data-verify-unit='committed-row']");
    expect(rows[1]).toHaveAttribute("data-verify-amount-readable", "true");
    // B32: through `formatAmount`, not the deleted `money()` — a real EUR zero
    // reads "€0.00", not the old "0.00 EUR".
    expect(rows[1]?.textContent).toContain("€0.00");
    expect(rows[2]).toHaveAttribute("data-verify-amount-readable", "false");
    expect(rows[2]?.textContent).toContain("unreadable");
  });

  /**
   * B32 — "two money formatters disagree, and M2.7 put them one click apart."
   * `/committed` (this table, via the now-deleted `money()`) and
   * `/milestones/[id]` (via `formatAmount`) rendered the same
   * `contract_milestone` row differently. Both now call `formatAmount`, so this
   * pins the three disagreements QA found, directly against this screen.
   */
  describe("B32 — one formatter, not two", () => {
    it("uses formatAmount's symbol-and-comma style, not the deleted money()'s code-and-narrow-space style", () => {
      const { container } = render(<CommittedTable milestones={COMMITTED} refs={REFS} />);
      const rows = all(container, "[data-verify-unit='committed-row']");
      // m-1: amount 12500, EUR. `formatAmount` -> "€12,500.00" (symbol, comma).
      // The deleted `money()` produced "12 500.00 EUR" (code, U+202F space) --
      // neither substring should survive the consolidation.
      expect(rows[0]?.textContent).toContain("€12,500.00");
      expect(rows[0]?.textContent).not.toContain("12 500.00");
      expect(rows[0]?.textContent).not.toContain("EUR");
    });

    it("renders the same amount identically to /milestones/[id] — the adjacency B32 names as the defect", () => {
      // `tests/detail-milestone.test.tsx` pins `amount: 111, currency: "USD"`
      // rendered by `/milestones/[id]` (via `formatAmount`) as literally
      // "$111.00". This table renders the identical amount/currency pair
      // through the same `formatAmount` call, so the two screens can no longer
      // disagree on what one `contract_milestone` row is worth.
      const identical = [{ ...COMMITTED[0], amount: 111, currency: "USD" }];
      const { container } = render(<CommittedTable milestones={identical} refs={REFS} />);
      expect(container.textContent).toContain("$111.00");
    });

    it("reverses the currency-code position for an unrecognised currency, exactly as formatAmount does everywhere else", () => {
      // Pinning the actual, measured behaviour rather than the assumed one:
      // `Intl.NumberFormat` does NOT throw for a syntactically well-formed but
      // fictional 3-letter code like "ZZZ" -- it treats the code itself as the
      // currency symbol and PREFIXES it (joined with U+00A0, not a plain
      // space -- also measured, not assumed), unlike every real currency's
      // symbol-prefix rendering, and unlike the deleted money()'s always-
      // suffixed code. `formatAmount`'s own catch branch (code suffixed,
      // "<number> <code>") is reachable only by a MALFORMED code -- see
      // `tests/registry-display.test.ts` for that path pinned directly.
      const unrecognised = [{ ...COMMITTED[0], amount: 1500, currency: "ZZZ" }];
      const { container } = render(<CommittedTable milestones={unrecognised} refs={REFS} />);
      expect(container.textContent).toContain("ZZZ 1,500.00");
    });

    it("renders a genuinely unpriced milestone as absent, never as unreadable and never as zero", () => {
      // No row in the shared COMMITTED fixture exercises `amount: null` with
      // `amountUnreadable: false` (nobody has priced the milestone at all, as
      // opposed to a stored ciphertext that would not decrypt) -- so this is
      // built locally rather than by widening the shared fixture. This is the
      // branch `committed-table.tsx` had to re-derive when it switched from
      // checking `money()`'s bare `null` to `formatAmount`'s `.readable`.
      const unpriced = [{ ...COMMITTED[0], amount: null, amountUnreadable: false }];
      const { container } = render(<CommittedTable milestones={unpriced} refs={REFS} />);
      const row = q(container, "[data-verify-unit='committed-row']");
      expect(row?.textContent).not.toContain("unreadable");
      expect(row?.textContent).not.toContain("0.00");
      expect(row?.querySelector("[title='No amount was recorded for this milestone.']")).not.toBeNull();
    });
  });

  it("publishes no contract amount into any state contract", () => {
    // §7a classes `contract_milestone` sensitive and encrypts `amount`. Writing
    // it into a data attribute for a test's convenience would put a client's
    // contract value in the DOM in clear.
    const { container } = render(<CommittedTable milestones={COMMITTED} refs={REFS} />);
    for (const row of all(container, "[data-verify-unit='committed-row']")) {
      for (const attr of [...row.attributes]) {
        if (!attr.name.startsWith("data-verify-")) continue;
        expect(attr.value).not.toContain("12500");
        expect(attr.value).not.toContain("3000");
      }
    }
  });

  it("says per acceptance requirement which of covered and shipped it has", () => {
    const { container } = render(<CommittedTable milestones={COMMITTED} refs={REFS} />);
    const refs = all(container, "[data-verify-unit='acceptance-ref']").map(
      (el) => ({
        ref: el.getAttribute("data-verify-ref"),
        covered: el.getAttribute("data-verify-covered"),
        shipped: el.getAttribute("data-verify-shipped"),
        regressed: el.getAttribute("data-verify-regressed"),
      }),
    );
    // The third milestone is 1/2 on both, and on *different* requirements —
    // exactly what the aggregate fractions cannot tell you.
    expect(refs).toContainEqual({
      ref: "FR-20",
      covered: "true",
      shipped: "true",
      regressed: "false",
    });
    expect(refs).toContainEqual({
      ref: "FR-21",
      covered: "true",
      shipped: "false",
      regressed: "true",
    });
  });

  it("marks unclassified defects against a milestone rather than dropping them", () => {
    const { container } = render(<CommittedTable milestones={COMMITTED} refs={REFS} />);
    expect(
      q(container, "[data-verify-unit='unclassified-defects']"),
    ).toHaveAttribute("data-verify-count", "1");
  });

  it("declines a total across currencies instead of inventing one", () => {
    const { container } = render(
      <CommittedTotalsStrip
        totals={{
          currency: null,
          committed: 0,
          billable: 0,
          submitted: 0,
          paid: 0,
          unreadable: 0,
        }}
      />,
    );
    expect(q(container, "[data-verify-unit='committed-totals']")).toHaveAttribute(
      "data-verify-currency",
      "mixed",
    );
    expect(container.textContent).toContain("more than one currency");
  });

  it("says how much the totals are missing when a row would not decrypt", () => {
    const { container } = render(
      <CommittedTotalsStrip
        totals={{
          currency: "EUR",
          committed: 15500,
          billable: 12500,
          submitted: 0,
          paid: 0,
          unreadable: 1,
        }}
      />,
    );
    expect(q(container, "[data-verify-unit='totals-unreadable']")).toHaveAttribute(
      "data-verify-count",
      "1",
    );
  });

  it("B32: formats totals through formatAmount too, not the deleted money()", () => {
    // Before B32, the totals strip and this table both imported `money()` and
    // stated the currency the deleted module's way -- comma-and-symbol here
    // means the strip is no longer a second formatter.
    const { container } = render(
      <CommittedTotalsStrip
        totals={{
          currency: "EUR",
          committed: 15500,
          billable: 12500,
          submitted: 0,
          paid: 0,
          unreadable: 0,
        }}
      />,
    );
    expect(container.textContent).toContain("€15,500.00");
    expect(container.textContent).not.toContain("15 500.00");
  });
});

/* ------------------------------------------------------------ FR-48/49/55 */

describe("Untested (FR-48, FR-49, FR-55)", () => {
  it("reports uncovered, unproven and self-certified as three counts", () => {
    const { container } = render(<EngagementCoverage coverage={COVERAGE} refs={REFS} />);
    const section = q(container, "[data-verify-unit='engagement-coverage']");
    expect(section).toHaveAttribute("data-verify-uncovered", "2");
    expect(section).toHaveAttribute("data-verify-unproven", "1");
    expect(section).toHaveAttribute("data-verify-self-certified", "1");
  });

  it("never renders a single combined tested figure", () => {
    const { container } = render(<EngagementCoverage coverage={COVERAGE} refs={REFS} />);
    const labels = all(container, "[data-verify-unit='coverage-count']").map(
      (el) => el.getAttribute("data-verify-label"),
    );
    // Each of the three states has its own count. A "% tested" would have to
    // merge at least two of them.
    expect(labels).toContain("uncovered");
    expect(labels).toContain("unproven");
    expect(labels).toContain("covered");
    expect(labels.join(" ")).not.toContain("tested%");
  });

  it("FR-55 links each uncovered requirement to what implements it", () => {
    const { container } = render(<EngagementCoverage coverage={COVERAGE} refs={REFS} />);
    const rows = all(container, "[data-verify-unit='uncovered-requirement']");
    expect(rows[0]).toHaveAttribute("data-verify-ref", "FR-31");
    expect(rows[0]).toHaveAttribute("data-verify-implementers", "1");
    expect(q(container, "[data-verify-unit='implementer']")).toHaveAttribute(
      "data-verify-id",
      "wi-20",
    );
  });

  it("states when nothing at all claims to implement a requirement", () => {
    // A different, and usually worse, finding than "built but untested".
    const { container } = render(<EngagementCoverage coverage={COVERAGE} refs={REFS} />);
    expect(
      q(container, "[data-verify-unit='unimplemented-requirement']"),
    ).not.toBeNull();
  });

  it("renders the unproven section separately from the uncovered one", () => {
    const { container } = render(<EngagementCoverage coverage={COVERAGE} refs={REFS} />);
    expect(q(container, "[data-verify-unit='uncovered-section']")).not.toBeNull();
    expect(q(container, "[data-verify-unit='unproven-section']")).not.toBeNull();
  });

  it("names the certifier and the author of a self-certified test", () => {
    const { container } = render(<EngagementCoverage coverage={COVERAGE} refs={REFS} />);
    const row = q(container, "[data-verify-unit='self-certified-test']");
    expect(row?.textContent).toContain("api-integrator");
  });
});

/* ------------------------------------------------------------------ FR-56 */

describe("Bottleneck (FR-56)", () => {
  it("prints the direct dependent count beside the transitive one", () => {
    // A ranking figure the reader cannot check is one they trust blindly or
    // ignore.
    const { container } = render(<BottleneckTable answer={BOTTLENECK} />);
    const row = q(container, "[data-verify-unit='bottleneck-item']");
    expect(row).toHaveAttribute("data-verify-unblocks", "12");
    expect(row).toHaveAttribute("data-verify-direct", "2");
  });

  it("paints the transitive figure, not the direct one, as the rank", () => {
    // Asserting the row's attributes alone does NOT catch the two figures being
    // swapped in the cell — a mutation that rendered `directDependents` in the
    // rank position survived the assertion above, because the attribute still
    // read 12 while the number on screen read 2. FR-56 ranks by the transitive
    // count, so the transitive count is what has to be painted.
    const { container } = render(<BottleneckTable answer={BOTTLENECK} />);
    const rank = q(container, "[data-verify-unit='unblocks-figure']");
    const direct = q(container, "[data-verify-unit='direct-figure']");
    expect(rank?.textContent?.trim()).toBe("12");
    expect(direct?.textContent?.trim()).toBe("2 direct");
  });

  it("distinguishes erik from erik_gate (FR-40)", () => {
    const { container } = render(<BottleneckTable answer={BOTTLENECK} />);
    const kinds = all(container, "[data-verify-unit='bottleneck-item']").map(
      (r) => r.getAttribute("data-verify-executor-kind"),
    );
    expect(kinds).toEqual(["erik_gate", "erik"]);
  });

  it("marks an item that a blocker or wait also holds", () => {
    const { container } = render(<BottleneckTable answer={BOTTLENECK} />);
    const rows = all(container, "[data-verify-unit='bottleneck-item']");
    expect(rows[0]).toHaveAttribute("data-verify-also-held", "false");
    expect(rows[1]).toHaveAttribute("data-verify-also-held", "true");
    expect(q(container, "[data-verify-unit='also-held']")).not.toBeNull();
  });

  it("publishes the ranking it actually computed", () => {
    const { container } = render(<BottleneckTable answer={BOTTLENECK} />);
    expect(q(container, "[data-verify-unit='bottleneck-table']")).toHaveAttribute(
      "data-verify-ranking",
      "unblocks-then-milestone",
    );
  });
});

/* --------------------------------------------------------------- FR-69/71 */

describe("Broken (FR-71, FR-69, FR-66)", () => {
  it("renders every severity group including the empty ones", () => {
    // An absent `minor` group and an empty one look identical to a reader
    // scanning for the worst bucket, and only one of them means "none".
    const { container } = render(<EngagementBroken broken={BROKEN} refs={REFS} />);
    const groups = all(container, "[data-verify-unit='severity-group']").map(
      (g) => [
        g.getAttribute("data-verify-severity"),
        g.getAttribute("data-verify-count"),
      ],
    );
    expect(groups).toEqual([
      ["critical", "1"],
      ["major", "1"],
      ["minor", "0"],
      ["unparsed", "1"],
    ]);
  });

  it("records both statuses where the derived one disagrees with the recorded", () => {
    // "emit what an artifact says, and where two artifacts disagree, record
    // both." A row showing only `fixed` would be the wrong-done this product
    // exists to prevent.
    const { container } = render(<EngagementBroken broken={BROKEN} refs={REFS} />);
    const row = q(container, "[data-verify-unit='defect-row']");
    expect(row).toHaveAttribute("data-verify-status", "open");
    expect(row).toHaveAttribute("data-verify-recorded-status", "fixed");
    expect(row).toHaveAttribute("data-verify-disagrees", "true");
    expect(
      q(container, "[data-verify-unit='status-disagreement']"),
    ).not.toBeNull();
  });

  it("says why a defect is still open rather than only that it is", () => {
    const { container } = render(<EngagementBroken broken={BROKEN} refs={REFS} />);
    const row = q(container, "[data-verify-unit='defect-row']");
    expect(row).toHaveAttribute("data-verify-blocked-by", "self-certified");
    expect(row?.textContent).toContain("certified by whoever fixed it");
  });

  it("keeps the two regression kinds in two sections", () => {
    const { container } = render(<EngagementBroken broken={BROKEN} refs={REFS} />);
    expect(q(container, "[data-verify-unit='test-regressions']")).toHaveAttribute(
      "data-verify-count",
      "1",
    );
    expect(
      q(container, "[data-verify-unit='requirement-regressions']"),
    ).toHaveAttribute("data-verify-count", "1");
  });

  it("shows a requirement regression that has no failing test", () => {
    // FR-69's second kind, and the case a merged "regressions" number would
    // hide completely: coverage lost with nothing going red.
    const { container } = render(<EngagementBroken broken={BROKEN} refs={REFS} />);
    const row = q(container, "[data-verify-unit='requirement-regression']");
    expect(row).toHaveAttribute("data-verify-failing", "0");
    expect(
      q(container, "[data-verify-unit='regression-without-failure']"),
    ).not.toBeNull();
  });

  it("renders a defect with no allocated reference rather than hiding it", () => {
    const { container } = render(<EngagementBroken broken={BROKEN} refs={REFS} />);
    const rows = all(container, "[data-verify-unit='defect-row']");
    const unallocated = rows.find(
      (r) => r.getAttribute("data-verify-ref") === "unallocated",
    );
    expect(unallocated).toBeDefined();
  });

  it("puts no defect description anywhere in the markup", () => {
    // §7a: `title` is clear by stated exception; `description` is ciphertext
    // and is never selected on this path. Nothing here can render one.
    const { container } = render(<EngagementBroken broken={BROKEN} refs={REFS} />);
    expect(container.textContent).toContain("checkout 500s on submit");
    expect(container.textContent).not.toContain("description");
  });
});

/* ---------------------------------------------------------------- notices */

describe("the notices that stop a wrong answer looking right", () => {
  it("names every rejected filter and says the answer is not narrowed by them", () => {
    const { container } = render(
      <RejectedFilters
        rejected={[{ field: "severity", value: "crit" }]}
      />,
    );
    const el = q(container, "[data-verify-unit='rejected-filters']");
    expect(el).toHaveAttribute("data-verify-count", "1");
    expect(el?.textContent).toContain("severity=crit");
    // Amber, never fuchsia: u4 shipped this panel in the reserved colour and
    // found it only by running the app.
    expect(el?.className).not.toContain("state-unparsed");
  });

  it("renders nothing when no filter was rejected", () => {
    const { container } = render(<RejectedFilters rejected={[]} />);
    expect(q(container, "[data-verify-unit='rejected-filters']")).toBeNull();
  });

  it("distinguishes an unknown engagement from an empty one", () => {
    const { container } = render(<UnknownEngagementNotice slug="acmee" />);
    expect(
      q(container, "[data-verify-unit='unknown-engagement']"),
    ).toHaveAttribute("data-verify-slug", "acmee");
    expect(container.textContent).toContain("not because that");
  });
});
