import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExternalWaitDetail } from "@/lib/detail-load";

/**
 * `/waits/[id]` — FR-81 for `external_wait`.
 *
 * `@/lib/detail-load` is replaced wholesale: it holds `requireOperator()`, the
 * service-role client and the pgcrypto reads, and this suite has no database
 * credential and must never want one. `getOperatorContext` is replaced so the
 * REAL `loadForOperator` reaches its `read()` — its refusal mapping is what
 * turns a thrown read into the notice these tests assert on, and a fake wrapper
 * would be asserting against itself.
 *
 * §7a leaves every column on this table clear, so nothing below is a decrypted
 * value and there is no `Prose` on this view.
 */

const NOT_FOUND = new Error("test:notFound");

const readExternalWaitDetail = vi.fn();

vi.mock("@/lib/detail-load", () => ({
  readExternalWaitDetail: (id: string) => readExternalWaitDetail(id),
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
}));

vi.mock("@/lib/api/operator", () => ({
  getOperatorContext: async () => ({
    userId: "op-1",
    email: "operator@example.test",
    assuranceLevel: "aal2",
    nextAssuranceLevel: "aal2",
    profile: { id: "op-1", email: "operator@example.test", displayName: null },
    mustVerifyMfa: false,
    mustEnrolMfa: false,
  }),
}));

const { default: WaitPage } = await import("@/app/waits/[id]/page");

afterEach(cleanup);
beforeEach(() => {
  readExternalWaitDetail.mockReset();
});

/** Mounted under `<StrictMode>` because `next.config.ts` sets it. */
async function show(id = "wait-1") {
  const element = await WaitPage({ params: Promise.resolve({ id }) });
  return render(<StrictMode>{element}</StrictMode>);
}

function byUnit(container: HTMLElement, unit: string): HTMLElement {
  const found = container.querySelector<HTMLElement>(
    `[data-verify-unit='${unit}']`,
  );
  if (found === null) {
    throw new Error(`no element published data-verify-unit="${unit}"`);
  }
  return found;
}

const WAIT: ExternalWaitDetail = {
  kind: "external_wait",
  id: "wait-1",
  engagement: { id: "eng-1", slug: "acme-rebuild", clientName: "Acme" },
  label: "App Store review",
  owner: "Apple review team",
  ownerType: "vendor",
  reason: "Binary submitted, waiting on first review pass.",
  startedAt: "2026-08-01",
  expectedBy: "2026-08-08",
  resolvedAt: null,
  resolvedBy: null,
  resolutionMethod: "probe",
  probeTarget: "https://example.test/status",
  blocks: [
    { kind: "work_item", label: "u4", id: "wi-4" },
    { kind: "work_item", label: "u9", id: null },
  ],
};

function wait(overrides: Partial<ExternalWaitDetail> = {}): ExternalWaitDetail {
  return { ...WAIT, ...overrides };
}

describe("FR-81 — the external wait detail view", () => {
  it("renders exactly one EntityDetail, and it names its kind", async () => {
    readExternalWaitDetail.mockResolvedValue(wait());
    const { container } = await show();

    const shells = container.querySelectorAll(
      "[data-verify-unit='entity-detail']",
    );
    expect(shells).toHaveLength(1);
    expect(shells[0]).toHaveAttribute("data-verify-kind", "external_wait");
  });

  it("adds no second unparsed count — FR-85 is satisfied by the root layout", async () => {
    readExternalWaitDetail.mockResolvedValue(wait());
    const { container } = await show();

    expect(
      container.querySelectorAll("[data-verify-unit='unparsed-count']"),
    ).toHaveLength(0);
  });

  it("passes the row id from the route segment straight to the loader", async () => {
    readExternalWaitDetail.mockResolvedValue(wait());
    await show("9c2f-uuid");

    expect(readExternalWaitDetail).toHaveBeenCalledWith("9c2f-uuid");
  });

  it("shows the fields §7a leaves clear on this table", async () => {
    readExternalWaitDetail.mockResolvedValue(wait());
    const { container } = await show();
    const text = container.textContent ?? "";

    expect(text).toContain("Apple review team");
    expect(text).toContain("Binary submitted");
    expect(text).toContain("2026-08-08");
  });
});

/* ------------------------------------------------------------------ 404/500 */

describe("a missing row and a refused read are different claims", () => {
  it("calls notFound() when the loader answers null", async () => {
    readExternalWaitDetail.mockResolvedValue(null);
    await expect(show()).rejects.toBe(NOT_FOUND);
  });

  it("renders the failure notice — not an empty state — when the read throws", async () => {
    readExternalWaitDetail.mockRejectedValue(new Error("connection reset"));
    const { container } = await show();

    expect(byUnit(container, "load-notice")).toHaveAttribute(
      "data-verify-reason",
      "error",
    );
    expect(
      container.querySelectorAll("[data-verify-unit='empty-state']"),
      "a failed read rendered an empty state, which claims nothing is waiting without looking",
    ).toHaveLength(0);
  });

  it("does not leak the database's own error text to the screen", async () => {
    readExternalWaitDetail.mockRejectedValue(
      new Error('relation "external_wait" does not exist'),
    );
    const { container } = await show();

    expect(container.textContent).not.toContain("external_wait");
  });
});

/* ------------------------------------------------------------------ FR-34 */

