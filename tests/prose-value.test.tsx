import { StrictMode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ProseValue } from "@/components/prose-value";
import type { Prose } from "@/lib/detail-load";

/**
 * B33 — the hoisted four-state prose renderer, tested once instead of five
 * times.
 *
 * Every FR-81 detail view that renders a `Prose` column now imports this
 * component from `@/components/prose-value` rather than carrying its own
 * copy. These tests assert the ONE contract directly; the per-view test
 * files (`tests/detail-blocker.test.tsx`, `tests/detail-defect.test.tsx`,
 * `tests/detail-work-item.test.tsx`, `tests/detail-requirement.test.tsx`,
 * `tests/detail-open-question.test.tsx`, `tests/detail-milestone.test.tsx`)
 * assert that each view actually calls it with the right `field`.
 */

afterEach(cleanup);

function prose(state: Prose["state"], text: string | null = null): Prose {
  return { state, text };
}

describe("ProseValue publishes one contract for every state", () => {
  it("wraps every state — present, absent, unreadable, not-requested, contradiction — in the same unit", () => {
    const cases: Array<[Prose, string]> = [
      [prose("present", "hello"), "present"],
      [prose("absent"), "absent"],
      [prose("unreadable"), "unreadable"],
      [prose("not-requested"), "not-requested"],
      [prose("present", null), "contradiction"],
    ];

    for (const [value, expected] of cases) {
      const { container } = render(
        <ProseValue field="f" prose={value} absent="nothing was ever stored" />,
      );
      const el = container.querySelector("[data-verify-unit='detail-prose']");
      expect(el, `state ${expected}`).not.toBeNull();
      expect(el).toHaveAttribute("data-verify-field", "f");
      expect(el).toHaveAttribute("data-verify-state", expected);
      cleanup();
    }
  });

  it("renders the decrypted text when present", () => {
    const { container } = render(
      <ProseValue
        field="f"
        prose={prose("present", "the actual paragraph")}
        absent="n/a"
      />,
    );
    expect(container.textContent).toContain("the actual paragraph");
  });

  it("renders absent as the shared em-dash primitive, not a bespoke string", () => {
    const { container } = render(
      <ProseValue field="f" prose={prose("absent")} absent="nothing stored" />,
    );
    const el = container.querySelector("[data-verify-unit='detail-prose']");
    expect(el?.textContent).toBe("—");
    // The reason is on the tooltip, not the visible text.
    expect(el?.querySelector("[title]")).toHaveAttribute("title", "nothing stored");
  });

  it("prints the word 'unreadable' in the blocked family, never blank — the hazard qa-reviewer refuted", () => {
    const { container } = render(
      <ProseValue field="f" prose={prose("unreadable")} absent="n/a" />,
    );
    expect(container.textContent).toBe("unreadable");
    expect(container.querySelector(".text-state-blocked")).not.toBeNull();
  });

  it("gives not-requested its own wording, distinct from absent and unreadable", () => {
    const { container } = render(
      <ProseValue field="f" prose={prose("not-requested")} absent="n/a" />,
    );
    expect(container.textContent).toContain("not read");
    expect(container.textContent).not.toBe("unreadable");
    expect(container.textContent).not.toBe("—");
  });

  it("records a contradiction rather than silently rendering present as blank", () => {
    // `state === "present"` with `text === null` is not one of `ProseState`'s
    // four values — the type says `text` is non-null only when present — but
    // nothing stops a caller's data from violating that at runtime. Rendering
    // it as an empty `<p>` under `data-verify-state='present'` is exactly the
    // silent falsehood this component exists to refuse.
    const { container } = render(
      <ProseValue field="f" prose={prose("present", null)} absent="n/a" />,
    );
    const el = container.querySelector("[data-verify-unit='detail-prose']");
    expect(el).toHaveAttribute("data-verify-state", "contradiction");
    expect(el?.textContent).not.toBe("");
  });

  it("publishes no decrypted text into any data-verify attribute — §7a", () => {
    const secret = "CLIENT PROSE THAT MUST NOT REACH AN ATTRIBUTE";
    const { container } = render(
      <ProseValue field="f" prose={prose("present", secret)} absent="n/a" />,
    );
    for (const el of container.querySelectorAll("*")) {
      for (const attr of [...el.attributes]) {
        if (!attr.name.startsWith("data-verify-")) continue;
        expect(attr.value).not.toContain(secret);
      }
    }
  });

  it("retired attribute names do not reappear", () => {
    const { container } = render(
      <ProseValue field="f" prose={prose("unreadable")} absent="n/a" />,
    );
    expect(container.querySelector("[data-verify-prose-state]")).toBeNull();
    expect(container.querySelector("[data-verify-unit='prose']")).toBeNull();
  });

  it("is stable under StrictMode's double invocation", () => {
    const plain = render(
      <ProseValue field="f" prose={prose("present", "text")} absent="n/a" />,
    );
    const plainHtml = plain.container.innerHTML;
    cleanup();

    const strict = render(
      <StrictMode>
        <ProseValue field="f" prose={prose("present", "text")} absent="n/a" />
      </StrictMode>,
    );
    expect(strict.container.innerHTML).toBe(plainHtml);
  });
});
