import { notFound } from "next/navigation";

import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Screen } from "@/components/screen";
import { readDefectDetail } from "@/lib/detail-load";
import { loadForOperator } from "@/lib/operator-load";

import { DefectDetailView } from "./_components/defect-detail-view";

export const metadata = { title: "Defect — Delivery Ledger" };

export const dynamic = "force-dynamic";

const SCREEN = "Defect";
const QUESTION = "Everything recorded about this defect, and what it points at.";
const REQUIREMENTS = ["FR-81", "FR-83", "FR-85"];

/**
 * FR-81 — the `defect` detail view (CR-001).
 *
 * The three outcomes and the reasoning behind keeping them apart are recorded
 * once, on `src/app/work-items/[id]/page.tsx`. In short: a refused or failed
 * read renders the notice, a uuid naming no row is `notFound()` called outside
 * the read because it signals by throwing, and neither is ever the other.
 *
 * `readDefectDetail` calls `requireOperator()` inside. This page adds no gate
 * and removes none, adds no route handler, and reads no census — FR-85 is
 * satisfied structurally by `UnparsedCount` in the root layout.
 */
export default async function DefectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadForOperator(() => readDefectDetail(id));

  if (!result.ok) {
    return (
      <Screen title={SCREEN} question={QUESTION} requirements={REQUIREMENTS}>
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={SCREEN}
        />
      </Screen>
    );
  }

  // A uuid that names no defect is a 404, not a defect with nothing in it.
  if (result.data === null) notFound();

  return <DefectDetailView detail={result.data} />;
}
