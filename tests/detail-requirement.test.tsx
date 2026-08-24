import { StrictMode } from "react";

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/api/operator";
import type { DetailRef, Prose, RequirementDetail } from "@/lib/detail-load";

/**
 * FR-82's view — `/requirements/[id]`.
 *
 * ## What these tests are for
 *
 * FR-82 is the de-siloing this whole change request exists for, and the failure
 * it can have is quiet: a section that vanishes when its relationship is empty
 * looks like a tidy page and states nothing where the product's most useful
 * finding belongs. *"A requirement nothing implements"* is usually the worse
 * finding, not the absence of one — so the emptiness of all four relationships
 * is the case asserted hardest here.
 *
 * Everything is queried through the `data-verify-*` contracts and never through
 * a class name. A suite built on class names goes red the next time anyone
 * restyles a badge, which is how a green suite starts reporting on the wrong
 * thing.
 *
 * ## Why `<StrictMode>`
 *
 * `next.config.ts` sets `reactStrictMode: true`, so the app double-invokes
 * render. A bare `render(<X />)` cannot reproduce that, and the repo has already
 * paid for the difference once. Nothing in this view fetches in an effect, which
 * is exactly the claim mounting under `<StrictMode>` makes checkable rather than
 * assumed.
 */

const notFoundSignal = "NEXT_NOT_FOUND";

const mocks = vi.hoisted(() => ({
  readRequirementDetail: vi.fn(),
  operatorContext: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    mocks.notFound();
    throw new Error(notFoundSignal);
  },
}));

// `getOperatorContext` is mocked and `loadForOperator` is NOT: the wrapper is
// the thing under test on the failure path, and replacing it would assert
// against a stand-in for the code that keeps "could not read" apart from
// "there is nothing here".
vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: () => mocks.operatorContext(),
}));

vi.mock("@/lib/detail-load", async () => {
  const types = await vi.importActual<typeof import("@/lib/server/detail/types")>(
    "@/lib/server/detail/types",
  );
  return {
    fallbackLabel: types.fallbackLabel,
    readRequirementDetail: (id: string) => mocks.readRequirementDetail(id),
  };
});

const { RequirementView } = await import(
  "@/app/requirements/_components/requirement-view"
);
const RequirementPage = (await import("@/app/requirements/[id]/page")).default;

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

function ref(overrides: Partial<DetailRef> = {}): DetailRef {
  return {
    kind: "work_item",
    label: "u4",
    id: "11111111-2222-3333-4444-555555555555",
    ...overrides,
  };
}

