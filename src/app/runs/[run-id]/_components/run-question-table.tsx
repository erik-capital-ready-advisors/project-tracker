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
import { isoDay } from "@/lib/display-format";
import type { RunQuestion } from "@/lib/runs-load";
import { cn } from "@/lib/utils";

/**
 * FR-93's *"the questions it queued"* — 96 rows on the one run in the ledger
 * today, and the reason this screen needed a density decision at all.
 *
 * ## Exhaustive, and it says how many
 *
 * There is no cap here and no "show more". `loadRunDetail` pages to an exact
 * count and reports a stalled read as an error rather than as a short page, so
 * the list this table receives is complete — and the count stated above it is
 * what lets a reader know that without trusting the scrollbar. A silently
 * truncated list is the display-layer form of the failure this product exists to
 * prevent: it reads as a complete answer and is not one.
 *
 * Density comes from the row rather than from hiding rows — one line each, mono
 * identifiers, no wrapping inside a token — which is §5a's instrument panel
 * applied to ninety-six of something.
 *
 * ## D4 — clear columns only, and the link is what carries the prose
 *
 * `open_question.question`, `best_guess` and `answer` are `bytea` under §7a and
 * `i1`'s projection never selects them. This table renders `unit`, `section`,
 * `confidence`, `status`, `answered by` and `answered at`, and links every row
 * to `/questions/[id]`, which already decrypts behind its own gate. It says
 * *which* question to open, never what it asked.
 *
 * `section` is the closest thing here to prose — it is a spec heading the fleet
 * wrote — so it is rendered as text and deliberately kept **out** of every
 * `data-verify-*` attribute. On run `29b583` a mutation adding those three
 * columns to `/questions`' select was caught by nothing; keeping ingested text
 * out of the state contract is one fewer path by which it could reach one.
 *
 * ## `confidence` follows `/questions`, not `/questions/[id]`
 *
 * A recorded `low | med | high` is plain mono text — confidence is not one of
 * §5a's five named states and earns no colour. A `null` is the reserved
 * `unparsed` badge, matching `question-table.tsx`'s treatment exactly rather
 * than the single-question view's quieter `<Absent>`. Both exist in this
 * repository; a listing follows the listing, because the reason
 * `question-table.tsx` gives is a listing's reason — a `null` here means the
 * classifier would not guess, not that there is nothing to show.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-question-table"  data-verify-count
 *   data-verify-unit="run-question-row"
 *   data-verify-id, data-verify-status, data-verify-confidence, data-verify-key
 */

/** `open | answered`, on the neutral ladder. `question-table.tsx`'s treatment. */
function StatusPill({ status }: { status: string }) {
  const known = status === "open" || status === "answered";

  return (
    <span
      data-verify-unit="run-question-status"
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
        data-verify-unit="run-question-confidence"
        data-verify-confidence="unparsed"
        title="No confidence classified low, medium or high. Either nothing was stated, or something was stated and the ingest mapping correctly refused to guess which label it meant — both read back as this same value."
      >
        <StateBadge state="unparsed" />
      </span>
    );
  }

  return (
    <span
      data-verify-unit="run-question-confidence"
      data-verify-confidence={confidence}
      className="ident text-muted-foreground text-xs"
    >
      {confidence}
    </span>
  );
}

export function RunQuestionTable({
  questions,
}: {
  questions: readonly RunQuestion[];
}) {
  return (
    <div className="border-border overflow-x-auto border-t">
      <Table
        data-verify-unit="run-question-table"
        data-verify-count={questions.length}
      >
        <TableHeader>
          <TableRow>
            <TableHead className="whitespace-nowrap">question</TableHead>
            <TableHead className="whitespace-nowrap">unit</TableHead>
            <TableHead>section</TableHead>
            <TableHead className="whitespace-nowrap">confidence</TableHead>
            <TableHead className="whitespace-nowrap">status</TableHead>
            <TableHead className="whitespace-nowrap">answered by</TableHead>
            <TableHead className="whitespace-nowrap">answered at</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((question) => {
            const answeredAt = isoDay(question.answeredAt);

            return (
              <TableRow
                key={question.ref.id ?? question.ref.label}
                data-verify-unit="run-question-row"
                {...(question.ref.id === null
                  ? {}
                  : { "data-verify-id": question.ref.id })}
                data-verify-key={question.unit ?? "none"}
                data-verify-status={question.status}
                data-verify-confidence={question.confidence ?? "unparsed"}
              >
                <TableCell className="font-medium whitespace-nowrap">
                  <EntityRef {...question.ref} />
                </TableCell>

                <TableCell className="ident text-muted-foreground whitespace-nowrap">
                  {question.unit ?? (
                    <Absent title="This question names no work unit." />
                  )}
                </TableCell>

                {/* Ingested text, rendered and never put in an attribute. */}
                <TableCell className="text-muted-foreground min-w-0 max-w-md text-xs">
                  {question.section ?? (
                    <Absent title="This question names no spec section." />
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
                  {answeredAt ?? (
                    <Absent title="No answer timestamp was recorded." />
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
