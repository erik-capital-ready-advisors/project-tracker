import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/api/operator";
import {
  dispatchUsage,
  reconcileVerdicts,
  renderGates,
  runDuration,
  runUnparsed,
  runVerdict,
  testTriple,
  VERDICT_SOURCE_QA_REPORT,
} from "@/lib/runs-display";
import type { RunDetail, RunIdentity } from "@/lib/server/runs/types";

/**
 * FR-93 / FR-94 / FR-95 — `/runs/[run-id]` (M2.8, u2).
 *
 * ## What is faked and what is exercised
 *
 * `i1`'s loader is faked — this unit built no read and there is no database
 * credential in this harness. **`loadForOperator` is NOT faked**: it is the
 * module that decides whether a failure renders as a failure or as an empty
 * screen, which is the distinction two of the tests below exist to hold. Only
 * the operator *context* it consults is stubbed.
 *
 * **The display derivations are NOT faked either.** Every model in the fixture
 * below is built by calling `@/lib/runs-display`'s real functions on the values
 * measured against the live row on 2026-08-23, so the fixture cannot drift into
 * a shape the loader would never produce. A hand-written `{ state: "known" }`
 * would pass these tests on the day it was written and stop describing the
 * product the first time either side changed.
 *
 * ## Everything is mounted under `<StrictMode>`
 *
 * `next.config.ts` sets `reactStrictMode: true`, and a bare `render(<X />)`
 * mounts once. These are Server Components with no effects, so the double invoke
 * cannot bite here — but the harness discipline is the repository's
 * (`CLAUDE.md`, run `b0952e`: 966 green tests while three screens were unusable)
 * and a screen is tested the way the config mounts it, not the way it is
 * cheapest to mount.
 */

const OPERATOR: OperatorContext = {
  userId: "00000000-0000-4000-8000-00000000000a",
  email: "erik@example.test",
  assuranceLevel: "aal2",
  nextAssuranceLevel: "aal2",
  profile: { id: "op-1", email: "erik@example.test", displayName: "Erik" },
  mustVerifyMfa: false,
  mustEnrolMfa: false,
};

const stub = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    // The real `notFound()` signals by throwing, and every test that asserts a
    // 404 depends on that: a stub that returned normally would let the page
    // carry on and render a run that does not exist.
    throw new Error("NEXT_NOT_FOUND");
  }),
  readRunDetail: vi.fn(),
  getOperatorContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: stub.notFound }));

// `@/lib/runs-load` is `server-only` and is the module boundary this unit was
// built against. The two *values* it re-exports come from the real pure module
// rather than being re-declared here — a constant spelled twice is a constant
// that can drift.
vi.mock("@/lib/runs-load", async () => {
  const display = await import("@/lib/runs-display");
  return {
    readRunDetail: stub.readRunDetail,
    VERDICT_SOURCE_QA_REPORT: display.VERDICT_SOURCE_QA_REPORT,
    RUN_UNPARSED_GAPS: display.RUN_UNPARSED_GAPS,
  };
});

vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: stub.getOperatorContext,
  requireOperator: stub.getOperatorContext,
}));

const { default: RunDetailPage } = await import("@/app/runs/[run-id]/page");
const { RunDetailView } = await import(
  "@/app/runs/[run-id]/_components/run-detail-view"
);

const RUN_ID = "b0952e";
const RUN_UUID = "0f3c1d2e-0000-4000-8000-0000000b0952";
const AT = "2026-08-19T00:00:00Z";
const DANGLING_REQUIREMENT = "FR-999";
const SECTION_TEXT = "CR-005 §3.2 FR-93 — the defects it opened";

/**
 * The one run in the ledger, as measured 2026-08-23.
 *
 * Verdict `unparsed`; equal timestamps so the duration is a genuine zero; NULL
 * dispatch pair; NULL test triple; a one-key `gates` payload.
 */
