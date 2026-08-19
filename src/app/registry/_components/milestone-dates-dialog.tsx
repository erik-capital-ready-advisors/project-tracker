"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toDateInputValue } from "@/lib/registry-display";
import type { MilestoneRecord } from "@/lib/server/registry/types";

import { submitMilestoneDate } from "../actions";
import { EMPTY_FORM_STATE } from "../_lib/form-state";
import { FormBanner } from "./form-banner";

/**
 * FR-11 — a milestone records a submitted date and a paid date, **each entered
 * in one action**.
 *
 * That phrasing is the design. Two separate forms, two separate submits, two
 * separate server actions: marking something paid must not require re-stating
 * when it was submitted, because a form that makes you re-enter a value you
 * already gave is a form that eventually gets a wrong value re-entered into it.
 *
 * Clearing is the same one action with an empty date, which is how a mis-click
 * is undone without a second concept.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="milestone-dates-trigger", data-verify-milestone
 *   data-verify-unit="milestone-date-form", data-verify-field="submitted" | "paid"
 *   data-verify-set="true" | "false"
 */

function DateRow({
  milestoneId,
  slug,
  field,
  label,
  detail,
  current,
}: {
  milestoneId: string;
  slug: string;
  field: "submitted" | "paid";
  label: string;
  detail: string;
  current: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    submitMilestoneDate,
    EMPTY_FORM_STATE,
  );
  const value = toDateInputValue(current);

  return (
    <form
      action={formAction}
      className="border-border flex flex-col gap-2 rounded-lg border px-3 py-2.5"
      data-verify-unit="milestone-date-form"
      data-verify-field={field}
      data-verify-set={value !== ""}
    >
      <input type="hidden" name="milestoneId" value={milestoneId} />
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="field" value={field} />

      <div className="flex flex-col gap-0.5">
        <label htmlFor={`${field}-${milestoneId}`} className="text-xs font-medium">
          {label}
        </label>
        <p className="text-muted-foreground text-xs">{detail}</p>
      </div>

      <div className="flex items-center gap-2">
        <Input
          id={`${field}-${milestoneId}`}
          name="date"
          type="date"
          defaultValue={value}
          autoComplete="off"
          className="ident h-8 w-auto text-sm"
        />
        <Button type="submit" size="sm" variant="outline" disabled={pending}>
          {pending ? "Saving…" : "Record"}
        </Button>
        <span className="text-muted-foreground text-xs">
          {/* COPY: sharpen the clearing hint */}
          Empty clears it.
        </span>
      </div>

      <FormBanner state={state} />
    </form>
  );
}

export function MilestoneDatesDialog({
  slug,
  milestone,
}: {
  slug: string;
  milestone: MilestoneRecord;
}) {
  const [open, setOpen] = useState(false);
  const [instance, setInstance] = useState(0);

  function change(next: boolean) {
    if (next) setInstance((value) => value + 1);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={change}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          data-verify-unit="milestone-dates-trigger"
          data-verify-milestone={milestone.id}
        >
          Dates
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{milestone.name}</DialogTitle>
          <DialogDescription className="text-xs">
            {/* COPY: sharpen the FR-11 framing */}
            Submitted and paid are recorded independently, each in one action
            (FR-11).
          </DialogDescription>
        </DialogHeader>

        {/* Remounted per open so a previous save's banner never greets the next one. */}
        <div key={instance} className="flex flex-col gap-3">
          <DateRow
            milestoneId={milestone.id}
            slug={slug}
            field="submitted"
            label="Submitted"
            detail="The day the work went to the client for acceptance."
            current={milestone.submittedAt}
          />
          <DateRow
            milestoneId={milestone.id}
            slug={slug}
            field="paid"
            label="Paid"
            detail="The day the money arrived. Independent of submission."
            current={milestone.paidAt}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
