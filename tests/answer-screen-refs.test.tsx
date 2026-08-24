import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BlockedGroup, blockedGroupRefEntries } from "@/app/blocked/_components/blocked-group";
import { BottleneckTable } from "@/app/bottleneck/_components/bottleneck-table";
import {
  EngagementBroken,
  engagementBrokenRefEntries,
} from "@/app/broken/_components/engagement-broken";
import {
  CommittedTable,
  committedTableRefEntries,
} from "@/app/committed/_components/committed-table";
import { NextTable, nextTableRefEntries } from "@/app/next/_components/next-table";
import {
  EngagementCoverage,
  engagementCoverageRefEntries,
} from "@/app/untested/_components/engagement-coverage";
import type { RefLookup } from "@/lib/answer-screen-refs";
import {
  buildRefLookup,
  collectRefQueries,
  engagementIdsBySlug,
} from "@/lib/answer-screen-refs";
import { refKey } from "@/lib/server/detail/refs";
import type { EngagementCoverage as Coverage } from "@/lib/server/answers/untested";

import { BLOCKED, BOTTLENECK, BROKEN, COMMITTED, COVERAGE, NEXT } from "./answer-samples";

/**
 * CR-003 FR-80, FR-83 and FR-55 on the six answer screens.
 *
 * ## What this file is asserting that the existing screen tests are not
 *
 * `answer-screens.test.tsx` renders every one of these components against a
 * lookup that resolves everything, because what it is checking is FR-30's
 * dispositions, FR-49's three coverage states, FR-75's two columns and the rest
 * — distinctions that have nothing to do with navigation. This file checks the
 * navigation contract itself, and the half of it that matters most is the half
 * that is **not** a link:
 *
 * > **FR-83** A reference that resolves to nothing renders in FR-12's
 * > dangling-reference treatment and **is never a link**.
 *
 * So every screen is rendered twice — once against a lookup that resolves and
 * once against one that resolves nothing — and the dangling assertions check
 * `closest("a") === null`, which is the same expression
 * `e2e/m27-navigation.spec.ts` evaluates in a real browser.
 *
 * ## Why `NOTHING_RESOLVES` does not make every screen dangle
 *
 * Most references on these screens are **not** text at all. `BlockedItem.id`,
 * `NextItem.id`, `BottleneckItem.id`, `BrokenDefect.id`, `workItem.id`,
 * `nearestMilestone.id` and `UncoveredRequirement.implementedBy[].id` are
 * already the database uuids the answer payloads carry, so those refs are
 * navigable with no resolution and stay navigable under a lookup that resolves
 * nothing. That is the property the assertions below pin down, because it is
 * what makes FR-55's hyperlink free and what makes a resolution failure
 * degrade one column rather than the screen.
 *
 * ## `data-verify-known` is never absent
 *
 * The e2e gate rejects a third value and rejects no value. Every assertion here
 * reads it explicitly rather than checking for the presence of an anchor alone,
 * because an anchor with no contract is exactly the state a screen that never
 * checked would produce.
 */

afterEach(cleanup);

const all = (c: HTMLElement, s: string) => [...c.querySelectorAll(s)];
const q = (c: HTMLElement, s: string) => c.querySelector(s);

const REF = "[data-verify-unit='entity-ref']";

/** Resolves every text reference. The happy half of FR-83. */
const RESOLVES: RefLookup = (kind, engagement, ref) =>
  `resolved-${kind}-${engagement}-${ref}`;

/** Resolves nothing — FR-83's case, and i1's answer to an ambiguous match. */
const NOTHING_RESOLVES: RefLookup = () => null;

function refsIn(container: HTMLElement) {
  return all(container, REF).map((el) => ({
    kind: el.getAttribute("data-verify-kind"),
    ref: el.getAttribute("data-verify-ref"),
    known: el.getAttribute("data-verify-known"),
    treatment: el.getAttribute("data-verify-treatment"),
    linked: el.closest("a") !== null,
    href: el.closest("a")?.getAttribute("href") ?? null,
  }));
}

/* ------------------------------------------------------ the seam itself */

