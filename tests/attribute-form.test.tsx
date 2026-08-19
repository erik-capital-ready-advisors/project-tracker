import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AttributeForm } from "@/app/work-items/unassigned/_components/attribute-form";
import { OperatorLoadNotice } from "@/components/operator-load-notice";

/**
 * FR-26 -- a session that resolves to no known engagement is "listed for Erik to
 * attribute in **one click**, rather than discarded".
 *
 * The tests below hold both halves: the click reaches the action with the right
 * two arguments, and the failure paths never look like success.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

afterEach(cleanup);

const ENGAGEMENTS = [
  { slug: "acme", clientName: "Acme Ltd" },
  { slug: "globex", clientName: "Globex" },
];

describe("AttributeForm", () => {
  it("attributes in one click once an engagement is chosen", async () => {
    const onAttribute = vi.fn(async () => ({ ok: true as const, data: {} }));
    render(
      <AttributeForm
        sessionId="s1"
        engagements={ENGAGEMENTS}
        onAttribute={onAttribute}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("Engagement to attribute this session to"),
      { target: { value: "globex" } },
    );
    fireEvent.click(screen.getByText("Attribute"));

    await waitFor(() =>
      expect(onAttribute).toHaveBeenCalledWith("s1", "globex"),
    );
  });

  it("refuses to submit with nothing chosen, rather than sending an empty slug", async () => {
    const onAttribute = vi.fn(async () => ({ ok: true as const, data: {} }));
    render(
      <AttributeForm
        sessionId="s1"
        engagements={ENGAGEMENTS}
        onAttribute={onAttribute}
      />,
    );

    fireEvent.click(screen.getByText("Attribute"));

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='attribute-error']")
          ?.textContent,
      ).toContain("Choose the engagement"),
    );
    expect(onAttribute).not.toHaveBeenCalled();
  });

  it("surfaces the server's refusal", async () => {
    render(
      <AttributeForm
        sessionId="s1"
        engagements={ENGAGEMENTS}
        onAttribute={async () => ({
          ok: false as const,
          message:
            'A session cannot be attributed to "unassigned"; that is where it already is.',
        })}
      />,
    );

    fireEvent.change(
      screen.getByLabelText("Engagement to attribute this session to"),
      { target: { value: "acme" } },
    );
    fireEvent.click(screen.getByText("Attribute"));

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='attribute-error']")
          ?.textContent,
      ).toContain("already is"),
    );
  });

  it("carries no session content in any state contract", () => {
    // §7a: work_session.summary "may quote anything Erik was working on,
    // including another client's codebase". This component is handed an id and
    // a list of slugs and must publish nothing else.
    render(
      <AttributeForm
        sessionId="s1"
        engagements={ENGAGEMENTS}
        onAttribute={async () => ({ ok: true as const, data: {} })}
      />,
    );

    const form = document.querySelector("[data-verify-unit='attribute-form']");
    const names = Array.from(form?.attributes ?? []).map(
      (attribute) => attribute.name,
    );
    expect(names.filter((name) => name.startsWith("data-verify-")).sort()).toEqual(
      ["data-verify-pending", "data-verify-session", "data-verify-unit"],
    );
  });
});

describe("OperatorLoadNotice — a failed read is not an empty ledger", () => {
  it("renders a different notice for each reason a read can be refused", () => {
    const rendered = (["sign-in", "mfa", "no-role", "error"] as const).map(
      (reason) => {
        const { container } = render(
          <OperatorLoadNotice reason={reason} detail="d" screen="Work items" />,
        );
        const notice = container.querySelector(
          "[data-verify-unit='load-notice']",
        );
        const markup = notice?.outerHTML ?? "";
        cleanup();
        return markup;
      },
    );

    expect(new Set(rendered).size).toBe(4);
  });

  it("says out loud that nothing was read", () => {
    // The whole reason this component exists rather than an empty state: an
    // empty state after a refused query is a clean-ledger claim nobody checked.
    render(
      <OperatorLoadNotice
        reason="sign-in"
        detail="Sign in to continue."
        screen="Work items"
      />,
    );
    expect(document.body.textContent).toContain("Nothing was read");
  });

  it("publishes the reason so a test can tell which refusal happened", () => {
    render(
      <OperatorLoadNotice reason="no-role" detail="d" screen="Agent tokens" />,
    );
    const notice = document.querySelector("[data-verify-unit='load-notice']");
    expect(notice?.getAttribute("data-verify-reason")).toBe("no-role");
    expect(notice?.getAttribute("data-verify-screen")).toBe("Agent tokens");
  });

  it("offers a way to sign in on the two refusals signing in fixes", () => {
    for (const reason of ["sign-in", "mfa"] as const) {
      render(<OperatorLoadNotice reason={reason} detail="d" screen="s" />);
      const action = document.querySelector(
        "[data-verify-unit='load-notice-action']",
      );
      expect(action?.getAttribute("href")).toBe("/sign-in");
      cleanup();
    }
  });

  it("offers no control on the refusals a control cannot fix", () => {
    // `no-role` is granted in the database and `error` is a fault in the read.
    // A button that cannot help is worse than none.
    for (const reason of ["no-role", "error"] as const) {
      render(<OperatorLoadNotice reason={reason} detail="d" screen="s" />);
      expect(
        document.querySelector("[data-verify-unit='load-notice-action']"),
      ).toBeNull();
      cleanup();
    }
  });
});
