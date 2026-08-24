import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/api/operator";
import type { WorkItemDetail } from "@/lib/detail-load";

/**
 * FR-81 / FR-83 / FR-85 — the `work_item` detail view (M2.7, f1).
 *
 * ## What is faked and what is exercised
 *
 * i1's loaders are faked, because this unit built no read and there is no
 * database credential in this harness. **`loadForOperator` is NOT faked**: it is
 * the module that decides whether a failure renders as a failure or as an empty
 * screen, which is the distinction two of the tests below exist to hold, so
 * running the real one is the point. Only the operator *context* it consults is
 * stubbed, at `@/lib/api/operator`.
 *
 * `@/lib/detail-load` is mocked by naming `fallbackLabel` from the pure module
 * it is re-exported from rather than by reimplementing it here. A fallback
 * spelled twice is a fallback that can drift, and i1's report says outright:
 * do not invent a second.
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
    // carry on and render a detail view over a row that does not exist.
    throw new Error("NEXT_NOT_FOUND");
  }),
  readWorkItemDetail: vi.fn(),
  getOperatorContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: stub.notFound }));

vi.mock("@/lib/detail-load", async () => {
  const types = await import("@/lib/server/detail/types");
  return {
    readWorkItemDetail: stub.readWorkItemDetail,
    fallbackLabel: types.fallbackLabel,
  };
});

vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: stub.getOperatorContext,
  requireOperator: stub.getOperatorContext,
}));

const { default: WorkItemDetailPage } = await import("@/app/work-items/[id]/page");
const { WorkItemDetailView } = await import(
  "@/app/work-items/[id]/_components/work-item-detail-view"
);

const ID = "0f3c1d2e-0000-4000-8000-00000000fee1";
const DANGLING_REQUIREMENT = "FR-999";

function base(): WorkItemDetail {
  return {
    kind: "work_item",
    id: ID,
    engagement: { id: "eng-1", slug: "acme", clientName: "Acme Robotics" },
    unit: "u4",
    executionMode: "fleet",
    workType: "ui",
    phase: 2,
    executor: "ui-designer",
    executorKind: "agent",
    status: "blocked",
    rawStatus: { text: null, state: "absent" },
    description: { text: "Build the three detail routes.", state: "present" },
    unautomatedReason: null,
    disposition: "carried",
    evidenceScope: "observed-live",
    notVerifiedCount: 0,
    startedAt: "2026-08-20T10:00:00Z",
    endedAt: null,
    planned: false,
    updatedAt: "2026-08-20T10:00:00Z",
    run: {
      id: "run-1",
      runId: "eb2490",
      branch: "agent-build/2026-08-20-eb2490",
      mode: "fleet",
      verdict: null,
    },
    stack: { id: "stack-1", name: "nextjs" },
    blocker: { kind: "blocker", label: "B29", id: "b1000000-0000-4000-8000-00000000000b" },
    externalWait: null,
    dependsOn: [
      { kind: "work_item", label: "u1", id: "a1000000-0000-4000-8000-000000000001" },
    ],
    // FR-83's case, and the reason it is in the base fixture rather than in one
    // test: every render below therefore has to keep a dangling reference out
    // of an anchor, not only the one test that looks for it.
    implementsRequirements: [
      { kind: "requirement", label: DANGLING_REQUIREMENT, id: null },
    ],
    blocks: [],
    fixesDefects: [],
  };
}

const q = (c: HTMLElement, s: string) => c.querySelector(s);
const all = (c: HTMLElement, s: string) => [...c.querySelectorAll(s)];

async function renderPage() {
  return render(await WorkItemDetailPage({ params: Promise.resolve({ id: ID }) }));
}

beforeEach(() => {
  stub.notFound.mockClear();
  stub.readWorkItemDetail.mockReset();
  stub.getOperatorContext.mockReset();
  stub.getOperatorContext.mockResolvedValue(OPERATOR);
});

afterEach(cleanup);

/* --------------------------------------------------- the three outcomes */

