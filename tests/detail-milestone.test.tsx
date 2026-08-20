import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ContractMilestoneDetail } from "@/lib/detail-load";

/**
 * `/milestones/[id]` — FR-81 for `contract_milestone`.
 *
 * ## What is mocked and why
 *
 * `@/lib/detail-load` is replaced wholesale. It is the module that holds
 * `requireOperator()`, the service-role client and the pgcrypto reads, and this
 * suite has **no database credential and must never want one** — CLAUDE.md is
 * explicit that a task appearing to need a real secret is a blocker rather than
 * a puzzle. Replacing it also means the real `server-only` guard and the real
 * `createServiceClient()` are never reached from a test process.
 *
 * `next/navigation`'s `notFound()` throws a framework-internal error carrying a
 * digest string. Asserting on that digest would couple this suite to a Next
 * internal, so it is replaced with a sentinel of our own — what is under test is
 * that the page CALLS it, not how Next signals a 404.
 *
 * ## No real amount appears anywhere below
 *
 * Every figure is obviously synthetic. §7a: an amount on this table is what Erik
 * charges a named client and the set of them is the studio's pricing model.
 */

const NOT_FOUND = new Error("test:notFound");

const readContractMilestoneDetail = vi.fn();

vi.mock("@/lib/detail-load", () => ({
  readContractMilestoneDetail: (id: string) => readContractMilestoneDetail(id),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

/**
 * A signed-in operator at `aal2` with a role, so `loadForOperator` reaches its
 * `read()`. The REAL `loadForOperator` is kept — its refusal mapping is what
 * turns a thrown read into the notice these tests assert on, and a fake wrapper
 * would assert against itself. Only the session lookup, which needs a cookie
 * store and a network, is replaced.
 */
vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: async () => ({
    userId: "op-1",
    email: "operator@example.test",
    assuranceLevel: "aal2",
    nextAssuranceLevel: "aal2",
    profile: { id: "op-1", email: "operator@example.test", displayName: null },
    mustVerifyMfa: false,
    mustEnrolMfa: false,
  }),
}));

const { default: MilestonePage } = await import("@/app/milestones/[id]/page");

afterEach(cleanup);
beforeEach(() => {
  readContractMilestoneDetail.mockReset();
});

/**
 * Mount the way `next.config.ts` mounts it. `reactStrictMode: true` double-
 * invokes render, and a bare `render()` cannot reproduce that.
 */
async function show(id = "ms-1") {
  const element = await MilestonePage({ params: Promise.resolve({ id }) });
  return render(<StrictMode>{element}</StrictMode>);
}

function byUnit(container: HTMLElement, unit: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `[data-verify-unit='${unit}']`,
  );
  if (found === null) {
    throw new Error(`no element published data-verify-unit="${unit}"`);
  }
  return found;
}

/** Obviously synthetic. Never a figure that could be read as a client's. */
const MILESTONE: ContractMilestoneDetail = {
  kind: "contract_milestone",
  id: "ms-1",
  engagement: { id: "eng-1", slug: "acme-rebuild", clientName: "Acme" },
  name: "Phase 1",
  amount: 111,
  amountUnreadable: false,
  currency: "USD",
  dueDate: "2026-09-01",
  submittedAt: null,
  paidAt: null,
  notes: { text: "Signed off over email.", state: "present" },
  acceptance: [
    { kind: "requirement", label: "FR-10", id: "req-1" },
    { kind: "requirement", label: "FR-99", id: null },
  ],
};

function milestone(
  overrides: Partial<ContractMilestoneDetail> = {},
): ContractMilestoneDetail {
  return { ...MILESTONE, ...overrides };
}

describe("FR-81 — the milestone detail view", () => {
  it("renders exactly one EntityDetail, and it names its kind", async () => {
    readContractMilestoneDetail.mockResolvedValue(milestone());
    const { container } = await show();

    const shells = container.querySelectorAll(
      "[data-verify-unit='entity-detail']",
    );
    expect(shells).toHaveLength(1);
    expect(shells[0]).toHaveAttribute("data-verify-kind", "contract_milestone");
  });

  it("adds no second unparsed count — FR-85 is satisfied by the root layout", async () => {
    readContractMilestoneDetail.mockResolvedValue(milestone());
    const { container } = await show();

    expect(
      container.querySelectorAll("[data-verify-unit='unparsed-count']"),
    ).toHaveLength(0);
  });

  it("passes the row id from the route segment straight to the loader", async () => {
    readContractMilestoneDetail.mockResolvedValue(milestone());
    await show("4f3a-uuid");

    expect(readContractMilestoneDetail).toHaveBeenCalledWith("4f3a-uuid");
  });
});

/* ------------------------------------------------------------------ 404/500 */

