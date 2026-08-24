import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExportPanel } from "@/app/settings/export/_components/export-panel";
import type { ExportReading } from "@/lib/server/export/document";

/**
 * FR-60 at the surface.
 *
 * Two things this screen has to say out loud, because the person reading it is
 * about to put a copy of the whole ledger on a laptop:
 *
 *   1. **What is in the file.** Every table and its row count, so "complete" is
 *      something they can check rather than something they are told.
 *   2. **That it is decrypted.** The export carries client prose and contract
 *      amounts in the clear, by the deliberate decision recorded in the
 *      migration. A person who does not know that will store it as if it were
 *      ciphertext.
 *
 * And one thing it must never do: offer a download of a document it could not
 * read. A damaged export that presents itself as a backup is worse than no
 * backup, because it is only discovered in the situation where it was the last
 * remaining copy.
 */

const OK: ExportReading = {
  kind: "ok",
  summary: {
    format: "delivery-ledger-export",
    version: 1,
    exportedAt: "2026-08-21T09:30:00+00:00",
    encryption: "decrypted",
    omitted: [{ column: "agent_token.token_hash", reason: "Spec 7a: never returned." }],
    tables: [
      { table: "engagement", rows: 1 },
      { table: "requirement", rows: 79 },
      { table: "work_item", rows: 20 },
    ],
    totalRows: 100,
  },
};

afterEach(cleanup);

describe("a readable export", () => {
  it("counts every table, so completeness can be checked rather than trusted", () => {
    render(<ExportPanel reading={OK} />);

    expect(screen.getByText("requirement")).toBeTruthy();
    expect(screen.getByText("79")).toBeTruthy();
    expect(screen.getByText(/100 rows/)).toBeTruthy();
    expect(screen.getByText(/3 tables/)).toBeTruthy();
  });

  it("says the file is decrypted, in words, before anyone downloads it", () => {
    render(<ExportPanel reading={OK} />);
    expect(screen.getByText(/decrypted/i)).toBeTruthy();
  });

  it("names what the export withholds, so the omission is not silent", () => {
    render(<ExportPanel reading={OK} />);
    expect(screen.getByText(/agent_token.token_hash/)).toBeTruthy();
    expect(screen.getByText(/Spec 7a: never returned./)).toBeTruthy();
  });

  it("offers the download", () => {
    render(<ExportPanel reading={OK} />);
    const link = screen.getByRole("link", { name: /download/i });
    expect(link.getAttribute("href")).toBe("/api/export");
  });
});

describe("an export that could not be read", () => {
  const damaged: ExportReading = { kind: "unparsed", reason: "work_item: counts disagree." };

  it("shows the reason as unparsed rather than as an empty export", () => {
    render(<ExportPanel reading={damaged} />);

    expect(screen.getByText(/unparsed/i)).toBeTruthy();
    expect(screen.getByText("work_item: counts disagree.")).toBeTruthy();
    expect(screen.queryByText(/rows/)).toBeNull();
  });

  it("does not offer a download of a document it could not read", () => {
    render(<ExportPanel reading={damaged} />);
    expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
  });
});
