import { StrictMode } from "react";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/api/operator";
import { OPERATOR_ROUTES } from "@/lib/nav";
import {
  dispatchUsage,
  reconcileVerdicts,
  renderGates,
  runDuration,
  runUnparsed,
  runVerdict,
  testTriple,
} from "@/lib/runs-display";
// Types only -- `vi.mock` replaces the module's runtime exports, never its
// types, so this stays the same boundary the route itself is written against.
import type { ListedRun, RunListing } from "@/lib/runs-load";

/**
 * M2.8 u1 -- `/runs`, FR-92, FR-94 and FR-95.
 *
 * Mirrors `tests/questions-list.test.tsx`'s shape: the async Server Component is
 * called directly and the returned element is rendered under `<StrictMode>`,
 * with `readRuns` and `getOperatorContext` mocked so the three outcomes -- a
 * failed read, an empty listing, a populated listing -- are each reachable
 * without a database. `next.config.ts` sets `reactStrictMode: true`, so mounting
 * bare would test the screen in a mode the product never runs it in.
 *
 * ## The fixtures are built by the real derivations, not hand-shaped
 *
 * Every `ListedRun` below runs its raw column values through `runVerdict`,
 * `runDuration`, `dispatchUsage`, `testTriple` and `runUnparsed` -- the same
 * pure functions `listRuns` uses. A hand-written `{ state: "known", ... }`
 * literal would let this suite stay green against a display model the read layer
 * can no longer produce, which is the failure mode a fixture exists to prevent.
 *
 * ## FR-95's `disagreed` branch is driven deliberately
 *
 * The ledger stores one verdict column per run, so `agreed` and `disagreed` are
 * unreachable from real data today. `reconcileVerdicts` is fed fabricated
 * two-source input here so that FR-95's both-shown state is live, exercised code
 * rather than a branch that has never once run. **Nothing in `src/` synthesises
 * a second source** -- that refusal is the subject of its own assertion below.
 */

const mocks = vi.hoisted(() => ({
  readRuns: vi.fn(),
  operatorContext: vi.fn(),
}));

vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: () => mocks.operatorContext(),
}));

vi.mock("@/lib/runs-load", () => ({
  readRuns: () => mocks.readRuns(),
}));

const RunsPage = (await import("@/app/runs/page")).default;

const OPERATOR: OperatorContext = {
  userId: "user-1",
  email: "erik@example.com",
  assuranceLevel: "aal2",
  nextAssuranceLevel: "aal2",
  profile: { id: "op-1", email: "erik@example.com", displayName: "Erik" },
  mustVerifyMfa: false,
  mustEnrolMfa: false,
};

/** The raw column values a `fleet_run` row can carry. */
interface RawRun {
  id: string;
  runId: string;
  branch: string | null;
  mode: string | null;
  startedAt: string | null;
  endedAt: string | null;
  verdict: string | null;
  dispatchesUsed: number | null;
  dispatchCap: number | null;
  testsPassed: number | null;
  testsFailed: number | null;
  testsSkipped: number | null;
  unparsedWorkItems: number | null;
  gates: unknown;
  engagement: ListedRun["engagement"];
}

/**
 * Run `b0952e` as it actually is in the ledger, measured 2026-08-23. Every
 * override below is stated against this, so a test that changes one column says
 * which column it changed.
 */
const B0952E: RawRun = {
  id: "11111111-1111-4111-8111-111111111111",
  runId: "b0952e",
  branch: "agent-build/2026-08-19-b0952e",
  mode: "full",
  startedAt: "2026-08-19 00:00:00+00",
  endedAt: "2026-08-19 00:00:00+00",
  verdict: "unparsed",
  dispatchesUsed: null,
  dispatchCap: null,
  testsPassed: null,
  testsFailed: null,
  testsSkipped: null,
  unparsedWorkItems: 0,
  gates: {},
  engagement: { id: "e1", slug: "delivery-ledger", clientName: "Capital Ready" },
};

