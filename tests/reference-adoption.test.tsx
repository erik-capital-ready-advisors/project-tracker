import { StrictMode } from "react";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcceptanceRefs } from "@/app/registry/_components/acceptance-refs";
import { MilestoneTable } from "@/app/registry/_components/milestone-table";
import { WaitList } from "@/app/waits/_components/wait-list";
import { WorkItemTable } from "@/app/work-items/_components/work-item-table";
import {
  DISPOSITIONS,
  EVIDENCE_SCOPES,
  EXECUTION_MODES,
  EXECUTOR_KINDS,
  UNAUTOMATED_REASONS,
  WORK_STATUSES,
} from "@/app/work-items/_lib/labels";
import { parseWorkItemQuery, PARAM, withParams } from "@/app/work-items/_lib/query";
import type { WorkItemQuery } from "@/app/work-items/_lib/query";
import {
  DISPOSITION,
  EVIDENCE_SCOPE,
  EXECUTION_MODE,
  EXECUTOR_KIND,
  UNAUTOMATED_REASON,
  WORK_STATUS,
} from "@/lib/server/workitems/rules";
import { refKey } from "@/lib/detail-load";
import type { RefResolution } from "@/lib/detail-load";
import { ENTITY_KINDS } from "@/lib/entity-routes";
import type { ListedWorkItem } from "@/lib/server/workitems/list";
import type { MilestoneRecord } from "@/lib/server/registry/types";
import type { StoredWait, WaitGroup } from "@/lib/server/waits/store";

// `WaitList` renders `ResolveWaitButton`, a Client Component that calls
// `useRouter()`. There is no app router in jsdom, so the hook throws its
// mounting invariant. Same stub `tests/wait-flow.test.tsx` uses: this suite is
// about references, and the resolve dialog has its own tests over there.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

/**
 * M2.7 f5 — FR-80 and FR-83 on the three operator screens.
 *
 * These screens are not the six answers, and FR-80 says "**any** screen". The
 * `/work-items` list, the registry's milestones and the waits list all render
 * entity references, and until this milestone every one of them was a dead
 * token: a `u4` a reader could see and not open.
 *
 * ## Everything is asserted through the markup contract
 *
 * Never through a class name — with one deliberate exception, below. A suite
 * built on class names goes red the next time anyone restyles a badge, which is
 * how a green suite starts reporting on the wrong thing.
 *
 * The exception is FR-12's dangling treatment, and it is asserted on purpose:
 * the brief for this unit is to make the *known* half of an acceptance
 * reference a link "without weakening the unknown half by one pixel", and a
 * contract attribute cannot express a pixel. So the treatment classes are
 * asserted directly, which is what makes "unchanged" a checkable claim rather
 * than an assurance.
 *
 * ## Mounted under `StrictMode`
 *
 * `next.config.ts` sets `reactStrictMode: true`, so a bare `render()` does not
 * mount these components the way Next does. Nothing here fetches in an effect
 * today — they are all Server Components over already-loaded props — so this
 * costs nothing and stops a later effect from being tested under a harness
 * gentler than production.
 */
function draw(ui: React.ReactElement): HTMLElement {
  return render(<StrictMode>{ui}</StrictMode>).container;
}

const ID = {
  fleetItem: "aaaaaaaa-0000-4000-8000-000000000001",
  handItem: "bbbbbbbb-0000-4000-8000-000000000002",
  blocker: "cccccccc-0000-4000-8000-000000000003",
  wait: "dddddddd-0000-4000-8000-000000000004",
  requirement: "eeeeeeee-0000-4000-8000-000000000005",
  milestone: "ffffffff-0000-4000-8000-000000000006",
  blockedItem: "99999999-0000-4000-8000-000000000007",
} as const;

const ENGAGEMENT_ID = "10101010-0000-4000-8000-00000000000a";

/** Every value here is obviously synthetic. No client name, no real amount. */
function listed(overrides: Partial<ListedWorkItem> = {}): ListedWorkItem {
  return {
    id: ID.fleetItem,
    engagementId: ENGAGEMENT_ID,
    engagementSlug: "example-engagement",
    unit: "u4",
    executionMode: "fleet",
    executorKind: "agent",
    executor: "ui-designer",
    status: "done",
    workType: "ui",
    phase: null,
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
    planned: false,
    updatedAt: null,
    ...overrides,
  };
}

