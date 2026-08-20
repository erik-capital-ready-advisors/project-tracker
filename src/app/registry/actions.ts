"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ApiError } from "@/lib/api";
import type { ActionResult } from "@/lib/action-result";
import { runOperatorAction } from "@/lib/operator-load";
import type { PurgeResult } from "@/lib/purge-result";
import { splitList, splitRefs } from "@/lib/registry-display";
import {
  archiveEngagement,
  purgeEngagement,
  unarchiveEngagement,
} from "@/lib/server/registry/archive";
import {
  createEngagement,
  updateEngagement,
} from "@/lib/server/registry/engagements";
import {
  createContractMilestone,
  setMilestonePaid,
  setMilestoneSubmitted,
  updateContractMilestone,
} from "@/lib/server/registry/milestones";
import type { EngagementInput, MilestoneInput } from "@/lib/server/registry/types";

import { failed, succeeded, type RegistryFormState } from "./_lib/form-state";

/**
 * The form seam for the registry screens.
 *
 * These are thin. They turn a `FormData` into the typed input `i5`'s actions
 * already take, call them, and turn a thrown `ApiError` back into a value a form
 * can render. **They validate nothing and persist nothing themselves** --
 * `validateEngagement` / `validateMilestone` own the rules and the database owns
 * FR-78's refusal, and a second copy of either here would drift from the first
 * and answer the same question two ways.
 *
 * **This module exports async functions and nothing else.** A `'use server'`
 * module may export only async functions; a `const` exported from one compiles
 * clean under `tsc --noEmit` and fails only under `next build`. The form-state
 * constructors live in `./_lib/form-state` for that reason.
 *
 * These wrappers are not the security boundary and must never be mistaken for
 * one. Every action they call runs `requireOperator()` as its first line, before
 * a service-role client is opened.
 */

/** `""` is what an untouched text input submits. It means "not set", not "". */
function text(form: FormData, field: string): string | null {
  const value = form.get(field);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function requiredText(form: FormData, field: string): string {
  return text(form, field) ?? "";
}

/**
 * A money field. `null` for empty, `NaN` for unparseable.
 *
 * `NaN` is passed through deliberately rather than coerced to `null` or to `0`:
 * `validateMilestone` refuses a non-finite amount with a sentence, and silently
 * turning "12,000" into an empty amount would drop a client's money out of the
 * record without saying so.
 */
function money(form: FormData, field: string): number | null {
  const raw = text(form, field);
  if (raw === null) return null;
  return Number(raw.replace(/[$,\s]/g, ""));
}

function engagementFrom(form: FormData): EngagementInput {
  return {
    slug: requiredText(form, "slug"),
    clientName: requiredText(form, "clientName"),
    source: text(form, "source"),
    contractType: text(form, "contractType"),
    status: text(form, "status"),
    repoPath: text(form, "repoPath"),
    specPath: text(form, "specPath"),
    fleetDir: text(form, "fleetDir"),
    stacks: splitList(String(form.get("stacks") ?? "")),
    dbOrg: text(form, "dbOrg"),
    dbProjectRef: text(form, "dbProjectRef"),
    hostingTeam: text(form, "hostingTeam"),
    hostingProject: text(form, "hostingProject"),
    productionUrl: text(form, "productionUrl"),
  };
}

function milestoneFrom(form: FormData): MilestoneInput {
  return {
    name: requiredText(form, "name"),
    amount: money(form, "amount"),
    currency: requiredText(form, "currency") || "USD",
    dueDate: text(form, "dueDate"),
    notes: text(form, "notes"),
    acceptance: splitRefs(String(form.get("acceptance") ?? "")),
  };
}

/**
 * Turn a thrown refusal into a sentence.
 *
 * `ApiError.message` is already written for Erik -- `errors.ts` composes it from
 * this build's own allowlist and never forwards a database message. Anything
 * else gets a generic sentence, because an unrecognised throw is exactly the
 * case where a mechanism would leak.
 */
function refusal(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message.startsWith("Missing required environment")) {
    return (
      "This deployment is not configured to reach its database, so nothing was " +
      "saved. See .env.example for the variables it expects."
    );
  }
  return "That did not save, and nothing was written. Try again; if it repeats, check the audit log.";
}

/**
 * FR-9 + FR-77. Register an engagement, or update one in place.
 *
 * A non-empty `id` field means update. On success this redirects to the
 * engagement, so `redirect()` is called OUTSIDE the try -- it signals navigation
 * by throwing, and a catch block that swallows it turns a working redirect into
 * a form that appears to do nothing.
 */
