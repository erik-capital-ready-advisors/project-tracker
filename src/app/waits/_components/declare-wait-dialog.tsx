"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import type { ActionResult } from "@/lib/action-result";
import { Field, NativeSelect } from "@/components/native-select";
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
import { Textarea } from "@/components/ui/textarea";

/**
 * FR-32 -- declare an external wait: an owner outside the studio, a reason, a
 * started date, an expected-by date, and the work items it blocks.
 *
 * All five are on this form and the three the requirement makes mandatory
 * (owner, started, and the wait's own label) are marked required. The form does
 * **not** validate beyond that, and that is deliberate: `parseWaitDeclaration`
 * is the validator, it is the same one the ingest route runs for FR-33, and a
 * second one here would be a second thing to keep in step. What the form does is
 * carry the server's refusal back to the field it belongs to.
 *
 * ## `owner_type` is a free-text input and not a dropdown
 *
 * Erik settled this. FR-29's reason classes and FR-30's dispositions *are*
 * stated closed sets and are enums; `external_wait.owner_type` is not, and
 * inventing one here would refuse the next kind of person the studio waits on.
 *
 * ## The action arrives as a prop
 *
 * `onDeclare` is passed in rather than imported, so the whole flow -- fill,
 * submit, pending, refuse, succeed, close -- is exercisable in a unit test with a
 * plain async function in that slot. See `attribute-form.tsx` for the same
 * decision and the same reason.
 */
export function DeclareWaitDialog({
  engagements,
  defaultStartedOn,
  onDeclare,
}: {
  engagements: readonly { slug: string; clientName: string }[];
  /**
   * The server's calendar day, passed down rather than computed here. A client
   * component renders twice -- once on the server, once at hydration -- and a
   * `new Date()` in that path is a hydration mismatch waiting for midnight.
   */
  defaultStartedOn: string;
  onDeclare: (payload: unknown) => Promise<ActionResult<unknown>>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [method, setMethod] = useState<"manual" | "probe">("manual");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string): string => String(form.get(name) ?? "").trim();

    // `blocks` is a list of work-item unit keys. Split on commas and whitespace
    // so a pasted manifest column works as typed.
    const blocks = text("blocks")
      .split(/[\s,]+/)
      .filter((entry) => entry !== "");

    const payload = {
      engagement: text("engagement"),
      label: text("label"),
      owner: text("owner"),
      ownerType: text("ownerType") || null,
      reason: text("reason") || null,
      startedAt: text("startedAt"),
      expectedBy: text("expectedBy") || null,
      resolutionMethod: text("resolutionMethod"),
      probeTarget: text("probeTarget") || null,
      blocks,
    };

    setError(null);
    startTransition(async () => {
      const result = await onDeclare(payload);
      if (result.ok) {
        setOpen(false);
        router.refresh();
        return;
      }
      setError(result.message);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" data-verify-unit="declare-wait-trigger">
          Declare a wait
        </Button>
      </DialogTrigger>
      <DialogContent
        data-verify-unit="declare-wait-dialog"
        className="sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>
            Declare an external wait
          </DialogTitle>
          <DialogDescription>
            Something outside the studio is holding work up. Record who owns it
            and when it is expected back, so the delay shows on Blocked and
            moves the milestone's projected date.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={submit}
          data-verify-unit="declare-wait-form"
          data-verify-pending={pending ? "true" : "false"}
          className="flex flex-col gap-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field id="wait-engagement" label="Engagement">
              <NativeSelect
                id="wait-engagement"
                name="engagement"
                required
                className="ident"
              >
                <option value="">choose…</option>
                {engagements.map((engagement) => (
                  <option key={engagement.slug} value={engagement.slug}>
                    {engagement.slug} — {engagement.clientName}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            <Field
              id="wait-owner"
              label="Owner"
              hint="The person or organisation outside the studio."
            >
              <Input
                id="wait-owner"
                name="owner"
                required
                autoComplete="off"
                aria-describedby="wait-owner-hint"
              />
            </Field>
          </div>

          <Field
            id="wait-label"
            label="Label"
            hint="Short and stable — re-declaring the same label updates the wait instead of creating a second one."
          >
            <Input
              id="wait-label"
              name="label"
              required
              autoComplete="off"
              aria-describedby="wait-label-hint"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field id="wait-owner-type" label="Owner type">
              <Input
                id="wait-owner-type"
                name="ownerType"
                autoComplete="off"
                placeholder="client, vendor, reviewer…"
              />
            </Field>

            <Field id="wait-started" label="Started">
              <Input
                id="wait-started"
                name="startedAt"
                type="date"
                required
                defaultValue={defaultStartedOn}
                className="ident"
              />
            </Field>

            <Field
              id="wait-expected"
              label="Expected by"
              hint="Leave blank if nobody has given a date."
            >
              <Input
                id="wait-expected"
                name="expectedBy"
                type="date"
                className="ident"
                aria-describedby="wait-expected-hint"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              id="wait-method"
              label="Resolution method"
              hint="`probe` names a check for Phase 2 automation; `manual` is the honest value where nobody can check it programmatically."
            >
              <NativeSelect
                id="wait-method"
                name="resolutionMethod"
                value={method}
                onChange={(event) =>
                  setMethod(event.target.value === "probe" ? "probe" : "manual")
                }
                className="ident"
                aria-describedby="wait-method-hint"
              >
                <option value="manual">manual</option>
                <option value="probe">probe</option>
              </NativeSelect>
            </Field>

            <Field
              id="wait-probe"
              label="Probe target"
              hint="Required when the method is a probe."
            >
              <Input
                id="wait-probe"
                name="probeTarget"
                autoComplete="off"
                required={method === "probe"}
                disabled={method !== "probe"}
                aria-describedby="wait-probe-hint"
                className="ident"
              />
            </Field>
          </div>

          <Field
            id="wait-blocks"
            label="Blocks"
            hint="Work-item unit keys, separated by commas or spaces. A key naming nothing is reported back rather than dropped."
          >
            <Input
              id="wait-blocks"
              name="blocks"
              autoComplete="off"
              className="ident"
              aria-describedby="wait-blocks-hint"
            />
          </Field>

          <Field id="wait-reason" label="Reason">
            <Textarea id="wait-reason" name="reason" rows={3} />
          </Field>

          {error === null ? null : (
            <p
              role="alert"
              data-verify-unit="declare-wait-error"
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
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? "Declaring…" : "Declare wait"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
