import { notFound } from "next/navigation";

import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Screen } from "@/components/screen";
import { readWorkItemDetail } from "@/lib/detail-load";
import { loadForOperator } from "@/lib/operator-load";
import { isoToday } from "@/lib/today";

import { WorkItemDetailView } from "./_components/work-item-detail-view";

export const metadata = { title: "Work item — Delivery Ledger" };

export const dynamic = "force-dynamic";

const SCREEN = "Work item";
const QUESTION =
  "Everything recorded about this work item, and everything that references it.";
const REQUIREMENTS = ["FR-81", "FR-83", "FR-85"];

/**
 * FR-81 — the `work_item` detail view.
 *
 * ## Three outcomes, never two
 *
 * `src/app/registry/[slug]/page.tsx` is this product's structural precedent and
 * the shape is kept:
 *
 *   * **The read was refused or failed** → `OperatorLoadNotice`. Not an empty
 *     state, and not a 404. `loadForOperator` already refuses to collapse those:
 *     a screen that renders "nothing here" after a failed read has reported a
 *     clean ledger without looking at one.
 *   * **The read succeeded and no row has this id** → `notFound()`. A 404 and a
 *     500 are different claims and i1 kept them apart in the loader for exactly
 *     this branch. Called **outside** the read above, because `notFound()`
 *     signals by throwing and a `try` around it would swallow it into the
 *     failure notice.
 *   * **The read succeeded** → the view.
 *
 * ## The gate is not here, on purpose
 *
 * `readWorkItemDetail` calls `requireOperator()` inside, beside the query. A
 * gate that lives in the caller is a gate the second call site forgets. This
 * page adds none and removes none; `loadForOperator` reads the operator context
 * first only to tell the four refusal reasons apart for the notice.
 *
 * ## FR-85 — nothing to do here
 *
 * `UnparsedCount` is mounted in `AppShell` in the single root layout, so this
 * route reports the count structurally. **A second count on this page would be
 * two elements answering `[data-verify-unit='unparsed-count']`** — an ambiguous
 * assertion at best and two different numbers at worst. This page does not read
 * the census.
 *
 * ## FR-86 — no new agent-reachable surface
 *
 * This is a React Server Component and there is no `route.ts` beside it. The
 * only decryption reachable from this file happens inside `readWorkItemDetail`,
 * behind `requireOperator()`, exactly as it did before this route existed.
 */
export default async function WorkItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadForOperator(() => readWorkItemDetail(id));

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

  // A uuid that names no work item is a 404, not an empty work item.
  if (result.data === null) notFound();

  return <WorkItemDetailView detail={result.data} asOf={isoToday()} />;
}