const QUERY: WorkItemQuery = parseWorkItemQuery({});

function token(container: HTMLElement, ref: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    `[data-verify-unit='entity-ref'][data-verify-ref="${ref}"]`,
  );
  if (el === null) throw new Error(`no entity-ref was rendered for "${ref}"`);
  return el;
}

/** FR-83's whole question, in the expression the e2e gate uses. */
function anchorFor(el: HTMLElement): HTMLAnchorElement | null {
  return el.closest("a");
}

/* ------------------------------------------------------------------ */
/* /work-items — FR-44's list, and the screen the FR-84 gate drives     */
/* ------------------------------------------------------------------ */

describe("/work-items — FR-80 on the unified list", () => {
  it("makes a fleet row's unit id navigable to that work item", () => {
    const container = draw(
      <WorkItemTable items={[listed()]} query={QUERY} asOf={"2026-08-24"} />,
    );

    const el = token(container, "u4");
    expect(el).toHaveAttribute("data-verify-kind", "work_item");
    expect(el).toHaveAttribute("data-verify-known", "true");
    expect(anchorFor(el)).toHaveAttribute("href", `/work-items/${ID.fleetItem}`);
  });

  it("links to the database uuid and never to the human reference", () => {
    // FR-83's most likely failure and the one i1 and u1 both flagged by name:
    // `/work-items/u4` is a broken link that looks exactly like a working one.
    const container = draw(<WorkItemTable items={[listed()]} query={QUERY} asOf={"2026-08-24"} />);
    const href = anchorFor(token(container, "u4"))?.getAttribute("href") ?? "";
    expect(href).not.toContain("u4");
  });

  it("names a hand work item with no unit rather than rendering a blank", () => {
    // Ruling 2, and this is the screen that lists these rows. A `hand` or
    // `external` item has no `unit` at all; before M2.7 the cell was an em
    // dash, which is a row a reader can see and cannot open.
    const container = draw(
      <WorkItemTable
        items={[
          listed({
            id: ID.handItem,
            unit: null,
            executionMode: "hand",
            executorKind: "erik",
          }),
        ]}
        query={QUERY}
        asOf={"2026-08-24"}
      />,
    );

    const el = token(container, "work item bbbbbbbb");
    expect(el.textContent).toBe("work item bbbbbbbb");
    expect(el).toHaveAttribute("data-verify-known", "true");
    expect(anchorFor(el)).toHaveAttribute("href", `/work-items/${ID.handItem}`);
  });

  it("makes the blocker and the external wait holding a row up navigable", () => {
    const container = draw(
      <WorkItemTable
        items={[
          listed({
            status: "blocked",
            blockerId: ID.blocker,
            externalWaitId: ID.wait,
          }),
        ]}
        query={QUERY}
        asOf={"2026-08-24"}
      />,
    );

    const blocker = token(container, "blocker cccccccc");
    expect(blocker).toHaveAttribute("data-verify-kind", "blocker");
    expect(anchorFor(blocker)).toHaveAttribute("href", `/blockers/${ID.blocker}`);

    const wait = token(container, "external wait dddddddd");
    expect(wait).toHaveAttribute("data-verify-kind", "external_wait");
    expect(anchorFor(wait)).toHaveAttribute("href", `/waits/${ID.wait}`);
  });

  it("links the engagement as a plain anchor, not as a ninth entity kind", () => {
    // Ruling 3. `ENTITY_KINDS` is asserted to be exactly FR-81's eight in
    // `tests/m27-gate.test.ts`, and `/registry/[slug]` has been the engagement's
    // detail view since M1.3. Asserted here so a later unit does not "fix" the
    // inconsistency by adding a kind and turning that gate red.
    const container = draw(<WorkItemTable items={[listed()]} query={QUERY} asOf={"2026-08-24"} />);

    const link = container.querySelector<HTMLAnchorElement>(
      "[data-verify-unit='engagement-link']",
    );
    expect(link).toHaveAttribute("href", "/registry/example-engagement");
    expect(link).not.toHaveAttribute("data-verify-kind");
    expect([...ENTITY_KINDS]).not.toContain("engagement");
  });

  it("publishes no decrypted prose into the row's state contract", () => {
    // §7a: `description` and `raw_status` are pgcrypto columns. The listing
    // leaves them null and this table never opts in — asserted rather than
    // assumed, because the attribute set is where a leak would be invisible.
    const container = draw(
      <WorkItemTable
        items={[listed({ description: "a client's confidential summary" })]}
        query={QUERY}
        asOf={"2026-08-24"}
      />,
    );

    const row = container.querySelector<HTMLElement>(
      "[data-verify-unit='work-item-row']",
    );
    if (row === null) throw new Error("no work-item-row was rendered");
    for (const name of row.getAttributeNames()) {
      expect(row.getAttribute(name)).not.toContain("confidential");
    }
    expect(container.textContent).not.toContain("confidential");
  });
});

