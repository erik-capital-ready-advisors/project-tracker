import { notFound } from "next/navigation";

import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Screen } from "@/components/screen";
import { readRequirementDetail } from "@/lib/detail-load";
import { loadForOperator } from "@/lib/operator-load";
import { isoToday } from "@/lib/today";

import { RequirementView } from "../_components/requirement-view";

export const metadata = { title: "Requirement — Delivery Ledger" };

export const dynamic = "force-dynamic";

const REQUIREMENTS = ["FR-81", "FR-82", "FR-83", "FR-85"];

const QUESTION =
  "Everything recorded against one requirement: what implements it, what tests it, what violates it, and where it shipped.";

/**
 * FR-81 and **FR-82** — one requirement, and the four relationships shown
 * together.
 *
 * ## Three outcomes, not two
 *
 * `loadForOperator` is the wrapper every operator screen reads through and the
 * reason is the third outcome: read it, read it and there was none, or **could
 * not read**. A page that renders an empty state after a failed read has told
 * Erik this requirement is implemented by nothing without having looked.
 *
 * So the failure notice and the 404 are kept apart, exactly as i1 kept them
 * apart in the loader:
 *
 *   * `readRequirementDetail` **throws** — the database refused. That is a 500's
 *     claim, and it renders `OperatorLoadNotice`.
 *   * it returns **`null`** — no row has that id. That is a 404's claim, and it
 *     calls `notFound()`.
 *
 * `notFound()` is called outside the load because it signals by throwing —
 * `src/app/registry/[slug]/page.tsx` does the same and says why. Here the load
 * already returns rather than throws, so there is nothing to escape from.
 *
 * ## Authorisation is not added here, and not removed either
 *
 * `readRequirementDetail` calls `requireOperator()` beside its own query. i1's
 * rule and u4's before it: a gate in the caller is a gate someone forgets at the
 * second call site, and eight detail routes are exactly that shape. This page
 * adds no second gate.
 *
 * ## The cost of this page, restated rather than rediscovered — B29
 *
 * `readRequirementDetail` is the expensive one of i1's eight. It reads the
 * engagement's whole requirement, work-item, test and test-result set, plus all
 * of `release_requirement`, because it **calls** `indexCoverage`,
 * `latestResults` and `shippedIndex` rather than forking FR-47, FR-49 and FR-74.
 * That is the stated price of not having a second implementation of the coverage
 * rules, and it is correct at this product's size — one operator, tens of
 * engagements. It is written down here so the next reader finds it as a known
 * trade rather than as a discovery.
 *
 * Every read on this path runs as `service_role`, which holds `BYPASSRLS`, so
 * `requireOperator()` is the whole of the authorisation. CR-003 Q9 accepted that
 * for M2.7 explicitly. **This unit adds no read of its own and no
 * `security_invoker` view**; it calls i1's loader and nothing else.
 *
 * ## FR-85
 *
 * Satisfied structurally. `<UnparsedCount>` is mounted in `AppShell` in the
 * single root layout, so this route reports the count without doing anything.
 * **No second count is added** — two elements answering
 * `[data-verify-unit='unparsed-count']` is ambiguous at best.
 *
 * ## FR-86
 *
 * No route handler, no server action, no JSON endpoint. This is a React Server
 * Component behind `requireOperator()` and that is the whole surface.
 */
export default async function RequirementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadForOperator(() => readRequirementDetail(id));

  if (!result.ok) {
    return (
      <Screen title="Requirement" question={QUESTION} requirements={REQUIREMENTS}>
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen="Requirement"
        />
      </Screen>
    );
  }

  // No row carries this id. A 404 and a refusal are different claims and this
  // product does not collapse them.
  if (result.data === null) notFound();

  return <RequirementView detail={result.data} asOf={isoToday()} />;
}
