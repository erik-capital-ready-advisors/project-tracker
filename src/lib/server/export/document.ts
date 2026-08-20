/**
 * FR-60. Reading the export document — a pure function over the value the
 * database function returned, touching no filesystem and no database.
 *
 * ## Why the reading is strict
 *
 * This is the one artifact this product emits that nobody reads inside the
 * product. It gets read months later, by a person or a script, in the situation
 * that makes an export worth having: the database is gone. Everything that
 * could have been checked at the moment it was written has to be checked at the
 * moment it was written.
 *
 * So a document whose `counts` disagree with its own rows is refused, not
 * repaired. The counts are derived inside `app.export_document()` from the same
 * jsonb the rows come out of, so they cannot disagree at the source — a
 * disagreement here means the value was damaged between the database and this
 * function, and a partial export that presents itself as complete is the exact
 * output §9 of CLAUDE.md exists to prevent.
 *
 * `unparsed` is the only default here as everywhere else: an unreadable document
 * says so and names what it saw, rather than degrading to "probably fine".
 */

export interface OmittedNote {
  column: string;
  reason: string;
}

export interface TableCount {
  table: string;
  rows: number;
}

export interface ExportSummary {
  format: string;
  version: number;
  exportedAt: string;
  /** `decrypted` — stated by the document, never inferred. See the migration's §2(b). */
  encryption: string;
  /** What the export deliberately withheld. Empty is a claim, not an absence. */
  omitted: OmittedNote[];
  /** Every table in the document, ordered by name so two exports diff cleanly. */
  tables: TableCount[];
  totalRows: number;
}

export type ExportReading =
  | { kind: "ok"; summary: ExportSummary }
  | { kind: "unparsed"; reason: string };

/** The only version this reader was written for. A later one is refused, not guessed at. */
export const EXPORT_FORMAT = "delivery-ledger-export";
export const EXPORT_VERSION = 1;

function unparsed(reason: string): ExportReading {
  return { kind: "unparsed", reason };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readOmitted(raw: unknown): OmittedNote[] {
  if (!Array.isArray(raw)) return [];
  const notes: OmittedNote[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const column = entry.column;
    const reason = entry.reason;
    if (typeof column === "string" && typeof reason === "string") {
      notes.push({ column, reason });
    }
  }
  return notes;
}

export function readExportDocument(raw: unknown): ExportReading {
  if (!isRecord(raw)) {
    return unparsed(
      `Not a Delivery Ledger export: expected a JSON object and read ${
        raw === null ? "null" : Array.isArray(raw) ? "an array" : typeof raw
      }.`,
    );
  }

  if (raw.format !== EXPORT_FORMAT) {
    return unparsed(
      `Not a Delivery Ledger export: the "format" field reads ${JSON.stringify(
        raw.format ?? null,
      )} rather than ${JSON.stringify(EXPORT_FORMAT)}.`,
    );
  }

  if (raw.version !== EXPORT_VERSION) {
    return unparsed(
      `This export is version ${String(raw.version)} and this reader was written for ` +
        `version ${EXPORT_VERSION}. Refusing rather than reading it optimistically: a ` +
        `later format may have moved a field this one would silently miss.`,
    );
  }

  if (typeof raw.exported_at !== "string") {
    return unparsed('The export carries no readable "exported_at" timestamp.');
  }

  if (typeof raw.encryption !== "string") {
    return unparsed(
      'The export carries no "encryption" header, so there is no way to tell whether ' +
        "the prose and the amounts in it are readable or ciphertext. Refusing rather " +
        "than assuming either.",
    );
  }

  if (!isRecord(raw.tables)) {
    return unparsed('The export carries no "tables" object.');
  }

  if (!isRecord(raw.counts)) {
    return unparsed('The export carries no "counts" object, so nothing verifies its rows.');
  }

  const tables: TableCount[] = [];
  for (const [table, value] of Object.entries(raw.tables)) {
    if (!Array.isArray(value)) {
      return unparsed(`${table}: the document holds something other than a list of rows.`);
    }
    const declared = raw.counts[table];
    if (typeof declared !== "number") {
      return unparsed(
        `${table}: the document carries ${value.length} rows and no count for them. ` +
          "Every table in an export is counted; a missing count means the file is damaged.",
      );
    }
    if (declared !== value.length) {
      return unparsed(
        `${table}: the document carries ${value.length} rows and its own count says ` +
          `${declared}. The file is damaged or truncated; it is not a partial export ` +
          "you can use.",
      );
    }
    tables.push({ table, rows: value.length });
  }

  for (const table of Object.keys(raw.counts)) {
    if (table in raw.tables) continue;
    return unparsed(
      `${table}: counted in the export and not present in it. The file is damaged.`,
    );
  }

  tables.sort((a, b) => a.table.localeCompare(b.table));

  return {
    kind: "ok",
    summary: {
      format: raw.format,
      version: raw.version,
      exportedAt: raw.exported_at,
      encryption: raw.encryption,
      omitted: readOmitted(raw.omitted),
      tables,
      totalRows: tables.reduce((sum, one) => sum + one.rows, 0),
    },
  };
}

/**
 * The download's filename, named for the instant the export was taken.
 *
 * Colons are stripped because a `:` in a filename is illegal on Windows and
 * merely ugly everywhere else, and an export is a file a person keeps.
 */
export function exportFilename(exportedAt: string): string {
  const at = new Date(exportedAt);
  if (Number.isNaN(at.getTime())) return "delivery-ledger-export-unparsed.json";
  const stamp = at.toISOString().replace(/\.\d+Z$/, "Z").replace(/:/g, "-");
  return `delivery-ledger-export-${stamp}.json`;
}
