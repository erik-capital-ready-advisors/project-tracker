import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DangerZone } from "@/app/registry/_components/danger-zone";
import type { PurgeResult } from "@/lib/purge-result";

/**
 * FR-61 at the surface a person actually touches.
 *
 * The requirement's operative phrase is "**never the default**", and everything
 * asserted here is that phrase made mechanical: archiving is one click and
 * reversible, deletion needs the slug typed by hand, and the delete control does
 * not even light up until the reversible step has been taken.
 *
 * The last three cases are the ones worth having. A destructive action that
 * reports success when the server refused, or when the server said something
 * this version does not understand, is the single worst output this product can
 * produce — it tells Erik a client's ledger is gone when it is not, or that it
 * survived when it did not.
 */

const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}));

const PURGED: PurgeResult = {
  kind: "purged",
  slug: "delivery-ledger",
  engagementId: "e1",
  destroyed: [
    { table: "requirement", rows: 79 },
    { table: "work_item", rows: 20 },
  ],
  totalRows: 99,
  retained: ["audit_log", "test_result"],
};

function renderZone(overrides: Partial<React.ComponentProps<typeof DangerZone>> = {}) {
  const props: React.ComponentProps<typeof DangerZone> = {
    engagementId: "e1",
    slug: "delivery-ledger",
    archivedAt: null,
    onArchive: async () => ({ ok: true as const, data: { archivedAt: "2026-08-21T00:00:00Z" } }),
    onRestore: async () => ({ ok: true as const, data: { archivedAt: null } }),
    onPurge: async () => PURGED,
    ...overrides,
  };
  render(<DangerZone {...props} />);
  return props;
}

afterEach(() => {
  cleanup();
  refresh.mockClear();
});

describe("archiving, which is the reversible one", () => {
  it("offers Archive while the engagement is live", () => {
    renderZone();
    expect(screen.getByRole("button", { name: /^archive$/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /restore/i })).toBeNull();
  });

  it("offers Restore once it is archived, so the step reads as undoable", () => {
    renderZone({ archivedAt: "2026-08-21T00:00:00Z" });
    expect(screen.getByRole("button", { name: /restore/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^archive$/i })).toBeNull();
  });

  it("shows a refusal from the server rather than assuming the archive took", async () => {
    renderZone({ onArchive: async () => ({ ok: false as const, message: "Nope, said the server." }) });

    fireEvent.click(screen.getByRole("button", { name: /^archive$/i }));

    await waitFor(() => {
      expect(screen.getByText("Nope, said the server.")).toBeTruthy();
    });
  });
});

describe("deleting, which is not", () => {
  it("will not open the delete dialog until the engagement is archived", () => {
    renderZone({ archivedAt: null });
    const trigger = screen.getByRole("button", { name: /delete permanently/i });
    expect(trigger.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/archive it first/i)).toBeTruthy();
  });

  it("keeps the confirm button disabled until the slug is typed exactly", () => {
    renderZone({ archivedAt: "2026-08-21T00:00:00Z" });
    fireEvent.click(screen.getByRole("button", { name: /delete permanently/i }));

    const confirm = screen.getByRole("button", { name: /delete this engagement/i });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/type the slug/i), {
      target: { value: "delivery-ledge" },
    });
    expect(confirm.hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByLabelText(/type the slug/i), {
      target: { value: "delivery-ledger" },
    });
    expect(confirm.hasAttribute("disabled")).toBe(false);
  });

  it("says what it destroyed and what it could not, after a purge", async () => {
    renderZone({ archivedAt: "2026-08-21T00:00:00Z" });
    fireEvent.click(screen.getByRole("button", { name: /delete permanently/i }));
    fireEvent.change(screen.getByLabelText(/type the slug/i), {
      target: { value: "delivery-ledger" },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete this engagement/i }));

    await waitFor(() => {
      expect(screen.getByText(/99 rows/)).toBeTruthy();
    });
    expect(screen.getByText(/requirement/)).toBeTruthy();
    // CR-002 §2.2 reaches the operator at the moment it applies to them.
    expect(screen.getByText(/audit_log/)).toBeTruthy();
    expect(screen.getByText(/test_result/)).toBeTruthy();
  });

  it("reports a server refusal as a refusal, never as a deletion", async () => {
    renderZone({
      archivedAt: "2026-08-21T00:00:00Z",
      onPurge: async () => ({
        kind: "refused" as const,
        refusal: "not_archived" as const,
        slug: "delivery-ledger",
        message: "delivery-ledger has not been archived.",
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: /delete permanently/i }));
    fireEvent.change(screen.getByLabelText(/type the slug/i), {
      target: { value: "delivery-ledger" },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete this engagement/i }));

    await waitFor(() => {
      expect(screen.getByText("delivery-ledger has not been archived.")).toBeTruthy();
    });
    expect(screen.queryByText(/rows destroyed/i)).toBeNull();
  });

  it("shows an unreadable answer as unparsed and claims nothing about the rows", async () => {
    renderZone({
      archivedAt: "2026-08-21T00:00:00Z",
      onPurge: async () => ({ kind: "unparsed" as const, reason: "The reply made no sense." }),
    });
    fireEvent.click(screen.getByRole("button", { name: /delete permanently/i }));
    fireEvent.change(screen.getByLabelText(/type the slug/i), {
      target: { value: "delivery-ledger" },
    });
    fireEvent.click(screen.getByRole("button", { name: /delete this engagement/i }));

    await waitFor(() => {
      expect(screen.getByText("The reply made no sense.")).toBeTruthy();
    });
    expect(screen.queryByText(/rows destroyed/i)).toBeNull();
    expect(screen.getByText(/unparsed/i)).toBeTruthy();
  });
});