/* ------------------------------------------------------------------ */
/* FR-84's precondition — the filters live in the URL and nowhere else  */
/* ------------------------------------------------------------------ */

describe("FR-84 — the filter state a detail view is entered from is in the URL", () => {
  /**
   * FR-84 itself is a browser-back assertion and only `pnpm gate:m27:e2e` can
   * make it, because it needs a signed-in operator session at `aal2`. What is
   * checkable here is the property the whole requirement rests on: **the filter
   * state lives in the query string**. If it does, browser back restores it for
   * free, because a detail view is a separate route reached by an ordinary
   * anchor. If it did not, no amount of restoration machinery would be honest.
   */
  const FILTERED =
    "engagement=example-engagement&mode=fleet&executor=erik_gate&status=blocked" +
    "&disposition=carried&reason=human-judgment&evidence=observed-live&blocked=1" +
    "&sort=status&dir=asc&page=3";

  function parse(search: string): WorkItemQuery {
    return parseWorkItemQuery(
      Object.fromEntries(new URLSearchParams(search).entries()),
    );
  }

  it("round-trips every filter through the query string without losing one", () => {
    const first = parse(FILTERED);
    expect(first.rejected).toEqual([]);
    expect(first.filtered).toBe(true);

    // `withParams(query, {})` is what every sort link and pagination link on the
    // screen builds. Re-parsing its output must reproduce the same query, or a
    // filter is being dropped somewhere on the way back into the URL.
    const rebuilt = withParams(first, {});
    const second = parse(rebuilt.slice(rebuilt.indexOf("?") + 1));

    expect(second).toEqual(first);
  });

  it("carries a value for every filter field in PARAM, so none can hide in state", () => {
    const query = parse(FILTERED);
    const search = new URLSearchParams(
      withParams(query, {}).split("?")[1] ?? "",
    );

    // Every parameter the screen knows about is present in the rebuilt URL.
    // A field that vanished here would be a filter that survives only in the
    // component that rendered it — which is exactly what FR-84 cannot tolerate.
    for (const name of Object.values(PARAM)) {
      expect(search.get(name), `${name} did not survive the URL round trip`)
        .not.toBeNull();
    }
  });

  it("keeps a filtered screen's query string non-empty on first render", () => {
    // The gate asserts `before !== ""` before it clicks anything: a screen that
    // dropped its own query string on first render would restore "nothing" on
    // the way back and pass a naive equality check while failing the point.
    const query = parse("mode=fleet&status=blocked");
    expect(withParams(query, {})).toBe(
      "/work-items?mode=fleet&status=blocked",
    );
  });

  it("emits a URL value the parser accepts for every option the bar offers", () => {
    // The defect this unit found while establishing FR-84's precondition, pinned
    // shut. `closedSet` maps a WIRE spelling to a STORED one, and for
    // `EVIDENCE_SCOPE` and `UNAUTOMATED_REASON` the two differ. Eight of these
    // twenty-eight values were written into the URL in their stored form and
    // rejected on the way back in — an unfiltered list under a "not recognised"
    // banner, and FR-84 unable to restore either filter.
    //
    // Driven off the label maps, which is what the filter bar's options are
    // built from, so a seventh closed set added later is covered by
    // construction rather than by anyone remembering to add a case.
    const rejected: string[] = [];
    const check = (field: string, wire: readonly string[]) => {
      for (const value of wire) {
        if (parse(`${field}=${value}`).rejected.length > 0) {
          rejected.push(`${field}=${value}`);
        }
      }
    };

    check("mode", EXECUTION_MODES.map(EXECUTION_MODE.toWire));
    check("executor", EXECUTOR_KINDS.map(EXECUTOR_KIND.toWire));
    check("status", WORK_STATUSES.map(WORK_STATUS.toWire));
    check("disposition", DISPOSITIONS.map(DISPOSITION.toWire));
    check("evidence", EVIDENCE_SCOPES.map(EVIDENCE_SCOPE.toWire));
    check("reason", UNAUTOMATED_REASONS.map(UNAUTOMATED_REASON.toWire));

    expect(rejected).toEqual([]);
  });

  it("round-trips a filter whose wire and stored spellings differ", () => {
    // The two that actually differ, named rather than left to the sweep above,
    // because the sweep would still pass if `toWire` were quietly dropped from
    // `withParams` and the URL never rebuilt.
    for (const search of ["evidence=observed-live", "reason=human-judgment"]) {
      const first = parse(search);
      expect(first.rejected, `${search} was rejected on the way in`).toEqual([]);

      const rebuilt = withParams(first, {});
      const second = parse(rebuilt.slice(rebuilt.indexOf("?") + 1));
      expect(second.rejected, `${search} was rejected on the way back`).toEqual([]);
      expect(second).toEqual(first);
    }
  });

  it("reports an unrecognised filter instead of widening the list", () => {
    // `unparsed` is the only default, applied to the URL. Unchanged by this
    // unit and asserted here because FR-84's round trip must not become a
    // reason to start tolerating values nobody recognised.
    const query = parse("mode=fleet&status=not-a-status");
    expect(query.status).toBeNull();
    expect(query.rejected).toEqual([{ field: "status", value: "not-a-status" }]);
  });
});