/** A requirement with every relationship empty — FR-82's hardest case. */
function requirement(
  overrides: Partial<RequirementDetail> = {},
): RequirementDetail {
  return {
    kind: "requirement",
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    engagement: { id: "eng-1", slug: "acme-rebuild", clientName: "Acme" },
    ref: "FR-42",
    section: "§4.2",
    text: prose("present", "The ledger reports what is blocked."),
    coverage: "uncovered",
    shippedEnvironments: [],
    workItems: [],
    tests: [],
    defects: [],
    releases: [],
    milestones: [],
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

function mount(detail: RequirementDetail) {
  render(
    <StrictMode>
      <RequirementView detail={detail} asOf={"2026-08-24"} />
    </StrictMode>,
  );
}

beforeEach(() => {
  mocks.readRequirementDetail.mockReset();
  mocks.notFound.mockReset();
  mocks.operatorContext.mockReset();
  mocks.operatorContext.mockResolvedValue(OPERATOR);
});

afterEach(cleanup);

/** The four names the e2e gate asserts, verbatim. */
const FR82_SECTIONS = [
  "requirement-work-items",
  "requirement-tests",
  "requirement-defects",
  "requirement-releases",
] as const;

describe("FR-82 — the four relationships are shown together", () => {
  it("renders all four sections when every relationship is empty", () => {
    mount(requirement());

    for (const section of FR82_SECTIONS) {
      expect(
        maybeUnit(section),
        `FR-82: a requirement detail view with no ${section} section`,
      ).not.toBeNull();
    }
  });

  it("states what each empty relationship means rather than rendering blank", () => {
    mount(requirement());

    // An absent section and an empty one are different claims, and an empty one
    // is frequently the worse finding. Each says so in words.
    for (const section of FR82_SECTIONS) {
      expect(byUnit(section).textContent?.trim().length ?? 0).toBeGreaterThan(40);
    }
    expect(byUnit("requirement-work-items").textContent).toContain(
      "No work item claims to implement this requirement",
    );
  });

  it("publishes a count for every relationship, including zero", () => {
    mount(requirement());

    const counts = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-verify-unit='relation-count']",
      ),
    ];
    const byRelation = Object.fromEntries(
      counts.map((el) => [
        el.getAttribute("data-verify-relation"),
        el.getAttribute("data-verify-count"),
      ]),
    );

    expect(byRelation).toEqual({
      "work-items": "0",
      tests: "0",
      defects: "0",
      releases: "0",
      acceptance: "0",
    });
  });

  it("renders every relationship's rows when they are populated", () => {
    mount(
      requirement({
        workItems: [
          {
            ref: ref(),
            unit: "u4",
            status: "done",
            planned: false,
            updatedAt: "2026-08-20T09:00:00Z",
            executor: "ui-designer",
            executorKind: "agent",
          },
        ],
        tests: [
          {
            id: "t1",
            file: "tests/blocked.test.ts",
            title: "blocked reports every blocker",
            harness: "vitest",
            covers: ["FR-42"],
            authoredBy: "qa-reviewer",
            certifiedBy: "qa-reviewer",
            latest: {
              status: "pass",
              evidenceScope: "observed-live",
              certifiedBy: "qa-reviewer",
              runAt: "2026-08-19T10:00:00.000Z",
            },
            selfCertified: false,
          },
        ],
        defects: [
          {
            ref: ref({ kind: "defect", label: "D-7", id: "def-1" }),
            title: "Blocked renders no blocker for a hand work item",
            severity: "critical",
            status: "open",
          },
        ],
        releases: [
          {
            ref: ref({ kind: "release", label: "dpl_1", id: "rel-1" }),
            identifier: "dpl_1",
            environment: "production",
            deployedAt: "2026-08-18T09:00:00.000Z",
          },
        ],
      }),
    );

    expect(byUnit("requirement-work-item-row").getAttribute("data-verify-status")).toBe(
      "done",
    );
    expect(byUnit("requirement-test-row").getAttribute("data-verify-ran")).toBe("true");
    expect(byUnit("requirement-defect-row").getAttribute("data-verify-severity")).toBe(
      "critical",
    );
    expect(
      byUnit("requirement-release-row").getAttribute("data-verify-environment"),
    ).toBe("production");
  });
});

describe("FR-82 — nothing new is derived", () => {
  it("renders the coverage the loader supplied and never recomputes it", () => {
    // `unproven` with a passing test present is exactly the state a second
    // implementation would collapse into `covered`. The view must show what
    // `indexCoverage` decided, not what the rows look like.
    mount(
      requirement({
        coverage: "unproven",
        tests: [
          {
            id: "t1",
            file: "tests/a.test.ts",
            title: "a",
            harness: "vitest",
            covers: ["FR-42"],
            authoredBy: null,
            certifiedBy: null,
            latest: {
              status: "pass",
              evidenceScope: "not-verified",
              certifiedBy: null,
              runAt: null,
            },
            selfCertified: false,
          },
        ],
      }),
    );

    expect(byUnit("requirement-state").getAttribute("data-verify-coverage")).toBe(
      "unproven",
    );
    expect(byUnit("coverage").getAttribute("data-verify-coverage")).toBe("unproven");
  });

  it("keeps shipped as a set of environments and never as a boolean claim", () => {
    mount(requirement({ shippedEnvironments: ["preview", "production"] }));

    const state = byUnit("requirement-state");
    expect(state.getAttribute("data-verify-shipped-count")).toBe("2");
    expect(byUnit("shipped").getAttribute("data-verify-environments")).toBe("2");
    expect(byUnit("shipped").textContent).toContain("production");
  });

  it("reports FR-47 self-certification as a finding beside the test, not as coverage", () => {
    mount(
      requirement({
        coverage: "covered",
        tests: [
          {
            id: "t1",
            file: "tests/a.test.ts",
            title: "a",
            harness: "vitest",
            covers: ["FR-42"],
            authoredBy: "ui-designer",
            certifiedBy: "ui-designer",
            latest: {
              status: "pass",
              evidenceScope: "asserted",
              certifiedBy: "ui-designer",
              runAt: null,
            },
            selfCertified: true,
          },
        ],
      }),
    );

    expect(
      byUnit("requirement-test-row").getAttribute("data-verify-self-certified"),
    ).toBe("true");
    expect(byUnit("requirement-tests").textContent).toContain("self-certified");
    // FR-47 is a finding about the evidence, and it did not move the coverage
    // state the loader supplied.
    expect(byUnit("requirement-state").getAttribute("data-verify-coverage")).toBe(
      "covered",
    );
  });

  it("renders a test that never ran as never-ran, not as a failure", () => {
    mount(
      requirement({
        tests: [
          {
            id: "t1",
            file: "tests/a.test.ts",
            title: "a",
            harness: "vitest",
            covers: ["FR-42"],
            authoredBy: null,
            certifiedBy: null,
            latest: null,
            selfCertified: false,
          },
        ],
      }),
    );

    const row = byUnit("requirement-test-row");
    expect(row.getAttribute("data-verify-ran")).toBe("false");
    expect(row.textContent).toContain("never ran");
    expect(row.textContent).not.toContain("fail");
  });
});