function base(): RunDetail {
  const gates = renderGates({ build_after_phase1: "PASS" });

  return {
    id: RUN_UUID,
    runId: RUN_ID,
    engagement: { id: "eng-1", slug: "delivery-ledger", clientName: "Capital Ready" },
    branch: "agent-build/2026-08-19-b0952e",
    mode: "full",
    startedAt: AT,
    endedAt: AT,
    verdict: runVerdict({ verdict: "unparsed" }),
    duration: runDuration(AT, AT),
    dispatches: dispatchUsage(null, null),
    tests: testTriple(null, null, null),
    gates,
    unparsed: runUnparsed({
      unparsedWorkItems: 0,
      gates,
      verdict: "unparsed",
    }),
    workUnits: [
      {
        ref: {
          kind: "work_item",
          label: "u4",
          id: "a1000000-0000-4000-8000-000000000004",
        },
        unit: "u4",
        status: "done",
        executionMode: "fleet",
        executorKind: "agent",
        executor: "ui-designer",
        workType: "ui",
        phase: 1,
        disposition: null,
        evidenceScope: "observed-live",
        notVerifiedCount: 0,
        startedAt: AT,
        endedAt: AT,
      },
    ],
    questions: [
      {
        ref: {
          kind: "open_question",
          label: "b0952e:u4",
          id: "c1000000-0000-4000-8000-000000000001",
        },
        unit: "u4",
        section: SECTION_TEXT,
        confidence: null,
        status: "open",
        answeredBy: null,
        answeredAt: null,
      },
    ],
    defects: { opened: null, openedUnavailable: "no_opened_by_edge", fixed: [] },
    requirements: {
      // FR-83's case rides in the base fixture rather than in one test, so every
      // render below has to keep a dangling reference out of an anchor.
      refs: [
        {
          kind: "requirement",
          label: "FR-93",
          id: "d1000000-0000-4000-8000-000000000093",
        },
        { kind: "requirement", label: DANGLING_REQUIREMENT, id: null },
      ],
      danglingCount: 1,
    },
  };
}

const q = (c: HTMLElement, s: string) => c.querySelector(s);
const all = (c: HTMLElement, s: string) => [...c.querySelectorAll(s)];

function view(run: RunDetail = base()) {
  return render(
    <StrictMode>
      <RunDetailView run={run} />
    </StrictMode>,
  );
}

async function renderPage() {
  return render(
    <StrictMode>
      {await RunDetailPage({ params: Promise.resolve({ "run-id": RUN_ID }) })}
    </StrictMode>,
  );
}

beforeEach(() => {
  stub.notFound.mockClear();
  stub.readRunDetail.mockReset();
  stub.getOperatorContext.mockReset();
  stub.getOperatorContext.mockResolvedValue(OPERATOR);
});

afterEach(cleanup);

/* ------------------------------------ RunDetailResult's three states */

describe("the page handles all three loader states, and never collapses one", () => {
  it("renders the run when the loader finds exactly one", async () => {
    stub.readRunDetail.mockResolvedValue({ state: "found", run: base() });
    const { container } = await renderPage();

    const shell = q(container, "[data-verify-unit='run-detail']");
    expect(shell).not.toBeNull();
    expect(shell).toHaveAttribute("data-verify-run", RUN_ID);
    expect(stub.notFound).not.toHaveBeenCalled();
  });

  it("calls notFound() when no run carries the id", async () => {
    stub.readRunDetail.mockResolvedValue({ state: "not_found" });
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(stub.notFound).toHaveBeenCalledOnce();
  });

  it("RENDERS the ambiguous state — it is not a 404 and not a first match", async () => {
    // `unique (engagement_id, run_id)` makes a run id unique per engagement and
    // not across the ledger. Taking the first match would put one engagement's
    // run behind an id that also belongs to another's, with nothing saying so.
    const matches: RunIdentity[] = [
      {
        id: "aaaaaaaa-0000-4000-8000-000000000001",
        runId: RUN_ID,
        engagement: { id: "e1", slug: "acme", clientName: "Acme Robotics" },
        branch: "agent-build/one",
        mode: "full",
      },
      {
        id: "bbbbbbbb-0000-4000-8000-000000000002",
        runId: RUN_ID,
        engagement: { id: "e2", slug: "delivery-ledger", clientName: "Capital Ready" },
        branch: "agent-build/two",
        mode: "ui-only",
      },
    ];
    stub.readRunDetail.mockResolvedValue({ state: "ambiguous", matches });

    const { container } = await renderPage();
    const notice = q(container, "[data-verify-unit='run-ambiguous']");

    expect(notice).not.toBeNull();
    expect(notice).toHaveAttribute("data-verify-matches", "2");
    expect(all(container, "[data-verify-unit='run-ambiguous-row']")).toHaveLength(2);
    // Every match is named. Neither is chosen, and neither is a 404.
    expect(container.textContent).toContain("acme");
    expect(container.textContent).toContain("delivery-ledger");
    expect(stub.notFound).not.toHaveBeenCalled();
    expect(q(container, "[data-verify-unit='run-detail']")).toBeNull();
  });

  it("renders the failure notice when the read throws, and never an empty state", async () => {
    stub.readRunDetail.mockRejectedValue(
      new Error("could not read fleet_run: connection refused"),
    );
    const { container } = await renderPage();

    const notice = q(container, "[data-verify-unit='load-notice']");
    expect(notice).not.toBeNull();
    expect(notice).toHaveAttribute("data-verify-reason", "error");
    expect(q(container, "[data-verify-unit='empty-state']")).toBeNull();
    expect(stub.notFound).not.toHaveBeenCalled();
  });

  it("does not leak the database's own message into the failure notice", async () => {
    stub.readRunDetail.mockRejectedValue(
      new Error('could not read fleet_run: relation "secret_table" does not exist'),
    );
    const { container } = await renderPage();
    expect(container.textContent).not.toContain("secret_table");
  });
});