export async function submitEngagement(
  previous: RegistryFormState,
  form: FormData,
): Promise<RegistryFormState> {
  const id = text(form, "id");
  let slug: string;

  try {
    const input = engagementFrom(form);
    const result =
      id === null
        ? await createEngagement(input)
        : await updateEngagement(id, input);
    slug = result.record.slug;
  } catch (error) {
    return failed(previous, refusal(error));
  }

  revalidatePath("/registry");
  revalidatePath(`/registry/${slug}`);
  redirect(`/registry/${slug}`);
}

/**
 * FR-10 + FR-12. Add or update a contract milestone.
 *
 * Deliberately does NOT redirect on success. FR-12's finding rides back in
 * `warnings`, and navigating away from the form is how a reported dangling
 * reference becomes a swallowed one.
 */
export async function submitMilestone(
  previous: RegistryFormState,
  form: FormData,
): Promise<RegistryFormState> {
  const slug = requiredText(form, "slug");
  const milestoneId = text(form, "milestoneId");
  const engagementId = requiredText(form, "engagementId");

  try {
    const input = milestoneFrom(form);
    const result =
      milestoneId === null
        ? await createContractMilestone(engagementId, input)
        : await updateContractMilestone(milestoneId, input);

    revalidatePath(`/registry/${slug}`);
    return succeeded(
      previous,
      milestoneId === null ? "Milestone added." : "Milestone updated.",
      result.warnings,
    );
  } catch (error) {
    return failed(previous, refusal(error));
  }
}

/**
 * FR-11. Record a submitted or a paid date -- each entered in one action.
 *
 * An empty date clears the field, which is how a mis-click is undone. The two
 * dates are separate submits against separate fields for the same reason FR-11
 * words it that way: marking something paid should not require re-stating when
 * it was submitted.
 */
export async function submitMilestoneDate(
  previous: RegistryFormState,
  form: FormData,
): Promise<RegistryFormState> {
  const slug = requiredText(form, "slug");
  const milestoneId = requiredText(form, "milestoneId");
  const field = requiredText(form, "field");
  const value = text(form, "date");

  if (field !== "submitted" && field !== "paid") {
    return failed(previous, "That is not a date this milestone records.");
  }

  try {
    if (field === "submitted") {
      await setMilestoneSubmitted(milestoneId, value);
    } else {
      await setMilestonePaid(milestoneId, value);
    }

    revalidatePath(`/registry/${slug}`);
    const label = field === "submitted" ? "Submitted" : "Paid";
    return succeeded(
      previous,
      value === null ? `${label} date cleared.` : `${label} ${value}.`,
    );
  } catch (error) {
    return failed(previous, refusal(error));
  }
}

/**
 * FR-61 — archive, restore, and hard deletion.
 *
 * The first two return `ActionResult` like every other form seam in this file.
 * The third does not, and the difference is deliberate.
 *
 * A purge has three outcomes and `ActionResult` only has two. `refused` is not a
 * failure — the database looked, decided, and destroyed nothing — and `unparsed`
 * is not a success. Flattening them into `ok: false` would put "this engagement
 * is not archived" and "this reply made no sense" behind the same sentence, on
 * the one action in this product that cannot be undone. So `PurgeResult` travels
 * intact and the component renders all three distinctly.
 *
 * A **thrown** error becomes `unparsed` rather than `refused`, because that is
 * what it is: the request failed somewhere this code cannot see, and the honest
 * statement about the rows is that nothing can be said about them yet. `refused`
 * would be a claim that the database declined, which is more than is known.
 */

export async function archiveEngagementSafe(
  id: string,
): Promise<ActionResult<{ archivedAt: string | null }>> {
  return runOperatorAction(async () => {
    const outcome = await archiveEngagement(id);
    revalidatePath(`/registry/${outcome.slug}`);
    revalidatePath("/registry");
    return { archivedAt: outcome.archivedAt };
  });
}

export async function restoreEngagementSafe(
  id: string,
): Promise<ActionResult<{ archivedAt: string | null }>> {
  return runOperatorAction(async () => {
    const outcome = await unarchiveEngagement(id);
    revalidatePath(`/registry/${outcome.slug}`);
    revalidatePath("/registry");
    return { archivedAt: outcome.archivedAt };
  });
}

export async function purgeEngagementSafe(
  slug: string,
  typedConfirmation: string,
): Promise<PurgeResult> {
  try {
    const result = await purgeEngagement(slug, typedConfirmation);
    if (result.kind === "purged") {
      revalidatePath("/registry");
    }
    return result;
  } catch (error) {
    return {
      kind: "unparsed",
      reason:
        error instanceof ApiError
          ? error.message
          : "The deletion failed for a reason this interface could not classify. " +
            "Check the audit log before assuming anything about what was destroyed.",
    };
  }
}