function toListed(raw: RawRun): ListedRun {
  const gates = renderGates(raw.gates);

  return {
    id: raw.id,
    runId: raw.runId,
    engagement: raw.engagement,
    branch: raw.branch,
    mode: raw.mode,
    startedAt: raw.startedAt,
    endedAt: raw.endedAt,
    verdict: runVerdict({ verdict: raw.verdict }),
    duration: runDuration(raw.startedAt, raw.endedAt),
    dispatches: dispatchUsage(raw.dispatchesUsed, raw.dispatchCap),
    tests: testTriple(raw.testsPassed, raw.testsFailed, raw.testsSkipped),
    unparsed: runUnparsed({
      unparsedWorkItems: raw.unparsedWorkItems,
      gates,
      verdict: raw.verdict,
    }),
  };
}

function listing(
  raws: readonly Partial<RawRun>[] = [],
  overrides: Partial<RunListing> = {},
): RunListing {
  const runs = raws.map((raw) => toListed({ ...B0952E, ...raw }));

  return {
    runs,
    noVerdictCount: runs.filter((run) => run.verdict.agreement === "none").length,
    noTestCountsCount: runs.filter((run) => run.tests.state === "unknown").length,
    unparsedCountsUnavailable: false,
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

function allUnits(unit: string): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(`[data-verify-unit='${unit}']`)];
}

async function mount(
  searchParams: Record<string, string | string[] | undefined> = {},
) {
  render(
    <StrictMode>
      {await RunsPage({ searchParams: Promise.resolve(searchParams) })}
    </StrictMode>,
  );
}

beforeEach(() => {
  mocks.readRuns.mockReset();
  mocks.operatorContext.mockReset();
  mocks.operatorContext.mockResolvedValue(OPERATOR);
});

afterEach(cleanup);

/* -------------------------------------------------------------------------- */
/* B43/B44 -- the nav entry, and the tripwire that makes deleting it fail       */
/* -------------------------------------------------------------------------- */

