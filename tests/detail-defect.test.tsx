import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OperatorContext } from "@/lib/api/operator";
import type { DefectDetail } from "@/lib/detail-load";

/**
 * FR-81 / FR-83 / FR-85 — the `defect` detail view (CR-001; M2.7, f1).
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
  readDefectDetail: vi.fn(),
  getOperatorContext: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: stub.notFound }));

vi.mock("@/lib/detail-load", async () => {
  const types = await import("@/lib/server/detail/types");
  return {
    readDefectDetail: stub.readDefectDetail,
    fallbackLabel: types.fallbackLabel,
  };
});

vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: stub.getOperatorContext,
  requireOperator: stub.getOperatorContext,
}));

const { default: DefectDetailPage } = await import("@/app/defects/[id]/page");
const { DefectDetailView } = await import(
  "@/app/defects/[id]/_components/defect-detail-view"
);

const ID = "d10c0de0-0000-4000-8000-0000000000d7";
const WORK_ITEM_ID = "a1000000-0000-4000-8000-000000000004";

function base(): DefectDetail {
  return {
    kind: "defect",
    id: ID,
    engagement: { id: "eng-1", slug: "acme", clientName: "Acme Robotics" },
    ref: "D-7",
    source: "qa_agent",
    severity: "critical",
    rawSeverity: "showstopper",
    title: "Ingest returns 500 on every request",
    description: { text: "The route handler throws before validation.", state: "present" },
    status: "open",
    wontFixReason: { text: null, state: "absent" },
    reportedAt: "2026-08-19T09:30:00Z",
    reportedBy: "qa-reviewer",
    verifiedAt: null,
    sourceKey: "checkpoint-eb2490.md#3",
    requirement: { kind: "requirement", label: "FR-999", id: null },
    fixingWorkItem: { kind: "work_item", label: "u4", id: WORK_ITEM_ID },
    tests: [],
  };
}

const q = (c: HTMLElement, s: string) => c.querySelector(s);
const all = (c: HTMLElement, s: string) => [...c.querySelectorAll(s)];

async function renderPage() {
  return render(await DefectDetailPage({ params: Promise.resolve({ id: ID }) }));
}

beforeEach(() => {
  stub.notFound.mockClear();
  stub.readDefectDetail.mockReset();
  stub.getOperatorContext.mockReset();
  stub.getOperatorContext.mockResolvedValue(OPERATOR);
});

afterEach(cleanup);

describe("the page keeps 404 and 500 apart", () => {
  it("calls notFound() when the loader returns null", async () => {
    stub.readDefectDetail.mockResolvedValue(null);
    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(stub.notFound).toHaveBeenCalledOnce();
  });

  it("renders the failure notice when the read throws, and never an empty state", async () => {
    stub.readDefectDetail.mockRejectedValue(
      new Error("could not read defect: connection refused"),
    );
    const { container } = await renderPage();

    expect(q(container, "[data-verify-unit='load-notice']")).toHaveAttribute(
      "data-verify-reason",
      "error",
    );
    expect(q(container, "[data-verify-unit='empty-state']")).toBeNull();
    expect(stub.notFound).not.toHaveBeenCalled();
  });

  it("renders exactly one entity-detail shell, carrying the kind", async () => {
    stub.readDefectDetail.mockResolvedValue(base());
    const { container } = await renderPage();

    const shells = all(container, "[data-verify-unit='entity-detail']");
    expect(shells).toHaveLength(1);
    expect(shells[0]).toHaveAttribute("data-verify-kind", "defect");
  });

  it("adds no second unparsed count — FR-85 is the root layout's job", async () => {
    stub.readDefectDetail.mockResolvedValue(base());
    const { container } = await renderPage();
    expect(all(container, "[data-verify-unit='unparsed-count']")).toHaveLength(0);
  });
});

describe("FR-83 — a reference to nothing is never a link", () => {
  it("draws a dangling requirement with the treatment and outside any anchor", () => {
    const { container } = render(<DefectDetailView detail={base()} />);
    const token = q(
      container,
      "[data-verify-unit='entity-ref'][data-verify-ref='FR-999']",
    );

    expect(token).toHaveAttribute("data-verify-known", "false");
    expect(token).toHaveAttribute("data-verify-treatment", "dangling");
    expect(token?.closest("a")).toBeNull();
  });

  it("links the fixing work item by its row id rather than by its unit", () => {
    const { container } = render(<DefectDetailView detail={base()} />);
    const token = q(
      container,
      "[data-verify-unit='entity-ref'][data-verify-ref='u4']",
    );
    expect(token?.closest("a")).toHaveAttribute(
      "href",
      `/work-items/${WORK_ITEM_ID}`,
    );
  });

  it("gives a test case no entity reference, because it is not one of the eight", () => {
    // FR-66. `test_case` has no detail view, `entityHref` can build no
    // destination for it, and a link this product cannot build is the broken
    // link FR-83 forbids.
    const detail = base();
    detail.tests = [
      {
        id: "t1",
        file: "tests/ingest.test.ts",
        title: "rejects a malformed manifest",
        harness: "vitest",
        covers: ["D-7"],
      },
    ];

    const { container } = render(<DefectDetailView detail={detail} />);
    const list = q(container, "[data-verify-unit='defect-test-list']");
    expect(list).toHaveAttribute("data-verify-count", "1");
    expect(list?.textContent).toContain("rejects a malformed manifest");
    expect(list?.querySelector("[data-verify-unit='entity-ref']")).toBeNull();
    expect(list?.querySelector("a")).toBeNull();
  });

  it("says why there are no tests differently when no D-nn has been allocated", () => {
    // "No test names D-7" and "there is no D-nn for a test to name" are
    // different facts about the same empty list.
    const withRef = render(<DefectDetailView detail={base()} />);
    const withRefText = withRef.container.textContent ?? "";
    cleanup();

    const detail = base();
    detail.ref = null;
    const withoutRef = render(<DefectDetailView detail={detail} />);
    expect(withoutRef.container.textContent).not.toBe(withRefText);
    expect(withoutRef.container.textContent).toContain("has been allocated");
  });
});

describe("Prose renders four states and never collapses them", () => {
  function proseFor(container: HTMLElement, field: string): HTMLElement | null {
    return container.querySelector(
      `[data-verify-unit='detail-prose'][data-verify-field='${field}']`,
    );
  }

  it("distinguishes unreadable from absent on the §7a description", () => {
    const detail = base();
    detail.description = { text: null, state: "unreadable" };

    const { container } = render(<DefectDetailView detail={detail} />);
    const unreadable = proseFor(container, "description");
    const absent = proseFor(container, "wont_fix_reason");

    expect(unreadable).toHaveAttribute("data-verify-state", "unreadable");
    expect(absent).toHaveAttribute("data-verify-state", "absent");
    expect(unreadable?.textContent).toContain("unreadable");
    expect(unreadable?.innerHTML).not.toBe(absent?.innerHTML);
  });

  it("shows an unreadable won't-fix reason rather than a blank decision", () => {
    // FR-67 makes `wont_fix` a decision. A decision whose stated reason could
    // not be read back is not the same as one that never had a reason, and
    // rendering it blank claims the second.
    const detail = base();
    detail.status = "wont_fix";
    detail.wontFixReason = { text: null, state: "unreadable" };

    const { container } = render(<DefectDetailView detail={detail} />);
    expect(proseFor(container, "wont_fix_reason")).toHaveAttribute(
      "data-verify-state",
      "unreadable",
    );
    expect(proseFor(container, "wont_fix_reason")?.textContent).toContain(
      "unreadable",
    );
  });

  it("puts no decrypted text into any data-verify attribute — §7a", () => {
    const { container } = render(<DefectDetailView detail={base()} />);
    for (const el of all(container, "*")) {
      for (const attr of [...el.attributes]) {
        if (!attr.name.startsWith("data-verify-")) continue;
        expect(attr.value).not.toContain("route handler throws");
      }
    }
  });

  it("renders the title in the clear, which CR-001 §4 states as an exception", () => {
    // `defect.title` is deliberately unencrypted because it is the display key
    // a person recognises a defect by. It is NOT a `Prose`.
    const { container } = render(<DefectDetailView detail={base()} />);
    expect(container.textContent).toContain(
      "Ingest returns 500 on every request",
    );
  });
});

describe("FR-64 — both severity spellings are kept", () => {
  it("renders the mapped enum and the artifact's own word side by side", () => {
    // Where the two disagree, the disagreement is the data. Showing only the
    // mapped enum hides what the artifact actually claimed.
    const { container } = render(<DefectDetailView detail={base()} />);
    expect(q(container, "[data-verify-unit='defect-severity']")).toHaveAttribute(
      "data-verify-severity",
      "critical",
    );
    expect(container.textContent).toContain("showstopper");
  });

  it("puts an ungraded defect in the unparsed population rather than a fourth rung", () => {
    const detail = base();
    detail.severity = "unparsed";
    detail.rawSeverity = null;

    const { container } = render(<DefectDetailView detail={detail} />);
    expect(q(container, "[data-verify-unit='defect-severity']")).toHaveAttribute(
      "data-verify-severity",
      "unparsed",
    );
  });
});

describe("the view is stable under StrictMode's double invocation", () => {
  it("renders the same markup mounted the way next.config.ts mounts it", () => {
    const plain = render(<DefectDetailView detail={base()} />);
    const plainHtml = plain.container.innerHTML;
    cleanup();

    const strict = render(
      <StrictMode>
        <DefectDetailView detail={base()} />
      </StrictMode>,
    );
    expect(strict.container.innerHTML).toBe(plainHtml);
  });
});
