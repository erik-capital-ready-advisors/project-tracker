"use client";

import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ActionResult } from "@/lib/action-result";
import { confirmationMatches, type PurgeResult } from "@/lib/purge-result";

/**
 * FR-61 — archive, restore, and hard deletion, at the surface a person touches.
 *
 * ## "Never the default" is spelled three ways here
 *
 * FR-61's operative phrase is that hard deletion is "a separate administrative
 * action, audited, and never the default". Three mechanisms carry that, and each
 * of them is a different kind of gate on purpose:
 *
 *   1. **Archiving is one click and reversible**, and it is the only control
 *      offered on a live engagement. It is what a person reaching for "get this
 *      out of my way" should find, and it is what they do find.
 *   2. **The delete control does not light up until the engagement is
 *      archived**, and the database refuses the same thing independently. This
 *      one is a courtesy; `app.purge_engagement()` is the control.
 *   3. **The slug is typed by hand.** Not a checkbox, not a second button — a
 *      string that cannot be produced by a mis-click, checked here for the
 *      person and again in the server action for the endpoint.
 *
 * ## The three outcomes are three outcomes
 *
 * A purge answers `purged`, `refused` or `unparsed`, and this renders all three
 * distinctly. Collapsing the last two into "something went wrong" would be the
 * failure this product exists to refuse, pointed at its own most destructive
 * action: reporting that a client's ledger is gone when it is not, or that it
 * survived when it did not.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="danger-zone", data-verify-archived="true" | "false"
 *   data-verify-unit="purge-outcome", data-verify-kind="purged" | "refused" | "unparsed"
 */

export interface DangerZoneProps {
  engagementId: string;
  slug: string;
  archivedAt: string | null;
  onArchive: (id: string) => Promise<ActionResult<{ archivedAt: string | null }>>;
  onRestore: (id: string) => Promise<ActionResult<{ archivedAt: string | null }>>;
  onPurge: (slug: string, typed: string) => Promise<PurgeResult>;
}

function PurgeOutcome({ result }: { result: PurgeResult }) {
  if (result.kind === "purged") {
    return (
      <Alert
        className="border-state-verified/40 bg-state-verified/10 px-3 py-2.5"
        data-verify-unit="purge-outcome"
        data-verify-kind="purged"
      >
        <CircleCheck aria-hidden className="text-state-verified" />
        <AlertTitle className="text-sm">
          {result.slug} is gone — {result.totalRows} rows destroyed
        </AlertTitle>
        <AlertDescription className="flex max-w-prose flex-col gap-2 text-sm">
          <ul className="ident flex flex-col gap-0.5 text-xs">
            {result.destroyed.map((one) => (
              <li key={one.table}>
                {one.table} · {one.rows}
              </li>
            ))}
          </ul>
          {result.retained.length > 0 ? (
            <p className="text-muted-foreground text-xs">
              Retained, and not deletable by anyone:{" "}
              <span className="ident">{result.retained.join(", ")}</span>. Those tables
              outlive the engagement they refer to, so the identifiers they hold now point
              at rows that no longer exist. That is expected — an orphaned audit row is
              evidence, and a deleted one is a gap.
            </p>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  if (result.kind === "refused") {
    return (
      <Alert
        variant="destructive"
        className="px-3 py-2.5"
        data-verify-unit="purge-outcome"
        data-verify-kind="refused"
      >
        <CircleAlert aria-hidden />
        <AlertTitle className="text-sm">Nothing was deleted</AlertTitle>
        <AlertDescription className="max-w-prose text-sm">{result.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert
      className="border-state-unparsed/50 bg-state-unparsed/10 px-3 py-2.5"
      data-verify-unit="purge-outcome"
      data-verify-kind="unparsed"
    >
      <TriangleAlert aria-hidden className="text-state-unparsed" />
      <AlertTitle className="text-sm">unparsed — the answer could not be read</AlertTitle>
      <AlertDescription className="max-w-prose text-sm">
        {result.reason}
      </AlertDescription>
    </Alert>
  );
}

export function DangerZone({
  engagementId,
  slug,
  archivedAt,
  onArchive,
  onRestore,
  onPurge,
}: DangerZoneProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [open, setOpen] = useState(false);
  const [outcome, setOutcome] = useState<PurgeResult | null>(null);

  const archived = archivedAt !== null;

  function runArchive(action: (id: string) => Promise<ActionResult<{ archivedAt: string | null }>>) {
    setArchiveMessage(null);
    startTransition(async () => {
      const result = await action(engagementId);
      if (result.ok) {
        router.refresh();
        return;
      }
      setArchiveMessage(result.message);
    });
  }

  function runPurge() {
    startTransition(async () => {
      const result = await onPurge(slug, typed);
      setOutcome(result);
      setTyped("");
      if (result.kind === "purged") {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <section
      className="border-border rounded-lg border"
      aria-labelledby="danger-zone-heading"
      data-verify-unit="danger-zone"
      data-verify-archived={String(archived)}
    >
      <header className="border-border border-b px-4 py-2.5">
        <h2 id="danger-zone-heading" className="text-sm font-semibold">
          Archive and deletion
        </h2>
        <p className="text-muted-foreground mt-0.5 text-xs">
          FR-61. Archiving is reversible. Deletion is not, and it stops at the audit
          boundary.
        </p>
      </header>

      <div className="flex flex-col gap-3 px-4 py-3">
        <div aria-live="polite" className="empty:hidden">
          {archiveMessage !== null ? (
            <Alert variant="destructive" className="px-3 py-2.5">
              <CircleAlert aria-hidden />
              <AlertTitle className="text-sm">Not changed</AlertTitle>
              <AlertDescription className="max-w-prose text-sm">
                {archiveMessage}
              </AlertDescription>
            </Alert>
          ) : null}
          {outcome !== null ? <PurgeOutcome result={outcome} /> : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {archived ? (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => runArchive(onRestore)}
              data-verify-unit="restore-button"
            >
              Restore from archive
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled={pending}
              onClick={() => runArchive(onArchive)}
              data-verify-unit="archive-button"
            >
              Archive
            </Button>
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={!archived || pending}
                data-verify-unit="purge-trigger"
              >
                Delete permanently
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete {slug} permanently</DialogTitle>
                <DialogDescription className="max-w-prose">
                  This destroys the engagement and everything about its current state —
                  work items, blockers, requirements, contract milestones, questions,
                  defects, releases and test cases. It cannot be undone.
                </DialogDescription>
              </DialogHeader>

              <p className="text-muted-foreground max-w-prose text-xs">
                What it does <em>not</em> destroy: <span className="ident">audit_log</span>{" "}
                and <span className="ident">test_result</span>. Those are append-only and no
                role may delete from them, so their rows will outlive this engagement and
                refer to it by identifiers that no longer resolve. That is the intended
                state.
              </p>

              <label className="flex flex-col gap-1.5 text-sm" htmlFor="purge-confirmation">
                <span>
                  Type the slug <span className="ident font-semibold">{slug}</span> to
                  confirm
                </span>
                <Input
                  id="purge-confirmation"
                  value={typed}
                  autoComplete="off"
                  className="ident"
                  onChange={(event) => setTyped(event.target.value)}
                  data-verify-unit="purge-confirmation"
                />
              </label>

              <DialogFooter>
                <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={!confirmationMatches(slug, typed) || pending}
                  onClick={runPurge}
                  data-verify-unit="purge-confirm"
                >
                  Delete this engagement
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {!archived ? (
            <p className="text-muted-foreground text-xs">
              Archive it first — that step is reversible and this one is not.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