describe("FR-83 — a reference to nothing is never a link", () => {
  it("renders a dangling reference as dangling and outside any anchor", () => {
    mount(
      requirement({
        defects: [
          {
            ref: { kind: "defect", label: "D-9", id: null },
            title: "a defect naming a requirement nothing has ingested",
            severity: "minor",
            status: "open",
          },
        ],
      }),
    );

    const token = byUnit("entity-ref");
    expect(token.getAttribute("data-verify-known")).toBe("false");
    expect(token.getAttribute("data-verify-treatment")).toBe("dangling");
    expect(token.closest("a")).toBeNull();
  });

  it("renders a resolved reference inside an anchor pointing at its uuid", () => {
    mount(
      requirement({
        workItems: [
          {
            ref: ref(),
            unit: "u4",
            status: "done",
            planned: false,
            updatedAt: "2026-08-20T09:00:00Z",
            executor: null,
            executorKind: "agent",
          },
        ],
      }),
    );

    const token = byUnit("entity-ref");
    expect(token.getAttribute("data-verify-known")).toBe("true");
    expect(token.closest("a")?.getAttribute("href")).toBe(
      "/work-items/11111111-2222-3333-4444-555555555555",
    );
  });

  it("links the engagement with a plain anchor rather than an entity reference", () => {
    // Ruling 3: the engagement slug does not become a ninth entity kind.
    mount(requirement());

    const link = byUnit("requirement-engagement-link");
    expect(link.getAttribute("href")).toBe("/registry/acme-rebuild");
    expect(link.getAttribute("data-verify-kind")).toBeNull();
  });
});

describe("§7a — the requirement's own text has four states", () => {
  it("renders unreadable differently from absent, and says something was lost", () => {
    mount(requirement({ text: prose("unreadable") }));
    const unreadable = byUnit("detail-prose");
    const unreadableState = unreadable.getAttribute("data-verify-state");
    const unreadableText = unreadable.textContent;

    cleanup();

    mount(requirement({ text: prose("absent") }));
    const absent = byUnit("detail-prose");

    expect(unreadableState).toBe("unreadable");
    expect(absent.getAttribute("data-verify-state")).toBe("absent");
    expect(unreadableText).not.toBe(absent.textContent);
    // Rendering ciphertext-that-did-not-decrypt as blank would state "there is
    // nothing here" about a spec paragraph that was lost.
    expect(unreadableText).toContain("unreadable");
    // B33: "not recorded" was this copy's own wording and it lost the
    // consolidation — four of the five copies already rendered absent as `—`
    // via the shared `Absent` primitive, which is the idiom this product uses
    // everywhere else a value is genuinely absent, so that is what the merged
    // `ProseValue` renders now.
    expect(absent.textContent).toBe("—");
  });

  it("renders not-requested distinctly from both of them", () => {
    mount(requirement({ text: prose("not-requested") }));
    expect(byUnit("detail-prose").getAttribute("data-verify-state")).toBe(
      "not-requested",
    );
    expect(byUnit("detail-prose").textContent).toContain("not read");
  });

  it("renders the decrypted text when it is present", () => {
    mount(requirement());
    expect(byUnit("detail-prose").getAttribute("data-verify-state")).toBe("present");
    expect(byUnit("detail-prose").textContent).toContain(
      "The ledger reports what is blocked.",
    );
  });

  it("records the contradiction when the loader reports present and returns nothing", () => {
    mount(requirement({ text: prose("present", null) }));
    expect(byUnit("detail-prose").getAttribute("data-verify-state")).toBe(
      "contradiction",
    );
  });

  it("publishes no decrypted text into any data-verify attribute", () => {
    const secret = "CLIENT PROSE THAT MUST NOT REACH AN ATTRIBUTE";
    mount(requirement({ text: prose("present", secret) }));

    for (const el of document.querySelectorAll("*")) {
      for (const attr of el.attributes) {
        if (attr.name.startsWith("data-verify-")) {
          expect(attr.value).not.toContain(secret);
        }
      }
    }
  });
});