describe("the slug → engagement-id bridge (FR-80)", () => {
  const idBySlug = engagementIdsBySlug([
    { slug: "northwind", id: "eng-1" },
    { slug: "acme", id: "eng-2" },
  ]);

  it("deduplicates, so a ref rendered on forty rows costs one query", () => {
    const queries = collectRefQueries(idBySlug, [
      { kind: "requirement", engagement: "northwind", ref: "FR-31" },
      { kind: "requirement", engagement: "northwind", ref: "FR-31" },
      { kind: "requirement", engagement: "acme", ref: "FR-31" },
    ]);
    expect(queries).toHaveLength(2);
  });

  it("drops a reference scoped to an engagement it cannot place, rather than asking with an empty id", () => {
    const queries = collectRefQueries(idBySlug, [
      { kind: "requirement", engagement: "not-a-slug", ref: "FR-1" },
    ]);
    expect(queries).toEqual([]);
  });

  it("drops a blank reference rather than asking the resolver to match nothing", () => {
    const queries = collectRefQueries(idBySlug, [
      { kind: "requirement", engagement: "northwind", ref: "   " },
    ]);
    expect(queries).toEqual([]);
  });

  it("returns the id the resolution carries, keyed the way refKey builds it", () => {
    const query = {
      kind: "requirement" as const,
      ref: "FR-31",
      engagementId: "eng-1",
    };
    const lookup = buildRefLookup(
      idBySlug,
      new Map([[refKey(query), "req-uuid-1"]]),
    );
    expect(lookup("requirement", "northwind", "FR-31")).toBe("req-uuid-1");
  });

  it("returns null — not undefined, not a throw — for a reference nobody asked about", () => {
    // i1's rule: a key absent from the map was never asked, and collapsing that
    // to `null` is the safe direction. An unasked reference dangles rather than
    // linking somewhere nobody checked.
    const lookup = buildRefLookup(idBySlug, new Map());
    expect(lookup("requirement", "northwind", "FR-99")).toBeNull();
    expect(lookup("requirement", "no-such-engagement", "FR-1")).toBeNull();
  });
});

/* --------------------------------------------- FR-83, on every screen */

describe("FR-83 — a reference that resolves to nothing is never a link", () => {
  it("Untested: a resolved requirement is inside an anchor and says so", () => {
    const { container } = render(
      <EngagementCoverage coverage={COVERAGE} refs={RESOLVES} />,
    );
    const requirement = refsIn(container).find(
      (one) => one.kind === "requirement" && one.ref === "FR-31",
    );
    expect(requirement).toBeDefined();
    expect(requirement?.known).toBe("true");
    expect(requirement?.linked).toBe(true);
    expect(requirement?.href).toBe(
      "/requirements/resolved-requirement-northwind-FR-31",
    );
  });

  it("Untested: an unresolved requirement carries FR-12's treatment and no anchor", () => {
    const { container } = render(
      <EngagementCoverage coverage={COVERAGE} refs={NOTHING_RESOLVES} />,
    );
    const requirement = refsIn(container).find(
      (one) => one.kind === "requirement" && one.ref === "FR-31",
    );
    expect(requirement?.known).toBe("false");
    expect(requirement?.treatment).toBe("dangling");
    expect(requirement?.linked).toBe(false);
  });

  it("Broken: an unresolved requirement ref dangles while the defect beside it stays navigable", () => {
    // The point of the pairing: a resolution that comes back empty degrades one
    // column. `defect.id` is a row id the payload already carries.
    const { container } = render(
      <EngagementBroken broken={BROKEN} refs={NOTHING_RESOLVES} />,
    );
    const rendered = refsIn(container);

    const requirement = rendered.find((one) => one.ref === "FR-20");
    expect(requirement?.kind).toBe("requirement");
    expect(requirement?.known).toBe("false");
    expect(requirement?.linked).toBe(false);

    const defect = rendered.find((one) => one.ref === "D-1");
    expect(defect?.kind).toBe("defect");
    expect(defect?.known).toBe("true");
    expect(defect?.linked).toBe(true);
    expect(defect?.href).toBe("/defects/d-1");
  });

  it("Committed: an acceptance requirement naming nothing is not a link", () => {
    const { container } = render(
      <CommittedTable milestones={COMMITTED} refs={NOTHING_RESOLVES} />,
    );
    const dangling = refsIn(container).filter(
      (one) => one.kind === "requirement",
    );
    expect(dangling.length).toBeGreaterThan(0);
    for (const one of dangling) {
      expect(one.known).toBe("false");
      expect(one.treatment).toBe("dangling");
      expect(one.linked).toBe(false);
    }
  });

  it("no screen passes an FR-nn through as if it were a row id", () => {
    // i1's rule 1, the one that bites hardest: "`id` is the database uuid,
    // never the human ref. Passing `FR-42` builds `/requirements/FR-42`, a
    // broken link — exactly what FR-83 exists to prevent." A screen that
    // shortcuts the lookup produces a link that is indistinguishable from a
    // correct one until it is followed, so the check is that EVERY requirement
    // dangles when the lookup resolves nothing.
    const screens: HTMLElement[] = [
      render(<NextTable answer={NEXT} refs={NOTHING_RESOLVES} />).container,
      render(<CommittedTable milestones={COMMITTED} refs={NOTHING_RESOLVES} />)
        .container,
      render(<EngagementCoverage coverage={COVERAGE} refs={NOTHING_RESOLVES} />)
        .container,
      render(<EngagementBroken broken={BROKEN} refs={NOTHING_RESOLVES} />)
        .container,
    ];

    let seen = 0;
    for (const container of screens) {
      for (const one of refsIn(container)) {
        if (one.kind !== "requirement") continue;
        seen += 1;
        expect(one.known).toBe("false");
        expect(one.href).toBeNull();
      }
    }
    // The control: a run that saw no requirement at all would pass vacuously.
    expect(seen).toBeGreaterThan(4);
  });

  it("every reference on every screen states data-verify-known, with no third value", () => {
    const screens: HTMLElement[] = [
      render(<BlockedGroup group={BLOCKED.groups[0]} refs={NOTHING_RESOLVES} />)
        .container,
      render(<NextTable answer={NEXT} refs={NOTHING_RESOLVES} />).container,
      render(<CommittedTable milestones={COMMITTED} refs={NOTHING_RESOLVES} />)
        .container,
      render(<EngagementCoverage coverage={COVERAGE} refs={NOTHING_RESOLVES} />)
        .container,
      render(<BottleneckTable answer={BOTTLENECK} />).container,
      render(<EngagementBroken broken={BROKEN} refs={NOTHING_RESOLVES} />)
        .container,
    ];

    for (const container of screens) {
      const rendered = refsIn(container);
      expect(rendered.length).toBeGreaterThan(0);
      for (const one of rendered) {
        expect(["true", "false"]).toContain(one.known);
        // FR-83's two halves, as one biconditional: a link exactly when known.
        expect(one.linked).toBe(one.known === "true");
        if (one.known === "false") expect(one.treatment).toBe("dangling");
      }
    }
  });
});

