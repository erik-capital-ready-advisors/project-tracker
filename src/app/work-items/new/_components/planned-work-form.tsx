"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Field, Fieldset, TextField } from "@/app/registry/_components/field";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action-result";

/**
 * FR-88 — planned work, entered by hand.
 *
 * ## The action arrives as a prop
 *
 * `onCreate` is passed down from the Server Component rather than imported.
 * Passing a Server Action as a prop is a supported Next pattern and it buys the
 * property this unit needs most: the whole interaction — choose, type, submit,
 * pending, refuse, succeed — is exercised in a unit test with a plain async
 * function in that slot, with no database, session or browser. `EngagementForm`
 * reaches for its own action and has, for that reason, no test at all.
 *
 * ## Why `onSubmit` rather than `useActionState`
 *
 * jsdom does not implement `HTMLFormElement.requestSubmit()`, which is what a
 * React form action goes through. u1 measured this in Phase 1: a submit test
 * passed against a handler that never ran, and `pnpm test` prints the
 * "Not implemented" line on this branch today. An explicit `onSubmit` handler
 * fires on a plain click, so the test exercises the thing it claims to.
 *
 * ## Why the engagement is enforced twice
 *
 * FR-87 as amended by Q14: *"a planned row carries an `engagement_id` at
 * creation. There is no unassigned planned row."* The check below is a
 * courtesy — it puts the refusal beside the control instead of after a round
 * trip. The **boundary** is `resolveEngagement` in the shared primitive, which
 * refuses an absent or unknown slug regardless of what any form did. A
 * client-side required field is not a control.
 *
 * The form carries `noValidate` so the two required fields are marked as
 * required — in the label, and to a screen reader — without the browser's own
 * bubble pre-empting the sentences below, which say more. It also keeps the
 * submit event reachable in jsdom, where an unsatisfied `required` otherwise
 * blocks submission before any handler runs and the refusal path becomes
 * untestable.
 *
 * ## §7a
 *
 * `work_item.description` is `sensitive`. Nothing typed into this form reaches
 * a `data-verify-*` attribute, a URL or an error message — the state contract
 * carries a status and a pending flag and nothing else. `autoComplete="off"`
 * comes from the shared `Field` components: none of this is offered to the
 * browser's autofill store.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="planned-work-form"
 *   data-verify-status="idle" | "submitting" | "error"
 *   data-verify-engagements="<count offered>"
 */
export function PlannedWorkForm({
  engagements,
  onCreate,
}: {
  /** Slug and display name. Never the whole engagement record. */
  engagements: readonly { slug: string; clientName: string }[];
  onCreate: (input: {
    engagementSlug: string;
    description: string;
    workType: string | null;
    unit: string | null;
  }) => Promise<ActionResult<{ id: string }>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [slug, setSlug] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);
    const text = (field: string): string | null => {
      const value = form.get(field);
      if (typeof value !== "string") return null;
      const trimmed = value.trim();
      return trimmed === "" ? null : trimmed;
    };

    if (slug === "") {
      setError(
        "Choose the engagement this work belongs to. There is no unassigned " +
          "planned work item.",
      );
      return;
    }

    const description = text("description");
    if (description === null) {
      setError(
        "Say what the work is. A planned item with no description tells the " +
          "person reading Next nothing.",
      );
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await onCreate({
        engagementSlug: slug,
        description,
        workType: text("workType"),
        unit: text("unit"),
      });

      if (result.ok) {
        router.push(`/work-items/${result.data.id}`);
        return;
      }

      setError(result.message);
    });
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex max-w-3xl flex-col gap-4"
      data-verify-unit="planned-work-form"
      data-verify-status={pending ? "submitting" : error === null ? "idle" : "error"}
      data-verify-engagements={engagements.length}
    >
      {error === null ? null : (
        <p
          id="planned-work-error"
          role="alert"
          data-verify-unit="planned-work-error"
          className="border-destructive/40 bg-destructive/5 text-foreground rounded-lg border px-3 py-2.5 text-sm"
        >
          {error}
        </p>
      )}

      <Fieldset
        legend="Planned work"
        detail={
          <>
            A planned item is recorded before any run exists, so{" "}
            <code className="ident">Next</code> can answer before there is
            anything to ingest. It is created with no execution mode and status{" "}
            <code className="ident">pending</code>; nobody has decided how it
            gets done yet (FR-87).
          </>
        }
      >
        <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
          <label htmlFor="engagementSlug" className="text-xs font-medium">
            Engagement
            {/* `aria-hidden` because the accessible name concatenates a label's
                text nodes without a separator: without it a screen reader
                announces this control as "Engagementrequired". Observed on the
                running app. The requirement itself is not lost — it is carried
                by `aria-required` on the select below. */}
            <span aria-hidden className="text-muted-foreground ml-1 font-normal">
              required
            </span>
          </label>
          <NativeSelect
            id="engagementSlug"
            name="engagementSlug"
            value={slug}
            disabled={pending || engagements.length === 0}
            aria-required="true"
            aria-invalid={error === null ? undefined : true}
            aria-describedby="engagementSlug-hint"
            onChange={(event) => {
              setSlug(event.target.value);
              setError(null);
            }}
            className="ident"
          >
            <option value="">choose an engagement…</option>
            {engagements.map((engagement) => (
              <option key={engagement.slug} value={engagement.slug}>
                {engagement.slug} — {engagement.clientName}
              </option>
            ))}
          </NativeSelect>
          <p id="engagementSlug-hint" className="text-muted-foreground text-xs">
            There is no unassigned planned item. The unassigned queue holds
            ingested sessions nothing could attribute; planned work has an owner
            by the time anybody plans it (Q14).
          </p>
        </div>

        <TextField
          name="description"
          label="What the work is"
          required
          wide
          rows={3}
          defaultValue=""
          placeholder="Wire the export panel to the new run columns"
          hint="Encrypted at rest (§7a). Written for the person who reads Next in ten seconds, not for a ticket."
        />

        <Field
          name="workType"
          label="Work type"
          placeholder="ui"
          hint="Free text, as it is on every ingested row."
        />

        <Field
          name="unit"
          label="Unit key"
          mono
          placeholder="u2"
          hint="Optional. The key a manifest would use for this unit, if there is one already."
        />
      </Fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={pending || engagements.length === 0}
          data-verify-unit="planned-work-submit"
        >
          {pending ? "Recording…" : "Record planned work"}
        </Button>
        {/* "written", not "saved": every refusal on this path — the two client
            checks above and all four server sentences in
            `create-planned-work-item.ts` — says "nothing was written", and one
            promise stated in two vocabularies is one the reader has to
            reconcile. */}
        <p className="text-muted-foreground text-xs">
          Nothing is written until this succeeds.
        </p>
      </div>
    </form>
  );
}