/* ------------------------------------------------------------------ */
/* /waits                                                              */
/* ------------------------------------------------------------------ */

function externalWait(overrides: Partial<StoredWait> = {}): StoredWait {
  return {
    id: ID.wait,
    engagementId: ENGAGEMENT_ID,
    engagementSlug: "example-engagement",
    label: "Example review",
    owner: "an outside reviewer",
    ownerType: "reviewer",
    reason: null,
    startedOn: "2026-08-01",
    expectedBy: null,
    resolvedAt: null,
    resolvedBy: null,
    resolutionMethod: null,
    probeTarget: null,
    daysWaiting: 3,
    overdue: false,
    blocks: [],
    ...overrides,
  };
}

function group(waits: StoredWait[]): WaitGroup {
  return { owner: waits[0].owner ?? "unattributed", waits, overdueCount: 0 };
}

function resolveWorkItem(unit: string, id: string | null): RefResolution {
  return new Map([
    [
      refKey({ kind: "work_item", ref: unit, engagementId: ENGAGEMENT_ID }),
      id,
    ],
  ]);
}

describe("/waits — FR-80 on the external waits", () => {
  it("makes each wait navigable by its own label", () => {
    const container = draw(
      <WaitList groups={[group([externalWait()])]} resolution={new Map()} />,
    );

    const el = token(container, "Example review");
    expect(el).toHaveAttribute("data-verify-kind", "external_wait");
    expect(el).toHaveAttribute("data-verify-known", "true");
    expect(anchorFor(el)).toHaveAttribute("href", `/waits/${ID.wait}`);
  });

  it("links a blocked work item whose unit key resolved", () => {
    const container = draw(
      <WaitList
        groups={[group([externalWait({ blocks: ["u7"] })])]}
        resolution={resolveWorkItem("u7", ID.blockedItem)}
      />,
    );

    const el = token(container, "u7");
    expect(el).toHaveAttribute("data-verify-kind", "work_item");
    expect(el).toHaveAttribute("data-verify-known", "true");
    expect(anchorFor(el)).toHaveAttribute(
      "href",
      `/work-items/${ID.blockedItem}`,
    );
  });

  it("dangles a blocked work item whose unit key resolved to nothing", () => {
    // FR-83, the whole of it. `resolveRefs` returns `null` for zero matches AND
    // for two or more — a `u7` defined by a second run is ambiguous, and this
    // product refuses rather than linking to the wrong row.
    const container = draw(
      <WaitList
        groups={[group([externalWait({ blocks: ["u7"] })])]}
        resolution={resolveWorkItem("u7", null)}
      />,
    );

    const el = token(container, "u7");
    expect(el).toHaveAttribute("data-verify-known", "false");
    expect(el).toHaveAttribute("data-verify-treatment", "dangling");
    expect(anchorFor(el)).toBeNull();
  });

  it("dangles every block when nothing was resolved at all", () => {
    // The omission rule: a caller that resolved nothing must not be able to
    // produce a link by passing an empty map. `unparsed` is the only default.
    const container = draw(
      <WaitList
        groups={[group([externalWait({ blocks: ["u7", "u8"] })])]}
        resolution={new Map()}
      />,
    );

    for (const unit of ["u7", "u8"]) {
      expect(token(container, unit)).toHaveAttribute(
        "data-verify-known",
        "false",
      );
      expect(anchorFor(token(container, unit))).toBeNull();
    }
  });

  it("links the engagement as a plain anchor", () => {
    const container = draw(
      <WaitList groups={[group([externalWait()])]} resolution={new Map()} />,
    );
    expect(
      container.querySelector("[data-verify-unit='engagement-link']"),
    ).toHaveAttribute("href", "/registry/example-engagement");
  });
});

