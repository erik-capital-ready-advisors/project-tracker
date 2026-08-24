import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AcceptanceRefs } from "@/app/registry/_components/acceptance-refs";
import { EngagementTable } from "@/app/registry/_components/engagement-table";
import { IdentifiersPanel } from "@/app/registry/_components/identifiers-panel";
import { MilestoneTable } from "@/app/registry/_components/milestone-table";
import { OperatorGatePanel } from "@/app/registry/_components/operator-gate";
import { TotalsPanel } from "@/app/registry/_components/totals-panel";
import type { GateRefusal } from "@/app/registry/_lib/gate";
import type {
  EngagementRecord,
  MilestoneRecord,
} from "@/lib/server/registry/types";

afterEach(cleanup);

/**
 * Query by the state contract, never by class name.
 *
 * Throws rather than returning null so a renamed contract fails the test that
 * relies on it instead of quietly asserting against `null` and passing.
 */
function byUnit(unit: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-verify-unit='${unit}']`,
  );
  if (element === null) {
    throw new Error(`no element published data-verify-unit="${unit}"`);
  }
  return element;
}

/**
 * The registry screens, asserted through the `data-verify-*` contracts rather
 * than through class names. A suite built on class names goes red the next time
 * anyone restyles a badge, which is how a green suite starts reporting on the
 * wrong thing.
 */

const ENGAGEMENT: EngagementRecord = {
  id: "eng-1",
  slug: "acme-rebuild",
  clientName: "Acme",
  source: "Upwork",
  contractType: "fixed-price",
  status: "active",
  repoPath: "/repos/acme",
  specPath: "spec/spec-approved.md",
  fleetDir: ".fleet",
  stacks: ["nextjs", "supabase"],
  dbOrg: "acme-studio",
  dbProjectRef: "abcdefghijklmnopqrst",
  hostingTeam: null,
  hostingProject: null,
  productionUrl: "https://acme.example.com",
  createdAt: "2026-08-01T00:00:00.000Z",
  archivedAt: null,
};

function milestone(overrides: Partial<MilestoneRecord> = {}): MilestoneRecord {
  return {
    id: "ms-1",
    engagementId: "eng-1",
    name: "Phase 1",
    amount: 12000,
    // B62. A priced milestone is not an unreadable one. The two null cases -
    // never stored, and stored-but-undecryptable - are opposite facts and this
    // fixture could not express the difference before.
    amountUnreadable: false,
    currency: "USD",
    dueDate: "2026-09-01",
    submittedAt: null,
    paidAt: null,
    notes: null,
    acceptance: ["FR-10", "FR-11"],
    unknownAcceptanceRefs: [],
    ...overrides,
  };
}

describe("MilestoneTable — the two numbers that must not lie", () => {
  it("FR-10 renders an amount that did not decrypt as unreadable, never as zero", () => {
    render(
      <MilestoneTable
        milestones={[milestone({ amount: null, amountUnreadable: true })]}
        engagementId="eng-1"
        slug="acme-rebuild"
      />,
    );

    const row = byUnit("milestone-row");
    expect(row.getAttribute("data-verify-amount-readable")).toBe("false");
    expect(row.textContent).toContain("unreadable");
    expect(row.textContent).not.toContain("$0");
  });

  it("B62 renders an amount that was never recorded as `not recorded`, not `unreadable`", () => {
    // The opposite fact from the test above, and it used to render the same
    // sentence. `unreadable` points a reader at the Vault key; this milestone
    // simply has no figure yet. Observed on the live ledger 2026-08-24:
    // /registry said "unreadable" while /milestones/[id] said "not recorded"
    // about the same row.
    render(
      <MilestoneTable
        milestones={[milestone({ amount: null, amountUnreadable: false })]}
        engagementId="eng-1"
        slug="acme-rebuild"
      />,
    );

    const row = byUnit("milestone-row");
    expect(row.textContent).toContain("not recorded");
    expect(row.textContent).not.toContain("unreadable");
    expect(row.textContent).not.toContain("$0");
  });

  it("counts unreadable amounts on the table rather than hiding them in rows", () => {
    render(
      <MilestoneTable
        milestones={[
          milestone({ id: "a", amount: null, amountUnreadable: true }),
          milestone({ id: "b", amount: 500 }),
        ]}
        engagementId="eng-1"
        slug="acme-rebuild"
      />,
    );

    const table = byUnit("milestone-table");
    expect(table.getAttribute("data-verify-total")).toBe("2");
    expect(table.getAttribute("data-verify-unreadable")).toBe("1");
  });

  it("FR-12 marks a dangling acceptance reference on every read", () => {
    render(
      <MilestoneTable
        milestones={[
          milestone({
            acceptance: ["FR-10", "FR-99"],
            unknownAcceptanceRefs: ["FR-99"],
          }),
        ]}
        engagementId="eng-1"
        slug="acme-rebuild"
      />,
    );

    const table = byUnit("milestone-table");
    expect(table.getAttribute("data-verify-with-unknown-refs")).toBe("1");

    const known = document.querySelector("[data-verify-ref='FR-10']");
    const unknown = document.querySelector("[data-verify-ref='FR-99']");
    expect(known?.getAttribute("data-verify-known")).toBe("true");
    expect(unknown?.getAttribute("data-verify-known")).toBe("false");
  });

  it("FR-11 publishes whether each date is set, without publishing the amount", () => {
    render(
      <MilestoneTable
        milestones={[
          milestone({ submittedAt: "2026-08-19T00:00:00.000Z", paidAt: null }),
        ]}
        engagementId="eng-1"
        slug="acme-rebuild"
      />,
    );

    const row = byUnit("milestone-row");
    expect(row.getAttribute("data-verify-submitted")).toBe("true");
    expect(row.getAttribute("data-verify-paid")).toBe("false");

    // §7a: `amount` and `notes` are sensitive. The state contract carries
    // counts and statuses, never content.
    for (const attribute of row.getAttributeNames()) {
      expect(row.getAttribute(attribute)).not.toContain("12000");
    }
  });
});

describe("fuchsia is reserved exclusively for unparsed", () => {
  it("no registry surface reaches for the unparsed colour", () => {
    const { container } = render(
      <div>
        <MilestoneTable
          milestones={[
            milestone({
              amount: null,
              acceptance: ["FR-99"],
              unknownAcceptanceRefs: ["FR-99"],
            }),
          ]}
          engagementId="eng-1"
          slug="acme-rebuild"
        />
        <AcceptanceRefs refs={["FR-99"]} unknown={["FR-99"]} />
        <IdentifiersPanel engagement={ENGAGEMENT} />
        <EngagementTable engagements={[ENGAGEMENT]} />
        <TotalsPanel
          totals={{
            currency: null,
            committed: 0,
            submitted: 0,
            paid: 0,
            unreadable: 1,
          }}
          milestoneCount={2}
        />
      </div>,
    );

    expect(container.innerHTML).not.toContain("state-unparsed");
  });
});

describe("IdentifiersPanel — FR-77 in one lookup", () => {
  it("renders all five identifier rows even when they are empty", () => {
    render(<IdentifiersPanel engagement={ENGAGEMENT} />);
    expect(document.querySelectorAll("[data-verify-unit='identifier-row']")).toHaveLength(5);
  });

  it("states an absent identifier rather than leaving the cell blank", () => {
    render(<IdentifiersPanel engagement={ENGAGEMENT} />);
    const row = document.querySelector("[data-verify-field='hostingTeam']");
    expect(row?.getAttribute("data-verify-recorded")).toBe("false");
    expect(row?.textContent).toContain("not recorded");
  });

  it("reports how many identifiers are recorded", () => {
    render(<IdentifiersPanel engagement={ENGAGEMENT} />);
    expect(
      byUnit("identifiers-panel").getAttribute("data-verify-recorded"),
    ).toBe("3");
  });
});

describe("TotalsPanel — no plausible wrong number", () => {
  it("refuses a figure across mixed currencies", () => {
    render(
      <TotalsPanel
        totals={{
          currency: null,
          committed: 900,
          submitted: 0,
          paid: 0,
          unreadable: 0,
        }}
        milestoneCount={2}
      />,
    );

    const panel = byUnit("milestone-totals");
    expect(panel.getAttribute("data-verify-qualifier")).toBe("mixed");
    expect(panel.textContent).toContain("not summed");
    expect(panel.textContent).not.toContain("900");
  });

  it("distinguishes an engagement with no milestones from a mixed one", () => {
    render(
      <TotalsPanel
        totals={{ currency: null, committed: 0, submitted: 0, paid: 0, unreadable: 0 }}
        milestoneCount={0}
      />,
    );
    expect(
      byUnit("milestone-totals").getAttribute("data-verify-qualifier"),
    ).toBe("empty");
  });

  it("says out loud that an unreadable amount is not zero", () => {
    render(
      <TotalsPanel
        totals={{
          currency: "USD",
          committed: 100,
          submitted: 0,
          paid: 0,
          unreadable: 1,
        }}
        milestoneCount={2}
      />,
    );
    expect(byUnit("milestone-totals").textContent).toContain(
      "not zero",
    );
  });
});

describe("EngagementTable — the identifiers are in the row", () => {
  it("puts the provisioning identifiers in the list, not behind a click", () => {
    render(<EngagementTable engagements={[ENGAGEMENT]} />);
    const row = byUnit("engagement-row");
    expect(row.textContent).toContain("abcdefghijklmnopqrst");
    expect(row.textContent).toContain("https://acme.example.com");
  });

  it("states an absent identifier in the list too", () => {
    render(<EngagementTable engagements={[ENGAGEMENT]} />);
    expect(byUnit("engagement-row").textContent).toContain(
      "not recorded",
    );
  });
});

describe("OperatorGatePanel — five refusals, five next actions", () => {
  const kinds: GateRefusal["kind"][] = [
    "signin",
    "enrol-mfa",
    "verify-mfa",
    "no-role",
    "unconfigured",
    "error",
  ];

  it("renders a distinct sentence for every refusal", () => {
    const seen = new Set<string>();
    for (const kind of kinds) {
      const { container, unmount } = render(<OperatorGatePanel gate={{ kind }} />);
      const panel = container.querySelector("[data-verify-unit='operator-gate']");
      expect(panel?.getAttribute("data-verify-gate")).toBe(kind);
      seen.add(panel?.textContent ?? "");
      unmount();
    }
    expect(seen.size).toBe(kinds.length);
  });

  it("never says a role-less account does not exist", () => {
    render(<OperatorGatePanel gate={{ kind: "no-role" }} />);
    const text = byUnit("operator-gate").textContent ?? "";
    expect(text).toContain("not a missing account");
  });
});
