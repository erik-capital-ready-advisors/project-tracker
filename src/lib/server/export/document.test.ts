import { describe, expect, it } from "vitest";

import { exportFilename, readExportDocument } from "./document";

/**
 * The export document is the one artifact this product emits that nobody reads
 * inside the product. It is read months later, by a person or a script, in a
 * situation where the database is gone — which is the only situation that makes
 * an export the thing you reach for.
 *
 * So the reading is strict and it refuses rather than guesses. A document whose
 * `counts` disagree with its own rows is not a document with a small problem; it
 * is a file that arrived damaged, and the whole value of an export is that you
 * find that out while you still have the database rather than afterwards.
 */

function doc(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: "delivery-ledger-export",
    version: 1,
    exported_at: "2026-08-21T09:30:00+00:00",
    encryption: "decrypted",
    omitted: [{ column: "agent_token.token_hash", reason: "spec 7a" }],
    tables: { engagement: [{ id: "e1" }], work_item: [{ id: "w1" }, { id: "w2" }] },
    counts: { engagement: 1, work_item: 2 },
    ...overrides,
  };
}

describe("readExportDocument", () => {
  it("summarises a well-formed document", () => {
    const reading = readExportDocument(doc());

    expect(reading).toEqual({
      kind: "ok",
      summary: {
        format: "delivery-ledger-export",
        version: 1,
        exportedAt: "2026-08-21T09:30:00+00:00",
        encryption: "decrypted",
        omitted: [{ column: "agent_token.token_hash", reason: "spec 7a" }],
        tables: [
          { table: "engagement", rows: 1 },
          { table: "work_item", rows: 2 },
        ],
        totalRows: 3,
      },
    });
  });

  it("orders tables by name so two exports can be diffed", () => {
    const reading = readExportDocument(
      doc({
        tables: { work_item: [], engagement: [], blocker: [] },
        counts: { work_item: 0, engagement: 0, blocker: 0 },
      }),
    );

    expect(reading.kind === "ok" && reading.summary.tables.map((one) => one.table)).toEqual([
      "blocker",
      "engagement",
      "work_item",
    ]);
  });

  it("refuses a document whose counts disagree with its own rows", () => {
    const reading = readExportDocument(doc({ counts: { engagement: 1, work_item: 9 } }));

    expect(reading).toEqual({
      kind: "unparsed",
      reason:
        "work_item: the document carries 2 rows and its own count says 9. The file is " +
        "damaged or truncated; it is not a partial export you can use.",
    });
  });

  it("refuses a table that carries rows and no count", () => {
    const reading = readExportDocument(doc({ counts: { engagement: 1 } }));

    expect(reading.kind).toBe("unparsed");
    expect(reading.kind === "unparsed" && reading.reason).toContain("work_item");
  });

  it("refuses a count for a table that is not in the document", () => {
    const reading = readExportDocument(
      doc({ counts: { engagement: 1, work_item: 2, defect: 4 } }),
    );

    expect(reading.kind).toBe("unparsed");
    expect(reading.kind === "unparsed" && reading.reason).toContain("defect");
  });

  it("refuses something that is not this product's export at all", () => {
    const reading = readExportDocument({ format: "some-other-tool", version: 1 });

    expect(reading).toEqual({
      kind: "unparsed",
      reason:
        'Not a Delivery Ledger export: the "format" field reads "some-other-tool" rather ' +
        'than "delivery-ledger-export".',
    });
  });

  it("refuses a version it was not written for rather than reading it optimistically", () => {
    const reading = readExportDocument(doc({ version: 2 }));

    expect(reading.kind).toBe("unparsed");
    expect(reading.kind === "unparsed" && reading.reason).toContain("version 2");
  });

  it("refuses a null, a string and an array without throwing", () => {
    for (const raw of [null, undefined, "{}", [], 7]) {
      expect(readExportDocument(raw).kind).toBe("unparsed");
    }
  });

  it("says so when the encryption header is missing rather than assuming ciphertext", () => {
    const reading = readExportDocument(doc({ encryption: undefined }));

    expect(reading.kind).toBe("unparsed");
    expect(reading.kind === "unparsed" && reading.reason).toContain("encryption");
  });
});

describe("exportFilename", () => {
  it("names the file for the instant the export was taken", () => {
    expect(exportFilename("2026-08-21T09:30:00+00:00")).toBe(
      "delivery-ledger-export-2026-08-21T09-30-00Z.json",
    );
  });

  it("falls back to a name that says the timestamp was unreadable", () => {
    expect(exportFilename("not a timestamp")).toBe("delivery-ledger-export-unparsed.json");
  });
});
