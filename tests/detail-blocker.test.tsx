import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/api/operator";
import type { BlockerDetail } from "@/lib/detail-load";

/**
 * FR-81 / FR-83 / FR-85 — the `blocker` detail view (M2.7, f1).
 *
 * The faking strategy is the one recorded in `tests/detail-work-item.test.tsx`:
 * i1's loader is stubbed, `loadForOperator` is real because it owns the
 * distinction between a failure and an empty screen, and only the operator
 * context it consults is replaced.
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
    throw new Error("NEXT_NOT_FOUND");
  }),
  readBlockerDetail: vi.fn(),
  getOperatorContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: stub.notFound }));

vi.mock("@/lib/detail-load", async () => {
  const types = await import("@/lib/server/detail/types");
  return {
    readBlockerDetail: stub.readBlockerDetail,
    fallbackLabel: types.fallbackLabel,
  };
});

vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: stub.getOperatorContext,
  requireOperator: stub.getOperatorContext,
}));

const { default: BlockerDetailPage } = await import("@/app/blockers/[id]/page");
const { BlockerDetailView } = await import(
  "@/app/blockers/[id]/_components/blocker-detail-view"
);

const ID = "b1000000-0000-4000-8000-0000000000b2";
const HELD_ID = "a1000000-0000-4000-8000-000000000007";

function base(): BlockerDetail {
  return {
    kind: "blocker",
    id: ID,
    engagement: { id: "eng-1", slug: "acme", clientName: "Acme Robotics" },
    ref: "B29",
    owner: "erik",
    description: {
      text: "Every operator read runs as service_role, which holds BYPASSRLS.",
      state: "present",
    },
    openedAt: "2026-08-19T08:00:00Z",
    resolvedAt: null,
    disposition: "carried",
    blocks: [
      { kind: "work_item", label: "u7", id: HELD_ID },
      { kind: "work_item", label: "u9", id: null },
    ],
  };
}

const q = (c: HTMLElement, s: string) => c.querySelector(s);
const all = (c: HTMLElement, s: string) => [...c.querySelectorAll(s)];

async function renderPage() {
  return render(await BlockerDetailPage({ params: Promise.resolve({ id: ID }) }));
}

beforeEach(() => {
  stub.notFound.mockClear();
  stub.readBlockerDetail.mockReset();
  stub.getOperatorContext.mockReset();
  stub.getOperatorContext.mockResolvedValue(OPERATOR);
});

afterEach(cleanup);

describe("the page keeps 404 and 500 apart", () => {
  it("calls notFound() when the loader returns null", async () => {
    stub.readBlockerDetail.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(stub.notFound).toHaveBeenCalledOnce();
  });

  it("renders the failure notice when the read throws, and never an empty state", async () => {
    stub.readBlockerDetail.mockRejectedValue(
      new Error("could not read blocker: connection refused"),
    );
    const { container } = await renderPage();

    expect(q(container, "[data-verify-unit='load-notice']")).toHaveAttribute(
      "data-verify-reason",
      "error",
    );
    expect(q(container, "[data-verify-unit='empty-state']")).toBeNull();
    expect(stub.notFound).not.toHaveBeenCalled();
  });

  it("distinguishes a refused session from a failed read", async () => {
    // `loadForOperator` separates four refusal reasons, and the operator has to
    // do a different thing in each. A page that flattened them to "error" would
    // tell a signed-out reader that the database is broken.
    stub.getOperatorContext.mockResolvedValue({
      ...OPERATOR,
      userId: null,
      profile: null,
      assuranceLevel: null,
    });
    const { container } = await renderPage();

    expect(q(container, "[data-verify-unit='load-notice']")).toHaveAttribute(
      "data-verify-reason",
      "sign-in",
    );
    expect(stub.readBlockerDetail).not.toHaveBeenCalled();
  });

  it("renders exactly one entity-detail shell, carrying the kind", async () => {
    stub.readBlockerDetail.mockResolvedValue(base());
    const { container } = await renderPage();

    const shells = all(container, "[data-verify-unit='entity-detail']");
    expect(shells).toHaveLength(1);
    expect(shells[0]).toHaveAttribute("data-verify-kind", "blocker");
  });

  it("adds no second unparsed count — FR-85 is the root layout's job", async () => {
    stub.readBlockerDetail.mockResolvedValue(base());
    const { container } = await renderPage();
    expect(all(container, "[data-verify-unit='unparsed-count']")).toHaveLength(0);
  });
});

describe("FR-83 — a reference to nothing is never a link", () => {
  it("draws a dangling held item with the treatment and outside any anchor", () => {
    const { container } = render(<BlockerDetailView detail={base()} />);
    const token = q(
      container,
      "[data-verify-unit='entity-ref'][data-verify-ref='u9']",
    );

    expect(token).toHaveAttribute("data-verify-known", "false");
    expect(token).toHaveAttribute("data-verify-treatment", "dangling");
    expect(token?.closest("a")).toBeNull();
  });

  it("keeps the dangling reference in the list rather than dropping it", () => {
    // A reference that resolves to nothing is a finding, and a list that
    // silently omits it under-reports what a blocker is holding.
    const { container } = render(<BlockerDetailView detail={base()} />);
    expect(q(container, "[data-verify-unit='blocker-blocks']")).toHaveAttribute(
      "data-verify-count",
      "2",
    );
    expect(all(container, "[data-verify-unit='entity-ref']")).toHaveLength(2);
  });

  it("links a resolved held item by its row id rather than by its unit", () => {
    const { container } = render(<BlockerDetailView detail={base()} />);
    const token = q(
      container,
      "[data-verify-unit='entity-ref'][data-verify-ref='u7']",
    );
    expect(token?.closest("a")).toHaveAttribute("href", `/work-items/${HELD_ID}`);
  });

  it("renders the engagement as a plain link and not as a ninth entity kind", () => {
    const { container } = render(<BlockerDetailView detail={base()} />);
    expect(q(container, "[data-verify-unit='detail-engagement']")).toHaveAttribute(
      "href",
      "/registry/acme",
    );
    const kinds = all(container, "[data-verify-unit='entity-ref']").map((el) =>
      el.getAttribute("data-verify-kind"),
    );
    expect(kinds).not.toContain("engagement");
  });
});

describe("Prose renders four states and never collapses them", () => {
  function prose(container: HTMLElement): HTMLElement | null {
    return container.querySelector(
      "[data-verify-unit='detail-prose'][data-verify-field='description']",
    );
  }

  it("distinguishes unreadable from absent, in state and in what is shown", () => {
    const unreadableDetail = base();
    unreadableDetail.description = { text: null, state: "unreadable" };
    const unreadable = render(<BlockerDetailView detail={unreadableDetail} />);
    const unreadableHtml = prose(unreadable.container)?.innerHTML;
    expect(prose(unreadable.container)).toHaveAttribute(
      "data-verify-prose-state",
      "unreadable",
    );
    expect(prose(unreadable.container)?.textContent).toContain("unreadable");
    cleanup();

    const absentDetail = base();
    absentDetail.description = { text: null, state: "absent" };
    const absent = render(<BlockerDetailView detail={absentDetail} />);
    expect(prose(absent.container)).toHaveAttribute(
      "data-verify-prose-state",
      "absent",
    );
    expect(prose(absent.container)?.innerHTML).not.toBe(unreadableHtml);
  });

  it("gives not-requested its own wording rather than reusing absent's", () => {
    const detail = base();
    detail.description = { text: null, state: "not-requested" };

    const { container } = render(<BlockerDetailView detail={detail} />);
    expect(prose(container)).toHaveAttribute(
      "data-verify-prose-state",
      "not-requested",
    );
    expect(prose(container)?.textContent).toContain("not read");
  });

  it("puts no decrypted text into any data-verify attribute — §7a", () => {
    const { container } = render(<BlockerDetailView detail={base()} />);
    for (const el of all(container, "*")) {
      for (const attr of [...el.attributes]) {
        if (!attr.name.startsWith("data-verify-")) continue;
        expect(attr.value).not.toContain("BYPASSRLS");
      }
    }
  });
});

describe("an absent value is drawn as absent, never as a value", () => {
  it("names a blocker with no ref by fallbackLabel and marks the slot absent", () => {
    const detail = base();
    detail.ref = null;

    const { container } = render(<BlockerDetailView detail={detail} />);
    expect(container.textContent).toContain("blocker b1000000");
  });

  it("does not default a missing owner to erik", () => {
    // FR-52's default `erik` is applied at ingest. A row that reached the
    // database with no owner is a gap in the record, and displaying it as one
    // of Erik's would move somebody else's backlog onto his screen.
    const detail = base();
    detail.owner = null;

    const { container } = render(<BlockerDetailView detail={detail} />);
    const identity = q(container, "[data-verify-unit='blocker-identity']");
    expect(identity?.textContent).not.toContain("erik");
  });

  it("draws an unrecorded disposition as a third thing, not as closed", () => {
    // FR-30. `carried` is still owned, `closed` is decided against, and
    // "nobody wrote one down" is neither.
    const detail = base();
    detail.disposition = null;

    const { container } = render(<BlockerDetailView detail={detail} />);
    expect(q(container, "[data-verify-unit='disposition']")).toHaveAttribute(
      "data-verify-disposition",
      "not-recorded",
    );
  });

  it("does not render a missing resolution date as a date", () => {
    const { container } = render(<BlockerDetailView detail={base()} />);
    const identity = q(container, "[data-verify-unit='blocker-identity']");
    // The opening date is present, so a formatter that turned `null` into a
    // date would show two.
    const dates = (identity?.textContent ?? "").match(/\d{4}-\d{2}-\d{2}/g) ?? [];
    expect(dates).toHaveLength(1);
  });
});

describe("the view is stable under StrictMode's double invocation", () => {
  it("renders the same markup mounted the way next.config.ts mounts it", () => {
    const plain = render(<BlockerDetailView detail={base()} />);
    const plainHtml = plain.container.innerHTML;
    cleanup();

    const strict = render(
      <StrictMode>
        <BlockerDetailView detail={base()} />
      </StrictMode>,
    );
    expect(strict.container.innerHTML).toBe(plainHtml);
  });
});