/* ---------------------------------------------------------- FR-94 */

describe("FR-94 — the run states its own unparsed count", () => {
  it("states the run's own total and breaks it into its components", () => {
    // 0 unparsed work items + 0 unparsed gates + the verdict itself = 1.
    const { container } = view();
    const panel = q(container, "[data-verify-unit='run-unparsed']");

    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("data-verify-state", "nonzero");
    expect(panel).toHaveAttribute("data-verify-total", "1");
    expect(panel).toHaveAttribute("data-verify-verdict", "true");
    expect(panel?.textContent).toContain("1 unparsed in this run");
  });

  it("adds no second shell badge — FR-85 belongs to the root layout", () => {
    // Two elements answering `[data-verify-unit='unparsed-count']` is an
    // ambiguous assertion at best and two different numbers at worst.
    const { container } = view();
    expect(all(container, "[data-verify-unit='unparsed-count']")).toHaveLength(0);
  });

  it("an unreadable work-item count states no total and never renders 0", () => {
    const run = base();
    run.unparsed = runUnparsed({
      unparsedWorkItems: null,
      gates: run.gates,
      verdict: "unparsed",
    });
    const { container } = view(run);
    const panel = q(container, "[data-verify-unit='run-unparsed']");

    expect(panel).toHaveAttribute("data-verify-state", "unknown");
    expect(panel?.hasAttribute("data-verify-total")).toBe(false);
    expect(panel?.textContent).toContain("unparsed count unavailable");
    expect(panel?.textContent).not.toContain("0 unparsed");
  });

  it("labels each component, and omits the count it could not read", () => {
    const run = base();
    run.unparsed = runUnparsed({
      unparsedWorkItems: null,
      gates: run.gates,
      verdict: "unparsed",
    });
    const { container } = view(run);
    const parts = all(container, "[data-verify-unit='run-unparsed-part']");

    expect(parts.map((p) => p.getAttribute("data-verify-part"))).toEqual([
      "workItems",
      "gates",
      "verdict",
    ]);
    // The unreadable component carries no count at all — not a `0`.
    expect(parts[0]?.hasAttribute("data-verify-count")).toBe(false);
    expect(parts[0]?.textContent).toContain("— work units");
    expect(parts[2]).toHaveAttribute("data-verify-count", "1");
  });

  it("names the populations that cannot be scoped to a run", () => {
    const { container } = view();
    const gaps = all(container, "[data-verify-unit='run-unparsed-gap']");
    expect(gaps.map((g) => g.getAttribute("data-verify-population"))).toEqual([
      "defect",
      "test_result",
    ]);
  });
});

/* ---------------------------------------------------------- FR-95 */

