import Link from "next/link";

import { EmptyState, Screen } from "@/components/screen";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Button } from "@/components/ui/button";
import { OPERATOR_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";
import { readOpenQuestions } from "@/lib/questions-load";

import { QuestionTable } from "./_components/question-table";
import { UnclassifiedConfidence } from "./_components/unclassified-confidence";

// Appended at the end of `OPERATOR_ROUTES` -- see nav.ts's own comment on why
// an insert after `/waits` would have silently broken two settings pages that
// index this array positionally.
const NAV = OPERATOR_ROUTES[5];

export const metadata = { title: `${NAV.label} — Delivery Ledger` };

/**
 * B36 -- `/questions/[id]` ships unreachable.
 *
 * ## What this screen is, and the finding it closes
 *
 * `i1` measured it, twice more independently (`f2`, `qa-reviewer`): zero
 * foreign keys reference `open_question`, and before this unit nothing under
 * `src/app/` linked to one except the detail view's own header. FR-81 built
 * the detail view anyway, because `pnpm gate:m27` enumerates all eight entity
 * kinds and `open_question` is one of them -- but a view nothing points at is
 * unreachable without typing a uuid, which is the defect this screen exists to
 * close.
 *
 * The decision this unit had to make -- and the spec section for this build
 * names it as the substance of the unit rather than a detail -- is *where* an
 * open question should be linked from. `@/lib/entity-routes` already claims
 * `/questions` as `open_question`'s base path, alongside `/work-items` and
 * `/waits` as the only two other entity kinds with a listing screen. That is
 * the surface this unit builds: a record of every question the fleet queued,
 * answered or not, each row navigable to `/questions/[id]` in one click from
 * here and two from the sidebar.
 *
 * ## Open by default, answered on request
 *
 * Mirrors `/waits`' `includeResolved` exactly, for the same reason: an
 * answered question is history, and the record of it -- who answered, when --
 * stays one click away rather than gone. Nothing here computes "answered";
 * `status` is the column FR-18 already carries.
 *
 * ## Only clear columns; no decrypted prose on this screen
 *
 * `readOpenQuestions` never selects `question`, `best_guess` or `answer` --
 * see that module's header. This screen tells Erik *which* question to open,
 * not what it says; the answer to that is `/questions/[id]`, one click away,
 * which already decrypts by default (`withProse` is `true` there).
 *
 * ## Three outcomes, not two
 *
 * Identical to every other operator screen in this product: a failed read
 * renders `<OperatorLoadNotice>` and never a clean-looking empty state. An
 * empty listing after a **successful** read renders `<EmptyState>`, which says
 * so in words that cannot be mistaken for "the query failed" -- B28 and B39
 * are both a version of that confusion, and this screen does not reproduce it.
 */
export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawAnswered = Array.isArray(params.answered)
    ? params.answered[0]
    : params.answered;
  const includeAnswered = rawAnswered === "1";

  const result = await loadForOperator(() =>
    readOpenQuestions({ includeAnswered }),
  );

  const listing = result.ok ? result.data : null;

  return (
    <Screen
      title={NAV.label}
      question={NAV.question}
      requirements={NAV.requirements}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          data-verify-unit="question-summary"
          data-verify-open={listing === null ? "unknown" : listing.openCount}
          data-verify-answered={
            listing === null ? "unknown" : listing.answeredCount
          }
          className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
        >
          {listing === null ? (
            <span>counts unavailable</span>
          ) : (
            <>
              <span className="ident">
                {listing.questions.length} {includeAnswered ? "listed" : "open"}
              </span>

              <UnclassifiedConfidence
                count={listing.unclassifiedConfidenceCount}
              />

              {listing.truncated ? (
                <span className="text-state-carried">
                  This page is full, so there may be more.
                </span>
              ) : null}
            </>
          )}
        </div>

        <Button asChild variant="ghost" size="sm">
          <Link
            href={includeAnswered ? "/questions" : "/questions?answered=1"}
            data-verify-unit="toggle-answered"
            data-verify-including-answered={includeAnswered ? "true" : "false"}
          >
            {includeAnswered ? "Open only" : "Include answered"}
          </Link>
        </Button>
      </div>

      {result.ok ? null : (
        <OperatorLoadNotice
          reason={result.reason}
          detail={result.detail}
          screen={NAV.label}
        />
      )}

      {listing === null ? null : listing.questions.length === 0 ? (
        <EmptyState
          headline={
            includeAnswered
              ? "No open questions have been recorded."
              : "Nothing is waiting on an answer."
          }
          detail="The fleet queues a question here whenever a unit could not resolve something on its own. Each one links to what it asked, what it assumed in the meantime, and what was decided."
        />
      ) : (
        <QuestionTable questions={listing.questions} />
      )}
    </Screen>
  );
}