/* ------------------------------------------------ the e2e gate's count */

describe("FR-80 — every answer screen renders at least one entity reference", () => {
  // `e2e/m27-navigation.spec.ts` fails a populated screen that renders none,
  // because a screen that never adopted the contract reads identical to one
  // that is perfectly navigable. This is the same assertion at component level,
  // where it can run without a signed-in operator session.
  it("Blocked", () => {
    const { container } = render(
      <BlockedGroup group={BLOCKED.groups[0]} refs={RESOLVES} />,
    );
    const rendered = refsIn(container);
    const kinds = new Set(rendered.map((one) => one.kind));
    expect(kinds).toContain("work_item");
    expect(kinds).toContain("external_wait");

    // The href, not merely the presence of one: a link built from the wrong
    // field is still an anchor, and `data-verify-known` cannot tell them apart.
    expect(rendered.find((one) => one.ref === "u7")?.href).toBe(
      "/work-items/wi-1",
    );
    expect(rendered.find((one) => one.ref === "App Store review")?.href).toBe(
      "/waits/w-1",
    );
  });

  it("Next", () => {
    const { container } = render(<NextTable answer={NEXT} refs={RESOLVES} />);
    const kinds = new Set(refsIn(container).map((one) => one.kind));
    expect(kinds).toContain("work_item");
    expect(kinds).toContain("requirement");
    expect(kinds).toContain("contract_milestone");
  });

  it("Committed", () => {
    const { container } = render(
      <CommittedTable milestones={COMMITTED} refs={RESOLVES} />,
    );
    const kinds = new Set(refsIn(container).map((one) => one.kind));
    expect(kinds).toContain("contract_milestone");
    expect(kinds).toContain("requirement");
  });

  it("Untested", () => {
    const { container } = render(
      <EngagementCoverage coverage={COVERAGE} refs={RESOLVES} />,
    );
    const kinds = new Set(refsIn(container).map((one) => one.kind));
    expect(kinds).toContain("requirement");
    expect(kinds).toContain("work_item");
  });

  it("Bottleneck, which resolves nothing and still carries references", () => {
    const { container } = render(<BottleneckTable answer={BOTTLENECK} />);
    const kinds = new Set(refsIn(container).map((one) => one.kind));
    expect(kinds).toContain("work_item");
    expect(kinds).toContain("contract_milestone");
  });

  it("Broken", () => {
    const { container } = render(
      <EngagementBroken broken={BROKEN} refs={RESOLVES} />,
    );
    const kinds = new Set(refsIn(container).map((one) => one.kind));
    expect(kinds).toContain("defect");
    expect(kinds).toContain("requirement");
    expect(kinds).toContain("work_item");
  });

  it("names only kinds that resolve to a route", () => {
    const { container } = render(
      <EngagementBroken broken={BROKEN} refs={RESOLVES} />,
    );
    for (const one of refsIn(container)) {
      if (one.known !== "true") continue;
      expect(one.href).toMatch(/^\/[a-z-]+\/[^/]+$/);
    }
  });
});

