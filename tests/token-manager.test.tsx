import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TokenManager } from "@/app/settings/tokens/_components/token-manager";
import type { TokenView } from "@/app/settings/tokens/_lib/status";

/**
 * FR-7's lifecycle: issue, see the plaintext once, dismiss it, revoke, rotate.
 *
 * `i4` reported FR-7 PARTIAL -- "the mechanism exists, the interface does not."
 * These are the tests that hold the interface half honest.
 *
 * ## No real token appears anywhere in this file
 *
 * `CLAUDE.md`: "Do not reproduce one in a screenshot, a test fixture, or the
 * user guide." The value below is generated to the right SHAPE
 * (`dl_<uuid>_<64 hex>`) and is not, and never was, a credential -- it
 * authenticates nothing, because no row was ever hashed from it. The shape
 * matters only so the "this value never reaches a data-verify attribute"
 * assertion is testing against something a real token could be mistaken for.
 */

const FAKE_PLAINTEXT =
  "dl_00000000-0000-4000-8000-000000000000_" + "a".repeat(64);
const OTHER_FAKE_PLAINTEXT =
  "dl_11111111-1111-4111-8111-111111111111_" + "b".repeat(64);

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

const ACTIVE: TokenView = {
  id: "00000000-0000-4000-8000-000000000000",
  label: "fleet runner",
  capabilities: ["answer:read", "ingest:write"],
  expiresAt: "2026-11-17T23:59:59.999Z",
  lastUsedAt: "2026-08-18T09:07:00.000Z",
  revokedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  status: "active",
};

const REVOKED: TokenView = {
  ...ACTIVE,
  id: "22222222-2222-4222-8222-222222222222",
  label: "retired runner",
  revokedAt: "2026-08-10T00:00:00.000Z",
  status: "revoked",
};

function ok<T>(data: T) {
  return async () => ({ ok: true as const, data });
}

function refused(message: string) {
  return async () => ({ ok: false as const, message });
}

function renderManager(
  overrides: Partial<React.ComponentProps<typeof TokenManager>> = {},
) {
  const props: React.ComponentProps<typeof TokenManager> = {
    tokens: [ACTIVE],
    defaultExpiryDay: "2026-11-17",
    onIssue: ok({ id: "new", label: "new", plaintext: FAKE_PLAINTEXT }),
    onRevoke: ok({ revoked: true }),
    onRotate: ok({ id: "rot", label: "rot", plaintext: OTHER_FAKE_PLAINTEXT }),
    ...overrides,
  };
  return { ...render(<TokenManager {...props} />), props };
}

beforeEach(() => {
  refresh.mockClear();
});

afterEach(cleanup);

describe("FR-7 — issue", () => {
  it("calls the action with the label, the chosen capabilities and the expiry", async () => {
    const onIssue = vi.fn(
      ok({ id: "abc", label: "ingest only", plaintext: FAKE_PLAINTEXT }),
    );
    renderManager({ onIssue });

    fireEvent.click(screen.getByText("Issue a token"));

    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "ingest only" },
    });
    fireEvent.click(screen.getByLabelText(/ingest:write/));
    fireEvent.click(screen.getByText("Issue token"));

    await waitFor(() => expect(onIssue).toHaveBeenCalledTimes(1));
    expect(onIssue).toHaveBeenCalledWith(
      "ingest only",
      ["ingest:write"],
      "2026-11-17",
    );
  });

  it("shows the plaintext exactly once, and never again after dismissal", async () => {
    renderManager();

    fireEvent.click(screen.getByText("Issue a token"));
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "fleet runner" },
    });
    fireEvent.click(screen.getByLabelText(/answer:read/));
    fireEvent.click(screen.getByText("Issue token"));

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='token-plaintext']"),
      ).not.toBeNull(),
    );
    expect(document.body.textContent).toContain(FAKE_PLAINTEXT);

    fireEvent.click(screen.getByText("I have stored it — close"));

    await waitFor(() => {
      expect(
        document.querySelector("[data-verify-unit='token-plaintext']"),
      ).toBeNull();
    });
    // The whole point: it is gone from the document, and there is no control
    // anywhere that brings it back.
    expect(document.body.textContent).not.toContain(FAKE_PLAINTEXT);
    expect(screen.queryByText(/reveal/i)).toBeNull();
  });

  it("puts the token value in NO data-verify attribute", async () => {
    renderManager();

    fireEvent.click(screen.getByText("Issue a token"));
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "fleet runner" },
    });
    fireEvent.click(screen.getByLabelText(/answer:read/));
    fireEvent.click(screen.getByText("Issue token"));

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='token-plaintext']"),
      ).not.toBeNull(),
    );

    // qa-reviewer queries these attributes, and a suite's assertions end up in
    // logs and traces. A credential must not travel that path.
    for (const element of Array.from(document.querySelectorAll("*"))) {
      for (const attribute of Array.from(element.attributes)) {
        if (!attribute.name.startsWith("data-verify-")) continue;
        expect(attribute.value).not.toContain(FAKE_PLAINTEXT);
        // Not even a prefix of the secret segment.
        expect(attribute.value).not.toContain("a".repeat(8));
      }
    }
  });

  it("surfaces the server's refusal instead of a redacted digest", async () => {
    renderManager({
      onIssue: refused(
        "A token needs at least one capability. A token with none can call nothing.",
      ),
    });

    fireEvent.click(screen.getByText("Issue a token"));
    fireEvent.change(screen.getByLabelText("Label"), {
      target: { value: "no caps" },
    });
    fireEvent.click(screen.getByText("Issue token"));

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='issue-token-error']")
          ?.textContent,
      ).toContain("at least one capability"),
    );
    // And no credential panel was opened on a failed issue.
    expect(
      document.querySelector("[data-verify-unit='token-plaintext']"),
    ).toBeNull();
  });
});

