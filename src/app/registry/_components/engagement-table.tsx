import Link from "next/link";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIdentifier } from "@/lib/registry-display";
import type { EngagementRecord } from "@/lib/server/registry/types";
import { cn } from "@/lib/utils";

/**
 * Every engagement, newest first (FR-9).
 *
 * Spec 5a asks for a flight strip rather than a project management app, so the
 * row is one line and the identifiers sit in it rather than a click away. That
 * is FR-77's whole argument: the provisioning identifiers exist so the
 * wrong-account failure mode is visible in ONE lookup, and a list that hides
 * them behind a detail page has quietly made it two.
 *
 * Absent values render "not recorded", never blank. A blank cell and a cell
 * nobody rendered look identical, and the difference matters most on exactly the
 * columns that say which account a client's data is sitting in.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="engagement-table", data-verify-count="<rows>"
 *   data-verify-unit="engagement-row", data-verify-slug="<slug>"
 */

function Identifier({ value }: { value: string | null }) {
  const { text, recorded } = formatIdentifier(value);
  return (
    <span
      className={cn(
        "ident text-xs",
        recorded ? "text-foreground" : "text-muted-foreground/70 italic",
      )}
    >
      {text}
    </span>
  );
}

export function EngagementTable({
  engagements,
}: {
  engagements: readonly EngagementRecord[];
}) {
  return (
    <div
      className="border-border overflow-hidden rounded-lg border"
      data-verify-unit="engagement-table"
      data-verify-count={engagements.length}
    >
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="h-8 text-xs">Client</TableHead>
            <TableHead className="h-8 text-xs">Status</TableHead>
            <TableHead className="h-8 text-xs">Contract</TableHead>
            <TableHead className="h-8 text-xs">Stacks</TableHead>
            <TableHead className="h-8 text-xs">Database</TableHead>
            <TableHead className="h-8 text-xs">Hosting</TableHead>
            <TableHead className="h-8 text-xs">Production</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {engagements.map((engagement) => (
            <TableRow
              key={engagement.id}
              data-verify-unit="engagement-row"
              data-verify-slug={engagement.slug}
            >
              <TableCell className="py-2 align-top">
                <Link
                  href={`/registry/${engagement.slug}`}
                  className="hover:text-primary text-sm font-medium underline-offset-4 hover:underline"
                >
                  {engagement.clientName}
                </Link>
                <div className="ident text-muted-foreground text-xs">
                  {engagement.slug}
                </div>
              </TableCell>
              <TableCell className="py-2 align-top">
                <span className="ident text-xs">{engagement.status}</span>
              </TableCell>
              <TableCell className="text-muted-foreground py-2 align-top text-xs">
                {formatIdentifier(engagement.contractType).text}
              </TableCell>
              <TableCell className="py-2 align-top">
                {engagement.stacks.length === 0 ? (
                  <span className="text-muted-foreground/70 text-xs italic">
                    not recorded
                  </span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {engagement.stacks.map((stack) => (
                      <span
                        key={stack}
                        className="border-border ident text-muted-foreground rounded border px-1.5 py-0.5 text-[0.7rem] leading-none"
                      >
                        {stack}
                      </span>
                    ))}
                  </span>
                )}
              </TableCell>
              <TableCell className="py-2 align-top">
                <Identifier value={engagement.dbProjectRef} />
                <div className="text-muted-foreground/70 ident text-[0.7rem]">
                  {formatIdentifier(engagement.dbOrg).text}
                </div>
              </TableCell>
              <TableCell className="py-2 align-top">
                <Identifier value={engagement.hostingProject} />
                <div className="text-muted-foreground/70 ident text-[0.7rem]">
                  {formatIdentifier(engagement.hostingTeam).text}
                </div>
              </TableCell>
              <TableCell className="py-2 align-top">
                <Identifier value={engagement.productionUrl} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
