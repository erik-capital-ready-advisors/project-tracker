import { Download, TriangleAlert } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ExportReading } from "@/lib/server/export/document";

/**
 * FR-60 at the surface — what is in the file, before anyone takes it away.
 *
 * ## Why the counts are on the screen and not only in the file
 *
 * "A full export produces every record" is a claim, and the only way a person
 * can check it is against numbers they already believe. Erik knows roughly how
 * many requirements and work items this ledger holds; a table of counts lets him
 * see that the export agrees, in the two seconds before he relies on it. A
 * download button on its own asks him to trust it instead.
 *
 * ## Why the word "decrypted" is on the screen in prose
 *
 * The export decrypts §7a's twelve encrypted columns, deliberately, because an
 * export whose contents need a Vault key that died with the project is not a
 * record of anything. The cost of that decision is that the file is client prose
 * and contract amounts in the clear, and the person holding it has to know. A
 * header field inside the JSON does not reach them; a sentence above the button
 * does.
 *
 * ## An unreadable document is not an empty one
 *
 * A damaged export that presents itself as a backup is worse than no backup: it
 * is discovered in the one situation where it was the last copy. So `unparsed`
 * renders as `unparsed`, and the download is withheld rather than offered with a
 * caveat.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="export-panel", data-verify-kind="ok" | "unparsed"
 *   data-verify-rows="<total>"
 */
export function ExportPanel({ reading }: { reading: ExportReading }) {
  if (reading.kind === "unparsed") {
    return (
      <section data-verify-unit="export-panel" data-verify-kind="unparsed">
        <Alert className="border-state-unparsed/50 bg-state-unparsed/10 px-3 py-2.5">
          <TriangleAlert aria-hidden className="text-state-unparsed" />
          <AlertTitle className="text-sm">unparsed — the export could not be read</AlertTitle>
          <AlertDescription className="flex max-w-prose flex-col gap-2 text-sm">
            <p>{reading.reason}</p>
            <p className="text-muted-foreground text-xs">
              No download is offered. A damaged export that presents itself as a backup is
              worse than none, because it is only found out in the situation where it was
              the last copy.
            </p>
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const { summary } = reading;

  return (
    <section
      className="flex flex-col gap-4"
      data-verify-unit="export-panel"
      data-verify-kind="ok"
      data-verify-rows={summary.totalRows}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">
          <span className="ident font-semibold">{summary.totalRows} rows</span> across{" "}
          <span className="ident font-semibold">{summary.tables.length} tables</span>, read
          in one database function so no row cap can truncate it.
        </p>
        <div className="ml-auto">
          <Button asChild size="sm">
            <a href="/api/export" download data-verify-unit="export-download">
              <Download aria-hidden />
              Download export
            </a>
          </Button>
        </div>
      </div>

      <Alert className="border-state-carried/50 bg-state-carried/10 px-3 py-2.5">
        <TriangleAlert aria-hidden className="text-state-carried" />
        <AlertTitle className="text-sm">
          This file is decrypted. Treat it the way you treat the database.
        </AlertTitle>
        <AlertDescription className="max-w-prose text-sm">
          The twelve encrypted columns — contract amounts, client prose, blocker and defect
          descriptions, open questions — come out readable. That is deliberate: an export
          exists so this system is not a single point of failure, and ciphertext whose key
          died with the project is not a record of anything. The consequence is that the
          file is as sensitive as everything it came from.
        </AlertDescription>
      </Alert>

      <div className="border-border overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <caption className="sr-only">Row counts per table in this export</caption>
          <thead className="border-border border-b">
            <tr>
              <th scope="col" className="px-4 py-2 text-left text-xs font-semibold">
                Table
              </th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-semibold">
                Rows
              </th>
            </tr>
          </thead>
          <tbody className="divide-border divide-y">
            {summary.tables.map((one) => (
              <tr key={one.table}>
                <td className="ident px-4 py-1.5 text-xs">{one.table}</td>
                <td className="ident px-4 py-1.5 text-right text-xs tabular-nums">
                  {one.rows}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {summary.omitted.length > 0 ? (
        <section className="border-border rounded-lg border" aria-labelledby="omitted-heading">
          <header className="border-border border-b px-4 py-2.5">
            <h2 id="omitted-heading" className="text-sm font-semibold">
              What this export withholds
            </h2>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Named rather than dropped silently. An export that omits something without
              saying so is the same failure as a count that reads zero because nothing
              looked.
            </p>
          </header>
          <dl className="divide-border divide-y">
            {summary.omitted.map((note) => (
              <div
                key={note.column}
                className="grid gap-1 px-4 py-2 sm:grid-cols-[minmax(0,14rem)_1fr] sm:gap-3"
              >
                <dt className="ident text-xs break-all">{note.column}</dt>
                <dd className="text-muted-foreground max-w-prose text-xs">{note.reason}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <p className="text-muted-foreground ident text-xs">
        format {summary.format} · version {summary.version} · taken {summary.exportedAt}
      </p>
    </section>
  );
}