/* ------------------------------------------------------------------ */
/* /registry — FR-12's treatment preserved, FR-80 added beside it       */
/* ------------------------------------------------------------------ */

function milestone(overrides: Partial<MilestoneRecord> = {}): MilestoneRecord {
  return {
    id: ID.milestone,
    engagementId: ENGAGEMENT_ID,
    name: "Example phase",
    amount: 1,
    currency: "USD",
    dueDate: null,
    submittedAt: null,
    paidAt: null,
    notes: null,
    acceptance: ["FR-10"],
    unknownAcceptanceRefs: [],
    ...overrides,
  };
}

/** The `acceptance-ref` wrapper — M1.3's contract, which must survive. */
function acceptanceRef(container: HTMLElement, ref: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    `[data-verify-unit='acceptance-ref'][data-verify-ref="${ref}"]`,
  );
  if (el === null) throw new Error(`no acceptance-ref was rendered for "${ref}"`);
  return el;
}

describe("/registry — FR-12's contract survives FR-80's adoption", () => {
  it("keeps the acceptance-refs counts M1.3 published", () => {
    const container = draw(
      <AcceptanceRefs refs={["FR-10", "FR-99"]} unknown={["FR-99"]} />,
    );

    const panel = container.querySelector<HTMLElement>(
      "[data-verify-unit='acceptance-refs']",
    );
    expect(panel).toHaveAttribute("data-verify-total", "2");
    expect(panel).toHaveAttribute("data-verify-unknown", "1");
  });

  it("keeps per-reference known/unknown answering FR-12's question", () => {
    const container = draw(
      <AcceptanceRefs
        refs={["FR-10", "FR-99"]}
        unknown={["FR-99"]}
        resolved={new Map([["FR-10", ID.requirement]])}
      />,
    );

    expect(acceptanceRef(container, "FR-10")).toHaveAttribute(
      "data-verify-known",
      "true",
    );
    expect(acceptanceRef(container, "FR-99")).toHaveAttribute(
      "data-verify-known",
      "false",
    );
  });

  it("makes a resolved acceptance reference a link to that requirement", () => {
    const container = draw(
      <AcceptanceRefs
        refs={["FR-10"]}
        unknown={[]}
        resolved={new Map([["FR-10", ID.requirement]])}
      />,
    );

    const el = token(container, "FR-10");
    expect(el).toHaveAttribute("data-verify-kind", "requirement");
    expect(anchorFor(el)).toHaveAttribute(
      "href",
      `/requirements/${ID.requirement}`,
    );
  });

  it("leaves the unknown half not a link, and not one pixel weaker", () => {
    // The brief for this unit in one assertion. `UNKNOWN_REF_TREATMENT` is
    // shared with `<EntityRef>` by import, so the colour cannot drift; what
    // could drift is the metrics, because the component's defaults are looser
    // than this screen's. Asserted directly, since no contract attribute can
    // express a pixel.
    const container = draw(
      <AcceptanceRefs refs={["FR-99"]} unknown={["FR-99"]} />,
    );

    const el = token(container, "FR-99");
    expect(anchorFor(el)).toBeNull();
    expect(el).toHaveAttribute("data-verify-treatment", "dangling");

    const classes = el.className.split(/\s+/);
    // FR-12's treatment: the `blocked` family, outlined and dashed.
    expect(classes).toContain("border-dashed");
    expect(classes).toContain("font-semibold");
    // This screen's metrics, which `cn` must keep over the component's.
    expect(classes).toContain("px-1.5");
    expect(classes).toContain("text-[0.7rem]");
    expect(classes).toContain("leading-none");
    expect(classes).not.toContain("px-1");
    expect(classes).not.toContain("text-xs");
  });

  it("is never the unparsed fuchsia — that means one thing and this is not it", () => {
    const container = draw(
      <AcceptanceRefs refs={["FR-99"]} unknown={["FR-99"]} />,
    );
    expect(container.innerHTML).not.toContain("state-unparsed");
  });

  it("records FR-12 and resolution disagreeing rather than picking a winner", () => {
    // A reference FR-12 calls known that resolution could not place. Rare —
    // `requirement` is unique on `(engagement_id, ref)` — but the two answer
    // different questions and this product records both. The outer contract
    // keeps saying "ingested"; the token is honestly not a link.
    const container = draw(
      <AcceptanceRefs refs={["FR-10"]} unknown={[]} resolved={new Map()} />,
    );

    expect(acceptanceRef(container, "FR-10")).toHaveAttribute(
      "data-verify-known",
      "true",
    );

    const el = token(container, "FR-10");
    expect(el).toHaveAttribute("data-verify-known", "false");
    expect(anchorFor(el)).toBeNull();

    expect(
      container.querySelector("[data-verify-unit='acceptance-refs']"),
    ).toHaveAttribute("data-verify-unresolved", "1");
  });

  it("cannot produce a link from a caller that resolved nothing", () => {
    const container = draw(<AcceptanceRefs refs={["FR-10"]} unknown={[]} />);
    expect(anchorFor(token(container, "FR-10"))).toBeNull();
  });
});

