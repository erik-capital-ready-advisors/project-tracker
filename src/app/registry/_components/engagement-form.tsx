"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { joinList } from "@/lib/registry-display";
import type { EngagementRecord } from "@/lib/server/registry/types";

import { submitEngagement } from "../actions";
import { EMPTY_FORM_STATE } from "../_lib/form-state";
import { Field, Fieldset, TextField } from "./field";
import { FormBanner } from "./form-banner";

/**
 * FR-9 + FR-77 + FR-78 — the one form in this product where Erik types.
 *
 * FR-13 says engagement and milestone records are the only data he enters and
 * everything else is captured or derived, which makes this form the entire
 * manual-input surface of the product. It is grouped into three fieldsets
 * because they are three different kinds of question — who the work is for,
 * where its artifacts live, and which accounts it was provisioned into — and
 * a flat list of fourteen inputs makes the third invisible.
 *
 * **The provisioning fieldset carries its own warning and that is the point.**
 * FR-77 exists so the wrong-account failure mode is visible in one lookup rather
 * than discovered during an incident, and FR-78 keeps those columns classified
 * `personal` rather than `sensitive` by refusing anything credential-shaped. The
 * refusal happens in a database trigger, so this form does not pre-empt it —
 * a second copy of the rule here would drift from the first. It explains it, and
 * `FormBanner` renders the database's answer verbatim when it fires.
 *
 * State contract for qa-reviewer:
 *   data-verify-unit="engagement-form"
 *   data-verify-mode="create" | "edit"
 */
export function EngagementForm({
  engagement,
}: {
  /** Absent for a new engagement. Present to edit one in place. */
  engagement?: EngagementRecord;
}) {
  const [state, formAction, pending] = useActionState(
    submitEngagement,
    EMPTY_FORM_STATE,
  );
  const editing = engagement !== undefined;

  return (
    <form
      action={formAction}
      className="flex max-w-3xl flex-col gap-4"
      data-verify-unit="engagement-form"
      data-verify-mode={editing ? "edit" : "create"}
    >
      {editing ? <input type="hidden" name="id" value={engagement.id} /> : null}

      <FormBanner state={state} />

      <Fieldset
        legend="Engagement"
        detail="Who the work is for, and on what terms."
      >
        <Field
          name="clientName"
          label="Client"
          required
          defaultValue={engagement?.clientName}
          hint="The display and grouping key everywhere else in the product."
        />
        <Field
          name="slug"
          label="Slug"
          required
          mono
          defaultValue={engagement?.slug}
          placeholder="acme-rebuild"
          hint="Lowercase, digits and single hyphens. This is the URL key on every screen."
        />
        <Field
          name="status"
          label="Status"
          defaultValue={engagement?.status ?? "active"}
          hint="Free text — deliberately not a fixed list."
        />
        <Field
          name="contractType"
          label="Contract type"
          defaultValue={engagement?.contractType ?? ""}
          placeholder="fixed-price"
        />
        <Field
          name="source"
          label="Sourced how"
          wide
          defaultValue={engagement?.source ?? ""}
          placeholder="Upwork — inbound"
          hint="How the work arrived. Free text."
        />
      </Fieldset>

      <Fieldset
        legend="Where the work lives"
        detail="The paths ingest reads. Everything derived from this engagement is found through them."
      >
        <Field
          name="repoPath"
          label="Repository path"
          mono
          wide
          defaultValue={engagement?.repoPath ?? ""}
          placeholder="/Users/…/projects/acme"
        />
        <Field
          name="specPath"
          label="Spec path"
          mono
          defaultValue={engagement?.specPath ?? ""}
          placeholder="spec/spec-approved.md"
          hint="Requirements are ingested from here, and acceptance references resolve against them (FR-12)."
        />
        <Field
          name="fleetDir"
          label="Fleet artifact directory"
          mono
          defaultValue={engagement?.fleetDir ?? ""}
          placeholder=".fleet"
        />
        <TextField
          name="stacks"
          label="Stacks"
          wide
          rows={2}
          defaultValue={engagement ? joinList(engagement.stacks) : ""}
          placeholder="nextjs, supabase, vercel"
          hint="Comma or newline separated. Duplicates are dropped."
        />
      </Fieldset>

      <Fieldset
        legend="Provisioning identifiers"
        detail={
          <>
            Which accounts this engagement was actually provisioned into, so the
            wrong-account failure mode is one lookup rather than an incident
            (FR-77).{" "}
            <strong className="text-foreground font-medium">
              These are identifiers, never secrets.
            </strong>{" "}
            A value shaped like a key or a token is refused by the database and
            reported here, because a credential pasted where an identifier
            belongs is a credential in the database (FR-78).
          </>
        }
      >
        <Field
          name="dbOrg"
          label="Database organisation"
          mono
          defaultValue={engagement?.dbOrg ?? ""}
          placeholder="acme-studio"
        />
        <Field
          name="dbProjectRef"
          label="Database project ref"
          mono
          defaultValue={engagement?.dbProjectRef ?? ""}
          placeholder="abcdefghijklmnopqrst"
        />
        <Field
          name="hostingTeam"
          label="Hosting team"
          mono
          defaultValue={engagement?.hostingTeam ?? ""}
          placeholder="acme"
        />
        <Field
          name="hostingProject"
          label="Hosting project"
          mono
          defaultValue={engagement?.hostingProject ?? ""}
          placeholder="acme-web"
        />
        <Field
          name="productionUrl"
          label="Production URL"
          type="url"
          mono
          wide
          defaultValue={engagement?.productionUrl ?? ""}
          placeholder="https://acme.example.com"
          hint="Must begin with https:// — this is where client data is served from."
        />
      </Fieldset>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} data-verify-unit="engagement-submit">
          {pending
            ? "Saving…"
            : editing
              ? "Save engagement"
              : "Register engagement"}
        </Button>
        <p className="text-muted-foreground text-xs">
          Nothing is saved unless this succeeds.
        </p>
      </div>
    </form>
  );
}
