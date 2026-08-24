"use server";

/**
 * The FR-88 hand-entry path's server boundary.
 *
 * ## Why this wrapper exists
 *
 * Next **redacts** a thrown Server Action error before it reaches the browser.
 * That is the right default — an unclassified throw may carry a Postgres message
 * naming a table, a constraint, or a row value, and this table's rows are §7a
 * `sensitive` client prose. But it destroys the refusals that were *written for
 * Erik*: "no engagement is registered under `acme`", "say what the work is".
 * Those are the whole value of the validation, so they are converted into return
 * values here and everything else stays redacted.
 *
 * ## Why the action lives under `new/` rather than in `../actions.ts`
 *
 * `/work-items/actions.ts` is the listing screen's seam and is a file other
 * units in this milestone may be editing. This route owns
 * `src/app/work-items/new/**` outright, so a file here cannot collide at merge.
 *
 * ## Every export is an async function
 *
 * A `'use server'` module may export only async functions. Exporting a `const`
 * from one passes `tsc --noEmit` cleanly and fails only under `next build`, and
 * only once something imports it — measured on a prior fleet run in this
 * practice. The input and result shapes therefore live in
 * `@/lib/server/planned-work/types` and `@/lib/action-result`.
 *
 * ## Where the gate is
 *
 * `requireOperator()` is called here, before `createServiceClient()` opens a
 * BYPASSRLS client. The primitive deliberately carries no gate of its own,
 * because i3's plan-document path may reach it under an agent token where
 * `requireOperator()` cannot succeed. **A caller that forgets this line is the
 * whole failure mode**, which is why it is the first statement inside the
 * closure and not somewhere further down.
 */

import { revalidatePath } from "next/cache";

import type { ActionResult } from "@/lib/action-result";
import { requireOperator } from "@/lib/api/operator";
import { runOperatorAction } from "@/lib/operator-load";
import { createPlannedWorkItem } from "@/lib/server/planned-work/create-planned-work-item";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * FR-87 + FR-88 — create one planned work item by hand.
 *
 * `planRef` is fixed at `null` and is not a form field. FR-90's reconciliation
 * key, per the Q13 ruling, is "an explicit id the plan carries and the manifest
 * echoes" — an id Erik invents while typing is echoed by nothing, so offering
 * the field would manufacture a key that cannot reconcile and would look like
 * one that can.
 *
 * Returns the new row's id rather than redirecting. `redirect()` signals
 * navigation by throwing, and `runOperatorAction` catches — a redirect inside
 * it would be swallowed and reported as a refusal. The caller navigates.
 */
export async function createPlannedWorkItemSafe(input: {
  engagementSlug: string;
  description: string;
  workType: string | null;
  unit: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const result = await runOperatorAction(async () => {
    await requireOperator();

    const record = await createPlannedWorkItem(
      createServiceClient(),
      input.engagementSlug,
      {
        description: input.description,
        workType: input.workType,
        unit: input.unit,
        planRef: null,
      },
    );

    return { id: record.id };
  });

  if (result.ok) {
    // The listing and the detail view are the two places this row is now
    // visible. `/next` is revalidated too: a pending planned row is exactly
    // what FR-53 exists to answer before a run exists, and a stale cache there
    // would mean the item Erik just planned is not in the answer he planned it
    // for.
    revalidatePath("/work-items");
    revalidatePath("/next");
  }

  return result;
}