describe("FR-95 — the verdict is emitted exactly as recorded", () => {
  it("prints `unparsed` as the word itself, in the reserved treatment", () => {
    const { container } = view();
    const source = q(container, "[data-verify-unit='run-verdict-source']");

    expect(source).toHaveAttribute("data-verify-verdict", "unparsed");
    expect(source?.textContent).toContain("unparsed");
    expect(
      q(container, "[data-verify-unit='state-badge'][data-verify-state='unparsed']"),
    ).not.toBeNull();
  });

  it("says one source exists rather than letting it read as agreement", () => {
    const { container } = view();
    const verdict = q(container, "[data-verify-unit='run-verdict']");

    expect(verdict).toHaveAttribute("data-verify-agreement", "single");
    expect(verdict).toHaveAttribute("data-verify-sources", "1");
    expect(verdict?.textContent).toContain("untested rather than satisfied");
  });

  it("shows BOTH sources when they disagree, and prefers neither", () => {
    // The branch cannot fire against today's single-column schema, so it is
    // driven with fabricated two-source input rather than left unexercised.
    const run = base();
    run.verdict = reconcileVerdicts([
      { origin: VERDICT_SOURCE_QA_REPORT, verdict: "pending", recognised: false },
      { origin: "checkpoint", verdict: "PASS", recognised: true },
    ]);

    const { container } = view(run);
    const verdict = q(container, "[data-verify-unit='run-verdict']");
    const sources = all(container, "[data-verify-unit='run-verdict-source']");

    expect(verdict).toHaveAttribute("data-verify-agreement", "disagreed");
    expect(sources).toHaveLength(2);
    expect(sources.map((s) => s.getAttribute("data-verify-verdict"))).toEqual([
      "pending",
      "PASS",
    ]);
    expect(verdict?.textContent).toContain("neither is preferred");
  });

  it("does not title-case, translate or hide an unrecognised verdict", () => {
    const run = base();
    run.verdict = runVerdict({ verdict: "half-done??" });
    const { container } = view(run);
    const source = q(container, "[data-verify-unit='run-verdict-source']");

    expect(source).toHaveAttribute("data-verify-verdict", "half-done??");
    expect(source).toHaveAttribute("data-verify-recognised", "false");
    expect(source?.textContent).toContain("half-done??");
  });

  it("states that no verdict was recorded rather than showing a dash", () => {
    const run = base();
    run.verdict = runVerdict({ verdict: null });
    const { container } = view(run);
    const verdict = q(container, "[data-verify-unit='run-verdict']");

    expect(verdict).toHaveAttribute("data-verify-agreement", "none");
    // The headline is unambiguous on its own; the sentence that says what the
    // absence is NOT rides on hover, which is this repository's pattern for a
    // stated gap (`DetailField`'s `absent`, `Absent`, `EvidenceScopeChip`).
    expect(verdict?.textContent).toContain("no verdict recorded");
    expect(
      q(container, "[data-verify-unit='run-gap'][data-verify-field='verdict']")
        ?.getAttribute("title"),
    ).toContain("never written down");
  });
});

/* ------------------------------------------ FR-93 — gates, rendered */

describe("FR-93 — the gates payload is rendered, not dumped", () => {
  it("lays each gate out as a key and an outcome, with no JSON on the screen", () => {
    const { container } = view();
    const section = q(container, "[data-verify-unit='run-gates']");
    const gate = q(container, "[data-verify-unit='run-gate']");

    expect(section).toHaveAttribute("data-verify-count", "1");
    expect(section).toHaveAttribute("data-verify-malformed", "false");
    expect(gate).toHaveAttribute("data-verify-gate", "build_after_phase1");
    expect(gate).toHaveAttribute("data-verify-outcome", "PASS");
    expect(gate).toHaveAttribute("data-verify-recognised", "true");

    // A dumped payload carries its punctuation with it. A rendered one does not.
    expect(container.querySelector("pre")).toBeNull();
    expect(section?.textContent).not.toContain('"build_after_phase1"');
    expect(section?.textContent).not.toContain("{");
  });

  it("an empty payload says the run recorded no gates, not that all passed", () => {
    const run = base();
    run.gates = renderGates({});
    const { container } = view(run);
    const empty = q(container, "[data-verify-unit='run-gates-empty']");

    expect(q(container, "[data-verify-unit='run-gates']")).toHaveAttribute(
      "data-verify-count",
      "0",
    );
    expect(all(container, "[data-verify-unit='run-gate']")).toHaveLength(0);
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain("recorded no gates");
    expect(empty?.textContent).toContain("not a statement that every gate passed");
  });

  it("a non-object payload is reported as a fault rather than as no gates", () => {
    const run = base();
    run.gates = renderGates(["PASS"]);
    const { container } = view(run);

    expect(q(container, "[data-verify-unit='run-gates']")).toHaveAttribute(
      "data-verify-malformed",
      "true",
    );
    expect(
      q(container, "[data-verify-unit='run-gap'][data-verify-field='gates-malformed']"),
    ).not.toBeNull();
    expect(q(container, "[data-verify-unit='run-gates-empty']")).toBeNull();
  });

  it("names a key whose value is not an outcome instead of dropping it", () => {
    // A gate silently omitted reads as a gate that was never run.
    const run = base();
    run.gates = renderGates({ build: "PASS", coverage: { ratio: 0.8 } });
    const { container } = view(run);
    const gap = q(
      container,
      "[data-verify-unit='run-gap'][data-verify-field='gates-unrenderable']",
    );

    expect(q(container, "[data-verify-unit='run-gates']")).toHaveAttribute(
      "data-verify-unrenderable",
      "1",
    );
    expect(gap?.textContent).toContain("coverage");
  });
});

