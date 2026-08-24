import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ReleaseDetail } from "@/lib/detail-load";

/**
 * `/releases/[id]` — FR-81 for `release` (CR-001 FR-73, FR-74).
 *
 * `@/lib/detail-load` is replaced wholesale: it holds `requireOperator()`, the
 * service-role client and the pgcrypto reads, and this suite has no database
 * credential and must never want one. `getOperatorContext` is replaced so the
 * REAL `loadForOperator` reaches its `read()`; its refusal mapping is what turns
 * a thrown read into the notice these tests assert on.
 *
 * §7a classes `release` and `release_requirement` `internal` with nothing
 * encrypted, so there is no `Prose` on this view.
 */

const NOT_FOUND = new Error("test:notFound");

const readReleaseDetail = vi.fn();

vi.mock("@/lib/detail-load", () => ({
  readReleaseDetail: (id: string) => readReleaseDetail(id),
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

const { default: ReleasePage } = await import("@/app/releases/[id]/page");

afterEach(cleanup);
beforeEach(() => {
  readReleaseDetail.mockReset();
});

/** Mounted under `<StrictMode>` because `next.config.ts` sets it. */
async function show(id = "rel-1") {
  const element = await ReleasePage({ params: Promise.resolve({ id }) });
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

const RELEASE: ReleaseDetail = {
  kind: "release",
  id: "rel-1",
  engagement: { id: "eng-1", slug: "acme-rebuild", clientName: "Acme" },
  identifier: "dpl_synthetic1",
  environment: "production",
  url: "https://acme.example.test",
  deployedAt: "2026-08-14",
  source: "ingested",
  recordedBy: "fleet",
  requirements: [
    { kind: "requirement", label: "FR-73", id: "req-73" },
    { kind: "requirement", label: "FR-99", id: null },
  ],
};

function release(overrides: Partial<ReleaseDetail> = {}): ReleaseDetail {
  return { ...RELEASE, ...overrides };
}

describe("FR-81 — the release detail view", () => {
  it("renders exactly one EntityDetail, and it names its kind", async () => {
    readReleaseDetail.mockResolvedValue(release());
    const { container } = await show();

    const shells = container.querySelectorAll(
      "[data-verify-unit='entity-detail']",
    );
    expect(shells).toHaveLength(1);
    expect(shells[0]).toHaveAttribute("data-verify-kind", "release");
  });

  it("adds no second unparsed count — FR-85 is satisfied by the root layout", async () => {
    readReleaseDetail.mockResolvedValue(release());
    const { container } = await show();

    expect(
      container.querySelectorAll("[data-verify-unit='unparsed-count']"),
    ).toHaveLength(0);
  });

  it("passes the row id from the route segment straight to the loader", async () => {
    readReleaseDetail.mockResolvedValue(release());
    await show("7b1e-uuid");

    expect(readReleaseDetail).toHaveBeenCalledWith("7b1e-uuid");
  });

  it("shows the environment, the source and when it went out", async () => {
    readReleaseDetail.mockResolvedValue(release());
    const text = (await show()).container.textContent ?? "";

    expect(text).toContain("production");
    expect(text).toContain("ingested");
    expect(text).toContain("2026-08-14");
  });
});

/* ------------------------------------------------------------------ 404/500 */

describe("a missing row and a refused read are different claims", () => {
  it("calls notFound() when the loader answers null", async () => {
    readReleaseDetail.mockResolvedValue(null);
    await expect(show()).rejects.toBe(NOT_FOUND);
  });

  it("renders the failure notice — not an empty state — when the read throws", async () => {
    readReleaseDetail.mockRejectedValue(new Error("connection reset"));
    const { container } = await show();

    expect(byUnit(container, "load-notice")).toHaveAttribute(
      "data-verify-reason",
      "error",
    );
    expect(
      container.querySelectorAll("[data-verify-unit='empty-state']"),
      "a failed read rendered an empty state, which claims nothing shipped without looking",
    ).toHaveLength(0);
  });

  it("does not leak the database's own error text to the screen", async () => {
    readReleaseDetail.mockRejectedValue(
      new Error('relation "release_requirement" does not exist'),
    );
    const { container } = await show();

    expect(container.textContent).not.toContain("release_requirement");
  });
});

/* ------------------------------------------------------------------ FR-74 */

describe("FR-74's shipped derivation is not recomputed here", () => {
  it("renders no shipped chip and says 'names' rather than 'shipped'", async () => {
    readReleaseDetail.mockResolvedValue(release());
    const { container } = await show();

    expect(
      container.querySelectorAll("[data-verify-unit='shipped']"),
      "the release view derived FR-74 a second time; that derivation lives in shippedIndex",
    ).toHaveLength(0);
    expect(byUnit(container, "release-requirements").textContent).toContain(
      "names",
    );
  });
});

/* --------------------------------------------------------------- contract */

describe("the state contract", () => {
  it("publishes the environment, the source and both reference counts", async () => {
    readReleaseDetail.mockResolvedValue(release());
    const detail = byUnit((await show()).container, "release-detail");

    expect(detail).toHaveAttribute("data-verify-environment", "production");
    expect(detail).toHaveAttribute("data-verify-source", "ingested");
    expect(detail).toHaveAttribute("data-verify-requirements", "2");
    expect(detail).toHaveAttribute("data-verify-dangling", "1");
  });

  it("keeps FR-73's declared and ingested apart", async () => {
    readReleaseDetail.mockResolvedValue(release({ source: "declared" }));
    const detail = byUnit((await show()).container, "release-detail");

    expect(detail).toHaveAttribute("data-verify-source", "declared");
  });
});

/* -------------------------------------------------------------------- URL */

describe("a stored URL is not automatically an anchor", () => {
  it("offers an https URL as a link", async () => {
    readReleaseDetail.mockResolvedValue(release());
    const { container } = await show();

    const url = byUnit(container, "release-url");
    expect(url).toHaveAttribute("data-verify-navigable", "true");
    expect(url).toHaveAttribute("href", "https://acme.example.test");
  });

  it("shows a javascript: URL verbatim and refuses to make it a link", async () => {
    // The hostile scheme is the point of the test: it is stored data on its way
    // to a `DetailField`, never a URL this suite navigates to.
    readReleaseDetail.mockResolvedValue(release({ url: "javascript:alert(1)" }));
    const { container } = await show();

    const url = byUnit(container, "release-url");
    expect(url).toHaveAttribute("data-verify-navigable", "false");
    expect(url.tagName).not.toBe("A");
    expect(url.textContent).toContain("javascript:alert(1)");
    expect(container.querySelectorAll("a[href^='javascript:']")).toHaveLength(0);
  });

  it("refuses a relative path rather than resolving it against this origin", async () => {
    readReleaseDetail.mockResolvedValue(release({ url: "/admin" }));
    const { container } = await show();

    expect(byUnit(container, "release-url")).toHaveAttribute(
      "data-verify-navigable",
      "false",
    );
  });

  it("states the absence rather than rendering a blank when no URL was recorded", async () => {
    readReleaseDetail.mockResolvedValue(release({ url: null }));
    const { container } = await show();

    expect(
      container.querySelectorAll("[data-verify-unit='release-url']"),
    ).toHaveLength(0);
    expect(container.textContent).toContain("URL");
  });
});

/* ------------------------------------------------------------ FR-83 / refs */

describe("the requirements this release names", () => {
  it("renders a dangling reference as known=false, dangling, and NOT a link", async () => {
    readReleaseDetail.mockResolvedValue(release());
    const { container } = await show();

    const dangler = [
      ...container.querySelectorAll<HTMLElement>(
        "[data-verify-unit='entity-ref']",
      ),
    ].find((ref) => ref.getAttribute("data-verify-ref") === "FR-99");
    if (dangler === undefined) throw new Error("FR-99 was not rendered at all");

    expect(dangler).toHaveAttribute("data-verify-known", "false");
    expect(dangler).toHaveAttribute("data-verify-treatment", "dangling");
    expect(
      dangler.closest("a"),
      "FR-83: a reference that resolves to nothing was rendered as a link",
    ).toBeNull();
  });

  it("keeps a resolved reference navigable, by uuid and not by human ref", async () => {
    readReleaseDetail.mockResolvedValue(release());
    const { container } = await show();

    const resolved = [
      ...container.querySelectorAll<HTMLElement>(
        "[data-verify-unit='entity-ref']",
      ),
    ].find((ref) => ref.getAttribute("data-verify-ref") === "FR-73");
    if (resolved === undefined) throw new Error("FR-73 was not rendered at all");

    expect(resolved.closest("a")).toHaveAttribute("href", "/requirements/req-73");
  });

  it("states the absence when a release names no requirements", async () => {
    readReleaseDetail.mockResolvedValue(release({ requirements: [] }));
    const { container } = await show();

    expect(byUnit(container, "release-requirements").textContent?.trim()).not.toBe(
      "",
    );
    expect(byUnit(container, "release-detail")).toHaveAttribute(
      "data-verify-requirements",
      "0",
    );
  });
});

/* ---------------------------------------------------------------- ruling 3 */

describe("the engagement is not a ninth entity kind", () => {
  it("links to the registry with a plain anchor, not an EntityRef", async () => {
    readReleaseDetail.mockResolvedValue(release());
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
  it("renders a zone-less deployment timestamp as the day the string carries", async () => {
    readReleaseDetail.mockResolvedValue(
      release({ deployedAt: "2026-09-01T00:00:00" }),
    );
    const { container } = await show();

    // `isoDay` would answer 2026-08-31 east of UTC.
    expect(container.textContent).toContain("2026-09-01");
    expect(container.textContent).not.toContain("2026-08-31");
  });
});
