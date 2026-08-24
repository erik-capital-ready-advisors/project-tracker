import { notFound } from "next/navigation";

import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Screen } from "@/components/screen";
import { readBlockerDetail } from "@/lib/detail-load";
import { loadForOperator } from "@/lib/operator-load";

import { BlockerDetailView } from "./_components/blocker-detail-view";

export const metadata = { title: "Blocker — Delivery Ledger" };

export const dynamic = "force-dynamic";

const SCREEN = "Blocker";
const QUESTION = "What this blocker is, who owns it, and what it is holding.";
const REQUIREMENTS = ["FR-81", "FR-83", "FR-85"];

/**
 * FR-81 — the `blocker` detail view.
 *
 * The three outcomes and the reasoning behind keeping them apart are recorded
 * once, on `src/app/work-items/[id]/page.tsx`. In short: a refused or failed
 * read renders the notice, a uuid naming no row is `notFound()` called outside
 * the read because it signals by throwing, and neither is ever the other.
 *
 * `readBlockerDetail` calls `requireOperator()` inside. This page adds no gate
 * and removes none, adds no route handler, and reads no census — FR-85 is
 * satisfied structurally by `UnparsedCount` in the root layout.
 */
export default async function BlockerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadForOperator(() => readBlockerDetail(id));

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

  // A uuid that names no blocker is a 404, not a blocker holding nothing.
  if (result.data === null) notFound();

  return <BlockerDetailView detail={result.data} />;
}