/* -------------------------------------- FR-93 — the defects section */

describe("FR-93 — the defects section states why, and never states none", () => {
  it("renders the measured reason instead of an empty state", () => {
    const { container } = view();
    const section = q(container, "[data-verify-unit='run-defects']");
    const gap = q(
      container,
      "[data-verify-unit='run-gap'][data-verify-field='defects-opened']",
    );

    expect(section).toHaveAttribute("data-verify-opened-available", "false");
    expect(section).toHaveAttribute(
      "data-verify-opened-reason",
      "no_opened_by_edge",
    );
    expect(gap).not.toBeNull();
    expect(gap?.textContent).toContain("carries no run column");
  });

  it("never writes the sentence `this run opened no defects`", () => {
    // The whole thesis of the screen: "nothing recorded which run opened a
    // defect" and "this run opened none" are different claims, and rendering
    // the second is the wrong-`done` this product exists to prevent.
    const { container } = view();
    const text = q(container, "[data-verify-unit='run-defects']")?.textContent ?? "";

    expect(text).not.toMatch(/opened no defects?/i);
    expect(text).not.toMatch(/no defects (were |was )?opened/i);
    expect(text).toContain("Nothing in this ledger records which run opened a defect");
  });

  it("draws the genuinely-queried `fixed` edge as an ordinary empty list", () => {
    // Two halves, two treatments. The fixed edge was looked at; the opened edge
    // could not be. Giving both the same treatment erases the only fact here.
    const { container } = view();
    const section = q(container, "[data-verify-unit='run-defects']");

    expect(section).toHaveAttribute("data-verify-fixed", "0");
    expect(section?.textContent).toContain("Fixed by this run");
  });
});

/* --------------------------------- D3 — NULL is not zero, anywhere */

describe("D3 — an unknown value never renders as a zero", () => {
  it("renders a measured zero duration as `0m`", () => {
    // `started_at === ended_at` on run b0952e. This zero is data.
    const { container } = view();
    const duration = q(container, "[data-verify-unit='run-duration']");

    expect(duration).toHaveAttribute("data-verify-state", "known");
    expect(duration).toHaveAttribute("data-verify-minutes", "0");
    expect(duration?.textContent).toContain("0m");
  });

  it("renders a missing timestamp as a stated gap and NOT as `0m`", () => {
    const run = base();
    run.endedAt = null;
    run.duration = runDuration(AT, null);
    const { container } = view(run);
    const duration = q(container, "[data-verify-unit='run-duration']");

    expect(duration).toHaveAttribute("data-verify-state", "unknown");
    expect(duration).toHaveAttribute("data-verify-reason", "no_end");
    expect(duration?.hasAttribute("data-verify-minutes")).toBe(false);
    expect(duration?.textContent).not.toContain("0m");
  });

  it("renders unwritten dispatch columns as never recorded, not `0 of 0`", () => {
    const { container } = view();
    const dispatches = q(container, "[data-verify-unit='run-dispatches']");

    expect(dispatches).toHaveAttribute("data-verify-state", "unknown");
    expect(dispatches?.textContent).not.toContain("0 of 0");
    expect(dispatches?.textContent).toContain("never recorded");
    expect(
      q(container, "[data-verify-unit='run-gap'][data-verify-field='dispatches']")
        ?.getAttribute("title"),
    ).toContain("not a run that used no dispatches");
  });

  it("renders a NULL test triple as no counts stated, not `0 passed`", () => {
    const { container } = view();
    const tests = q(container, "[data-verify-unit='run-tests']");

    expect(tests).toHaveAttribute("data-verify-state", "unknown");
    expect(tests?.textContent).not.toContain("0 passed");
    expect(tests?.textContent).toContain("no counts stated");
  });

  it("renders a recorded zero test triple as `0 passed` — that one IS data", () => {
    const run = base();
    run.tests = testTriple(0, 0, 0);
    const { container } = view(run);
    const tests = q(container, "[data-verify-unit='run-tests']");

    expect(tests).toHaveAttribute("data-verify-state", "known");
    expect(tests).toHaveAttribute("data-verify-passed", "0");
    expect(tests?.textContent).toContain("0 passed, 0 failed, 0 skipped");
  });
});

/* ---------------------------------------------------------- FR-83 */

