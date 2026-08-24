import { StrictMode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlannedWorkForm } from "@/app/work-items/new/_components/planned-work-form";

/**
 * FR-88's hand-entry form.
 *
 * ## Two repo rules are load-bearing in this file
 *
 * **Submission is exercised by clicking the submit control**, never by
 * `requestSubmit()`. jsdom does not implement that method — `pnpm test` prints
 * the "Not implemented" line on this branch today — and u1 measured in Phase 1
 * that a submit test can pass against a handler that never ran because of it.
 *
 * **Everything is mounted under `<StrictMode>`**, because `next.config.ts` sets
 * `reactStrictMode: true` and a bare `render()` cannot reproduce the
 * double-invocation the real app runs under.
 *
 * ## Nothing here mocks the component under test
 *
 * The router is mocked because there is no router in jsdom. The action is a
 * plain async function because that is the seam the component was built with.
 * The form itself is the real one.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

const ENGAGEMENTS = [
  { slug: "acme", clientName: "Acme Ltd" },
  { slug: "globex", clientName: "Globex" },
];

/**
 * Deliberately NOT the field's placeholder text. The placeholder is static UI
 * copy and appears in the markup by design; reusing it here would make the §7a
 * assertion below fail for a reason that has nothing to do with what Erik
 * typed — which it did, the first time this file was run.
 */
const DESCRIPTION = "Reconcile Northwind's invoice export against ledger totals";

function mount(
  onCreate: Parameters<typeof PlannedWorkForm>[0]["onCreate"],
  engagements = ENGAGEMENTS,
) {
  return render(
    <StrictMode>
      <PlannedWorkForm engagements={engagements} onCreate={onCreate} />
    </StrictMode>,
  );
}

function chooseEngagement(slug: string) {
  fireEvent.change(screen.getByLabelText(/^Engagement/), {
    target: { value: slug },
  });
}

function type(label: RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function submit() {
  fireEvent.click(screen.getByText("Record planned work"));
}

function statusAttribute(): string | null {
  return document
    .querySelector("[data-verify-unit='planned-work-form']")
    ?.getAttribute("data-verify-status") ?? null;
}

function errorText(): string {
  return (
    document.querySelector("[data-verify-unit='planned-work-error']")
      ?.textContent ?? ""
  );
}

const accepted = vi.fn(async () => ({ ok: true as const, data: { id: "wi-1" } }));

describe("PlannedWorkForm — the happy path reaches the action", () => {
  it("sends the engagement, the description and the optional fields", async () => {
    const onCreate = vi.fn(async () => ({ ok: true as const, data: { id: "wi-1" } }));
    mount(onCreate);

    chooseEngagement("globex");
    type(/What the work is/, DESCRIPTION);
    type(/Work type/, "ui");
    type(/Unit key/, "u9");
    submit();

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith({
        engagementSlug: "globex",
        description: DESCRIPTION,
        workType: "ui",
        unit: "u9",
      }),
    );
  });

  it("sends NULL for an optional field left blank, never an empty string", async () => {
    const onCreate = vi.fn(async () => ({ ok: true as const, data: { id: "wi-1" } }));
    mount(onCreate);

    chooseEngagement("acme");
    type(/What the work is/, DESCRIPTION);
    submit();

    await waitFor(() =>
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({ workType: null, unit: null }),
      ),
    );
  });

  it("navigates to the row it just created", async () => {
    mount(accepted);

    chooseEngagement("acme");
    type(/What the work is/, DESCRIPTION);
    submit();

    await waitFor(() => expect(push).toHaveBeenCalledWith("/work-items/wi-1"));
  });
});

