import Link from "next/link";

import { Absent } from "@/components/answer-chips";
import { EntityRef } from "@/components/entity-ref";
import { StateBadge } from "@/components/state-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toRef } from "@/lib/detail-load";
import type { ListedOpenQuestion } from "@/lib/questions-load";
import { formatDate, NOT_RECORDED } from "@/lib/registry-display";
import { cn } from "@/lib/utils";

/**
 * B36 -- the open-question ledger, one row per question, every row navigable
 * to `/questions/[id]`.
 *
 * ## The primary cell is an `<EntityRef>`, exactly like `/work-items`
 *
 * `open_question` has no natural human key (the table comment says so
 * verbatim: "No natural unique key, deliberately"). `identityLine` below
 * builds `run:unit §section` from whichever halves a row carries, the same
 * function `open-question-view.tsx` already uses for the detail header, and
 * `toRef` falls back to `fallbackLabel` when a row carries none of the three --
 * never a blank cell, and never a link with no visible text.
 *
 * ## `confidence`: present values are plain text, `null` is loud
 *
 * A recorded `low | med | high` renders as plain mono text, matching
 * `open-question-view.tsx`'s own treatment -- confidence is not one of spec
 * 5a's five named semantic states, so it earns no colour of its own.
 *
 * A `null` is different, and is rendered with `<StateBadge state="unparsed">`
 * rather than a quiet dash. That is a **deviation** from the single-question
 * detail view, which renders the same `null` as `<Absent>` with a stated
 * reason. Both are defensible and they are not yet the same choice — recorded
 * in the build report as a decision for Erik, not smoothed over here. The
 * list is new territory: nothing else in this product shows an aggregate
 * count of unclassified `open_question.confidence`, and `DefectSeverityChip`
 * already sets the precedent of reaching for the reserved fuchsia treatment
 * on exactly this shape of value -- an enum-like classification whose `null`
 * means "the classifier would not guess", not "nothing to show".
 *
 * ## No prose reaches this table
 *
 * `question`, `best_guess` and `answer` are never selected by
 * `listOpenQuestions`, so there is nothing to withhold here and no risk of one
 * landing in a `data-verify-*` attribute by accident.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="question-table"
 *   data-verify-unit="question-row"    data-verify-id, data-verify-status,
 *                                       data-verify-confidence
 *   data-verify-unit="question-confidence"  data-verify-confidence (a label or
 *                                       "unparsed", never prose)
 *   data-verify-unit="question-status"      data-verify-status
 */

function identityLine(question: ListedOpenQuestion): string | null {
  const pair =
    question.run !== null && question.unit !== null
      ? `${question.run}:${question.unit}`
      : (question.run ?? question.unit);

  const section = question.section === null ? null : `§${question.section}`;
  const parts = [pair, section].filter((part) => part !== null);

  return parts.length === 0 ? null : parts.join(" ");
}

/**
 * `open | answered`, on the neutral ladder rather than the semantic scale --
 * spec 5a reserves that scale for five named states and this is not one of
 * them. Any third value (there should not be one; the column is a
 * non-nullable Postgres enum) renders on the `blocked` family so an
 * impossible state is visibly wrong rather than silently blended in.
 */
function StatusPill({ status }: { status: string }) {
  const known = status === "open" || status === "answered";

  return (
    <span
      data-verify-unit="question-status"
      data-verify-status={status}
      className={cn(
        "ident inline-flex items-center rounded-md border px-1.5 py-0.5 text-xs leading-none whitespace-nowrap",
        status === "open" && "border-border text-foreground/80",
        status === "answered" &&
          "border-border/60 text-muted-foreground bg-transparent",
        !known &&
          "border-state-blocked/50 bg-state-blocked/10 text-state-blocked font-semibold",
      )}
    >
      {status}
    </span>
  );
}

function ConfidenceCell({ confidence }: { confidence: string | null }) {
  if (confidence === null) {
    return (
      <span
        data-verify-unit="question-confidence"
        data-verify-confidence="unparsed"
        title="No confidence classified low, medium or high. Either nothing was stated, or something was stated and the ingest mapping correctly refused to guess which label it meant -- both read back as this same value."
      >
        <StateBadge state="unparsed" />
      </span>
    );
  }

  return (
    <span
      data-verify-unit="question-confidence"
      data-verify-confidence={confidence}
      className="ident text-muted-foreground text-xs"
    >
      {confidence}
    </span>
  );
}

export function QuestionTable({
  questions,
}: {
  questions: readonly ListedOpenQuestion[];
}) {
  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <Table data-verify-unit="question-table">
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">question</TableHead>
            <TableHead className="whitespace-nowrap">engagement</TableHead>
            <TableHead className="whitespace-nowrap">confidence</TableHead>
            <TableHead className="whitespace-nowrap">status</TableHead>
            <TableHead className="whitespace-nowrap">answered by</TableHead>
            <TableHead className="whitespace-nowrap">answered at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((question) => {
            const identifier = identityLine(question);
            const answeredAt = formatDate(question.answeredAt);

            return (
              <TableRow
                key={question.id}
                data-verify-unit="question-row"
                data-verify-id={question.id}
                data-verify-status={question.status}
                data-verify-confidence={question.confidence ?? "unparsed"}
              >
                <TableCell className="font-medium whitespace-nowrap">
                  <EntityRef {...toRef("open_question", question.id, identifier)} />
                </TableCell>

                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {question.engagementSlug === null ? (
                    <Absent title="This question's engagement could not be read." />
                  ) : (
                    <Link
                      href={`/registry/${question.engagementSlug}`}
                      data-verify-unit="engagement-link"
                      data-verify-slug={question.engagementSlug}
                      className="hover:text-foreground underline-offset-2 hover:underline"
                    >
                      {question.engagementClientName ?? question.engagementSlug}{" "}
                      <span className="ident text-muted-foreground/70 text-xs">
                        {question.engagementSlug}
                      </span>
                    </Link>
                  )}
                </TableCell>

                <TableCell>
                  <ConfidenceCell confidence={question.confidence} />
                </TableCell>

                <TableCell>
                  <StatusPill status={question.status} />
                </TableCell>

                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {question.answeredBy ?? (
                    <Absent title="No answerer was recorded." />
                  )}
                </TableCell>

                <TableCell className="ident text-muted-foreground whitespace-nowrap">
                  {answeredAt === NOT_RECORDED ? (
                    <Absent title="No answer timestamp was recorded." />
                  ) : (
                    answeredAt
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