describe("FR-83 — a reference to nothing is never a link", () => {
  it("draws a dangling requirement with the treatment and outside any anchor", () => {
    const { container } = view();
    const token = q(
      container,
      `[data-verify-unit='entity-ref'][data-verify-ref='${DANGLING_REQUIREMENT}']`,
    );

    expect(token).not.toBeNull();
    expect(token).toHaveAttribute("data-verify-known", "false");
    expect(token).toHaveAttribute("data-verify-treatment", "dangling");
    expect(token?.closest("a")).toBeNull();
  });

  it("makes every resolved reference navigable to its row id", () => {
    const { container } = view();

    expect(
      q(container, "[data-verify-unit='entity-ref'][data-verify-ref='u4']")?.closest("a"),
    ).toHaveAttribute("href", "/work-items/a1000000-0000-4000-8000-000000000004");
    expect(
      q(container, "[data-verify-unit='entity-ref'][data-verify-ref='FR-93']")?.closest("a"),
    ).toHaveAttribute("href", "/requirements/d1000000-0000-4000-8000-000000000093");
  });

  it("renders the engagement as a plain link, not as a ninth entity kind", () => {
    const { container } = view();
    expect(q(container, "[data-verify-unit='detail-engagement']")).toHaveAttribute(
      "href",
      "/registry/delivery-ledger",
    );
    expect(
      q(container, "[data-verify-unit='entity-ref'][data-verify-kind='engagement']"),
    ).toBeNull();
  });

  it("reports the dangling count beside the requirement list", () => {
    const { container } = view();
    const refs = q(container, "[data-verify-unit='run-requirements-refs']");

    expect(refs).toHaveAttribute("data-verify-count", "2");
    expect(refs).toHaveAttribute("data-verify-dangling", "1");
    expect(refs?.textContent).toContain("resolve to nothing");
  });
});

/* ------------------------------------ the listings, and D4's tripwire */

describe("the listings are exhaustive and carry no prose in their contracts", () => {
  it("states the count above each list and renders every row", () => {
    const { container } = view();

    expect(q(container, "[data-verify-unit='run-work-unit-table']")).toHaveAttribute(
      "data-verify-count",
      "1",
    );
    expect(all(container, "[data-verify-unit='run-work-unit-row']")).toHaveLength(1);
    expect(q(container, "[data-verify-unit='run-question-table']")).toHaveAttribute(
      "data-verify-count",
      "1",
    );
    expect(all(container, "[data-verify-unit='run-question-row']")).toHaveLength(1);
    expect(
      q(container, "[data-verify-unit='run-questions']")?.textContent,
    ).toContain("never truncated");
  });

  it("renders a question's clear columns and links it out for the prose", () => {
    const { container } = view();
    const row = q(container, "[data-verify-unit='run-question-row']");

    expect(row).toHaveAttribute("data-verify-status", "open");
    expect(row).toHaveAttribute("data-verify-confidence", "unparsed");
    expect(row).toHaveAttribute("data-verify-key", "u4");
    expect(
      q(container, "[data-verify-unit='entity-ref'][data-verify-ref='b0952e:u4']")
        ?.closest("a"),
    ).toHaveAttribute("href", "/questions/c1000000-0000-4000-8000-000000000001");
  });

  it("D4 — no ingested text reaches any data-verify-* attribute", () => {
    // §7a's ciphertext columns are never selected by i1's projections, so the
    // only ingested text this screen holds is `section`. It is rendered and
    // deliberately kept out of the state contract: on run 29b583 a mutation
    // adding three encrypted columns to a select was caught by nothing, and one
    // fewer path from ingested text to an attribute is one fewer way for the
    // next one to land quietly.
    const { container } = view();
    expect(container.textContent).toContain(SECTION_TEXT);

    for (const element of all(container, "*")) {
      for (const attribute of element.attributes) {
        if (!attribute.name.startsWith("data-verify-")) continue;
        expect(attribute.value).not.toContain(SECTION_TEXT);
      }
    }
  });

  it("states a genuinely empty listing without calling it a clean result", () => {
    const run = base();
    run.workUnits = [];
    run.questions = [];
    const { container } = view(run);

    expect(q(container, "[data-verify-unit='run-work-unit-table']")).toBeNull();
    expect(
      q(container, "[data-verify-unit='run-work-units']")?.textContent,
    ).toContain("The edge exists and was queried");
    expect(
      q(container, "[data-verify-unit='run-questions']")?.textContent,
    ).toContain("queried and matched nothing");
  });
});