describe("the /runs nav entry (D5, B43, B44)", () => {
  it("exists, so the screen is reachable from navigation at all", () => {
    const entry = OPERATOR_ROUTES.find((item) => item.href === "/runs");

    expect(entry).toBeDefined();
    expect(entry?.label).toBe("Fleet runs");
    expect(entry?.question.length).toBeGreaterThan(0);
    expect(entry?.requirements).toContain("FR-92");
  });

  it("sits after every positional call site, so it can shift none of them", () => {
    // B44: six pages read this array by index, `[0]` through `[5]`. Appending
    // is the only change to it that cannot silently render a screen under
    // another screen's title and requirement list.
    //
    // `tests/nav-routes.test.ts` pins `[0]`-`[4]`; `[5]` is pinned here,
    // because `questions/page.tsx` reads it positionally and nothing else
    // asserted it -- it is the one index this entry could have broken with
    // nothing to catch it.
    expect(OPERATOR_ROUTES[5]?.href).toBe("/questions");
    expect(
      OPERATOR_ROUTES.findIndex((item) => item.href === "/runs"),
    ).toBeGreaterThanOrEqual(6);
  });

  it("is the entry this page renders itself from, by href and not by position", async () => {
    mocks.readRuns.mockResolvedValue(listing());

    await mount();

    const entry = OPERATOR_ROUTES.find((item) => item.href === "/runs");
    expect(byUnit("screen").getAttribute("data-verify-screen")).toBe(
      entry?.label,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The three outcomes                                                          */
/* -------------------------------------------------------------------------- */

describe("the read failed", () => {
  it("renders the load notice and never the empty state", async () => {
    mocks.readRuns.mockRejectedValue(new Error("connection refused"));

    await mount();

    expect(byUnit("load-notice").getAttribute("data-verify-reason")).toBe("error");
    expect(maybeUnit("empty-state")).toBeNull();
    expect(maybeUnit("run-table")).toBeNull();
  });

  it("states no counts rather than zeros it never read", async () => {
    mocks.readRuns.mockRejectedValue(new Error("connection refused"));

    await mount();

    const summary = byUnit("run-summary");
    expect(summary.getAttribute("data-verify-runs")).toBe("unknown");
    expect(summary.textContent).not.toContain("0 runs");
  });
});

describe("the read succeeded with nothing to show", () => {
  it("renders the truthful empty state, distinct from a failure", async () => {
    mocks.readRuns.mockResolvedValue(listing());

    await mount();

    expect(maybeUnit("load-notice")).toBeNull();
    expect(byUnit("empty-state").textContent).toContain(
      "No fleet run has been ingested yet",
    );
    expect(maybeUnit("run-table")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* FR-92 -- the listing, against the data it will actually render              */
/* -------------------------------------------------------------------------- */

describe("FR-92: the row, as run b0952e actually is", () => {
  beforeEach(() => {
    mocks.readRuns.mockResolvedValue(listing([{}]));
  });

  it("renders one row carrying the run id, branch and mode", async () => {
    await mount();

    const rows = allUnits("run-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]?.getAttribute("data-verify-run-id")).toBe("b0952e");
    expect(rows[0]?.getAttribute("data-verify-mode")).toBe("full");
    expect(rows[0]?.textContent).toContain("agent-build/2026-08-19-b0952e");
  });

  it("links the run id to its own detail route", async () => {
    await mount();

    const link = document.querySelector<HTMLAnchorElement>(
      "[data-verify-unit='run-link']",
    );
    expect(link?.getAttribute("href")).toBe("/runs/b0952e");
    expect(link?.textContent).toBe("b0952e");
  });

  it("links the engagement to the registry, since /runs is cross-engagement", async () => {
    await mount();

    const link = document.querySelector<HTMLAnchorElement>(
      "[data-verify-unit='engagement-link']",
    );
    expect(link?.getAttribute("href")).toBe("/registry/delivery-ledger");
  });

  it("builds no engagement filter, which is FR-96 and is not approved", async () => {
    await mount();

    expect(document.querySelector("select")).toBeNull();
    expect(
      document.querySelector("[data-verify-unit='engagement-filter']"),
    ).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* D3 -- NULL is not zero, on every numeric column                             */
/* -------------------------------------------------------------------------- */

describe("D3: a measured zero and an absent value never render the same", () => {
  it("renders a genuine zero duration as 0m, because that is data", async () => {
    // b0952e's start and end are the same instant. Refusing to state a real
    // zero is as wrong as inventing one.
    mocks.readRuns.mockResolvedValue(listing([{}]));

    await mount();

    const cell = byUnit("run-duration");
    expect(cell.getAttribute("data-verify-duration-state")).toBe("known");
    expect(cell.getAttribute("data-verify-minutes")).toBe("0");
    expect(cell.textContent).toBe("0m");
  });

  it("renders a missing end time as a statement, never as 0m", async () => {
    mocks.readRuns.mockResolvedValue(listing([{ endedAt: null }]));

    await mount();

    const cell = byUnit("run-duration");
    expect(cell.getAttribute("data-verify-duration-state")).toBe("no_end");
    expect(cell.getAttribute("data-verify-minutes")).toBeNull();
    expect(cell.textContent).not.toContain("0m");
    expect(cell.textContent).toContain("no end recorded");
  });

  it("reports a run that ends before it starts rather than clamping it to zero", async () => {
    mocks.readRuns.mockResolvedValue(
      listing([{ startedAt: "2026-08-19 06:00:00+00", endedAt: "2026-08-19 01:00:00+00" }]),
    );

    await mount();

    const cell = byUnit("run-duration");
    expect(cell.getAttribute("data-verify-duration-state")).toBe(
      "ends_before_start",
    );
    expect(cell.textContent).not.toContain("0m");
  });

  it("never renders unrecorded dispatch usage as 0 of 0", async () => {
    mocks.readRuns.mockResolvedValue(listing([{}]));

    await mount();

    const cell = byUnit("run-dispatches");
    expect(cell.getAttribute("data-verify-dispatch-state")).toBe("unknown");
    expect(cell.textContent).not.toContain("0 of 0");
    expect(cell.textContent).toContain("not recorded");
  });

  it("shows the recorded half of a partial dispatch pair and refuses to infer the other", async () => {
    mocks.readRuns.mockResolvedValue(listing([{ dispatchesUsed: 3 }]));

    await mount();

    const cell = byUnit("run-dispatches");
    expect(cell.getAttribute("data-verify-dispatch-state")).toBe("partial");
    expect(cell.textContent).toContain("3 of ?");
  });

  it("never renders an absent test triple as 0 / 0 / 0", async () => {
    mocks.readRuns.mockResolvedValue(listing([{}]));

    await mount();

    const cell = byUnit("run-tests");
    expect(cell.getAttribute("data-verify-tests-state")).toBe("unknown");
    expect(cell.textContent).not.toContain("0 / 0 / 0");
    expect(cell.textContent).toContain("not recorded");
  });

  it("renders a real all-zero triple as zeros, because that is a measurement", async () => {
    mocks.readRuns.mockResolvedValue(
      listing([{ testsPassed: 0, testsFailed: 0, testsSkipped: 0 }]),
    );

    await mount();

    const cell = byUnit("run-tests");
    expect(cell.getAttribute("data-verify-tests-state")).toBe("known");
    expect(cell.textContent).toContain("0 / 0 / 0");
  });

  it("marks the missing members of a partial triple, never filling them with zero", async () => {
    mocks.readRuns.mockResolvedValue(listing([{ testsPassed: 12 }]));

    await mount();

    const cell = byUnit("run-tests");
    expect(cell.getAttribute("data-verify-tests-state")).toBe("partial");
    expect(cell.textContent).toContain("12 / ? / ?");
  });
});

/* -------------------------------------------------------------------------- */
/* FR-94 -- this run's own unparsed count                                      */
/* -------------------------------------------------------------------------- */

describe("FR-94: every row states its own unparsed count", () => {
  it("counts the run's own unparsed verdict, which no other total holds", async () => {
    mocks.readRuns.mockResolvedValue(listing([{}]));

    await mount();

    const cell = byUnit("run-unparsed");
    expect(cell.getAttribute("data-verify-state")).toBe("nonzero");
    expect(cell.getAttribute("data-verify-count")).toBe("1");
    expect(cell.getAttribute("data-verify-verdict-unparsed")).toBe("true");
    expect(cell.textContent).toContain("1 unparsed");
  });

  it("states a real zero rather than hiding it", async () => {
    mocks.readRuns.mockResolvedValue(listing([{ verdict: "PASS" }]));

    await mount();

    const cell = byUnit("run-unparsed");
    expect(cell.getAttribute("data-verify-state")).toBe("zero");
    expect(cell.getAttribute("data-verify-count")).toBe("0");
    expect(cell.textContent).toContain("0 unparsed");
  });

  it("never renders an unread count as zero", async () => {
    mocks.readRuns.mockResolvedValue(
      listing([{ unparsedWorkItems: null }], { unparsedCountsUnavailable: true }),
    );

    await mount();

    const cell = byUnit("run-unparsed");
    expect(cell.getAttribute("data-verify-state")).toBe("unknown");
    expect(cell.getAttribute("data-verify-count")).toBeNull();
    expect(cell.textContent).not.toContain("0 unparsed");
  });

  it("reserves the fuchsia unparsed treatment for a non-zero count", async () => {
    mocks.readRuns.mockResolvedValue(listing([{}]));
    await mount();
    expect(byUnit("run-unparsed").className).toContain("state-unparsed");

    cleanup();

    mocks.readRuns.mockResolvedValue(listing([{ verdict: "PASS" }]));
    await mount();
    expect(byUnit("run-unparsed").className).not.toContain("state-unparsed");
  });

  it("says so on the screen when no run could state a total", async () => {
    mocks.readRuns.mockResolvedValue(
      listing([{ unparsedWorkItems: null }], { unparsedCountsUnavailable: true }),
    );

    await mount();

    expect(byUnit("run-summary").textContent).toContain(
      "could not be read",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* FR-95 -- the verdict, byte-for-byte, with disagreement shown                */
/* -------------------------------------------------------------------------- */

describe("FR-95: the verdict is emitted exactly as recorded", () => {
  it("renders `unparsed` as the word itself, never hidden behind a dash", async () => {
    mocks.readRuns.mockResolvedValue(listing([{}]));

    await mount();

    const source = byUnit("run-verdict-source");
    expect(source.getAttribute("data-verify-verdict")).toBe("unparsed");
    expect(source.textContent).toContain("unparsed");
  });

  it("reuses the one hatched unparsed treatment rather than inventing a second", async () => {
    mocks.readRuns.mockResolvedValue(listing([{}]));

    await mount();

    const badge = byUnit("state-badge");
    expect(badge.getAttribute("data-verify-state")).toBe("unparsed");
    expect(badge.getAttribute("data-verify-treatment")).toBe("hatched");
  });

  it("does not title-case or otherwise rewrite a recorded verdict", async () => {
    mocks.readRuns.mockResolvedValue(listing([{ verdict: "ISSUES" }]));

    await mount();

    const source = byUnit("run-verdict-source");
    expect(source.getAttribute("data-verify-verdict")).toBe("ISSUES");
    expect(source.textContent).toContain("ISSUES");
    expect(source.textContent).not.toContain("Issues");
  });

  it("shows an unrecognised verdict as recorded, and marks it rather than correcting it", async () => {
    mocks.readRuns.mockResolvedValue(listing([{ verdict: "MOSTLY FINE" }]));

    await mount();

    const source = byUnit("run-verdict-source");
    expect(source.getAttribute("data-verify-verdict")).toBe("MOSTLY FINE");
    expect(source.getAttribute("data-verify-recognised")).toBe("false");
    expect(source.textContent).toContain("MOSTLY FINE");
  });

  it("says a single source is uncorroborated, so it cannot read as agreement", async () => {
    mocks.readRuns.mockResolvedValue(listing([{}]));

    await mount();

    const verdict = byUnit("run-verdict");
    expect(verdict.getAttribute("data-verify-agreement")).toBe("single");
    expect(verdict.getAttribute("data-verify-source-count")).toBe("1");
    expect(verdict.textContent).toContain("one source");
  });

  it("distinguishes no verdict at all from a verdict of `unparsed`", async () => {
    mocks.readRuns.mockResolvedValue(listing([{ verdict: null }]));

    await mount();

    const verdict = byUnit("run-verdict");
    expect(verdict.getAttribute("data-verify-agreement")).toBe("none");
    expect(verdict.getAttribute("data-verify-source-count")).toBe("0");
    expect(verdict.textContent).toContain("not recorded");
    expect(verdict.textContent).not.toContain("unparsed");
  });

  it("synthesises no second source from the gates payload", async () => {
    // D1. A run whose gates carry outcomes still exposes exactly one verdict
    // source. Manufacturing a second to light up the both-shown branch would
    // make a disagreement this product invented look like one two artifacts
    // recorded.
    mocks.readRuns.mockResolvedValue(
      listing([{ gates: { build: "PASS", lint: "FAIL" } }]),
    );

    await mount();

    expect(byUnit("run-verdict").getAttribute("data-verify-source-count")).toBe(
      "1",
    );
    expect(allUnits("run-verdict-source")).toHaveLength(1);
  });

  it("shows BOTH verdicts, each labelled, when two sources disagree", async () => {
    // Fabricated two-source input: the schema cannot produce this yet, and a
    // branch that has never run is indistinguishable from one that does not
    // work. `manifest-cd414c.md` saying `pending` while `checkpoint-cd414c.md`
    // says merged is the standing example of why both must be shown.
    const run = toListed(B0952E);
    mocks.readRuns.mockResolvedValue(
      listing([], {
        runs: [
          {
            ...run,
            verdict: reconcileVerdicts([
              { origin: "manifest", verdict: "pending", recognised: false },
              { origin: "checkpoint", verdict: "merged", recognised: false },
            ]),
          },
        ],
      }),
    );

    await mount();

    const verdict = byUnit("run-verdict");
    expect(verdict.getAttribute("data-verify-agreement")).toBe("disagreed");
    expect(verdict.getAttribute("data-verify-distinct-count")).toBe("2");

    const sources = allUnits("run-verdict-source");
    expect(sources).toHaveLength(2);
    expect(sources.map((one) => one.getAttribute("data-verify-verdict"))).toEqual(
      ["pending", "merged"],
    );

    // Each is attributed, so neither reads as the product's own conclusion.
    expect(verdict.textContent).toContain("manifest");
    expect(verdict.textContent).toContain("checkpoint");
    expect(verdict.textContent).toContain("sources disagree");
  });

  it("reports agreement between two sources as agreement, not as a single source", async () => {
    const run = toListed(B0952E);
    mocks.readRuns.mockResolvedValue(
      listing([], {
        runs: [
          {
            ...run,
            verdict: reconcileVerdicts([
              { origin: "manifest", verdict: "PASS", recognised: true },
              { origin: "checkpoint", verdict: "PASS", recognised: true },
            ]),
          },
        ],
      }),
    );

    await mount();

    const verdict = byUnit("run-verdict");
    expect(verdict.getAttribute("data-verify-agreement")).toBe("agreed");
    expect(verdict.textContent).toContain("2 sources agree");
    expect(verdict.textContent).not.toContain("one source");
  });
});

/* -------------------------------------------------------------------------- */
/* The two self-retiring notes                                                 */
/* -------------------------------------------------------------------------- */

describe("the notes that retire themselves", () => {
  it("names the missing dispatch producer while every run reads unknown", async () => {
    mocks.readRuns.mockResolvedValue(listing([{}]));

    await mount();

    expect(byUnit("dispatch-producer-note").textContent).toContain(
      "nothing in this product writes",
    );
  });

  it("stops naming it the moment one run records the pair", async () => {
    // The note is conditional precisely so it cannot become a false statement
    // that nobody goes back to delete.
    mocks.readRuns.mockResolvedValue(
      listing([{ dispatchesUsed: 4, dispatchCap: 20 }]),
    );

    await mount();

    expect(maybeUnit("dispatch-producer-note")).toBeNull();
    expect(byUnit("run-dispatches").textContent).toContain("4 of 20");
  });

  it("warns that the tail of the list is not a chronology when a start is missing", async () => {
    mocks.readRuns.mockResolvedValue(listing([{ startedAt: null }]));

    await mount();

    expect(byUnit("run-order-note").textContent).toContain("not a chronology");
  });

  it("says nothing about ordering when every run has a start time", async () => {
    mocks.readRuns.mockResolvedValue(listing([{}]));

    await mount();

    expect(maybeUnit("run-order-note")).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* D4 -- no prose reaches this screen                                          */
/* -------------------------------------------------------------------------- */

describe("D4: no decrypted prose on this screen", () => {
  it("publishes no data-verify attribute carrying free text", async () => {
    mocks.readRuns.mockResolvedValue(listing([{}]));

    await mount();

    // Every published value is an identifier, an enum-like token or a number.
    // A sentence in a state contract would mean a prose column reached the
    // projection; `runs-columns.test.ts` guards the read side, this guards the
    // render side.
    const attributes = [...document.querySelectorAll("*")].flatMap((element) =>
      [...element.attributes]
        .filter((attribute) => attribute.name.startsWith("data-verify-"))
        .map((attribute) => attribute.value),
    );

    expect(attributes.length).toBeGreaterThan(0);
    for (const value of attributes) {
      expect(value.split(/\s+/).length).toBeLessThanOrEqual(3);
    }
  });
});
