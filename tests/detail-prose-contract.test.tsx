import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type {
  BlockerDetail,
  DefectDetail,
  OpenQuestionDetail,
  RequirementDetail,
  WorkItemDetail,
} from "@/lib/detail-load";

/**
 * B33 — "no single selector covers all eight [FR-81] detail views" was the
 * actual defect this blocker names, not the three incompatible attribute
 * names by themselves. This file is the test that keeps it fixed: it renders
 * every detail view that carries a `Prose` field with the SAME
 * `[data-verify-unit='detail-prose']` query and asserts every match carries
 * the same two other attributes, `data-verify-field` and `data-verify-state`,
 * with a state drawn from the same five-value set.
 *
 * ## Why five views here and not eight
 *
 * FR-81 names eight kinds. Two of them — `release` and `external_wait` —
 * hold no §7a-encrypted prose column at all (their own page docblocks say so
 * in terms: "there is no `Prose` on this view, and none is looked for"), so
 * the single selector correctly finds nothing there; that is asserted below
 * via a source-level check rather than a full render, since neither view
 * exposes a sync component that renders without a loader mock. `contract_milestone`
 * (`/milestones`) DOES carry one (`notes`) but is a Server Component page with
 * no extractable sync view — its own contract assertions live in
 * `tests/detail-milestone.test.tsx`, which this same B33 unit updated to the
 * identical selector. The remaining five — `work_item`, `defect`, `blocker`,
 * `requirement`, `open_question` — are rendered directly here, and
 * `requirement` and `open_question` between them exercise all four call sites
 * that used to be the fifth copy (`detail-prose.tsx`, shared by two routes).
 *
 * So: 5 direct renders + 1 already-covered page suite + 2 confirmed-empty by
 * source = all eight.
 */

const CANONICAL_STATES = [
  "present",
  "absent",
  "unreadable",
  "not-requested",
  "contradiction",
];

function assertUniformContract(container: HTMLElement, view: string) {
  const matches = [...container.querySelectorAll("[data-verify-unit='detail-prose']")];
  expect(matches.length, `${view} should render at least one prose slot`).toBeGreaterThan(
    0,
  );
  for (const el of matches) {
    const field = el.getAttribute("data-verify-field");
    const state = el.getAttribute("data-verify-state");
    expect(field, `${view}: every detail-prose slot names its field`).toBeTruthy();
    expect(
      CANONICAL_STATES,
      `${view}: field "${field}" published state "${state}"`,
    ).toContain(state);
    // The retired names must not reappear anywhere alongside the new one.
    expect(el.hasAttribute("data-verify-prose-state")).toBe(false);
  }
}

afterEach(cleanup);