describe("a missing row and a refused read are different claims", () => {
  it("calls notFound() when the loader answers null", async () => {
    readContractMilestoneDetail.mockResolvedValue(null);
    await expect(show()).rejects.toBe(NOT_FOUND);
  });

  it("renders the failure notice — not an empty state — when the read throws", async () => {
    readContractMilestoneDetail.mockRejectedValue(new Error("connection reset"));
    const { container } = await show();

    const notice = byUnit(container, "load-notice");
    expect(notice).toHaveAttribute("data-verify-reason", "error");
    expect(
      container.querySelectorAll("[data-verify-unit='empty-state']"),
      "a failed read rendered an empty state, which claims the ledger is clean without looking",
    ).toHaveLength(0);
  });

  it("does not leak the database's own error text to the screen", async () => {
    readContractMilestoneDetail.mockRejectedValue(
      new Error('relation "contract_milestone" does not exist'),
    );
    const { container } = await show();

    expect(container.textContent).not.toContain("contract_milestone");
  });
});

/* ------------------------------------------------------------ FR-54 / money */

describe("the amount — three situations that must not look alike", () => {
  it("renders a priced milestone through formatAmount", async () => {
    readContractMilestoneDetail.mockResolvedValue(
      milestone({ amount: 111, amountUnreadable: false }),
    );
    const { container } = await show();

    const detail = byUnit(container, "contract-milestone-detail");
    expect(detail).toHaveAttribute("data-verify-amount-readable", "true");
    expect(detail).toHaveAttribute("data-verify-amount-unreadable", "false");
    expect(container.textContent).toContain("$111.00");
  });

  it("says NOT RECORDED when nobody priced it — flag false", async () => {
    readContractMilestoneDetail.mockResolvedValue(
      milestone({ amount: null, amountUnreadable: false }),
    );
    const { container } = await show();

    const detail = byUnit(container, "contract-milestone-detail");
    expect(detail).toHaveAttribute("data-verify-amount-readable", "false");
    expect(detail).toHaveAttribute("data-verify-amount-unreadable", "false");
    expect(container.textContent).toContain("not recorded");
    expect(container.textContent).not.toContain("unreadable");
  });

  it("says UNREADABLE when ciphertext was stored and failed — flag true", async () => {
    readContractMilestoneDetail.mockResolvedValue(
      milestone({ amount: null, amountUnreadable: true }),
    );
    const { container } = await show();

    const detail = byUnit(container, "contract-milestone-detail");
    expect(detail).toHaveAttribute("data-verify-amount-readable", "false");
    expect(detail).toHaveAttribute("data-verify-amount-unreadable", "true");
    expect(container.textContent).toContain("unreadable");
  });

  /**
   * The assertion the whole view exists for. `amount: null` means two different
   * things and one of them is a number that belongs on an invoice.
   */
  it("renders the two null-amount cases DIFFERENTLY", async () => {
    readContractMilestoneDetail.mockResolvedValue(
      milestone({ amount: null, amountUnreadable: false }),
    );
    const unpriced = (await show()).container.textContent ?? "";
    cleanup();

    readContractMilestoneDetail.mockResolvedValue(
      milestone({ amount: null, amountUnreadable: true }),
    );
    const lost = (await show()).container.textContent ?? "";

    expect(
      unpriced,
      "an unpriced milestone and one whose amount could not be read render identically",
    ).not.toEqual(lost);
  });

  it("never renders either null case as 0, and never as blank", async () => {
    for (const unreadable of [false, true]) {
      readContractMilestoneDetail.mockResolvedValue(
        milestone({ amount: null, amountUnreadable: unreadable, currency: "USD" }),
      );
      const { container } = await show();
      const text = container.textContent ?? "";

      expect(text, `amountUnreadable=${unreadable} rendered a zero figure`).not.toMatch(
        /\$0(\.00)?\b/,
      );
      // The row states something rather than nothing: the field is present and
      // carries one of the two stated absences.
      expect(text).toMatch(/not recorded|unreadable/);
      cleanup();
    }
  });

  it("publishes no amount into any data-verify attribute", async () => {
    readContractMilestoneDetail.mockResolvedValue(
      milestone({ amount: 111, currency: "USD" }),
    );
    const { container } = await show();

    for (const element of container.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        if (!attribute.name.startsWith("data-verify")) continue;
        expect(
          attribute.value,
          `${attribute.name} carries the amount; §7a keeps money out of the state contract`,
        ).not.toContain("111");
      }
    }
  });
});

/* ------------------------------------------------------------------- ruling 5 */

describe("FR-50's billable state is not computed here", () => {
  it("renders no milestone-state chip and links to Committed instead", async () => {
    readContractMilestoneDetail.mockResolvedValue(milestone());
    const { container } = await show();

    expect(
      container.querySelectorAll("[data-verify-unit='milestone-state']"),
      "the milestone view re-derived FR-50, which ruling 5 forbids",
    ).toHaveLength(0);
    expect(byUnit(container, "committed-link")).toHaveAttribute(
      "href",
      "/committed",
    );
  });
});

/* --------------------------------------------------------------------- prose */