/* --------------------------------------------------------------- FR-55 */

describe("FR-55 — an uncovered requirement links to what implements it", () => {
  it("puts a navigable work item inside the uncovered-requirement wrapper", () => {
    const { container } = render(
      <EngagementCoverage coverage={COVERAGE} refs={RESOLVES} />,
    );
    const row = q(container, "[data-verify-unit='uncovered-requirement']");
    expect(row).not.toBeNull();

    const implementer = row?.querySelector(
      `${REF}[data-verify-kind='work_item']`,
    );
    expect(implementer).not.toBeNull();
    expect(implementer).toHaveAttribute("data-verify-known", "true");
    expect(implementer?.closest("a")?.getAttribute("href")).toBe(
      "/work-items/wi-20",
    );
  });

  it("links the implementer even when resolution returns nothing at all", () => {
    // CR-003 Q11 ruled "links" a hyperlink, and `implementedBy[].id` is the row
    // id — so FR-55's link cannot be lost to a failed lookup.
    const { container } = render(
      <EngagementCoverage coverage={COVERAGE} refs={NOTHING_RESOLVES} />,
    );
    const implementer = q(
      container,
      `[data-verify-unit='uncovered-requirement'] ${REF}[data-verify-kind='work_item']`,
    );
    expect(implementer).toHaveAttribute("data-verify-known", "true");
    expect(implementer?.closest("a")).not.toBeNull();
  });

  it("keeps the wrapper and the finding for a requirement nothing implements", () => {
    // "An uncovered requirement with nothing behind it is a different and
    // usually worse finding — nobody has built it." It must not lose its row to
    // the arrival of the link.
    const { container } = render(
      <EngagementCoverage coverage={COVERAGE} refs={RESOLVES} />,
    );
    const rows = all(container, "[data-verify-unit='uncovered-requirement']");
    const unimplemented = rows.find(
      (row) => row.getAttribute("data-verify-ref") === "FR-32",
    );
    expect(unimplemented).toBeDefined();
    expect(unimplemented?.getAttribute("data-verify-implementers")).toBe("0");
    expect(
      unimplemented?.querySelector("[data-verify-unit='unimplemented-requirement']")
        ?.textContent,
    ).toContain("no work item claims to implement this");
    expect(
      unimplemented?.querySelector(`${REF}[data-verify-kind='work_item']`),
    ).toBeNull();
  });

  it("labels an implementing work item that has no unit key, rather than dropping its link", () => {
    // A `hand` or `external` work item has no `unit`. It is still the thing
    // that implements the requirement, so it gets `fallbackLabel` and a link.
    const coverage: Coverage = {
      ...COVERAGE,
      uncoveredDetail: [
        {
          ref: "FR-31",
          implementedBy: [
            {
              id: "3f2a1b8c-0000-4000-8000-000000000000",
              unit: null,
              status: "done",
              executor: "erik",
              executorKind: "erik",
            },
          ],
        },
      ],
    };
    const { container } = render(
      <EngagementCoverage coverage={coverage} refs={RESOLVES} />,
    );
    const implementer = q(
      container,
      `[data-verify-unit='uncovered-requirement'] ${REF}[data-verify-kind='work_item']`,
    );
    expect(implementer?.getAttribute("data-verify-ref")).toBe("work item 3f2a1b8c");
    expect(implementer).toHaveAttribute("data-verify-known", "true");
  });
});

