import { cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppShell } from "@/components/app-shell";

/**
 * B43 -- until this file existed, deleting `<SignOutButton />` from `AppShell`
 * left the entire suite green. B40's control was written by an abandoned agent
 * during run 29b583's worktree-isolation failure and verified by an instance
 * that never wrote it, at a moment when no agent could load a signed-in screen
 * (§7c, revoked operator session). So the mount had neither a test nor an
 * observation behind it. This is the test.
 *
 * It asserts the control is inside the `<header>` specifically, not merely
 * somewhere in the tree. That is the assertion that bites: the sidebar rail is
 * `hidden md:block`, so a control moved there renders in jsdom and in a desktop
 * browser while being unreachable on mobile -- exactly the regression a
 * presence-only check would pass.
 *
 * What this still does NOT prove: that a real session is destroyed. That needs
 * an aal2 browser session, which run 29b583 did not hold. See
 * `.fleet/report-29b583.md` for the NOT VERIFIED note.
 */

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: nav.replace,
    refresh: nav.refresh,
    push: vi.fn(),
  }),
  usePathname: () => "/blocked",
}));

const supabase = vi.hoisted(() => ({ signOut: vi.fn(), createClient: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabase.createClient,
}));

// The shell's other children are mocked because they are not what this file is
// about and each drags in router or theme context. `SignOutButton` is
// deliberately NOT mocked -- mocking the component under assertion would make
// the test pass against an empty shell.
vi.mock("@/components/command-palette", () => ({
  CommandPalette: () => null,
  CommandPaletteTrigger: () => <button type="button">Search</button>,
}));
vi.mock("@/components/main-nav", () => ({ MainNav: () => <nav /> }));
vi.mock("@/components/mobile-nav", () => ({ MobileNav: () => <nav /> }));
vi.mock("@/components/theme-toggle", () => ({
  ThemeToggle: () => <button type="button">Theme</button>,
}));

beforeEach(() => {
  nav.replace.mockClear();
  nav.refresh.mockClear();
  supabase.signOut.mockReset().mockResolvedValue({ error: null });
  supabase.createClient
    .mockReset()
    .mockReturnValue({ auth: { signOut: supabase.signOut } });
});

afterEach(cleanup);

function renderShell() {
  return render(
    <StrictMode>
      <AppShell unparsedCount={null}>
        <p>screen body</p>
      </AppShell>
    </StrictMode>,
  );
}

describe("AppShell mounts the sign-out control (B40, B43)", () => {
  it("renders a sign-out control", () => {
    const { getByRole } = renderShell();

    expect(getByRole("button", { name: "Sign out" })).toBeTruthy();
  });

  it("mounts it in the header, so it reaches every breakpoint", () => {
    const { container } = renderShell();

    // The header is breakpoint-independent; the sidebar rail is `hidden md:block`.
    const inHeader = container.querySelector(
      'header [data-verify-unit="sign-out"]',
    );
    expect(inHeader).not.toBeNull();

    // And nowhere inside the desktop-only rail, which would not reach mobile.
    const inDesktopRail = container.querySelector(
      'aside [data-verify-unit="sign-out"]',
    );
    expect(inDesktopRail).toBeNull();
  });

  it("mounts exactly one, so MobileNav never grows a second copy", () => {
    const { container } = renderShell();

    expect(
      container.querySelectorAll('[data-verify-unit="sign-out"]'),
    ).toHaveLength(1);
  });

  it("exposes the idle state contract qa-reviewer reads", () => {
    const { getByRole } = renderShell();
    const button = getByRole("button", { name: "Sign out" });

    expect(button.getAttribute("data-verify-status")).toBe("idle");
  });
});
