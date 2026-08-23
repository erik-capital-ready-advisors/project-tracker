import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SignOutButton } from "@/components/sign-out-button";

/**
 * B40 -- there was no way to end a session anywhere in the signed-in app.
 * These tests prove the control renders, is reachable, and calls the right
 * function with the right arguments.
 *
 * They do NOT and cannot prove a real session is destroyed: that requires an
 * aal2 browser session, which this run does not hold (§7c). See the u4 report
 * for the explicit NOT VERIFIED note on end-to-end behaviour.
 */

const nav = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: nav.replace, refresh: nav.refresh, push: vi.fn() }),
}));

const supabase = vi.hoisted(() => ({
  signOut: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: supabase.createClient,
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

describe("SignOutButton (B40)", () => {
  it("renders reachable at every breakpoint, with an idle state contract", () => {
    const { getByRole } = render(<SignOutButton />);
    const button = getByRole("button", { name: "Sign out" });

    expect(button).toHaveAttribute("data-verify-unit", "sign-out");
    expect(button).toHaveAttribute("data-verify-status", "idle");
    // No responsive `hidden` / `md:*` class -- unlike the sidebar rail, this
    // control must not be desktop-only.
    expect(button.className).not.toMatch(/\bhidden\b/);
  });

  it("calls the browser client's signOut and lands on /sign-in", async () => {
    const { getByRole } = render(<SignOutButton />);
    fireEvent.click(getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(supabase.signOut).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/sign-in"));
    expect(nav.refresh).toHaveBeenCalled();
  });

  it("disables itself while the call is pending, so a double-click cannot fire twice", async () => {
    let resolve!: (value: { error: null }) => void;
    supabase.signOut.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    const { getByRole } = render(<SignOutButton />);
    const button = getByRole("button", { name: "Sign out" });
    fireEvent.click(button);

    await waitFor(() => expect(button).toHaveAttribute("data-verify-status", "pending"));
    expect(button).toBeDisabled();

    resolve({ error: null });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/sign-in"));
  });

  it("surfaces a GoTrue error without navigating away", async () => {
    supabase.signOut.mockResolvedValue({ error: { message: "network error" } });

    const { getByRole } = render(<SignOutButton />);
    fireEvent.click(getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(getByRole("button", { name: "Sign out" })).toHaveAttribute(
        "data-verify-status",
        "error",
      ),
    );
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("does nothing destructive when Supabase is not configured", async () => {
    supabase.createClient.mockImplementationOnce(() => {
      throw new Error("not configured");
    });

    const { getByRole } = render(<SignOutButton />);
    fireEvent.click(getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(getByRole("button", { name: "Sign out" })).toHaveAttribute(
        "data-verify-status",
        "idle",
      ),
    );
    expect(supabase.signOut).not.toHaveBeenCalled();
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it("never writes session or token content into a data-verify-* attribute", async () => {
    const { getByRole, container } = render(<SignOutButton />);
    fireEvent.click(getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(supabase.signOut).toHaveBeenCalled());

    for (const element of Array.from(container.querySelectorAll("*"))) {
      for (const attribute of Array.from(element.attributes)) {
        if (!attribute.name.startsWith("data-verify-")) continue;
        expect(["idle", "pending", "error", "sign-out"]).toContain(attribute.value);
      }
    }
  });
});
