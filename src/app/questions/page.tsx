import Link from "next/link";

import { EngagementScopeNotice } from "@/components/engagement-scope-notice";
import { EmptyState, Screen } from "@/components/screen";
import { OperatorLoadNotice } from "@/components/operator-load-notice";
import { Button } from "@/components/ui/button";
import { engagementFilterFrom } from "@/lib/engagement-filter";
import type { SearchParamRecord } from "@/lib/engagement-filter";
import {
  engagementScopeBlocksRows,
  engagementScopeId,
  resolveEngagementFilter,
} from "@/lib/engagement-resolve";
import { withListFlag } from "@/lib/list-toggle-link";
import { OPERATOR_ROUTES } from "@/lib/nav";
import { loadForOperator } from "@/lib/operator-load";
import { readOpenQuestions } from "@/lib/questions-load";

import { QuestionTable } from "./_components/question-table";
import { UnclassifiedConfidence } from "./_components/unclassified-confidence";

// Appended at the end of `OPERATOR_ROUTES` -- see nav.ts's own comment on why
// an insert after `/waits` would have silently broken two settings pages that
// index this array positionally.
const NAV = OPERATOR_ROUTES.find((item) => item.href === "/questions")!;

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
 *
 * ## FR-96 -- four outcomes now, and the fourth is FR-96c
 *
 * The engagement filter is read from the URL and nowhere else (CR-005 §3.3
 * point 3: no cookie, no remembered last filter), and the picker that sets it
 * lives in the app shell rather than on this screen. What this screen owns is
 * honouring it: a resolvable slug narrows the list, and an unresolvable one
 * renders FR-96c's explicit state with **no rows** rather than the whole ledger
 * under a filtered heading.
 *
 * `withListFlag` is what keeps the "include answered" toggle from quietly
 * dropping that filter -- see its own header, which is a defect this unit did
 * not ship rather than one it fixed.
 */
export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamRecord>;
}) {
  const params = await searchParams;
  const rawAnswered = Array.isArray(params.answered)
    ? params.answered[0]
    : params.answered;
  const includeAnswered = rawAnswered === "1";
  const filter = engagementFilterFrom(params);

  // Resolved inside the load wrapper so a gated visitor gets exactly one
  // refusal, from the machinery that owns the gate. See `@/lib/engagement-resolve`.
  const result = await loadForOperator(async () => {
    const scope = await resolveEngagementFilter(filter);
    return {
      scope,
      listing: engagementScopeBlocksRows(scope)
        ? null
        : await readOpenQuestions({
            includeAnswered,
            engagementId: engagementScopeId(scope),
          }),
    };
  });

  const scope = result.ok ? result.data.scope : null;
  const listing = result.ok ? result.data.listing : null;

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
            href={withListFlag(
              "/questions",
              params,
              "answered",
              !includeAnswered,
            )}
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

      {/* FR-96c. The same `engagementScopeBlocksRows` that made `listing` null
          above is what guarantees no rows render beneath this. */}
      {scope === null ? null : <EngagementScopeNotice resolution={scope} />}

      {listing === null ? null : listing.questions.length === 0 ? (
        <EmptyState
          headline={
            // Scoped and unscoped are different claims. "No open questions have
            // been recorded." under `?engagement=acme` reports an empty ledger
            // on a request that only looked at one engagement.
            // Four sentences, two axes, and each one claims exactly what its
            // request looked at. The scope qualifier leads in the "nothing is
            // waiting" pair, because trailing it after the predicate reads as
            // part of the predicate — "waiting on an answer for acme" — rather
            // than as the scope of the search.
            //
            // The unfiltered `includeAnswered` line used to say "No OPEN
            // questions have been recorded." on a request that searched
            // answered ones too: narrower in the copy than in the query, which
            // leaves the reader believing answered rows may be hidden. It now
            // makes the claim the query supports.
            scope?.kind === "resolved"
              ? includeAnswered
                ? `No questions have been recorded for ${scope.slug}.`
                : `Nothing for ${scope.slug} is waiting on an answer.`
              : includeAnswered
                ? "No questions have been recorded."
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
