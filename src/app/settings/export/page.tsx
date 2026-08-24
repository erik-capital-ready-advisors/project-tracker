import { Screen } from "@/components/screen";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { OPERATOR_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";
import { runExport } from "@/lib/server/export/run";

import { ExportPanel } from "./_components/export-panel";

const NAV = OPERATOR_ROUTES.find((item) => item.href === "/settings/export")!;

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

export const dynamic = "force-dynamic";

/**
 * FR-60 — every record in one document.
 *
 * The page runs the export to render the counts, and the download button runs it
 * again through `/api/export`. Two reads rather than holding a multi-megabyte
 * document in the page and handing it to the browser as a blob — the counts may
 * differ by a row if an ingest lands between them, which is honest and does not
 * matter. A ledger this size costs one query per read.
 *
 * §7b's user guide for this screen is not written yet. It is the last item of
 * M1.10 and is deliberately held until §5a is approved, so it does not
 * photograph a design that is about to change.
 */
export default async function ExportPage() {
  const result = await loadForOperator(() => runExport());

  return (
    <Screen title={NAV.label} question={NAV.question} requirements={["FR-60"]}>
      {result.ok ? (
        <ExportPanel reading={result.data.reading} />
      ) : (
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={NAV.label}
        />
      )}
    </Screen>
  );
}
