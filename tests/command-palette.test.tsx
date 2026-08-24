import { cleanup, render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CommandPalette } from "@/components/command-palette";
import { ANSWER_ROUTES, OPERATOR_ROUTES } from "@/lib/nav";

/**
 * B46 -- the command palette crashed the page on every route into it, and the
 * whole suite stayed green.
 *
 * `CommandPalette` renders `CommandInput`, `CommandList`, `CommandGroup` and
 * `CommandItem`, which are all cmdk primitives and all require cmdk's `Command`
 * root for their store. `CommandDialog` passed `{children}` straight into
 * `DialogContent` and **never rendered `Command` at all**, so `useStore()`
 * returned `undefined` and the first property read off it -- `.subscribe` --
 * threw. React unmounted the tree and the operator got "This page couldn't
 * load".
 *
 * Nothing could catch it: no test mounted this component, and
 * `tests/app-shell.test.tsx` deliberately mocks it to `() => null` so that the
 * shell's own assertions stay about the shell. A mock is the correct call
 * there and it is also the reason this went to production.
 *
 * These tests assert the palette **renders its routes**, not merely that it
 * did not throw. A "does not crash" assertion would pass against a dialog that
 * opened empty, which is the other way this component can be broken.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/blocked",
}));

/**
 * jsdom implements no `ResizeObserver` and cmdk constructs one. This is an
 * environment gap, not a product defect -- kept local to this file rather than
 * added to `vitest.setup.ts`, so it cannot quietly change how every other test
 * in the suite mounts.
 */
if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = function scrollIntoView() {};
}

afterEach(cleanup);

/**
 * Mounted under `<StrictMode>` because `next.config.ts` sets
 * `reactStrictMode: true`, and this component registers two `useEffect`
 * listeners. A bare `render()` cannot reproduce the double-invoke.
 */
function mountPalette() {
  return render(
    <StrictMode>
      <CommandPalette />
    </StrictMode>,
  );
}

function pressKey(init: KeyboardEventInit) {
  act(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true }));
  });
}

describe("CommandPalette (B46)", () => {
  it("opens on Cmd+K and renders every answer route", () => {
    mountPalette();
    pressKey({ key: "k", metaKey: true });

    // The store crash showed up here: cmdk primitives without their root.
    for (const item of ANSWER_ROUTES) {
      expect(
        screen.getByText(item.label),
        `Cmd+K opened the palette but "${item.label}" did not render`,
      ).toBeInTheDocument();
    }
  });

  it("opens on Ctrl+K and renders every operator route", () => {
    mountPalette();
    pressKey({ key: "k", ctrlKey: true });

    for (const item of OPERATOR_ROUTES) {
      expect(
        screen.getByText(item.label),
        `Ctrl+K opened the palette but "${item.label}" did not render`,
      ).toBeInTheDocument();
    }
  });

  it("opens from the header trigger's event, which is the third route in", () => {
    mountPalette();
    act(() => {
      window.dispatchEvent(new Event("delivery-ledger:open-palette"));
    });

    expect(screen.getByPlaceholderText("Jump to...")).toBeInTheDocument();
    expect(screen.getByText(ANSWER_ROUTES[0].label)).toBeInTheDocument();
  });

  it("gives the dialog an accessible name from a title inside its content", () => {
    // The quieter half of B46. Radix wires `aria-labelledby` from a
    // `DialogTitle` rendered inside `DialogContent`; this one sat outside it,
    // as a sibling, so the dialog reached a screen reader unnamed.
    mountPalette();
    pressKey({ key: "k", metaKey: true });

    expect(screen.getByRole("dialog", { name: "Command palette" })).toBeInTheDocument();
  });

  it("renders nothing until it is opened", () => {
    mountPalette();
    expect(screen.queryByPlaceholderText("Jump to...")).not.toBeInTheDocument();
  });
});