describe("the page keeps 404 and 500 apart", () => {
  it("calls notFound() when the loader returns null", async () => {
    stub.readWorkItemDetail.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(stub.notFound).toHaveBeenCalledOnce();
  });

  it("renders the failure notice when the read throws, and never an empty state", async () => {
    // "The database refused" and "there is no such row" are different claims.
    // A screen that renders its empty state after a failed read has reported a
    // clean ledger without looking at one.
    stub.readWorkItemDetail.mockRejectedValue(
      new Error("could not read work_item: connection refused"),
    );
    const { container } = await renderPage();

    const notice = q(container, "[data-verify-unit='load-notice']");
    expect(notice).not.toBeNull();
    expect(notice).toHaveAttribute("data-verify-reason", "error");
    expect(q(container, "[data-verify-unit='empty-state']")).toBeNull();
    expect(stub.notFound).not.toHaveBeenCalled();
  });

  it("does not leak the database's own message into the failure notice", async () => {
    // `LoadError` carries the table name and the PostgREST message, and this
    // product's rows quote client systems. `loadForOperator` replaces anything
    // that is not an `ApiError`; this asserts the page inherits that.
    stub.readWorkItemDetail.mockRejectedValue(
      new Error('could not read work_item: relation "secret_table" does not exist'),
    );
    const { container } = await renderPage();
    expect(container.textContent).not.toContain("secret_table");
  });

  it("renders exactly one entity-detail shell, carrying the kind", async () => {
    stub.readWorkItemDetail.mockResolvedValue(base());
    const { container } = await renderPage();

    const shells = all(container, "[data-verify-unit='entity-detail']");
    expect(shells).toHaveLength(1);
    expect(shells[0]).toHaveAttribute("data-verify-kind", "work_item");
  });

  it("adds no second unparsed count — FR-85 is the root layout's job", async () => {
    // Two elements answering the same selector is an ambiguous assertion at
    // best and two different numbers at worst.
    stub.readWorkItemDetail.mockResolvedValue(base());
    const { container } = await renderPage();
    expect(all(container, "[data-verify-unit='unparsed-count']")).toHaveLength(0);
  });
});

/* ------------------------------------------------------------- FR-83 */

describe("FR-83 — a reference to nothing is never a link", () => {
  it("draws a dangling reference with the treatment and outside any anchor", () => {
    const { container } = render(<WorkItemDetailView detail={base()} />);
    const token = q(
      container,
      `[data-verify-unit='entity-ref'][data-verify-ref='${DANGLING_REQUIREMENT}']`,
    );

    expect(token).not.toBeNull();
    expect(token).toHaveAttribute("data-verify-known", "false");
    expect(token).toHaveAttribute("data-verify-treatment", "dangling");
    expect(token?.closest("a")).toBeNull();
  });

  it("makes a resolved reference navigable to the row id, not to the label", () => {
    // Passing `u1` instead of the uuid builds `/work-items/u1`, a broken link —
    // which is the failure FR-83 exists to prevent.
    const { container } = render(<WorkItemDetailView detail={base()} />);
    const token = q(
      container,
      "[data-verify-unit='entity-ref'][data-verify-ref='u1']",
    );
    expect(token?.closest("a")).toHaveAttribute(
      "href",
      "/work-items/a1000000-0000-4000-8000-000000000001",
    );
  });

  it("renders the engagement as a plain link and not as a ninth entity kind", () => {
    // `ENTITY_KINDS` is asserted to equal exactly FR-81's eight, so an
    // `<EntityRef kind="engagement">` would turn a passing gate red. FR-80 is
    // met by linking `/registry/<slug>`, which already exists.
    const { container } = render(<WorkItemDetailView detail={base()} />);
    const link = q(container, "[data-verify-unit='detail-engagement']");
    expect(link).toHaveAttribute("href", "/registry/acme");
    expect(link).toHaveAttribute("data-verify-slug", "acme");

    const kinds = all(container, "[data-verify-unit='entity-ref']").map((el) =>
      el.getAttribute("data-verify-kind"),
    );
    expect(kinds).not.toContain("engagement");
  });
});

/* -------------------------------------------- Prose has four states */

