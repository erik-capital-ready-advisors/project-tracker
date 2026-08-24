import { notFound } from "next/navigation";

import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Screen } from "@/components/screen";
import { readOpenQuestionDetail } from "@/lib/detail-load";
import { loadForOperator } from "@/lib/operator-load";

import { OpenQuestionView } from "../_components/open-question-view";

export const metadata = { title: "Open question — Delivery Ledger" };

export const dynamic = "force-dynamic";

const REQUIREMENTS = ["FR-18", "FR-81", "FR-83", "FR-85"];

const QUESTION =
  "One question the fleet could not answer for itself: what it asked, what it assumed in the meantime, and what was decided.";

/**
 * FR-81 for `open_question` (FR-18).
 *
 * ## This route is unreachable by navigation today, deliberately and reported
 *
 * i1 measured that nothing in the product points at an open question: zero
 * foreign keys reference the table and, before this unit, zero files under
 * `src/app/` mentioned it. FR-81 names `open_question` as one of its eight and
 * the M2.7 gate enumerates all eight, so the route is built; adding a listing
 * screen to give it an inbound link would be scope nobody approved. The finding
 * is in the build report rather than papered over.
 *
 * ## Three outcomes, not two
 *
 * Identical to `/requirements/[id]` and for the same reason. A throw is the
 * database refusing — a 500's claim, rendered as the failure notice. `null` is
 * no such row — a 404's claim, `notFound()`. A screen that renders its empty
 * state after a failed read has reported a clean ledger without looking at one.
 *
 * ## Authorisation, FR-85 and FR-86
 *
 * `readOpenQuestionDetail` calls `requireOperator()` beside its own query; no
 * second gate is added here and none is removed. `<UnparsedCount>` is in
 * `AppShell` in the single root layout, so FR-85 is satisfied structurally and
 * no second count is added. No route handler, no server action, no JSON
 * endpoint — FR-86's surface is exactly a React Server Component behind
 * `requireOperator()`.
 */
export default async function OpenQuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const result = await loadForOperator(() => readOpenQuestionDetail(id));

  if (!result.ok) {
    return (
      <Screen
        title="Open question"
        question={QUESTION}
        requirements={REQUIREMENTS}
      >
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen="Open question"
        />
      </Screen>
    );
  }

  // No row carries this id. Distinct from a refusal, and kept distinct.
  if (result.data === null) notFound();

  return <OpenQuestionView detail={result.data} />;
}
