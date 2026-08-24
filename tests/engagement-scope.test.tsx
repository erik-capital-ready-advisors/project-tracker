import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EngagementScope } from "@/components/engagement-scope";
import type { EngagementRoster } from "@/lib/engagement-roster";

/**
 * FR-45: every test title opens with the requirement ref it covers.
 *
 * ## This file mounts the real component, and that is the point
 *
 * B46 reached production because `AppShell`'s test mocks `CommandPalette` to
 * `() => null`: the palette threw on every route into it, no test ever mounted
 * the real thing, and 1545 tests stayed green. `EngagementScope` is the shell's
 * newest child and it renders on all thirty routes, so it gets the test the
 * palette did not have — the real component, under `<StrictMode>`, because
 * `next.config.ts` sets `reactStrictMode: true` and a bare `render()` cannot
 * reproduce a double-invoked render.
 */

const nav = vi.hoisted(() => ({
  pathname: "/next",
  search: new URLSearchParams(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => nav.search,
}));

const ROSTER: EngagementRoster = {
  status: "ok",
  options: [
    { slug: "acme-rebuild", clientName: "Acme" },
    { slug: "delivery-ledger", clientName: "Delivery Ledger" },
  ],
};

function mount(props: {
  pathname?: string;
  search?: string;
  unparsedCount?: number | null;
  roster?: EngagementRoster;
}) {
  nav.pathname = props.pathname ?? "/next";
  nav.search = new URLSearchParams(props.search ?? "");

  return render(
    <StrictMode>
      <EngagementScope
        unparsedCount={props.unparsedCount === undefined ? 3 : props.unparsedCount}
        roster={props.roster ?? ROSTER}
      />
    </StrictMode>,
  );
}

function picker(container: HTMLElement): HTMLElement | null {
  return container.querySelector('[data-verify-unit="engagement-picker"]');
}

beforeEach(() => {
  nav.pathname = "/next";
  nav.search = new URLSearchParams();
});

afterEach(cleanup);

/* ---------------------------------------------------------------------- */

describe("FR-96b — one engagement picker, in the shell", () => {
  it("FR-96b offers every active engagement on a screen that honours the filter", () => {
    const { container } = mount({ pathname: "/next" });

    const control = picker(container);
    expect(control).not.toBeNull();
    expect(control).toHaveAttribute("data-verify-roster", "ok");
    expect(control).toHaveAttribute("data-verify-options", "2");

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    const values = [...select.options].map((one) => one.value);
    // The unfiltered option is first, because FR-96 keeps the cross-engagement
    // view as the default rather than as an escape from a default scope.
    expect(values).toEqual(["", "acme-rebuild", "delivery-ledger"]);
    expect(select.value).toBe("");
  });

  it("FR-96b renders on every one of the eleven screens the filter reaches", () => {
    for (const path of [
      "/next",
      "/committed",
      "/broken",
      "/bottleneck",
      "/blocked",
      "/untested",
      "/work-items",
      "/questions",
      "/waits",
      "/runs",
      "/registry",
    ]) {
      const { container, unmount } = mount({ pathname: path });
      expect(picker(container), `expected a picker on ${path}`).not.toBeNull();
      unmount();
    }
  });

  it("FR-96b offers no filter on a screen that does not honour one", () => {
    // A picker on a detail view would let Erik set a scope that narrows
    // nothing. CR-005 §3.3 point 1 keeps `[id]` views out of the filter.
    for (const path of [
      "/work-items/abc-123",
      "/registry/acme-rebuild",
      "/registry/new",
      "/settings/tokens",
      "/",
    ]) {
      const { container, unmount } = mount({ pathname: path });
      expect(picker(container), `expected no picker on ${path}`).toBeNull();
      unmount();
    }
  });

  it("FR-96b posts back to the screen it is on, so the filter is a link", () => {
    const { container } = mount({ pathname: "/broken" });

    expect(picker(container)?.getAttribute("action")).toBe("/broken");
    expect(picker(container)?.getAttribute("method")).toBe("get");
  });

  it("FR-96b shows the engagement the URL already selected", () => {
    const { container } = mount({
      pathname: "/next",
      search: "engagement=acme-rebuild",
    });

    expect(picker(container)).toHaveAttribute(
      "data-verify-filter",
      "acme-rebuild",
    );
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe(
      "acme-rebuild",
    );
  });

  it("FR-96b carries every other filter across, so changing engagement narrows nothing else", () => {
    const { container } = mount({
      pathname: "/broken",
      search: "engagement=acme-rebuild&severity=critical&limit=100",
    });

    const hidden = [
      ...(picker(container)?.querySelectorAll<HTMLInputElement>(
        'input[type="hidden"]',
      ) ?? []),
    ].map((input) => [input.name, input.value]);

    // A GET form replaces the whole query string with its own fields. Anything
    // missing here is silently dropped -- and dropping `severity=critical`
    // would show every severity under a heading that claims to be filtered.
    expect(hidden).toEqual([
      ["severity", "critical"],
      ["limit", "100"],
    ]);
    // The engagement itself is the select's job, never a hidden field, or the
    // form would submit two values for one parameter.
    expect(hidden.map(([name]) => name)).not.toContain("engagement");
  });

  it("FR-96b returns to page one when the engagement changes", () => {
    const { container } = mount({
      pathname: "/work-items",
      search: "page=7&sort=started_at",
    });

    const names = [
      ...(picker(container)?.querySelectorAll<HTMLInputElement>(
        'input[type="hidden"]',
      ) ?? []),
    ].map((input) => input.name);

    expect(names).toContain("sort");
    // Page seven of a list that just got shorter renders an empty page that
    // reads exactly like an empty ledger.
    expect(names).not.toContain("page");
  });
});

/* ---------------------------------------------------------------------- */

describe("FR-96b — a roster that is empty and one that was not read", () => {
  it("FR-96b renders no picker when there is genuinely nothing to filter by", () => {
    const { container } = mount({
      roster: { status: "ok", options: [] },
    });

    // A dropdown whose only entry is "every engagement" cannot change anything.
    expect(picker(container)).toBeNull();
  });

  it("FR-96b offers no picker to a caller who may not read the ledger", () => {
    /*
     * Found by serving the build and looking at it, not by reasoning about it.
     * An anonymous request to any of the eleven screens rendered a dropdown
     * whose only entry was "every engagement", sitting above the operator gate
     * panel — a control offering a choice to someone who may not read a row.
     * `gated` is the state that was split out of `unavailable` to fix it.
     */
    const { container } = mount({ roster: { status: "gated" } });
    expect(picker(container)).toBeNull();

    // The count is still stated, because FR-58 is about every surface and this
    // is one. It reads "unavailable" for an anonymous caller, never 0.
    expect(screen.getByRole("status")).toBeTruthy();
  });

  it("FR-96b still renders a picker when the engagement list could NOT be read", () => {
    const { container } = mount({
      search: "engagement=acme-rebuild",
      roster: { status: "unavailable" },
    });

    const control = picker(container);
    // An unread roster is not the same fact as an empty one, and it must not
    // strand a filter that is already in the URL with no way to clear it.
    expect(control).not.toBeNull();
    expect(control).toHaveAttribute("data-verify-roster", "unavailable");
    expect(control).toHaveAttribute("data-verify-options", "0");

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect([...select.options].map((one) => one.value)).toContain("");
    expect(select.value).toBe("acme-rebuild");
  });

  it("FR-96c keeps a slug the active list does not carry selected rather than snapping back", () => {
    // Two ways this happens: the engagement is archived-but-not-purged, whose
    // permalink CR-005 §3.3 point 2 says must still filter; or the slug matches
    // nothing, which FR-96c renders as an explicit no-rows state below. In both
    // cases a control that quietly reset to "every engagement" would make the
    // chrome and the screen disagree about what is being shown.
    const { container } = mount({ search: "engagement=archived-thing" });

    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("archived-thing");
    expect(picker(container)).toHaveAttribute(
      "data-verify-filter",
      "archived-thing",
    );
  });
});

/* ---------------------------------------------------------------------- */

describe("FR-96a — the unparsed badge states its scope", () => {
  it("FR-96a labels the count ledger-wide when an engagement filter is active", () => {
    mount({ search: "engagement=acme-rebuild", unparsedCount: 3 });
    const badge = screen.getByRole("status");

    expect(badge).toHaveTextContent("3 unparsed (whole ledger)");
    expect(badge).toHaveAttribute("data-verify-scope", "whole-ledger");
    // FR-58's number is unchanged. The label states the scope; it never narrows
    // it. M2.8 logged the failure this prevents: a run's own unparsed count
    // disagreeing with an unlabelled global badge.
    expect(badge).toHaveAttribute("data-verify-count", "3");
  });

  it("FR-96a labels a ZERO count too, which is the reading most easily got wrong", () => {
    mount({ search: "engagement=acme-rebuild", unparsedCount: 0 });
    const badge = screen.getByRole("status");

    // "0 unparsed" over a filtered list reads as "this engagement is clean".
    expect(badge).toHaveTextContent("0 unparsed (whole ledger)");
    expect(badge).toHaveAttribute("data-verify-scope", "whole-ledger");
  });

  it("FR-96a adds no scope label when nothing is filtered", () => {
    mount({ unparsedCount: 3 });
    const badge = screen.getByRole("status");

    expect(badge).toHaveTextContent("3 unparsed");
    expect(badge.textContent).not.toContain("whole ledger");
    expect(badge).toHaveAttribute("data-verify-scope", "none");
  });

  it("FR-96a adds no scope label where the screen does not honour the filter", () => {
    // A stray `?engagement=` on a detail view narrows nothing, so announcing a
    // scope there would state something that is not in force.
    mount({ pathname: "/work-items/abc-123", search: "engagement=acme-rebuild" });
    const badge = screen.getByRole("status");

    expect(badge).toHaveAttribute("data-verify-scope", "none");
    expect(badge.textContent).not.toContain("whole ledger");
  });

  it("FR-58 an unknown count still says unavailable under a filter, never 0", () => {
    // B12. The one claim this product must never make without checking.
    mount({ search: "engagement=acme-rebuild", unparsedCount: null });
    const badge = screen.getByRole("status");

    expect(badge).toHaveAttribute("data-verify-state", "unknown");
    expect(badge).not.toHaveAttribute("data-verify-count");
    expect(badge.textContent).not.toMatch(/\b0\b/);
    expect(badge).toHaveTextContent("unavailable");
    // No scope note: there is no number here to be misread as a scoped one, and
    // "unavailable (whole ledger)" would spend width saying nothing.
    expect(badge).toHaveAttribute("data-verify-scope", "none");
  });

  it("FR-96b mounts exactly one picker and exactly one count", () => {
    const { container } = mount({ search: "engagement=acme-rebuild" });

    expect(
      container.querySelectorAll('[data-verify-unit="engagement-picker"]'),
    ).toHaveLength(1);
    expect(
      container.querySelectorAll('[data-verify-unit="unparsed-count"]'),
    ).toHaveLength(1);
  });
});

/* ---------------------------------------------------------------------- */

describe("FR-96 — the URL is the entire state", () => {
  it("FR-96 persists the filter nowhere: no cookie, no storage", () => {
    // CR-005 §3.3 point 3, and it is a hard constraint rather than a
    // preference: a filter that persisted invisibly across navigation would
    // mean two operators on the same URL see different data.
    const cookieBefore = document.cookie;
    localStorage.clear();
    sessionStorage.clear();

    mount({ search: "engagement=acme-rebuild" });

    expect(document.cookie).toBe(cookieBefore);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("FR-96 clears to the bare path rather than to a trailing empty parameter", () => {
    const { container } = mount({
      pathname: "/work-items",
      search: "engagement=acme-rebuild&sort=started_at",
    });

    const form = picker(container) as HTMLFormElement;
    const select = screen.getByRole("combobox") as HTMLSelectElement;

    // Choosing "every engagement" and submitting the way a person does.
    select.value = "";
    // `fireEvent.click` on the submit button, not `requestSubmit()`: jsdom does
    // not implement the latter, and it logs "Not implemented" while leaving the
    // submit event undispatched -- so the assertion below would pass against a
    // handler that never ran. A click is also what a person does.
    fireEvent.click(
      screen.getByRole("button", { name: /apply the engagement filter/i }),
    );

    // The select's name is dropped, so the browser sends no `engagement` field
    // and the cleared view is `/work-items?sort=started_at` rather than
    // `...&engagement=`. An empty value is handled correctly by every screen
    // parser, but the six ENDPOINTS refuse one, so a pasted screen URL would
    // 400 on a filter nobody set.
    expect(select.getAttribute("name")).toBeNull();
    // The other filter is still on its way across.
    expect(
      form.querySelector('input[type="hidden"][name="sort"]'),
    ).not.toBeNull();
  });

  it("FR-96 keeps the field named whenever an engagement IS chosen", () => {
    mount({ search: "engagement=acme-rebuild" });

    // `fireEvent.click` on the submit button, not `requestSubmit()`: jsdom does
    // not implement the latter, and it logs "Not implemented" while leaving the
    // submit event undispatched -- so the assertion below would pass against a
    // handler that never ran. A click is also what a person does.
    fireEvent.click(
      screen.getByRole("button", { name: /apply the engagement filter/i }),
    );

    expect(
      (screen.getByRole("combobox") as HTMLSelectElement).getAttribute("name"),
    ).toBe("engagement");
  });

  it("FR-96 names the control for a screen reader without spending header width", () => {
    mount({});
    const select = screen.getByRole("combobox");

    // The accessible name carries the whole sentence, including the fact that
    // the badge beside it is NOT narrowed by this control.
    expect(select.getAttribute("aria-label")).toMatch(/engagement/i);
    expect(select.getAttribute("aria-label")).toMatch(/ledger-wide/i);
    expect(
      screen.getByRole("button", { name: /apply the engagement filter/i }),
    ).toBeTruthy();
  });
});