describe("FR-81 — the milestone section is not a fifth FR-82 relationship", () => {
  it("is named distinctly and says so to a reader", () => {
    mount(requirement());

    expect(maybeUnit("requirement-milestones")).toBeNull();
    const acceptance = byUnit("requirement-acceptance");
    expect(acceptance.textContent).toContain("not one of FR-82");
  });

  it("renders milestone names and reaches for no amount", () => {
    mount(
      requirement({
        milestones: [
          { kind: "contract_milestone", label: "Phase 1", id: "ms-1" },
        ],
      }),
    );

    const acceptance = byUnit("requirement-acceptance");
    expect(acceptance.textContent).toContain("Phase 1");
    expect(acceptance.textContent).not.toMatch(/\$|USD|EUR/);
  });
});

describe("the page — a 404 and a refusal are different claims", () => {
  it("calls notFound() when no row carries the id", async () => {
    mocks.readRequirementDetail.mockResolvedValue(null);

    await expect(
      RequirementPage({ params: Promise.resolve({ id: "nope" }) }),
    ).rejects.toThrow(notFoundSignal);
    expect(mocks.notFound).toHaveBeenCalledTimes(1);
  });

  it("renders the failure notice, and NOT an empty state, when the read throws", async () => {
    mocks.readRequirementDetail.mockRejectedValue(new Error("connection refused"));

    const element = await RequirementPage({
      params: Promise.resolve({ id: "FR-42" }),
    });
    render(<StrictMode>{element}</StrictMode>);

    const notice = byUnit("load-notice");
    expect(notice.getAttribute("data-verify-reason")).toBe("error");
    expect(maybeUnit("empty-state")).toBeNull();
    // The four sections must not render either: a page that shows "nothing
    // implements this" after a failed read has reported a finding it never read.
    for (const section of FR82_SECTIONS) {
      expect(maybeUnit(section)).toBeNull();
    }
    expect(mocks.notFound).not.toHaveBeenCalled();
  });

  it("does not leak the database's own words into the notice", async () => {
    mocks.readRequirementDetail.mockRejectedValue(
      new Error('relation "requirement" does not exist'),
    );

    const element = await RequirementPage({
      params: Promise.resolve({ id: "FR-42" }),
    });
    render(<StrictMode>{element}</StrictMode>);

    expect(byUnit("load-notice").textContent).not.toContain("relation");
  });

  it("asks for a sign-in rather than reporting an empty requirement", async () => {
    mocks.operatorContext.mockResolvedValue({ ...OPERATOR, userId: null });

    const element = await RequirementPage({
      params: Promise.resolve({ id: "FR-42" }),
    });
    render(<StrictMode>{element}</StrictMode>);

    expect(byUnit("load-notice").getAttribute("data-verify-reason")).toBe("sign-in");
    expect(mocks.readRequirementDetail).not.toHaveBeenCalled();
  });

  it("renders the view, with exactly one entity-detail shell, on a good read", async () => {
    mocks.readRequirementDetail.mockResolvedValue(requirement());

    const element = await RequirementPage({
      params: Promise.resolve({ id: "FR-42" }),
    });
    render(<StrictMode>{element}</StrictMode>);

    const shells = document.querySelectorAll("[data-verify-unit='entity-detail']");
    expect(shells).toHaveLength(1);
    expect(shells[0]?.getAttribute("data-verify-kind")).toBe("requirement");
    // FR-85: no second unparsed count is added by this view.
    expect(
      document.querySelectorAll("[data-verify-unit='unparsed-count']"),
    ).toHaveLength(0);
  });
});
