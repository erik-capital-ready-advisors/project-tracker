"use server";

import type { AuditCapableClient } from "@/lib/api/audit";
import { writeAuditLog } from "@/lib/api/audit";
import { requireOperator } from "@/lib/api/operator";
import { createServiceClient } from "@/lib/supabase/service";

import { registryError } from "./errors";
import { confirmationMatches, readPurgeResult, type PurgeResult } from "@/lib/purge-result";

/**
 * FR-61 — archiving, which is reversible, and hard deletion, which is not.
 *
 * ## `archived_at` is the fact; `status` is the operator's own word
 *
 * `engagement` carries both an `archived_at` timestamp and a free-text `status`
 * (free text by B16 — the spec names no value set for it). Archiving sets the
 * timestamp and leaves `status` alone.
 *
 * Writing both would create two fields that can disagree, and this project's
 * standing rule is that a disagreement between two records is data worth
 * keeping — which is a good rule for artifacts written by different authors and
 * a bad thing to manufacture inside one table. So `archived_at` is the single
 * source of truth for archived-ness and every screen derives from it.
 *
 * ## Why these read with the service-role client
 *
 * The same reason as `./engagements.ts`: `authenticated` holds SELECT only, so a
 * write cannot go through the session client. `requireOperator()` runs first and
 * is the whole gate — a signed-in operator at `aal2` (FR-2, enforced in RLS)
 * holding a deliberately granted role (FR-3).
 */

export interface ArchiveOutcome {
  id: string;
  slug: string;
  archivedAt: string | null;
}

async function setArchivedAt(
  id: string,
  value: string | null,
  action: "engagement.archive" | "engagement.unarchive",
): Promise<ArchiveOutcome> {
  const operator = await requireOperator();
  const db = createServiceClient();

  const { data, error } = await db
    .from("engagement")
    .update({ archived_at: value })
    .eq("id", id)
    .select("id, slug, archived_at")
    .single();

  if (error || !data) {
    throw registryError(error, value === null ? "Restoring the engagement" : "Archiving the engagement");
  }

  await writeAuditLog(db as unknown as AuditCapableClient, {
    actor: operator.profile?.id ?? operator.userId ?? "unknown_operator",
    actorType: "operator",
    action,
    targetTable: "engagement",
    targetId: data.id,
    outcome: "allowed",
  });

  return { id: data.id, slug: data.slug, archivedAt: data.archived_at };
}

/** FR-61. Archive an engagement. Reversible by `unarchiveEngagement`. */
export async function archiveEngagement(id: string): Promise<ArchiveOutcome> {
  return setArchivedAt(id, new Date().toISOString(), "engagement.archive");
}

/** FR-61. Undo an archive. The half of the requirement that makes archiving the safe default. */
export async function unarchiveEngagement(id: string): Promise<ArchiveOutcome> {
  return setArchivedAt(id, null, "engagement.unarchive");
}

/**
 * FR-61 as CR-002 §2 defines it. Irreversible.
 *
 * The typed confirmation is checked HERE and not only in the dialog, because a
 * server action is a public HTTP endpoint — the dialog is a courtesy to the
 * person and this is the control. A mismatch is audited: an attempt to destroy
 * an engagement is worth a row whether or not it succeeded.
 *
 * The successful path writes no audit row from here. `app.purge_engagement()`
 * writes its own, inside the same transaction as the delete it records, which is
 * the only arrangement in which the record and the deletion cannot come apart.
 */
export async function purgeEngagement(
  slug: string,
  typedConfirmation: string,
): Promise<PurgeResult> {
  const operator = await requireOperator();
  const actor = operator.profile?.id ?? operator.userId ?? "unknown_operator";
  const db = createServiceClient();

  if (!confirmationMatches(slug, typedConfirmation)) {
    await writeAuditLog(db as unknown as AuditCapableClient, {
      actor,
      actorType: "operator",
      action: "engagement.purge",
      targetTable: "engagement",
      targetId: null,
      outcome: "refused",
    });

    return {
      kind: "unparsed",
      reason:
        `Nothing was deleted. The confirmation did not match: type the slug ${slug} ` +
        "exactly to confirm.",
    };
  }

  const { data, error } = await db.rpc("purge_engagement", {
    p_slug: slug,
    p_actor: actor,
  });

  if (error) throw registryError(error, "Deleting the engagement");

  return readPurgeResult(data);
}