describe("one selector covers every Prose slot on every FR-81 view that has one", () => {
  it("blocker — description", async () => {
    const { BlockerDetailView } = await import(
      "@/app/blockers/[id]/_components/blocker-detail-view"
    );
    const detail: BlockerDetail = {
      kind: "blocker",
      id: "b1000000-0000-4000-8000-0000000000b2",
      engagement: { id: "eng-1", slug: "acme", clientName: "Acme Robotics" },
      ref: "B29",
      owner: "erik",
      description: { text: "Synthetic blocker prose for this test only.", state: "present" },
      openedAt: "2026-08-19T08:00:00Z",
      resolvedAt: null,
      disposition: "carried",
      blocks: [],
    };
    const { container } = render(<BlockerDetailView detail={detail} />);
    assertUniformContract(container, "blocker");
  });

  it("defect — description and wont_fix_reason", async () => {
    const { DefectDetailView } = await import(
      "@/app/defects/[id]/_components/defect-detail-view"
    );
    const detail: DefectDetail = {
      kind: "defect",
      id: "d10c0de0-0000-4000-8000-0000000000d7",
      engagement: { id: "eng-1", slug: "acme", clientName: "Acme Robotics" },
      ref: "D-7",
      source: "qa_agent",
      severity: "critical",
      rawSeverity: "showstopper",
      title: "Synthetic defect for this test only",
      description: { text: "Synthetic defect prose.", state: "present" },
      status: "open",
      wontFixReason: { text: null, state: "absent" },
      reportedAt: "2026-08-19T09:30:00Z",
      reportedBy: "qa-reviewer",
      verifiedAt: null,
      sourceKey: "checkpoint-test.md#1",
      requirement: null,
      fixingWorkItem: null,
      tests: [],
    };
    const { container } = render(<DefectDetailView detail={detail} />);
    assertUniformContract(container, "defect");
  });

  it("work item — description and raw_status", async () => {
    const { WorkItemDetailView } = await import(
      "@/app/work-items/[id]/_components/work-item-detail-view"
    );
    const detail: WorkItemDetail = {
      kind: "work_item",
      id: "0f3c1d2e-0000-4000-8000-00000000fee1",
      engagement: { id: "eng-1", slug: "acme", clientName: "Acme Robotics" },
      unit: "u4",
      executionMode: "fleet",
      workType: "ui",
      phase: 2,
      executor: "ui-designer",
      executorKind: "agent",
      status: "blocked",
      rawStatus: { text: null, state: "absent" },
      description: { text: "Synthetic work-item prose.", state: "present" },
      unautomatedReason: null,
      disposition: "carried",
      evidenceScope: "observed-live",
      notVerifiedCount: 0,
      startedAt: "2026-08-20T10:00:00Z",
      endedAt: null,
      planned: false,
      updatedAt: "2026-08-20T10:00:00Z",
      run: null,
      stack: null,
      blocker: null,
      externalWait: null,
      dependsOn: [],
      implementsRequirements: [],
      blocks: [],
      fixesDefects: [],
    };
    const { container } = render(<WorkItemDetailView detail={detail} asOf={"2026-08-24"} />);
    assertUniformContract(container, "work item");
  });

  it("requirement — requirement-text (the old fifth copy, first call site)", async () => {
    const { RequirementView } = await import(
      "@/app/requirements/_components/requirement-view"
    );
    const detail: RequirementDetail = {
      kind: "requirement",
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      engagement: { id: "eng-1", slug: "acme-rebuild", clientName: "Acme" },
      ref: "FR-42",
      section: "§4.2",
      text: { state: "present", text: "Synthetic requirement prose." },
      coverage: "uncovered",
      shippedEnvironments: [],
      workItems: [],
      tests: [],
      defects: [],
      releases: [],
      milestones: [],
    };
    const { container } = render(<RequirementView detail={detail} asOf={"2026-08-24"} />);
    assertUniformContract(container, "requirement");
  });

  it("open question — question, best guess and answer (the old fifth copy, second call site)", async () => {
    const { OpenQuestionView } = await import(
      "@/app/questions/_components/open-question-view"
    );
    const detail: OpenQuestionDetail = {
      kind: "open_question",
      id: "3f2a1b8c-9999-4444-8888-777777777777",
      engagement: { id: "eng-1", slug: "acme-rebuild", clientName: "Acme" },
      run: "eb2490",
      unit: "f2",
      section: "5a",
      question: { state: "present", text: "Synthetic question." },
      bestGuess: { state: "present", text: "Synthetic best guess." },
      confidence: "med",
      answer: { state: "absent", text: null },
      answeredBy: null,
      answeredAt: null,
      status: "open",
      sourceKey: "questions-test.jsonl#1",
      workItem: null,
    };
    const { container } = render(<OpenQuestionView detail={detail} />);
    assertUniformContract(container, "open question");
    // Three separate fields, three separate slots — the reason `data-verify-field`
    // stayed part of the contract rather than being dropped along with the
    // `-prose-` infix.
    const fields = [
      ...container.querySelectorAll("[data-verify-unit='detail-prose']"),
    ].map((el) => el.getAttribute("data-verify-field"));
    expect(new Set(fields).size).toBe(3);
  });
});

describe("the two FR-81 views with no Prose column stay clean of the contract", () => {
  function sourceOf(relativePath: string): string {
    return readFileSync(join(process.cwd(), relativePath), "utf8");
  }

  it("release — no detail-prose fragment, retired or current", () => {
    const source = sourceOf("src/app/releases/[id]/page.tsx");
    expect(source).not.toContain("data-verify-unit=\"detail-prose\"");
    expect(source).not.toContain("data-verify-unit=\"prose\"");
    expect(source).not.toContain("data-verify-prose-state");
  });

  it("external wait — no detail-prose fragment, retired or current", () => {
    const source = sourceOf("src/app/waits/[id]/page.tsx");
    expect(source).not.toContain("data-verify-unit=\"detail-prose\"");
    expect(source).not.toContain("data-verify-unit=\"prose\"");
    expect(source).not.toContain("data-verify-prose-state");
  });
});

describe("the retired attribute names are gone from the whole tree", () => {
  it("no call-site source under src/ still writes data-verify-prose-state or data-verify-unit=\"prose\"", () => {
    // A narrower, code-level restatement of the grep the report's Verification
    // section runs against the whole tree: `grep -rn
    // 'data-verify-prose-state\|data-verify-unit="detail-prose"' src/` should
    // return only this component. `src/components/prose-value.tsx` is
    // deliberately excluded from this list — its own docblock documents the
    // two retired names in prose (the table above), which the top-level grep
    // check explicitly allows ("or only your one component, if you chose
    // those names"). Every call site must have NO trace of either retired
    // name in actual markup.
    const files = [
      "src/app/blockers/[id]/_components/blocker-detail-view.tsx",
      "src/app/defects/[id]/_components/defect-detail-view.tsx",
      "src/app/work-items/[id]/_components/work-item-detail-view.tsx",
      "src/app/requirements/_components/requirement-view.tsx",
      "src/app/questions/_components/open-question-view.tsx",
      "src/app/milestones/[id]/page.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source, file).not.toContain("data-verify-prose-state");
      expect(source, file).not.toMatch(/data-verify-unit=["']prose["']/);
    }
  });
});