describe("FR-34's overdue verdict is not recomputed here", () => {
  it("renders no overdue badge even for a wait long past its expected date", async () => {
    readExternalWaitDetail.mockResolvedValue(
      wait({ startedAt: "2020-01-01", expectedBy: "2020-01-02" }),
    );
    const { container } = await show();

    expect(
      container.querySelectorAll("[data-verify-unit='wait-overdue']"),
      "the detail view derived FR-34 a second time; that derivation lives in listWaits",
    ).toHaveLength(0);
    expect(byUnit(container, "back-to-waits")).toHaveAttribute("href", "/waits");
  });

  it("states that a wait with no expected date is not thereby on schedule", async () => {
    readExternalWaitDetail.mockResolvedValue(wait({ expectedBy: null }));
    const { container } = await show();

    const titles = [...container.querySelectorAll("[title]")].map((element) =>
      element.getAttribute("title"),
    );
    expect(
      titles.some((title) => title?.includes("never be flagged overdue")),
    ).toBe(true);
  });
});

/* --------------------------------------------------------------- contract */

describe("the state contract", () => {
  it("publishes resolution state, method and the count it holds", async () => {
    readExternalWaitDetail.mockResolvedValue(wait());
    const detail = byUnit((await show()).container, "external-wait-detail");

    expect(detail).toHaveAttribute("data-verify-resolved", "false");
    expect(detail).toHaveAttribute("data-verify-resolution-method", "probe");
    expect(detail).toHaveAttribute("data-verify-blocks", "2");
  });

  it("says not-recorded rather than blank when FR-35's method is missing", async () => {
    readExternalWaitDetail.mockResolvedValue(
      wait({ resolutionMethod: null, probeTarget: null }),
    );
    const detail = byUnit((await show()).container, "external-wait-detail");

    expect(detail).toHaveAttribute(
      "data-verify-resolution-method",
      "not-recorded",
    );
  });

  it("flips to resolved once a resolution date is recorded", async () => {
    readExternalWaitDetail.mockResolvedValue(
      wait({ resolvedAt: "2026-08-09", resolvedBy: "erik" }),
    );
    const detail = byUnit((await show()).container, "external-wait-detail");

    expect(detail).toHaveAttribute("data-verify-resolved", "true");
  });

  it("publishes no owner, reason or probe target into the state contract", async () => {
    readExternalWaitDetail.mockResolvedValue(wait());
    const { container } = await show();

    for (const element of container.querySelectorAll("*")) {
      for (const attribute of element.attributes) {
        if (!attribute.name.startsWith("data-verify")) continue;
        for (const secret of [
          "Apple review team",
          "Binary submitted",
          "example.test",
        ]) {
          expect(
            attribute.value,
            `${attribute.name} carries ${secret}; §7a classes this row personal`,
          ).not.toContain(secret);
        }
      }
    }
  });
});

/* ------------------------------------------------------------ FR-83 / refs */

describe("the work items this wait holds", () => {
  it("renders a dangling reference as known=false, dangling, and NOT a link", async () => {
    readExternalWaitDetail.mockResolvedValue(wait());
    const { container } = await show();

    const dangler = [
      ...container.querySelectorAll<HTMLElement>(
        "[data-verify-unit='entity-ref']",
      ),
    ].find((ref) => ref.getAttribute("data-verify-ref") === "u9");
    if (dangler === undefined) throw new Error("u9 was not rendered at all");

    expect(dangler).toHaveAttribute("data-verify-known", "false");
    expect(dangler).toHaveAttribute("data-verify-treatment", "dangling");
    expect(
      dangler.closest("a"),
      "FR-83: a reference that resolves to nothing was rendered as a link",
    ).toBeNull();
  });

  it("keeps a resolved reference navigable, by uuid and not by human ref", async () => {
    readExternalWaitDetail.mockResolvedValue(wait());
    const { container } = await show();

    const resolved = [
      ...container.querySelectorAll<HTMLElement>(
        "[data-verify-unit='entity-ref']",
      ),
    ].find((ref) => ref.getAttribute("data-verify-ref") === "u4");
    if (resolved === undefined) throw new Error("u4 was not rendered at all");

    expect(resolved.closest("a")).toHaveAttribute("href", "/work-items/wi-4");
  });

  it("states the absence rather than rendering a blank when nothing is held", async () => {
    readExternalWaitDetail.mockResolvedValue(wait({ blocks: [] }));
    const { container } = await show();

    const section = byUnit(container, "external-wait-blocks");
    expect(section.textContent?.trim()).not.toBe("");
    expect(byUnit(container, "external-wait-detail")).toHaveAttribute(
      "data-verify-blocks",
      "0",
    );
  });
});

/* ---------------------------------------------------------------- ruling 3 */

describe("the engagement is not a ninth entity kind", () => {
  it("links to the registry with a plain anchor, not an EntityRef", async () => {
    readExternalWaitDetail.mockResolvedValue(wait());
    const { container } = await show();

    const link = byUnit(container, "engagement-link");
    expect(link).toHaveAttribute("href", "/registry/acme-rebuild");
    expect(
      link.querySelector("[data-verify-unit='entity-ref']"),
      "the engagement was rendered as one of FR-81's eight kinds",
    ).toBeNull();
  });
});

/* ------------------------------------------------------------------ dates */

describe("dates carry formatDate's timezone care", () => {
  it("renders a zone-less timestamp as the day the string actually carries", async () => {
    readExternalWaitDetail.mockResolvedValue(
      wait({ expectedBy: "2026-09-01T00:00:00" }),
    );
    const { container } = await show();

    // `isoDay` would answer 2026-08-31 east of UTC.
    expect(container.textContent).toContain("2026-09-01");
    expect(container.textContent).not.toContain("2026-08-31");
  });
});
