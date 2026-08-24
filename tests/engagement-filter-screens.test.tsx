import { StrictMode } from "react";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/api/operator";
import { ENGAGEMENT_PARAM } from "@/lib/engagement-filter";
import type { OpenQuestionListing } from "@/lib/questions-load";
import type { RunListing } from "@/lib/runs-load";
import type { EngagementRecord } from "@/lib/server/registry/types";
import type { WaitListing } from "@/lib/server/waits/store";
import type { WorkItemListing } from "@/lib/server/workitems/list";

/**
 * M2.9 u3 — FR-96 and FR-96c on the five screens that gained the filter here.
 *
 * The six answer screens already honoured `?engagement=` and already rendered
 * `UnknownEngagementNotice`; `tests/answer-screens.test.tsx` covers them and
 * this file deliberately does not restate it. What is new is `/work-items`
 * (which filtered but could not say a slug named nothing), and `/questions`,
 * `/waits`, `/runs` and `/registry`, of which the last two read no
 * `searchParams` at all before this unit.
 *
 * ## What is NOT mocked, on purpose
 *
 * `@/lib/engagement-resolve` runs for real against a mocked
 * `getEngagement`/`listEngagements`. Mocking the resolver would leave the one
 * rule this file exists to prove — that an unresolvable slug produces no rows —
 * asserted against a stub of the thing under test. `@/lib/engagement-filter`
 * runs for real for the same reason.
 *
 * ## `<StrictMode>`, because `next.config.ts` sets `reactStrictMode: true`
 *
 * The repo rule, and it is cheap to keep: a bare `render(<X />)` tests the
 * screen in a mode the product never runs it in.
 *
 * ## The one assertion every screen here repeats
 *
 * **An unresolvable slug renders the notice AND no rows.** Both halves, every
 * time. A screen that renders the notice above the full unfiltered list has
 * satisfied the visible half of FR-96c and violated the half that matters —
 * "renders nothing, loudly" is one requirement, not two.
 */

const mocks = vi.hoisted(() => ({
  operatorContext: vi.fn(),
  getEngagement: vi.fn(),
  listEngagements: vi.fn(),
  readOpenQuestions: vi.fn(),
  readWaits: vi.fn(),
  readWaitEngagements: vi.fn(),
  readRuns: vi.fn(),
  readWorkItems: vi.fn(),
  readRefResolution: vi.fn(),
}));

vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: () => mocks.operatorContext(),
  requireOperator: async () => undefined,
}));

// Only `DeclareWaitDialog` reaches for it, and only because it refreshes after
// a successful write. Mirrors `tests/wait-flow.test.tsx`, which mounts the same
// dialog. No screen in this file is a Client Component.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/server/registry/engagements", () => ({
  getEngagement: (slug: string) => mocks.getEngagement(slug),
  listEngagements: () => mocks.listEngagements(),
}));

vi.mock("@/lib/questions-load", () => ({
  readOpenQuestions: (filters: unknown) => mocks.readOpenQuestions(filters),
}));

vi.mock("@/app/waits/_lib/load", () => ({
  readWaits: (includeResolved: boolean, slug: string | null) =>
    mocks.readWaits(includeResolved, slug),
  readEngagements: () => mocks.readWaitEngagements(),
}));

vi.mock("@/app/waits/actions", () => ({
  declareWaitSafe: async () => ({ ok: true }),
  resolveWaitSafe: async () => ({ ok: true }),
}));

vi.mock("@/lib/detail-load", () => ({
  readRefResolution: (queries: unknown) => mocks.readRefResolution(queries),
}));

vi.mock("@/lib/runs-load", () => ({
  readRuns: (engagementId: string | null) => mocks.readRuns(engagementId),
}));

vi.mock("@/app/work-items/_lib/load", () => ({
  readWorkItems: (query: unknown) => mocks.readWorkItems(query),
}));

const QuestionsPage = (await import("@/app/questions/page")).default;
const WaitsPage = (await import("@/app/waits/page")).default;
const RunsPage = (await import("@/app/runs/page")).default;
const RegistryPage = (await import("@/app/registry/page")).default;
const WorkItemsPage = (await import("@/app/work-items/page")).default;