/* ------------------------------------------- the unit-less work item */

describe("a work item that carries no unit key (ruling 2 — one fallback, not five)", () => {
  // `hand` and `external` work items have no `unit`, and until now both places
  // Broken renders one printed the raw uuid: `item.unit ?? item.id`. That is a
  // 36-character token in a mono chip beside prose. `fallbackLabel` is the one
  // label the fleet agreed on for a row with no human reference, and the link
  // is unaffected either way.
  const brokenWithHandWork = {
    ...BROKEN,
    bySeverity: BROKEN.bySeverity.map((group) =>
      group.severity !== "critical"
        ? group
        : {
            ...group,
            defects: group.defects.map((defect) => ({
              ...defect,
              workItem: {
                id: "9c4d5e6f-0000-4000-8000-000000000000",
                unit: null,
                executor: "erik",
              },
            })),
          },
    ),
    requirementRegressions: [
      {
        ref: "FR-47",
        failingTests: [],
        implementedBy: [
          {
            id: "7a8b9c0d-0000-4000-8000-000000000000",
            unit: null,
            executor: null,
          },
        ],
      },
    ],
  };

  it("labels the fixing work item with fallbackLabel and keeps it navigable", () => {
    const { container } = render(
      <EngagementBroken broken={brokenWithHandWork} refs={RESOLVES} />,
    );
    const labels = refsIn(container)
      .filter((one) => one.kind === "work_item")
      .map((one) => one.ref);

    expect(labels).toContain("work item 9c4d5e6f");
    expect(labels).toContain("work item 7a8b9c0d");
    // The raw uuid is never the label. It is still the href.
    expect(labels).not.toContain("9c4d5e6f-0000-4000-8000-000000000000");

    const fixing = all(container, `${REF}[data-verify-kind='work_item']`).find(
      (el) => el.getAttribute("data-verify-ref") === "work item 9c4d5e6f",
    );
    expect(fixing?.closest("a")?.getAttribute("href")).toBe(
      "/work-items/9c4d5e6f-0000-4000-8000-000000000000",
    );
  });
});

/* --------------------------------- what each screen asks to be resolved */

describe("the batch each screen collects", () => {
  it("Blocked asks only about the work items a wait blocks", () => {
    const entries = BLOCKED.groups.flatMap(blockedGroupRefEntries);
    expect(entries).toEqual([
      { kind: "work_item", engagement: "northwind", ref: "u9" },
      { kind: "work_item", engagement: "northwind", ref: "u10" },
    ]);
  });

  it("Next asks only about the requirements its items implement", () => {
    const kinds = new Set(nextTableRefEntries(NEXT).map((one) => one.kind));
    expect([...kinds]).toEqual(["requirement"]);
  });

  it("Committed asks about every acceptance requirement, scoped by engagement", () => {
    const entries = committedTableRefEntries(COMMITTED);
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.kind).toBe("requirement");
      expect(entry.engagement).not.toBe("");
    }
  });

  it("Untested asks about uncovered, unproven and self-certified refs alike", () => {
    const refs = engagementCoverageRefEntries(COVERAGE).map((one) => one.ref);
    expect(refs).toContain("FR-31");
    expect(refs).toContain("FR-32");
    expect(refs).toContain("FR-33");
    expect(refs).toContain("FR-47");
  });

  it("Broken asks about a defect's requirement, a regression's ref and a test's covers", () => {
    const refs = engagementBrokenRefEntries(BROKEN).map((one) => one.ref);
    expect(refs).toContain("FR-20");
    expect(refs).toContain("FR-51");
    expect(refs).toContain("FR-47");
    // A defect naming no requirement contributes nothing rather than a blank.
    expect(refs).not.toContain("");
  });
});

/* -------------------------------------------- FR-80's engagement slug */

describe("FR-80 — the engagement slug, which is not one of FR-81's eight kinds", () => {
  it("is an ordinary anchor to the detail view that already exists", () => {
    const { container } = render(
      <EngagementCoverage coverage={COVERAGE} refs={RESOLVES} />,
    );
    const link = q(container, "[data-verify-unit='engagement-link']");
    expect(link?.getAttribute("href")).toBe("/registry/northwind");
    // Never an `<EntityRef>`: `ENTITY_KINDS` is asserted to be exactly eight and
    // `entityHref("engagement", …)` returns null by construction.
    expect(link?.getAttribute("data-verify-kind")).toBeNull();
  });
});
