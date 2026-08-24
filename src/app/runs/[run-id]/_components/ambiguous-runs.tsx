import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { Absent } from "@/components/answer-chips";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { RunIdentity } from "@/lib/runs-load";

/**
 * More than one run carries this id.
 *
 * ## Why this is a screen rather than a 404 or a first match
 *
 * `fleet_run`'s constraint is `unique (engagement_id, run_id)` — a run id is
 * unique **within an engagement**, not across the ledger — while FR-92 makes
 * `/runs` cross-engagement. Run ids are six hex characters, so two engagements
 * sharing one is a collision waiting rather than a theoretical.
 *
 * Both shortcuts are wrong in the specific way this product refuses:
 *
 *   * **`notFound()`** tells a reader that a run they can see listed on `/runs`
 *     does not exist.
 *   * **taking the first match** renders one engagement's run under an id that
 *     also belongs to another's, with nothing on the screen saying so — a wrong
 *     answer that looks checked.
 *
 * So every match is listed and none is chosen. It cannot fire on today's data
 * (one run, two engagements) and it is built and tested anyway: a branch nothing
 * has ever exercised is indistinguishable from a branch that does not work, and
 * the day it first fires is the worst possible day to find that out.
 *
 * ## Why no row links to its run
 *
 * There is no route that can select one. `/runs/[run-id]` is keyed by the human
 * id alone, and adding an engagement scope to the key — or an
 * `?engagement=` parameter — would be building CR-005 §3.3 (FR-96), which is
 * DRAFT and NOT APPROVED. `i1` queued the routing question for Erik; until he
 * rules, each row links to its **engagement**, which does have a detail view, and
 * the screen says plainly that it cannot narrow further. Guessing a route key is
 * how a screen ends up answering a question nobody asked it.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="run-ambiguous"
 *   data-verify-run       the id that matched more than once
 *   data-verify-matches   how many runs carry it
 *   data-verify-unit="run-ambiguous-row"  data-verify-id
 */
export function AmbiguousRuns({
  runId,
  matches,
}: {
  runId: string;
  matches: readonly RunIdentity[];
}) {
  return (
    <div
      data-verify-unit="run-ambiguous"
      data-verify-run={runId}
      data-verify-matches={matches.length}
      className="flex flex-col gap-3"
    >
      <div className="border-state-blocked/40 bg-state-blocked/5 text-state-blocked flex flex-col gap-1 rounded-lg border px-4 py-3 text-xs">
        <span className="ident inline-flex items-center gap-1.5 font-semibold">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {matches.length} runs are recorded under the id{" "}
          <span className="ident">{runId}</span>
        </span>
        <span className="text-muted-foreground max-w-2xl">
          A fleet run id is unique within an engagement and not across the
          ledger, so this address names more than one run. None has been chosen:
          picking one would put an engagement&rsquo;s run behind an id that also
          belongs to another&rsquo;s, with nothing here saying so. Each row links
          to its engagement, which is as far as this route can narrow today.
        </span>
      </div>

      <div className="border-border overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">engagement</TableHead>
              <TableHead className="whitespace-nowrap">branch</TableHead>
              <TableHead className="whitespace-nowrap">mode</TableHead>
              <TableHead className="whitespace-nowrap">row</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((match) => (
              <TableRow
                key={match.id}
                data-verify-unit="run-ambiguous-row"
                data-verify-id={match.id}
              >
                <TableCell className="whitespace-nowrap">
                  {match.engagement === null ? (
                    <Absent title="This run's engagement could not be read." />
                  ) : (
                    <Link
                      href={`/registry/${match.engagement.slug}`}
                      data-verify-unit="engagement-link"
                      data-verify-slug={match.engagement.slug}
                      className="hover:text-foreground inline-flex flex-wrap items-baseline gap-2 underline-offset-2 hover:underline"
                    >
                      <span className="text-foreground">
                        {match.engagement.clientName}
                      </span>
                      <span className="ident text-muted-foreground/85 text-xs">
                        {match.engagement.slug}
                      </span>
                    </Link>
                  )}
                </TableCell>

                <TableCell className="ident text-muted-foreground text-xs break-all">
                  {match.branch ?? <Absent title="No branch was recorded." />}
                </TableCell>

                <TableCell className="ident text-muted-foreground whitespace-nowrap">
                  {match.mode ?? <Absent title="No mode was recorded." />}
                </TableCell>

                <TableCell className="ident text-muted-foreground/85 text-xs break-all">
                  {match.id}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
