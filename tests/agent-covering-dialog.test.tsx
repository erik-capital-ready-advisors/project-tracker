import { StrictMode } from "react";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentCoveringDialog } from "@/app/stacks/_components/agent-covering-dialog";

/**
 * FR-109 — which fleet agent covers a stack is set by the operator, exercised
 * through the control Erik actually clicks.
 *
 * The server action arrives as a prop, so the whole interaction runs here with
 * no database, no operator session and no `'use server'` boundary. What is
 * asserted is that boundary: **what payload reaches the action**, and **what the
 * operator is told when it refuses**.
 *
 * ## Driven by clicking the control, never by `requestSubmit()`
 *
 * `HTMLFormElement.prototype.requestSubmit` is unimplemented in jsdom, so a test
 * that submits through it can pass while the handler never ran — inert, and
 * indistinguishable from a passing test (measured on run `d4000f`). This
 * component is deliberately not a `<form>`: it saves on a button click, which is
 * the path a person takes and the one jsdom actually implements.
 *
 * ## Mounted under StrictMode
 *
 * `next.config.ts` sets `reactStrictMode: true`. This component holds four
 * pieces of state and a transition; mounting bare would test it in a mode the
 * product never runs it in.
 *
 * ## What this file does NOT re-test
 *
 * `normaliseAgentCovering`. It is the only validator, `stacks.test.ts` owns its
 * rules, and a second set of expectations about trimming and length on this side
 * of the boundary is exactly the drift a single validator exists to prevent.
 * What is asserted here is that the raw field value is handed over **unaltered**,
 * so the validator is the only thing that shapes it.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

function ok() {
  return vi.fn(async () => ({ ok: true as const, data: {} }));
}

function refused(message: string) {
  return vi.fn(async () => ({ ok: false as const, message }));
}

function mount(props: {
  current?: string | null;
  onSave: ReturnType<typeof ok> | ReturnType<typeof refused>;
}) {
  return render(
    <StrictMode>
      <AgentCoveringDialog
        stackId="stack-nextjs-supabase"
        stackName="nextjs-supabase"
        current={props.current ?? null}
        onSave={props.onSave}
      />
    </StrictMode>,
  );
}

function open() {
  fireEvent.click(screen.getByRole("button", { name: /the agent covering/ }));
}

function field() {
  return screen.getByLabelText("Agent covering this stack");
}

describe("FR-109 — recording which agent covers a stack", () => {
  it("hands the action the stack id and the value exactly as typed", async () => {
    const onSave = ok();
    mount({ onSave });
    open();

    fireEvent.change(field(), { target: { value: "api-integrator" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith("stack-nextjs-supabase", "api-integrator");
  });

  it("passes an unrecognised name through untouched, because FR-109 forbids inference", async () => {
    // The fleet's agent roster lives in `~/.claude/agents/`, outside this
    // product and unreadable from here. Nothing may check the value against a
    // list, so a name no agent answers to is stored as typed.
    const onSave = ok();
    mount({ onSave });
    open();

    fireEvent.change(field(), { target: { value: "kotlin-android-specialist" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      "stack-nextjs-supabase",
      "kotlin-android-specialist",
    );
  });

  it("clears the value with an empty field, which is a real operation", async () => {
    const onSave = ok();
    mount({ current: "api-integrator", onSave });
    open();

    expect(field()).toHaveValue("api-integrator");
    fireEvent.change(field(), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    // `''` rather than a second concept. `normaliseAgentCovering` turns it into
    // `null`; this side must not decide that for it.
    expect(onSave).toHaveBeenCalledWith("stack-nextjs-supabase", "");
  });

  it("adds no length attribute that would silently truncate a paste", () => {
    mount({ onSave: ok() });
    open();

    // The 96-character ceiling is enforced in `normaliseAgentCovering` and
    // returned as a sentence. A name stored short and wrong is worse than a name
    // refused with a reason.
    expect(field()).not.toHaveAttribute("maxLength");
  });

  it("does not close on a refusal, and shows the reason the server wrote", async () => {
    const onSave = refused("An agent name is a single line. Remove the line break and try again.");
    mount({ onSave });
    open();

    fireEvent.change(field(), { target: { value: "ui\ndesigner" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("An agent name is a single line");
    // Still open, so the operator can fix what they typed rather than retype it.
    expect(field()).toBeInTheDocument();
  });

  it("clears a previous refusal when the dialog is reopened", async () => {
    const onSave = refused("No stack has that id. Reload the register and try again — nothing was saved.");
    mount({ onSave });
    open();

    fireEvent.change(field(), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Wait on the dialog's own content unmounting, not on the alert inside it.
    // Radix tears the content down asynchronously, so asserting the alert is
    // gone races that teardown — green alone and red under a loaded suite,
    // which is the worst kind of test. What is being asserted is the state on
    // REOPEN; the close is a step, not the claim.
    await waitFor(() =>
      expect(
        screen.queryByLabelText("Agent covering this stack"),
      ).not.toBeInTheDocument(),
    );

    open();
    await waitFor(() => expect(field()).toBeInTheDocument());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // And the abandoned edit is gone with it.
    expect(field()).toHaveValue("");
  });

  it("closes on success", async () => {
    const onSave = ok();
    mount({ onSave });
    open();

    fireEvent.change(field(), { target: { value: "api-integrator" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.queryByLabelText("Agent covering this stack")).not.toBeInTheDocument(),
    );
  });
});

describe("FR-109 — what the control says, and what it does not", () => {
  it("names the stack in the trigger's accessible name, not only in the row", () => {
    // A table of identical "Set agent" labels reaches a screen-reader user as
    // one repeated, meaningless control.
    mount({ onSave: ok() });

    expect(
      screen.getByRole("button", { name: "Set the agent covering nextjs-supabase" }),
    ).toBeInTheDocument();
  });

  it("reads Change once an agent is named", () => {
    mount({ current: "api-integrator", onSave: ok() });

    expect(
      screen.getByRole("button", { name: "Change the agent covering nextjs-supabase" }),
    ).toBeInTheDocument();
  });

  it("gives the dialog an accessible name from a title inside its content (B46)", () => {
    mount({ onSave: ok() });
    open();

    expect(
      screen.getByRole("dialog", { name: /Which agent covers this stack/ }),
    ).toBeInTheDocument();
  });

  it("wires the field's hint through aria-describedby", () => {
    mount({ onSave: ok() });
    open();

    const described = field().getAttribute("aria-describedby");
    expect(described).toBe("agent-covering-stack-nextjs-supabase-hint");
    expect(document.getElementById(described!)?.textContent).toContain(
      "Leave it empty to clear it",
    );
  });

  it("says the value is recorded and not detected", () => {
    mount({ onSave: ok() });
    open();

    expect(
      screen.getByText(/recorded, not detected/),
    ).toBeInTheDocument();
  });

  it("puts the agent name into no data-verify attribute", () => {
    mount({ current: "api-integrator", onSave: ok() });
    open();

    for (const element of Array.from(document.querySelectorAll<HTMLElement>("*"))) {
      for (const name of element.getAttributeNames()) {
        if (!name.startsWith("data-verify-")) continue;
        expect(element.getAttribute(name)).not.toContain("api-integrator");
      }
    }
  });

  it("uses the word `coverage` nowhere (Q26)", () => {
    mount({ current: "api-integrator", onSave: ok() });
    open();

    expect(document.body.innerHTML.toLowerCase()).not.toContain("coverage");
    // CONTROL: the sweep can see this document.
    expect(document.body.innerHTML.toLowerCase()).toContain("covering");
  });
});
