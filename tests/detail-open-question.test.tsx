import { StrictMode } from "react";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/api/operator";
import type { OpenQuestionDetail, Prose } from "@/lib/detail-load";

/**
 * FR-81 for `open_question` — `/questions/[id]`.
 *
 * ## The thing worth asserting about this view
 *
 * An open question has **no human key at all**, so `fallbackLabel` is its normal
 * case rather than an edge (ruling 2), and its one outbound reference is a
 * `(run, unit)` pair that resolution refuses to guess at when it is ambiguous.
 * Both of those are states a view can quietly render as blank, and a blank is
 * indistinguishable from a field nobody rendered.
 *
 * Its three prose columns are encrypted — `question` and `best_guess` under §7a,
 * `answer` under the security baseline (B13) — so the four-state `Prose`
 * discipline applies to all three.
 *
 * Mounted under `<StrictMode>` because `next.config.ts` sets
 * `reactStrictMode: true` and a bare render cannot reproduce it.
 */

const notFoundSignal = "NEXT_NOT_FOUND";

const mocks = vi.hoisted(() => ({
  readOpenQuestionDetail: vi.fn(),
  operatorContext: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    mocks.notFound();
    throw new Error(notFoundSignal);
  },
}));

vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: () => mocks.operatorContext(),
}));

vi.mock("@/lib/detail-load", async () => {
  const types = await vi.importActual<typeof import("@/lib/server/detail/types")>(
    "@/lib/server/detail/types",
  );
  return {
    fallbackLabel: types.fallbackLabel,
    readOpenQuestionDetail: (id: string) => mocks.readOpenQuestionDetail(id),
  };
});

const { OpenQuestionView } = await import(
  "@/app/questions/_components/open-question-view"
);
const QuestionPage = (await import("@/app/questions/[id]/page")).default;

const OPERATOR: OperatorContext = {
  userId: "user-1",
  email: "erik@example.com",
  assuranceLevel: "aal2",
  nextAssuranceLevel: "aal2",
  profile: { id: "op-1", email: "erik@example.com", displayName: "Erik" },
  mustVerifyMfa: false,
  mustEnrolMfa: false,
};

function prose(state: Prose["state"], text: string | null = null): Prose {
  return { state, text };
}

