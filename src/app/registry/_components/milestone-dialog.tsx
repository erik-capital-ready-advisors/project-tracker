"use client";

import { useActionState, useCallback, useEffect, useState } from "react";

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
import { joinList, toDateInputValue } from "@/lib/registry-display";
import type { MilestoneRecord } from "@/lib/server/registry/types";

import { submitMilestone } from "../actions";
import { EMPTY_FORM_STATE } from "../_lib/form-state";
import { Field, TextField } from "./field";
import { FormBanner } from "./form-banner";

/**
 * FR-10 + FR-12 — add or edit a contract milestone.
 *
 * The body is a separate component mounted with a fresh `key` each time the
 * dialog opens. `useActionState` keeps its state for the life of the component,
 * so without that remount, closing a dialog after a successful save and opening
 * it again shows the previous save's banner over an empty form — a stale success
 * message next to unsaved input is exactly the wrong thing for the one screen in
 * this product where Erik types (FR-13).
 *
 * **A clean save closes the dialog; a save with findings does not.** FR-12's
 * dangling acceptance references come back on the write, and closing the dialog
 * on them would report the finding into a modal that is no longer on screen. The
 * table underneath marks them permanently either way, so nothing is lost — but
 * the moment to fix a typo'd `FR-` reference is while the form is still open.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="milestone-dialog-trigger", data-verify-mode
 *   data-verify-unit="milestone-form", data-verify-mode="create" | "edit"
 */

function MilestoneFormBody({
  engagementId,
  slug,
  milestone,
  onClean,
}: {
  engagementId: string;
  slug: string;
  milestone?: MilestoneRecord;
  onClean: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    submitMilestone,
    EMPTY_FORM_STATE,
  );
  const editing = milestone !== undefined;

  // Close on a save with nothing to report; stay open when there is. This runs
  // in an effect rather than during render because it updates the PARENT — a
  // `setState` on another component during render is the warning React exists
  // to give you, and here it would fire on every keystroke after a save.
  const clean = state.status === "success" && state.warnings.length === 0;
  useEffect(() => {
    if (clean) onClean();
  }, [clean, onClean]);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-3"
      data-verify-unit="milestone-form"
      data-verify-mode={editing ? "edit" : "create"}
    >
      <input type="hidden" name="engagementId" value={engagementId} />
      <input type="hidden" name="slug" value={slug} />
      {editing ? (
        <input type="hidden" name="milestoneId" value={milestone.id} />
      ) : null}

      <FormBanner state={state} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          name="name"
          label="Milestone"
          required
          wide
          defaultValue={milestone?.name}
          placeholder="Phase 1 — ingest and the six answers"
        />
        <Field
          name="amount"
          label="Amount"
          mono
          inputMode="decimal"
          defaultValue={
            milestone?.amount === null || milestone?.amount === undefined
              ? ""
              : String(milestone.amount)
          }
          placeholder="12000"
          hint={
            milestone !== undefined && milestone.amount === null
              ? "The stored amount did not decrypt. Leaving this blank clears it; it is not currently zero."
              : "Encrypted at rest. Stored per milestone, never aggregated in SQL."
          }
        />
        <Field
          name="currency"
          label="Currency"
          required
          mono
          defaultValue={milestone?.currency ?? "USD"}
          placeholder="USD"
          hint="Three-letter code."
        />
        <Field
          name="dueDate"
          label="Due"
          type="date"
          mono
          defaultValue={toDateInputValue(milestone?.dueDate ?? null)}
        />
        <TextField
          name="acceptance"
          label="Acceptance"
          wide
          rows={2}
          mono
          defaultValue={milestone ? joinList(milestone.acceptance) : ""}
          placeholder="FR-10, FR-11, FR-12"
          hint="The requirement references that constitute acceptance. Matched by reference, never by text. A reference naming a requirement this engagement has not ingested is saved and reported, not rejected (FR-12)."
        />
        <TextField
          name="notes"
          label="Notes"
          wide
          rows={3}
          defaultValue={milestone?.notes ?? ""}
          hint="Encrypted at rest."
        />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save milestone" : "Add milestone"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function MilestoneDialog({
  engagementId,
  slug,
  milestone,
}: {
  engagementId: string;
  slug: string;
  /** Absent to add a milestone; present to edit one. */
  milestone?: MilestoneRecord;
}) {
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);
  const editing = milestone !== undefined;

  function change(next: boolean) {
    if (next) setInstance((value) => value + 1);
    setOpen(next);
  }

  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button
          variant={editing ? "ghost" : "default"}
          size={editing ? "xs" : "sm"}
          data-verify-unit="milestone-dialog-trigger"
          data-verify-mode={editing ? "edit" : "create"}
        >
          {editing ? "Edit" : "Add milestone"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {editing ? milestone.name : "Add a contract milestone"}
          </DialogTitle>
          <DialogDescription className="text-xs">
            A name, an amount, a due date, and the requirement references that
            constitute acceptance (FR-10).
          </DialogDescription>
        </DialogHeader>
        <MilestoneFormBody
          key={instance}
          engagementId={engagementId}
          slug={slug}
          milestone={milestone}
          onClean={close}
        />
      </DialogContent>
    </Dialog>
  );
}