describe("/registry — FR-80 on the contract milestones", () => {
  it("makes a milestone navigable by its own name", () => {
    const container = draw(
      <MilestoneTable
        milestones={[milestone()]}
        engagementId={ENGAGEMENT_ID}
        slug="example-engagement"
      />,
    );

    const el = token(container, "Example phase");
    expect(el).toHaveAttribute("data-verify-kind", "contract_milestone");
    expect(el).toHaveAttribute("data-verify-known", "true");
    expect(anchorFor(el)).toHaveAttribute("href", `/milestones/${ID.milestone}`);
  });

  it("threads the resolution through to the acceptance references", () => {
    const container = draw(
      <MilestoneTable
        milestones={[milestone({ acceptance: ["FR-10"] })]}
        engagementId={ENGAGEMENT_ID}
        slug="example-engagement"
        resolvedAcceptance={new Map([["FR-10", ID.requirement]])}
      />,
    );

    expect(anchorFor(token(container, "FR-10"))).toHaveAttribute(
      "href",
      `/requirements/${ID.requirement}`,
    );
  });

  it("publishes no amount into the milestone's state contract", () => {
    // §7a: `contract_milestone` is sensitive and operator-only. A link is not a
    // decryption surface, and adopting one must not put a number in an
    // attribute. Re-asserted here because this unit touched the row.
    const container = draw(
      <MilestoneTable
        milestones={[milestone({ amount: 4242 })]}
        engagementId={ENGAGEMENT_ID}
        slug="example-engagement"
      />,
    );

    const row = container.querySelector<HTMLElement>(
      "[data-verify-unit='milestone-row']",
    );
    if (row === null) throw new Error("no milestone-row was rendered");
    for (const name of row.getAttributeNames()) {
      expect(row.getAttribute(name)).not.toContain("4242");
    }
  });
});
