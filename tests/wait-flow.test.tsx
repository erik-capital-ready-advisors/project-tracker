import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DeclareWaitDialog } from "@/app/waits/_components/declare-wait-dialog";
import { ResolveWaitButton } from "@/app/waits/_components/resolve-wait-button";

/**
 * FR-32's declaration and FR-36's resolution, exercised through the components
 * Erik actually clicks.
 *
 * The server actions arrive as props, so the whole interaction runs here with no
 * database, no operator session and no clock of its own. What is asserted is the
 * boundary: what payload reaches the action, and what the operator is told when
 * the action refuses.
 *
 * Nothing here re-tests `parseWaitDeclaration`. It is the only validator, it has
 * its own tests, and a second set of expectations about the same rules on this
 * side of the boundary would be the drift the single-validator decision exists
 * to prevent.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

const ENGAGEMENTS = [
  { slug: "acme", clientName: "Acme Ltd" },
  { slug: "globex", clientName: "Globex" },
];

function ok() {
  return async () => ({ ok: true as const, data: {} });
}

function refused(message: string) {
  return async () => ({ ok: false as const, message });
}

describe("FR-32 — declaring a wait", () => {
  it("sends every field the requirement names", async () => {
    // Typed through the payload so the assertion below can read call[0][0].
    const onDeclare = vi.fn(async (_payload: unknown) => ({
      ok: true as const,
      data: {},
    }));
    render(
      <DeclareWaitDialog
        engagements={ENGAGEMENTS}
        defaultStartedOn="2026-08-19"
        onDeclare={onDeclare}
      />,
    );

    fireEvent.click(screen.getByText("Declare a wait"));

    fireEvent.change(screen.getByLabelText("Engagement"), {
      target: { value: "globex" },
    });
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "app store review" },
    });
    fireEvent.change(screen.getByLabelText("Owner"), {
      target: { value: "Apple review" },
    });
    fireEvent.change(screen.getByLabelText("Owner type"), {
      target: { value: "vendor" },
    });
    fireEvent.change(screen.getByLabelText("Expected by"), {
      target: { value: "2026-08-26" },
    });
    fireEvent.change(screen.getByLabelText("Blocks"), {
      target: { value: "u4, i7  u9" },
    });
    fireEvent.change(screen.getByLabelText("Reason"), {
      target: { value: "submitted, waiting on review" },
    });

    fireEvent.click(screen.getByText("Declare wait"));

    await waitFor(() => expect(onDeclare).toHaveBeenCalledTimes(1));
    expect(onDeclare.mock.calls[0][0]).toEqual({
      engagement: "globex",
      label: "app store review",
      owner: "Apple review",
      ownerType: "vendor",
      reason: "submitted, waiting on review",
      startedAt: "2026-08-19",
      expectedBy: "2026-08-26",
      resolutionMethod: "manual",
      probeTarget: null,
      // FR-32's "the work items it blocks", accepted as commas or whitespace so
      // a column pasted out of a manifest works as typed.
      blocks: ["u4", "i7", "u9"],
    });
  });

  it("defaults the resolution method to `manual`, the honest value", () => {
    // FR-35: "a named probe for Phase 2 automation, or `manual` where nobody can
    // check it programmatically." Defaulting to `probe` would put "this one
    // checks itself" on every wait when nothing does.
    render(
      <DeclareWaitDialog
        engagements={ENGAGEMENTS}
        defaultStartedOn="2026-08-19"
        onDeclare={ok()}
      />,
    );
    fireEvent.click(screen.getByText("Declare a wait"));

    expect(
      (screen.getByLabelText("Resolution method") as HTMLSelectElement).value,
    ).toBe("manual");
    // And the probe field is inert until it is relevant.
    expect(
      (screen.getByLabelText("Probe target") as HTMLInputElement).disabled,
    ).toBe(true);
  });

  it("enables and requires the probe target once the method is a probe", () => {
    render(
      <DeclareWaitDialog
        engagements={ENGAGEMENTS}
        defaultStartedOn="2026-08-19"
        onDeclare={ok()}
      />,
    );
    fireEvent.click(screen.getByText("Declare a wait"));
    fireEvent.change(screen.getByLabelText("Resolution method"), {
      target: { value: "probe" },
    });

    const probe = screen.getByLabelText("Probe target") as HTMLInputElement;
    expect(probe.disabled).toBe(false);
    expect(probe.required).toBe(true);
  });

  it("shows the validator's own sentence when the server refuses", async () => {
    render(
      <DeclareWaitDialog
        engagements={ENGAGEMENTS}
        defaultStartedOn="2026-08-19"
        onDeclare={refused(
          "The external wait was refused: expectedBy: is before startedAt",
        )}
      />,
    );

    fireEvent.click(screen.getByText("Declare a wait"));
    fireEvent.change(screen.getByLabelText("Engagement"), {
      target: { value: "acme" },
    });
    fireEvent.change(screen.getByLabelText("Label"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "y" } });
    fireEvent.click(screen.getByText("Declare wait"));

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='declare-wait-error']")
          ?.textContent,
      ).toContain("expectedBy: is before startedAt"),
    );
    // A refused declaration leaves the form open, with what was typed still in
    // it. Closing it would make the operator retype a form the server rejected.
    expect(
      document.querySelector("[data-verify-unit='declare-wait-form']"),
    ).not.toBeNull();
  });
});

describe("FR-36 — resolving a wait", () => {
  it("does not resolve on the first click", () => {
    const onResolve = vi.fn(ok());
    render(
      <ResolveWaitButton
        waitId="w1"
        label="app store review"
        blockedCount={3}
        onResolve={onResolve}
      />,
    );

    fireEvent.click(screen.getByText("Resolve"));
    // Resolution is not reversible from this screen -- a second resolution is
    // refused outright, because it would overwrite who resolved it the first
    // time. So the confirmation step is the control, not a nicety.
    expect(onResolve).not.toHaveBeenCalled();
  });

  it("states how many work items the resolution releases", () => {
    render(
      <ResolveWaitButton
        waitId="w1"
        label="app store review"
        blockedCount={3}
        onResolve={ok()}
      />,
    );
    fireEvent.click(screen.getByText("Resolve"));
    expect(document.body.textContent).toContain("3 work items");
  });

  it("records nobody by default, letting the server fill in the operator", async () => {
    const onResolve = vi.fn(ok());
    render(
      <ResolveWaitButton
        waitId="w1"
        label="app store review"
        blockedCount={0}
        onResolve={onResolve}
      />,
    );

    fireEvent.click(screen.getByText("Resolve"));
    fireEvent.click(
      document.querySelector(
        "[data-verify-unit='resolve-wait-confirm']",
      ) as HTMLElement,
    );

    await waitFor(() => expect(onResolve).toHaveBeenCalledWith("w1", ""));
  });

  it("passes an explicit resolver through when one is typed", async () => {
    const onResolve = vi.fn(ok());
    render(
      <ResolveWaitButton
        waitId="w1"
        label="app store review"
        blockedCount={1}
        onResolve={onResolve}
      />,
    );

    fireEvent.click(screen.getByText("Resolve"));
    fireEvent.change(screen.getByLabelText("Resolved by"), {
      target: { value: "Apple review" },
    });
    fireEvent.click(
      document.querySelector(
        "[data-verify-unit='resolve-wait-confirm']",
      ) as HTMLElement,
    );

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledWith("w1", "Apple review"),
    );
  });

  it("shows the refusal when the wait was already resolved", async () => {
    render(
      <ResolveWaitButton
        waitId="w1"
        label="app store review"
        blockedCount={1}
        onResolve={refused(
          "That wait is already resolved. Recording a second resolution would overwrite who resolved it the first time.",
        )}
      />,
    );

    fireEvent.click(screen.getByText("Resolve"));
    fireEvent.click(
      document.querySelector(
        "[data-verify-unit='resolve-wait-confirm']",
      ) as HTMLElement,
    );

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='resolve-wait-error']")
          ?.textContent,
      ).toContain("already resolved"),
    );
  });
});