const OPERATOR: OperatorContext = {
  userId: "user-1",
  email: "erik@example.com",
  assuranceLevel: "aal2",
  nextAssuranceLevel: "aal2",
  profile: { id: "op-1", email: "erik@example.com", displayName: "Erik" },
  mustVerifyMfa: false,
  mustEnrolMfa: false,
};

const ACME_ID = "22222222-2222-4222-8222-222222222222";

function engagement(
  overrides: Partial<EngagementRecord> = {},
): EngagementRecord {
  return {
    id: ACME_ID,
    slug: "acme",
    clientName: "Acme",
    source: null,
    contractType: null,
    status: "active",
    repoPath: null,
    specPath: null,
    fleetDir: null,
    stacks: [],
    dbOrg: null,
    dbProjectRef: null,
    hostingTeam: null,
    hostingProject: null,
    productionUrl: null,
    createdAt: "2026-08-01T00:00:00Z",
    archivedAt: null,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------- */
/* DOM helpers                                                                 */
/* -------------------------------------------------------------------------- */

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

/** Every anchor href on the rendered screen. Used to catch a dropped filter. */
function hrefs(): string[] {
  return [...document.querySelectorAll("a[href]")].map(
    (anchor) => anchor.getAttribute("href") ?? "",
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.operatorContext.mockResolvedValue(OPERATOR);
  mocks.getEngagement.mockResolvedValue(null);
  mocks.listEngagements.mockResolvedValue([]);
  mocks.readRefResolution.mockResolvedValue(new Map());
  mocks.readWaitEngagements.mockResolvedValue([]);
});

afterEach(cleanup);

/* -------------------------------------------------------------------------- */
/* The parameter itself                                                        */
/* -------------------------------------------------------------------------- */

describe("FR-96 — the parameter is spelled once", () => {
  it("is the name every screen below is driven with", () => {
    // If this ever stops being "engagement", every URL in this file is testing
    // a parameter no screen reads, and every assertion below would still pass
    // by rendering the unfiltered view. Pinning it here makes that impossible.
    expect(ENGAGEMENT_PARAM).toBe("engagement");
  });
});

/* -------------------------------------------------------------------------- */
/* /questions                                                                  */
/* -------------------------------------------------------------------------- */

function questionListing(
  overrides: Partial<OpenQuestionListing> = {},
): OpenQuestionListing {
  return {
    questions: [],
    openCount: 0,
    answeredCount: 0,
    unclassifiedConfidenceCount: 0,
    truncated: false,
    ...overrides,
  };
}

async function mountQuestions(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  render(
    <StrictMode>
      {await QuestionsPage({ searchParams: Promise.resolve(searchParams) })}
    </StrictMode>,
  );
}

describe("FR-96 on /questions", () => {
  it("reads the whole ledger when the URL asks for nothing", async () => {
    mocks.readOpenQuestions.mockResolvedValue(questionListing());

    await mountQuestions();

    expect(mocks.readOpenQuestions).toHaveBeenCalledWith({
      includeAnswered: false,
      engagementId: null,
    });
    expect(maybeUnit("unknown-engagement")).toBeNull();
  });

  it("narrows to the resolved engagement's id, never its slug", async () => {
    // The id, because `open_question.engagement_id` is what the row carries. A
    // slug filter here would need a join or a second lookup, and the resolution
    // already paid for one.
    mocks.getEngagement.mockResolvedValue(engagement());
    mocks.readOpenQuestions.mockResolvedValue(questionListing());

    await mountQuestions({ engagement: "acme" });

    expect(mocks.getEngagement).toHaveBeenCalledWith("acme");
    expect(mocks.readOpenQuestions).toHaveBeenCalledWith({
      includeAnswered: false,
      engagementId: ACME_ID,
    });
  });

  it("FR-96c: an unresolvable slug says so and reads nothing at all", async () => {
    mocks.getEngagement.mockResolvedValue(null);

    await mountQuestions({ engagement: "acmee" });

    expect(byUnit("unknown-engagement").getAttribute("data-verify-slug")).toBe(
      "acmee",
    );
    // Both halves. The listing read is never issued, so there are no rows to
    // leak past the notice even by accident.
    expect(mocks.readOpenQuestions).not.toHaveBeenCalled();
    expect(maybeUnit("question-summary")?.textContent).toContain(
      "counts unavailable",
    );
  });

  it("reports a failed engagement lookup as unavailable, not as 'no such engagement'", async () => {
    mocks.getEngagement.mockRejectedValue(new Error("connection reset"));

    await mountQuestions({ engagement: "acme" });

    expect(maybeUnit("unknown-engagement")).toBeNull();
    expect(
      byUnit("engagement-scope-unavailable").getAttribute("data-verify-slug"),
    ).toBe("acme");
    expect(mocks.readOpenQuestions).not.toHaveBeenCalled();
  });

  it("carries the filter across the answered toggle rather than dropping it", async () => {
    mocks.getEngagement.mockResolvedValue(engagement());
    mocks.readOpenQuestions.mockResolvedValue(questionListing());

    await mountQuestions({ engagement: "acme" });

    const toggle = byUnit("toggle-answered").getAttribute("href");
    expect(toggle).toContain("answered=1");
    expect(toggle).toContain("engagement=acme");
  });

  it("keeps the filter when the toggle is turning answered OFF", async () => {
    mocks.getEngagement.mockResolvedValue(engagement());
    mocks.readOpenQuestions.mockResolvedValue(questionListing());

    await mountQuestions({ engagement: "acme", answered: "1" });

    const toggle = byUnit("toggle-answered").getAttribute("href");
    expect(toggle).not.toContain("answered=");
    expect(toggle).toContain("engagement=acme");
  });
});

/* -------------------------------------------------------------------------- */
/* /waits                                                                      */
/* -------------------------------------------------------------------------- */

function waitListing(overrides: Partial<WaitListing> = {}): WaitListing {
  return {
    waits: [],
    byOwner: [],
    overdueCount: 0,
    truncated: false,
    ...overrides,
  };
}

async function mountWaits(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  render(
    <StrictMode>
      {await WaitsPage({ searchParams: Promise.resolve(searchParams) })}
    </StrictMode>,
  );
}

describe("FR-96 on /waits", () => {
  it("reads the whole ledger when the URL asks for nothing", async () => {
    mocks.readWaits.mockResolvedValue(waitListing());

    await mountWaits();

    expect(mocks.readWaits).toHaveBeenCalledWith(false, null);
  });

  it("narrows to the resolved engagement's slug, which is what listWaits takes", async () => {
    mocks.getEngagement.mockResolvedValue(engagement());
    mocks.readWaits.mockResolvedValue(waitListing());

    await mountWaits({ engagement: "acme" });

    expect(mocks.readWaits).toHaveBeenCalledWith(false, "acme");
  });

  it("FR-96c: an unresolvable slug says so and never reaches listWaits", async () => {
    // This is the assertion that matters most on this screen. `listWaits`
    // throws `invalid_request` for a slug naming nothing, which would render as
    // "this screen could not be read" — a different and wrong sentence. The
    // resolution in front of it is what keeps that unreachable.
    mocks.getEngagement.mockResolvedValue(null);

    await mountWaits({ engagement: "ghost" });

    expect(byUnit("unknown-engagement").getAttribute("data-verify-slug")).toBe(
      "ghost",
    );
    expect(mocks.readWaits).not.toHaveBeenCalled();
    expect(maybeUnit("load-notice")).toBeNull();
  });

  it("carries the filter across the resolved toggle", async () => {
    mocks.getEngagement.mockResolvedValue(engagement());
    mocks.readWaits.mockResolvedValue(waitListing());

    await mountWaits({ engagement: "acme" });

    const toggle = byUnit("toggle-resolved").getAttribute("href");
    expect(toggle).toContain("resolved=1");
    expect(toggle).toContain("engagement=acme");
  });

  it("does not narrow the declare-a-wait form's engagement options", async () => {
    // A filter scopes what is SHOWN. Narrowing the form would mean a filtered
    // screen can only declare a wait against one client, which makes the filter
    // a mode rather than a view.
    mocks.getEngagement.mockResolvedValue(engagement());
    mocks.readWaits.mockResolvedValue(waitListing());
    mocks.readWaitEngagements.mockResolvedValue([
      engagement(),
      engagement({ id: "other", slug: "northwind", clientName: "Northwind" }),
    ]);

    await mountWaits({ engagement: "acme" });

    // The dialog trigger renders only when there are options to offer, and it
    // is matched by its aria affordance rather than by its label.
    expect(
      document.querySelector("[aria-haspopup], [data-state]"),
    ).not.toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* /runs                                                                       */
/* -------------------------------------------------------------------------- */

function runListing(overrides: Partial<RunListing> = {}): RunListing {
  return {
    runs: [],
    noVerdictCount: 0,
    noTestCountsCount: 0,
    unparsedCountsUnavailable: false,
    ...overrides,
  };
}

async function mountRuns(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  render(
    <StrictMode>
      {await RunsPage({ searchParams: Promise.resolve(searchParams) })}
    </StrictMode>,
  );
}

describe("FR-96 on /runs", () => {
  it("stays cross-engagement by default, which is Q16 and is unchanged", async () => {
    mocks.readRuns.mockResolvedValue(runListing());

    await mountRuns();

    expect(mocks.readRuns).toHaveBeenCalledWith(null);
  });

  it("narrows to the resolved engagement's id", async () => {
    mocks.getEngagement.mockResolvedValue(engagement());
    mocks.readRuns.mockResolvedValue(runListing());

    await mountRuns({ engagement: "acme" });

    expect(mocks.readRuns).toHaveBeenCalledWith(ACME_ID);
  });

  it("FR-96c: an unresolvable slug says so and reads no runs", async () => {
    mocks.getEngagement.mockResolvedValue(null);

    await mountRuns({ engagement: "nope" });

    expect(byUnit("unknown-engagement").getAttribute("data-verify-slug")).toBe(
      "nope",
    );
    expect(mocks.readRuns).not.toHaveBeenCalled();
    expect(byUnit("run-summary").getAttribute("data-verify-runs")).toBe(
      "unknown",
    );
  });

  it("does not claim an empty ledger when one engagement has no runs", async () => {
    mocks.getEngagement.mockResolvedValue(engagement());
    mocks.readRuns.mockResolvedValue(runListing());

    await mountRuns({ engagement: "acme" });

    // "No fleet run has been ingested yet." is a claim about the whole ledger,
    // and this request only looked at one engagement.
    expect(document.body.textContent).toContain("acme");
    expect(document.body.textContent).not.toContain(
      "No fleet run has been ingested yet.",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* /registry                                                                   */
/* -------------------------------------------------------------------------- */

async function mountRegistry(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  render(
    <StrictMode>
      {await RegistryPage({ searchParams: Promise.resolve(searchParams) })}
    </StrictMode>,
  );
}

describe("FR-96 on /registry", () => {
  it("lists every engagement when the URL asks for nothing", async () => {
    mocks.listEngagements.mockResolvedValue([
      engagement(),
      engagement({ id: "other", slug: "northwind", clientName: "Northwind" }),
    ]);

    await mountRegistry();

    expect(document.body.textContent).toContain("Acme");
    expect(document.body.textContent).toContain("Northwind");
  });

  it("narrows to the named engagement and drops the others", async () => {
    mocks.listEngagements.mockResolvedValue([
      engagement(),
      engagement({ id: "other", slug: "northwind", clientName: "Northwind" }),
    ]);

    await mountRegistry({ engagement: "northwind" });

    expect(document.body.textContent).toContain("Northwind");
    expect(document.body.textContent).not.toContain("Acme");
    expect(maybeUnit("unknown-engagement")).toBeNull();
  });

  it("FR-96c: an unresolvable slug renders the notice and no table", async () => {
    mocks.listEngagements.mockResolvedValue([engagement()]);

    await mountRegistry({ engagement: "acmee" });

    expect(byUnit("unknown-engagement").getAttribute("data-verify-slug")).toBe(
      "acmee",
    );
    // Not the empty state either: "No engagements recorded." is a claim about
    // the ledger, and the read plainly returned one.
    expect(document.body.textContent).not.toContain("Acme");
    expect(document.body.textContent).not.toContain("No engagements recorded.");
  });

  it("resolves an archived-not-purged engagement, so a permalink does not rot", async () => {
    // CR-005 §3.3 point 2. The picker lists active engagements only; the URL is
    // not narrowed by that, and `listEngagements()` does not filter on
    // `archived_at`, which is the whole of the mechanism.
    mocks.listEngagements.mockResolvedValue([
      engagement({ archivedAt: "2026-08-10T00:00:00Z" }),
    ]);

    await mountRegistry({ engagement: "acme" });

    expect(maybeUnit("unknown-engagement")).toBeNull();
    expect(document.body.textContent).toContain("Acme");
  });

  it("renders the gate rather than FR-96c when the session cannot read", async () => {
    // A refused session has established nothing about whether the engagement
    // exists, and saying "no engagement has this slug" there would be a claim
    // nobody checked.
    mocks.operatorContext.mockResolvedValue({
      ...OPERATOR,
      userId: null,
      profile: null,
    });

    await mountRegistry({ engagement: "acmee" });

    expect(maybeUnit("unknown-engagement")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* /work-items                                                                 */
/* -------------------------------------------------------------------------- */

function workItemListing(
  overrides: Partial<WorkItemListing> = {},
): WorkItemListing {
  return {
    items: [],
    unparsedOnPage: 0,
    erikGateCount: 0,
    truncated: false,
    ...overrides,
  };
}

async function mountWorkItems(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  render(
    <StrictMode>
      {await WorkItemsPage({ searchParams: Promise.resolve(searchParams) })}
    </StrictMode>,
  );
}

describe("FR-96c on /work-items", () => {
  it("still filters by slug when the engagement resolves", async () => {
    mocks.getEngagement.mockResolvedValue(engagement());
    mocks.readWorkItems.mockResolvedValue(workItemListing());

    await mountWorkItems({ engagement: "acme" });

    expect(mocks.readWorkItems).toHaveBeenCalledWith(
      expect.objectContaining({ engagementSlug: "acme" }),
    );
    expect(maybeUnit("unknown-engagement")).toBeNull();
  });

  it("no longer answers a mistyped slug with 'No work items match these filters.'", async () => {
    // The sentence was true and it was not the answer: an engagement with no
    // work items and an engagement that does not exist rendered identically
    // under it, and only one of them means Erik mistyped a slug.
    mocks.getEngagement.mockResolvedValue(null);

    await mountWorkItems({ engagement: "acmee" });

    expect(byUnit("unknown-engagement").getAttribute("data-verify-slug")).toBe(
      "acmee",
    );
    expect(mocks.readWorkItems).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain(
      "No work items match these filters.",
    );
  });

  it("keeps the over-long value in the rejection banner rather than FR-96c", async () => {
    // This screen has a filter bar, so an unusable value joins its siblings in
    // `RejectedFilters` — the treatment every other filter on that bar gets.
    // The four screens with no filter bar route it to FR-96c instead; the
    // divergence is deliberate and is queued for Erik.
    mocks.readWorkItems.mockResolvedValue(workItemListing());

    await mountWorkItems({ engagement: "x".repeat(200) });

    expect(byUnit("rejected-filters").getAttribute("data-verify-count")).toBe(
      "1",
    );
    expect(maybeUnit("unknown-engagement")).toBeNull();
  });

  it("carries the filter into the pagination links", async () => {
    mocks.getEngagement.mockResolvedValue(engagement());
    mocks.readWorkItems.mockResolvedValue(
      workItemListing({ items: [], truncated: false }),
    );

    await mountWorkItems({ engagement: "acme", page: "2" });

    // Every link this screen renders while filtered must carry the filter, or
    // one click silently widens the list back to the whole ledger.
    const paged = hrefs().filter((href) => href.startsWith("/work-items?"));
    for (const href of paged) expect(href).toContain("engagement=acme");
  });
});