describe("FR-7 — revoke", () => {
  it("confirms before revoking, then calls the action with the token id", async () => {
    const onRevoke = vi.fn(ok({ revoked: true }));
    renderManager({ onRevoke });

    fireEvent.click(screen.getByText("Revoke"));
    // Opening the dialog alone must not have revoked anything.
    expect(onRevoke).not.toHaveBeenCalled();

    fireEvent.click(
      document.querySelector(
        "[data-verify-unit='revoke-token-confirm']",
      ) as HTMLElement,
    );

    await waitFor(() => expect(onRevoke).toHaveBeenCalledWith(ACTIVE.id));
    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='token-notice']")?.textContent,
      ).toContain("Revoked"),
    );
  });

  it("says a token was already revoked rather than implying it did something", async () => {
    renderManager({ onRevoke: ok({ revoked: false }) });

    fireEvent.click(screen.getByText("Revoke"));
    fireEvent.click(
      document.querySelector(
        "[data-verify-unit='revoke-token-confirm']",
      ) as HTMLElement,
    );

    await waitFor(() =>
      expect(
        document.querySelector("[data-verify-unit='token-notice']")?.textContent,
      ).toContain("already revoked"),
    );
  });

  it("offers no revoke or rotate control on an already-revoked token", () => {
    renderManager({ tokens: [REVOKED] });

    expect(
      document.querySelector("[data-verify-unit='revoke-token-trigger']"),
    ).toBeNull();
    expect(
      document.querySelector("[data-verify-unit='rotate-token-trigger']"),
    ).toBeNull();
    // The row is kept rather than deleted: §7a retains it for the audit window.
    expect(screen.getByText("retired runner")).toBeTruthy();
    expect(screen.getByText("kept for audit")).toBeTruthy();
  });
});

describe("FR-7 — rotate", () => {
  it("calls the action with the token id and a new expiry, and shows the replacement once", async () => {
    const onRotate = vi.fn(
      ok({ id: "rot", label: "fleet runner", plaintext: OTHER_FAKE_PLAINTEXT }),
    );
    renderManager({ onRotate });

    fireEvent.click(screen.getByText("Rotate"));
    fireEvent.click(
      document.querySelector(
        "[data-verify-unit='rotate-token-confirm']",
      ) as HTMLElement,
    );

    await waitFor(() =>
      expect(onRotate).toHaveBeenCalledWith(ACTIVE.id, "2026-11-17"),
    );

    await waitFor(() =>
      expect(
        document
          .querySelector("[data-verify-unit='token-plaintext']")
          ?.getAttribute("data-verify-rotated"),
      ).toBe("true"),
    );
    expect(document.body.textContent).toContain(OTHER_FAKE_PLAINTEXT);
  });
});

describe("the table", () => {
  it("shows no hash, and no column that could carry one", () => {
    renderManager();
    const table = document.querySelector("[data-verify-unit='token-table']");
    expect(table?.textContent).not.toContain("hash");
    expect(table?.textContent).not.toContain(FAKE_PLAINTEXT);
  });

  it("reports a never-used token as never rather than as a date", () => {
    renderManager({ tokens: [{ ...ACTIVE, lastUsedAt: null }] });
    expect(screen.getByText("never")).toBeTruthy();
  });
});
