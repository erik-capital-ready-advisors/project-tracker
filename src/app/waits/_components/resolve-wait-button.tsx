"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";
import { Field } from "@/components/native-select";
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

/**
 * FR-36 -- resolving a wait records who resolved it and when, and unblocks its
 * dependent work items.
 *
 * ## Why this is a dialog and not a one-click button
 *
 * Resolving is not reversible from the interface: `resolveWait` refuses a second
 * resolution outright, because "recording a second resolution would overwrite
 * who resolved it the first time" and FR-36 exists to record the who. A single
 * misplaced click would therefore permanently attribute the resolution to
 * whoever clicked. The dialog is the confirmation step that costs one keystroke
 * and prevents that.
 *
 * It also states what will happen to the dependent work items, because that is
 * the half of FR-36 a button label cannot carry: resolving this releases them
 * from `blocked` back to `pending`.
 *
 * ## Who is recorded
 *
 * Empty means "me" -- the server action defaults to the operator's own email,
 * which on this path is more accurate than anything typed. The override exists
 * because a wait is often cleared by the person outside the studio and Erik is
 * only recording that it happened.
 */
export function ResolveWaitButton({
  waitId,
  label,
  blockedCount,
  onResolve,
}: {
  waitId: string;
  /** The wait's own label, so the dialog names what is being resolved. */
  label: string;
  /** How many work items this wait currently holds. */
  blockedCount: number;
  onResolve: (
    waitId: string,
    resolvedBy?: string,
  ) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resolvedBy, setResolvedBy] = useState("");

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await onResolve(waitId, resolvedBy);
      if (result.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      setError(result.message);
    });
  }

  const fieldId = `resolved-by-${waitId}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          data-verify-unit="resolve-wait-trigger"
          data-verify-wait={waitId}
        >
          {/* COPY: the button that opens the resolve-wait confirmation */}
          Resolve
        </Button>
      </DialogTrigger>
      <DialogContent data-verify-unit="resolve-wait-dialog">
        <DialogHeader>
          <DialogTitle>
            {/* COPY: resolve-wait dialog title */}
            Resolve this wait
          </DialogTitle>
          <DialogDescription>
            <span className="ident text-foreground">{label}</span>
          </DialogDescription>
        </DialogHeader>

        <p className="text-muted-foreground text-sm">
          {/* COPY: what resolving does, including the effect on blocked items */}
          {blockedCount === 0
            ? "Nothing is currently blocked on this wait, so resolving it releases nothing. It will be recorded as resolved by you, now."
            : `This releases ${blockedCount} work ${blockedCount === 1 ? "item" : "items"} from blocked back to pending, and records who resolved it and when. It cannot be undone from this screen.`}
        </p>

        <Field
          id={fieldId}
          label="Resolved by"
          // COPY: hint for the resolved-by override
          hint="Leave blank to record yourself."
        >
          <Input
            id={fieldId}
            value={resolvedBy}
            autoComplete="off"
            disabled={pending}
            aria-describedby={`${fieldId}-hint`}
            onChange={(event) => setResolvedBy(event.target.value)}
          />
        </Field>

        {error === null ? null : (
          <p
            role="alert"
            data-verify-unit="resolve-wait-error"
            className="text-state-blocked text-xs"
          >
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            {/* COPY: cancel button */}
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={confirm}
            data-verify-unit="resolve-wait-confirm"
          >
            {/* COPY: confirm button, and its pending label */}
            {pending ? "Resolving…" : "Resolve"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
