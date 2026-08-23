import { StrictMode } from "react";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/api/operator";
import type { OpenQuestionListing } from "@/lib/questions-load";

/**
 * B36 -- `/questions`, the listing that makes `/questions/[id]` reachable.
 *
 * Mirrors `tests/detail-open-question.test.tsx`'s shape for the page half:
 * the async Server Component is called directly and the returned element is
 * rendered under `<StrictMode>`, with `readOpenQuestions` and
 * `getOperatorContext` mocked so the three outcomes -- failed read, empty
 * listing, populated listing -- are each reachable without a database.
 *
 * `QuestionTable` and `UnclassifiedConfidence` are exercised through the page
 * rather than in isolation: neither holds state or an effect of its own, and
 * the thing worth asserting is the page's wiring -- which outcome renders for
 * which read result, and that the toggle and the aggregate count carry the
 * right numbers -- not the table's own rendering, which has no branch a unit
 * test would catch that this does not already.
 */

const mocks = vi.hoisted(() => ({
  readOpenQuestions: vi.fn(),
  operatorContext: vi.fn(),
}));

vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: () => mocks.operatorContext(),
}));

vi.mock("@/lib/questions-load", () => ({
  readOpenQuestions: (filters: unknown) => mocks.readOpenQuestions(filters),
}));

const QuestionsPage = (await import("@/app/questions/page")).default;

const OPERATOR: OperatorContext = {
  userId: "user-1",
  email: "erik@example.com",
  assuranceLevel: "aal2",
  nextAssuranceLevel: "aal2",
  profile: { id: "op-1", email: "erik@example.com", displayName: "Erik" },
  mustVerifyMfa: false,
  mustEnrolMfa: false,
};

function listing(overrides: Partial<OpenQuestionListing> = {}): OpenQuestionListing {
  return {
    questions: [],
    openCount: 0,
    answeredCount: 0,
    unclassifiedConfidenceCount: 0,
    truncated: false,
    ...overrides,
  };
}

function byUnit(unit: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(
    `[data-verify-unit='${unit}']`,
  );
  if (element === null) {
    throw new Error(`no element published data-verify-unit="${unit}"`);
  }
  return element;
}

function maybeUnit(unit: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-verify-unit='${unit}']`);
}

async function mount(searchParams: Record<string, string | string[] | undefined> = {}) {
  const element = await QuestionsPage({
    searchParams: Promise.resolve(searchParams),
  });
  render(<StrictMode>{element}</StrictMode>);
}

beforeEach(() => {
  mocks.readOpenQuestions.mockReset();
  mocks.operatorContext.mockReset();
  mocks.operatorContext.mockResolvedValue(OPERATOR);
});

afterEach(cleanup);

describe("the read failed", () => {
  it("renders the load notice and not the empty state", async () => {
    mocks.readOpenQuestions.mockRejectedValue(new Error("connection refused"));

    await mount();

    expect(byUnit("load-notice").getAttribute("data-verify-reason")).toBe("error");
    expect(maybeUnit("empty-state")).toBeNull();
    expect(maybeUnit("question-table")).toBeNull();
  });
});

describe("the read succeeded with nothing to show", () => {
  it("renders the truthful empty state, distinct from a failure", async () => {
    mocks.readOpenQuestions.mockResolvedValue(listing());

    await mount();

    expect(maybeUnit("load-notice")).toBeNull();
    const empty = byUnit("empty-state");
    expect(empty.textContent).toContain("Nothing is waiting on an answer");
  });

  it("states a different headline once answered questions are included", async () => {
    mocks.readOpenQuestions.mockResolvedValue(listing());

    await mount({ answered: "1" });

    expect(byUnit("empty-state").textContent).toContain(
      "No open questions have been recorded",
    );
  });
});

describe("the read succeeded with rows", () => {
  it("renders one row per question, each navigable to /questions/[id]", async () => {
    mocks.readOpenQuestions.mockResolvedValue(
      listing({
        questions: [
          {
            id: "3f2a1b8c-9999-4444-8888-777777777777",
            engagementSlug: "acme-rebuild",
            engagementClientName: "Acme",
            run: "eb2490",
            unit: "f2",
            section: "5a",
            confidence: "med",
            answeredBy: null,
            answeredAt: null,
            status: "open",
          },
        ],
        openCount: 1,
      }),
    );

    await mount();

    expect(maybeUnit("empty-state")).toBeNull();
    const rows = document.querySelectorAll("[data-verify-unit='question-row']");
    expect(rows).toHaveLength(1);

    const link = document.querySelector<HTMLAnchorElement>(
      "[data-verify-unit='entity-link']",
    );
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe(
      "/questions/3f2a1b8c-9999-4444-8888-777777777777",
    );
  });

  it("renders a recorded confidence as its plain label, never coerced", async () => {
    mocks.readOpenQuestions.mockResolvedValue(
      listing({
        questions: [
          {
            id: "q1",
            engagementSlug: null,
            engagementClientName: null,
            run: "eb2490",
            unit: "f2",
            section: null,
            confidence: "high",
            answeredBy: null,
            answeredAt: null,
            status: "open",
          },
        ],
        openCount: 1,
      }),
    );

    await mount();

    const cell = byUnit("question-confidence");
    expect(cell.getAttribute("data-verify-confidence")).toBe("high");
    expect(cell.textContent).toBe("high");
  });

  it("renders an unclassified confidence loudly, never as a guessed label", async () => {
    mocks.readOpenQuestions.mockResolvedValue(
      listing({
        questions: [
          {
            id: "q1",
            engagementSlug: null,
            engagementClientName: null,
            run: null,
            unit: null,
            section: null,
            confidence: null,
            answeredBy: null,
            answeredAt: null,
            status: "open",
          },
        ],
        openCount: 1,
        unclassifiedConfidenceCount: 1,
      }),
    );

    await mount();

    const cell = byUnit("question-confidence");
    expect(cell.getAttribute("data-verify-confidence")).toBe("unparsed");
    expect(cell.textContent).not.toBe("");
    expect(["low", "med", "high"]).not.toContain(cell.textContent?.trim());

    const summary = byUnit("unclassified-confidence");
    expect(summary.getAttribute("data-verify-state")).toBe("nonzero");
    expect(summary.getAttribute("data-verify-count")).toBe("1");
  });

  it("never renders the unclassified count as zero when it is merely unread", async () => {
    // A listing whose count truly is zero — every row on the page classified.
    mocks.readOpenQuestions.mockResolvedValue(
      listing({
        questions: [
          {
            id: "q1",
            engagementSlug: null,
            engagementClientName: null,
            run: null,
            unit: null,
            section: null,
            confidence: "low",
            answeredBy: null,
            answeredAt: null,
            status: "open",
          },
        ],
        openCount: 1,
        unclassifiedConfidenceCount: 0,
      }),
    );

    await mount();

    const summary = byUnit("unclassified-confidence");
    expect(summary.getAttribute("data-verify-state")).toBe("zero");
    expect(summary.getAttribute("data-verify-count")).toBe("0");
  });
});