describe("Prose renders four states and never collapses them", () => {
  function proseFor(container: HTMLElement, field: string): HTMLElement | null {
    return container.querySelector(
      `[data-verify-unit='detail-prose'][data-verify-field='${field}']`,
    );
  }

  it("distinguishes unreadable from absent, in state and in what is shown", () => {
    // This is the one that matters. `absent` means nothing was ever stored;
    // `unreadable` means ciphertext WAS stored and could not be read back.
    // Rendering the second as blank states "there is nothing here" about a
    // field that was lost.
    const detail = base();
    detail.description = { text: null, state: "unreadable" };
    detail.rawStatus = { text: null, state: "absent" };

    const { container } = render(<WorkItemDetailView detail={detail} />);
    const unreadable = proseFor(container, "description");
    const absent = proseFor(container, "raw_status");

    expect(unreadable).toHaveAttribute("data-verify-state", "unreadable");
    expect(absent).toHaveAttribute("data-verify-state", "absent");
    expect(unreadable?.textContent).toContain("unreadable");
    expect(absent?.textContent).not.toContain("unreadable");
    expect(unreadable?.innerHTML).not.toBe(absent?.innerHTML);
  });

  it("gives not-requested its own wording rather than reusing absent's", () => {
    const detail = base();
    detail.description = { text: null, state: "not-requested" };
    detail.rawStatus = { text: null, state: "absent" };

    const { container } = render(<WorkItemDetailView detail={detail} />);
    const notRequested = proseFor(container, "description");

    expect(notRequested).toHaveAttribute(
      "data-verify-state",
      "not-requested",
    );
    expect(notRequested?.textContent).toContain("not read");
    expect(notRequested?.innerHTML).not.toBe(
      proseFor(container, "raw_status")?.innerHTML,
    );
  });

  it("shows decrypted prose when it is present", () => {
    const { container } = render(<WorkItemDetailView detail={base()} />);
    const present = proseFor(container, "description");
    expect(present).toHaveAttribute("data-verify-state", "present");
    expect(present?.textContent).toContain("Build the three detail routes.");
  });

  it("puts no decrypted text into any data-verify attribute — §7a", () => {
    const { container } = render(<WorkItemDetailView detail={base()} />);
    for (const el of all(container, "*")) {
      for (const attr of [...el.attributes]) {
        if (!attr.name.startsWith("data-verify-")) continue;
        expect(attr.value).not.toContain("Build the three detail routes.");
      }
    }
  });
});

/* -------------------------------------------------- absence and defaults */

describe("an absent value is drawn as absent, never as a value", () => {
  it("names a work item with no unit by fallbackLabel and marks the slot absent", () => {
    // A `hand` or `external` work item carries no unit. It still exists and is
    // still navigable, so it gets a display label and an absent identifier —
    // not a blank heading.
    const detail = base();
    detail.unit = null;
    detail.executionMode = "hand";
    detail.executorKind = "erik";

    const { container } = render(<WorkItemDetailView detail={detail} />);
    expect(container.textContent).toContain("work item 0f3c1d2e");
  });

  it("draws an unrecorded evidence scope as a third thing, not as not-verified", () => {
    // FR-43. "No scope was recorded" and a recorded `not-verified` are
    // different facts and only one of them is a claim about evidence.
    const detail = base();
    detail.evidenceScope = null;

    const { container } = render(<WorkItemDetailView detail={detail} />);
    expect(q(container, "[data-verify-unit='evidence-scope']")).toHaveAttribute(
      "data-verify-scope",
      "not-recorded",
    );
  });

  it("keeps the hyphenated domain scope and the underscored stored one in step", () => {
    // The chip takes Postgres' spelling and the loader returns the wire one. A
    // wrong mapping here renders "no scope recorded" over a row that recorded
    // a scope — a false absence, which is this product's worst output.
    const detail = base();
    detail.evidenceScope = "observed-elsewhere";

    const { container } = render(<WorkItemDetailView detail={detail} />);
    expect(q(container, "[data-verify-unit='evidence-scope']")).toHaveAttribute(
      "data-verify-scope",
      "observed_elsewhere",
    );
  });

  it("reports a not-verified count of zero as a measurement", () => {
    // `notVerifiedCount` is non-nullable in i1's type, so `0` here is something
    // that was counted rather than something unknown rendered as zero.
    const { container } = render(<WorkItemDetailView detail={base()} />);
    expect(
      q(container, "[data-verify-unit='work-item-not-verified']"),
    ).toHaveAttribute("data-verify-count", "0");
  });

  it("renders an absent run as absent rather than inventing a run id", () => {
    const detail = base();
    detail.run = null;
    detail.stack = null;

    const { container } = render(<WorkItemDetailView detail={detail} />);
    const context = q(container, "[data-verify-unit='work-item-context']");
    expect(context?.textContent).not.toContain("eb2490");
  });
});

/* ------------------------------------------------------------ StrictMode */

describe("the view is stable under StrictMode's double invocation", () => {
  it("renders the same markup mounted the way next.config.ts mounts it", () => {
    // `reactStrictMode: true` double-invokes. Nothing in this unit fetches in
    // an effect, so this is a guard against one being added later rather than a
    // reproduction of a known failure — but a bare render could not see it.
    const plain = render(<WorkItemDetailView detail={base()} />);
    const plainHtml = plain.container.innerHTML;
    cleanup();

    const strict = render(
      <StrictMode>
        <WorkItemDetailView detail={base()} />
      </StrictMode>,
    );
    expect(strict.container.innerHTML).toBe(plainHtml);
  });
});