function question(
  overrides: Partial<OpenQuestionDetail> = {},
): OpenQuestionDetail {
  return {
    kind: "open_question",
    id: "3f2a1b8c-9999-4444-8888-777777777777",
    engagement: { id: "eng-1", slug: "acme-rebuild", clientName: "Acme" },
    run: "eb2490",
    unit: "f2",
    section: "5a",
    question: prose("present", "Which section name does the milestone list get?"),
    bestGuess: prose("present", "Contract acceptance, named distinctly."),
    confidence: "med",
    answer: prose("absent"),
    answeredBy: null,
    answeredAt: null,
    status: "open",
    sourceKey: "questions-f2-eb2490.jsonl#1",
    workItem: {
      kind: "work_item",
      label: "f2",
      id: "11111111-2222-3333-4444-555555555555",
    },
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

function mount(detail: OpenQuestionDetail) {
  render(
    <StrictMode>
      <OpenQuestionView detail={detail} />
    </StrictMode>,
  );
}

beforeEach(() => {
  mocks.readOpenQuestionDetail.mockReset();
  mocks.notFound.mockReset();
  mocks.operatorContext.mockReset();
  mocks.operatorContext.mockResolvedValue(OPERATOR);
});

afterEach(cleanup);

describe("FR-81 — a row with no human reference of its own", () => {
  it("titles the view with fallbackLabel rather than inventing a second fallback", () => {
    mount(question());
    // `fallbackLabel("open_question", id)` — "open question 3f2a1b8c".
    expect(document.body.textContent).toContain("open question 3f2a1b8c");
  });

  it("carries run:unit §section on the identity line", () => {
    mount(question());
    expect(byUnit("entity-detail").textContent).toContain("eb2490:f2 §5a");
  });

  it("states the identity line as absent rather than blank when nothing is recorded", () => {
    mount(question({ run: null, unit: null, section: null }));

    const shell = byUnit("entity-detail");
    expect(shell.getAttribute("data-verify-kind")).toBe("open_question");
    expect(shell.querySelector("[title*='carries no reference']")).not.toBeNull();
  });

  it("shows the machine source key as a field and never as the title", () => {
    mount(question());
    expect(byUnit("open-question-origin").textContent).toContain(
      "questions-f2-eb2490.jsonl#1",
    );
  });
});

describe("FR-83 — the one outbound reference can dangle", () => {
  it("renders an unresolved (run, unit) pair as dangling and outside any anchor", () => {
    mount(
      question({
        workItem: {
          kind: "work_item",
          label: "f2",
          id: null,
          title: "No work item f2 in run eb2490 has been ingested.",
        },
      }),
    );

    const token = byUnit("entity-ref");
    expect(token.getAttribute("data-verify-known")).toBe("false");
    expect(token.getAttribute("data-verify-treatment")).toBe("dangling");
    expect(token.closest("a")).toBeNull();
  });

  it("renders a resolved pair as a link to the work item's uuid", () => {
    mount(question());
    expect(byUnit("entity-ref").closest("a")?.getAttribute("href")).toBe(
      "/work-items/11111111-2222-3333-4444-555555555555",
    );
  });

  it("distinguishes 'names no work item' from 'names one that does not exist'", () => {
    mount(question({ workItem: null, unit: null }));

    expect(maybeUnit("entity-ref")).toBeNull();
    expect(byUnit("open-question-origin").textContent).toContain("Work item");
  });

  it("links the engagement with a plain anchor, not an entity reference", () => {
    mount(question());
    const link = byUnit("open-question-engagement-link");
    expect(link.getAttribute("href")).toBe("/registry/acme-rebuild");
    expect(link.getAttribute("data-verify-kind")).toBeNull();
  });
});

describe("§7a and B13 — three encrypted columns, four states each", () => {
  it("renders unreadable differently from absent on the question itself", () => {
    mount(question({ question: prose("unreadable") }));
    const unreadable = document.querySelector(
      "[data-verify-field='open-question-question']",
    );
    const state = unreadable?.getAttribute("data-verify-state");
    const text = unreadable?.textContent;

    cleanup();

    mount(question({ question: prose("absent") }));
    const absent = document.querySelector(
      "[data-verify-field='open-question-question']",
    );

    expect(state).toBe("unreadable");
    expect(absent?.getAttribute("data-verify-state")).toBe("absent");
    expect(text).not.toBe(absent?.textContent);
  });

  it("renders the best guess even when nobody answered, because that is what shipped", () => {
    mount(question());

    const bestGuess = document.querySelector(
      "[data-verify-field='open-question-best-guess']",
    );
    expect(bestGuess?.getAttribute("data-verify-state")).toBe("present");
    expect(bestGuess?.textContent).toContain("Contract acceptance");
    expect(
      document
        .querySelector("[data-verify-field='open-question-answer']")
        ?.getAttribute("data-verify-state"),
    ).toBe("absent");
  });

  it("renders the baseline-encrypted answer through the same four states", () => {
    mount({
      ...question({ answer: prose("unreadable"), status: "answered" }),
      answeredBy: "erik",
      answeredAt: "2026-08-19T12:00:00.000Z",
    });

    expect(
      document
        .querySelector("[data-verify-field='open-question-answer']")
        ?.getAttribute("data-verify-state"),
    ).toBe("unreadable");
    expect(byUnit("open-question-state").getAttribute("data-verify-answered")).toBe(
      "true",
    );
  });

  it("publishes no question, guess or answer text into any data-verify attribute", () => {
    const secret = "CLIENT PROSE THAT MUST NOT REACH AN ATTRIBUTE";
    mount({
      ...question(),
      question: prose("present", secret),
      bestGuess: prose("present", secret),
      answer: prose("present", secret),
    });

    for (const el of document.querySelectorAll("*")) {
      for (const attr of el.attributes) {
        if (attr.name.startsWith("data-verify-")) {
          expect(attr.value).not.toContain(secret);
        }
      }
    }
  });
});

describe("unparsed is the only default", () => {
  it("states an unrecorded confidence rather than implying one", () => {
    mount(question({ confidence: null }));

    const state = byUnit("open-question-state");
    expect(state.getAttribute("data-verify-confidence")).toBe("unrecorded");
    expect(state.querySelector("[title*='not `high` by default']")).not.toBeNull();
  });
});

describe("the page — a 404 and a refusal are different claims", () => {
  it("calls notFound() when no row carries the id", async () => {
    mocks.readOpenQuestionDetail.mockResolvedValue(null);

    await expect(
      QuestionPage({ params: Promise.resolve({ id: "nope" }) }),
    ).rejects.toThrow(notFoundSignal);
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("renders the failure notice, and NOT an empty state, when the read throws", async () => {
    mocks.readOpenQuestionDetail.mockRejectedValue(new Error("connection refused"));

    const element = await QuestionPage({ params: Promise.resolve({ id: "q1" }) });
    render(<StrictMode>{element}</StrictMode>);

    expect(byUnit("load-notice").getAttribute("data-verify-reason")).toBe("error");
    expect(maybeUnit("empty-state")).toBeNull();
    expect(maybeUnit("open-question-question")).toBeNull();
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("renders the view, with exactly one entity-detail shell, on a good read", async () => {
    mocks.readOpenQuestionDetail.mockResolvedValue(question());

    const element = await QuestionPage({ params: Promise.resolve({ id: "q1" }) });
    render(<StrictMode>{element}</StrictMode>);

    const shells = document.querySelectorAll("[data-verify-unit='entity-detail']");
    expect(shells).toHaveLength(1);
    expect(shells[0]?.getAttribute("data-verify-kind")).toBe("open_question");
    // FR-85 is structural; this view adds no second count.
    expect(
      document.querySelectorAll("[data-verify-unit='unparsed-count']"),
    ).toHaveLength(0);
  });
});