describe("notes — four Prose states, four renderings", () => {
  it("shows the text when it is present", async () => {
    readContractMilestoneDetail.mockResolvedValue(milestone());
    const { container } = await show();

    expect(container.textContent).toContain("Signed off over email.");
    expect(byUnit(container, "contract-milestone-detail")).toHaveAttribute(
      "data-verify-notes-state",
      "present",
    );
  });

  it("states that an unreadable field was LOST, never blank", async () => {
    readContractMilestoneDetail.mockResolvedValue(
      milestone({ notes: { text: null, state: "unreadable" } }),
    );
    const { container } = await show();

    const prose = byUnit(container, "prose");
    expect(prose).toHaveAttribute("data-verify-state", "unreadable");
    expect(prose.textContent).toBe("unreadable");
  });

  it("states that a not-requested field was never asked for", async () => {
    readContractMilestoneDetail.mockResolvedValue(
      milestone({ notes: { text: null, state: "not-requested" } }),
    );
    const { container } = await show();

    expect(byUnit(container, "prose")).toHaveAttribute(
      "data-verify-state",
      "not-requested",
    );
  });

  it("renders absent through DetailField, distinctly from the other three", async () => {
    readContractMilestoneDetail.mockResolvedValue(
      milestone({ notes: { text: null, state: "absent" } }),
    );
    const { container } = await show();

    expect(
      container.querySelectorAll("[data-verify-unit='prose']"),
      "an absent field borrowed the unreadable marker",
    ).toHaveLength(0);
    expect(byUnit(container, "contract-milestone-detail")).toHaveAttribute(
      "data-verify-notes-state",
      "absent",
    );
  });

  it("never publishes the note text into a data-verify attribute", async () => {
    readContractMilestoneDetail.mockResolvedValue(milestone());
    const { container } = await show();

    for (const element of container.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        if (!attribute.name.startsWith("data-verify")) continue;
        expect(attribute.value).not.toContain("Signed off");
      }
    }
  });
});

/* ------------------------------------------------------------ FR-83 / refs */

describe("acceptance references", () => {
  it("renders a dangling reference as known=false, dangling, and NOT a link", async () => {
    readContractMilestoneDetail.mockResolvedValue(milestone());
    const { container } = await show();

    const refs = [
      ...container.querySelectorAll<HTMLElement>(
        "[data-verify-unit='entity-ref']",
      ),
    ];
    const dangler = refs.find(
      (ref) => ref.getAttribute("data-verify-ref") === "FR-99",
    );
    if (dangler === undefined) throw new Error("FR-99 was not rendered at all");

    expect(dangler).toHaveAttribute("data-verify-known", "false");
    expect(dangler).toHaveAttribute("data-verify-treatment", "dangling");
    expect(
      dangler.closest("a"),
      "FR-83: a reference that resolves to nothing was rendered as a link",
    ).toBeNull();
  });

  it("keeps a resolved reference navigable, by uuid and not by human ref", async () => {
    readContractMilestoneDetail.mockResolvedValue(milestone());
    const { container } = await show();

    const resolved = [
      ...container.querySelectorAll<HTMLElement>(
        "[data-verify-unit='entity-ref']",
      ),
    ].find((ref) => ref.getAttribute("data-verify-ref") === "FR-10");
    if (resolved === undefined) throw new Error("FR-10 was not rendered at all");

    expect(resolved.closest("a")).toHaveAttribute("href", "/requirements/req-1");
  });

  it("counts the dangling references in the state contract", async () => {
    readContractMilestoneDetail.mockResolvedValue(milestone());
    const { container } = await show();

    const detail = byUnit(container, "contract-milestone-detail");
    expect(detail).toHaveAttribute("data-verify-acceptance", "2");
    expect(detail).toHaveAttribute("data-verify-dangling", "1");
  });
});

/* ---------------------------------------------------------------- ruling 3 */

describe("the engagement is not a ninth entity kind", () => {
  it("links to the registry with a plain anchor, not an EntityRef", async () => {
    readContractMilestoneDetail.mockResolvedValue(milestone());
    const { container } = await show();

    const link = byUnit(container, "engagement-link");
    expect(link).toHaveAttribute("href", "/registry/acme-rebuild");
    expect(
      link.querySelector("[data-verify-unit='entity-ref']"),
      "the engagement was rendered as one of FR-81's eight kinds",
    ).toBeNull();
  });

  it("states the absence when a milestone has no engagement", async () => {
    readContractMilestoneDetail.mockResolvedValue(
      milestone({ engagement: null }),
    );
    const { container } = await show();

    expect(
      container.querySelectorAll("[data-verify-unit='engagement-link']"),
    ).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ dates */

describe("dates carry formatDate's timezone care", () => {
  it("renders a zone-less due date as the day the string actually carries", async () => {
    readContractMilestoneDetail.mockResolvedValue(
      milestone({ dueDate: "2026-09-01T00:00:00" }),
    );
    const { container } = await show();

    // `isoDay` would answer 2026-08-31 east of UTC. A contractual date shown a
    // day early is a defect on some machines and not others.
    expect(container.textContent).toContain("2026-09-01");
    expect(container.textContent).not.toContain("2026-08-31");
  });
});