describe("FR-87 as amended by Q14 — the engagement is required in the form too", () => {
  it("refuses to submit with no engagement chosen, and says why", async () => {
    const onCreate = vi.fn(async () => ({ ok: true as const, data: { id: "wi-1" } }));
    mount(onCreate);

    type(/What the work is/, DESCRIPTION);
    submit();

    await waitFor(() =>
      expect(errorText()).toContain("no unassigned planned work item"),
    );
    expect(onCreate).not.toHaveBeenCalled();
    expect(statusAttribute()).toBe("error");
  });

  it("refuses to submit with no description, rather than sending a blank one", async () => {
    const onCreate = vi.fn(async () => ({ ok: true as const, data: { id: "wi-1" } }));
    mount(onCreate);

    chooseEngagement("acme");
    type(/What the work is/, "   ");
    submit();

    await waitFor(() => expect(errorText()).toContain("Say what the work is"));
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("clears the refusal once an engagement is chosen", async () => {
    mount(accepted);

    submit();
    await waitFor(() => expect(errorText()).not.toBe(""));

    chooseEngagement("acme");
    expect(errorText()).toBe("");
    expect(statusAttribute()).toBe("idle");
  });

  it("offers no submit at all when there is no engagement to plan against", () => {
    // The empty state beside the form says to register one. A submit control
    // that can only ever be refused is worse than none.
    mount(accepted, []);

    expect(screen.getByText("Record planned work")).toBeDisabled();
    expect(screen.getByLabelText(/^Engagement/)).toBeDisabled();
  });
});

describe("the server's refusal survives the round trip", () => {
  it("renders the sentence the server wrote, not a generic failure", async () => {
    mount(async () => ({
      ok: false as const,
      message: "No engagement is registered under `acme`, so nothing was written.",
    }));

    chooseEngagement("acme");
    type(/What the work is/, DESCRIPTION);
    submit();

    await waitFor(() =>
      expect(errorText()).toContain("No engagement is registered"),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("does not navigate on a refusal", async () => {
    mount(async () => ({ ok: false as const, message: "refused" }));

    chooseEngagement("acme");
    type(/What the work is/, DESCRIPTION);
    submit();

    await waitFor(() => expect(errorText()).toContain("refused"));
    expect(push).not.toHaveBeenCalled();
  });
});

describe("§7a — nothing typed here reaches a state contract", () => {
  it("publishes a status and a count, and no content", async () => {
    mount(accepted);

    chooseEngagement("acme");
    type(/What the work is/, DESCRIPTION);

    const form = document.querySelector("[data-verify-unit='planned-work-form']");
    const names = Array.from(form?.attributes ?? [])
      .map((attribute) => attribute.name)
      .filter((name) => name.startsWith("data-verify-"))
      .sort();

    expect(names).toEqual([
      "data-verify-engagements",
      "data-verify-status",
      "data-verify-unit",
    ]);

    // The control does hold what was typed — otherwise this assertion passes
    // for a form that ignored the keystroke, which is the same green as a form
    // that kept it out of the contract.
    expect(
      (screen.getByLabelText(/What the work is/) as HTMLTextAreaElement).value,
    ).toBe(DESCRIPTION);

    // …and no attribute anywhere in the subtree carries it.
    for (const element of Array.from(form?.querySelectorAll("*") ?? [])) {
      for (const attribute of Array.from(element.attributes)) {
        expect(attribute.value).not.toContain(DESCRIPTION);
      }
    }
    expect(form?.outerHTML).not.toContain(DESCRIPTION);
  });

  it("offers nothing on this form to the browser's autofill store", () => {
    mount(accepted);

    const fields = Array.from(
      document.querySelectorAll("input, textarea"),
    ) as HTMLInputElement[];

    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(field.getAttribute("autocomplete")).toBe("off");
    }
  });

  it("announces each control by its label, not by the label plus the word required", () => {
    // A label's text nodes concatenate into the accessible name with no
    // separator, so an un-hidden "required" badge makes a screen reader say
    // "Engagementrequired". Found by reading the accessibility tree of the
    // running app; no test in this repo would have caught it, and the same
    // markup is on /registry/new.
    //
    // `getByRole(..., { name })` is the query that computes the accessible
    // name and honours `aria-hidden`; `getByLabelText` matches raw
    // `textContent` and would pass either way, which is why it is not used
    // here.
    mount(accepted);

    const select = screen.getByRole("combobox", { name: "Engagement" });
    const description = screen.getByRole("textbox", { name: "What the work is" });

    // …and the requirement is still carried, by the control rather than by the
    // label text.
    expect(select).toHaveAttribute("aria-required", "true");
    expect(description).toBeRequired();
  });

  it("skips native validation so the written refusals are the ones seen", () => {
    // `noValidate` is why the sentences above are reachable at all: without it
    // the browser's own bubble pre-empts them, and jsdom blocks the submit
    // event outright, which would make every refusal test above vacuous.
    mount(accepted);
    const form = document.querySelector("form") as HTMLFormElement;
    expect(form.noValidate).toBe(true);
  });
});
