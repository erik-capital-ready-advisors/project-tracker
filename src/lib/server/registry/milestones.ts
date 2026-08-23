"use server";

import { requireOperator } from "@/lib/api/operator";
import { decryptAll, encryptAll } from "@/lib/server/ingest/encrypt";
import { createServiceClient } from "@/lib/supabase/service";

import { registryError } from "./errors";
import type { MilestoneInput, MilestoneRecord, RegistryWriteResult } from "./types";
import {
  unknownRequirementRefs,
  validateMilestone,
  validateMilestoneDate,
} from "./validation";

/**
 * FR-10, FR-11, FR-12 — contract milestones and their acceptance criteria.
 *
 * Async exports only. See the note at the top of `engagements.ts`.
 *
 * ## §7a's two consequences, both structural here
 *
 * `contract_milestone` is `sensitive` and **agent tokens are refused it
 * entirely**. Nothing in this module is reachable from an agent route: every
 * function begins with `requireOperator()`, and the agent path never imports it.
 *
 * `amount` is a pgcrypto column, so **there is no SQL aggregation over money**.
 * `milestoneTotals` below decrypts and sums in TypeScript, which §7a states as
 * the intended consequence rather than a workaround. The row count is small
 * enough that this is not a performance question at any point in this product's
 * life.
 */

const COLUMNS =
  "id, engagement_id, name, amount, currency, due_date, submitted_at, paid_at, notes";

interface MilestoneRow {
  id: string;
  engagement_id: string;
  name: string;
  amount: string | null;
  currency: string;
  due_date: string | null;
  submitted_at: string | null;
  paid_at: string | null;
  notes: string | null;
}

/**
 * FR-12. Acceptance refs, plus the ones naming a requirement that does not
 * exist.
 *
 * The unknown refs are REPORTED and the rows are kept. The schema stores these
 * as text rather than as foreign keys precisely so that this finding survives —
 * a foreign key would have refused the row and lost it.
 */
async function acceptanceFor(
  db: ReturnType<typeof createServiceClient>,
  milestoneIds: string[],
  engagementId: string,
): Promise<Map<string, { refs: string[]; unknown: string[] }>> {
  const result = new Map<string, { refs: string[]; unknown: string[] }>();
  if (milestoneIds.length === 0) return result;

  const [criteria, requirements] = await Promise.all([
    db
      .from("acceptance_criterion")
      .select("milestone_id, requirement_ref")
      .in("milestone_id", milestoneIds)
      .range(0, 4999),
    db
      .from("requirement")
      .select("ref")
      .eq("engagement_id", engagementId)
      .range(0, 4999),
  ]);

  if (criteria.error) throw registryError(criteria.error, "Reading acceptance criteria");
  if (requirements.error) throw registryError(requirements.error, "Reading requirements");

  const knownRefs = (requirements.data ?? []).map((row) => row.ref);

  for (const id of milestoneIds) result.set(id, { refs: [], unknown: [] });
  for (const row of criteria.data ?? []) {
    result.get(row.milestone_id)?.refs.push(row.requirement_ref);
  }
  for (const [, value] of result) {
    value.refs.sort();
    value.unknown = unknownRequirementRefs(value.refs, knownRefs);
  }
  return result;
}

async function toRecords(
  db: ReturnType<typeof createServiceClient>,
  rows: MilestoneRow[],
  engagementId: string,
): Promise<MilestoneRecord[]> {
  const amounts = await decryptAll(db, rows.map((row) => row.amount));
  const notes = await decryptAll(db, rows.map((row) => row.notes));
  const acceptance = await acceptanceFor(db, rows.map((row) => row.id), engagementId);

  return rows.map((row, index) => {
    const plain = amounts[index];
    const parsed = plain === null ? null : Number(plain);
    const entry = acceptance.get(row.id);

    return {
      id: row.id,
      engagementId: row.engagement_id,
      name: row.name,
      // A stored amount that will not parse is reported as null rather than as
      // NaN or 0. A wrong number here is money.
      amount: parsed !== null && Number.isFinite(parsed) ? parsed : null,
      currency: row.currency,
      dueDate: row.due_date,
      submittedAt: row.submitted_at,
      paidAt: row.paid_at,
      notes: notes[index],
      acceptance: entry?.refs ?? [],
      unknownAcceptanceRefs: entry?.unknown ?? [],
    };
  });
}

/** Replace a milestone's acceptance criteria with exactly `refs`. */
async function writeAcceptance(
  db: ReturnType<typeof createServiceClient>,
  milestoneId: string,
  refs: string[],
): Promise<void> {
  const removal = await db
    .from("acceptance_criterion")
    .delete()
    .eq("milestone_id", milestoneId);
  if (removal.error) throw registryError(removal.error, "Clearing acceptance criteria");

  if (refs.length === 0) return;

  const insertion = await db.from("acceptance_criterion").upsert(
    refs.map((ref) => ({ milestone_id: milestoneId, requirement_ref: ref })),
    { onConflict: "milestone_id,requirement_ref" },
  );
  if (insertion.error) throw registryError(insertion.error, "Saving acceptance criteria");
}

/** FR-10. Add a contract milestone to an engagement. */
export async function createContractMilestone(
  engagementId: string,
  input: MilestoneInput,
): Promise<RegistryWriteResult<MilestoneRecord>> {
  await requireOperator();
  const validated = validateMilestone(input);
  const db = createServiceClient();

  const [amount, notes] = await Promise.all([
    encryptAll(db, [validated.amount === null ? null : String(validated.amount)]),
    encryptAll(db, [validated.notes]),
  ]);

  const { data, error } = await db
    .from("contract_milestone")
    .insert({
      engagement_id: engagementId,
      name: validated.name,
      amount: amount[0],
      currency: validated.currency,
      due_date: validated.dueDate,
      notes: notes[0],
    })
    .select(COLUMNS)
    .single();

  if (error || !data) throw registryError(error, "Adding the milestone");

  await writeAcceptance(db, data.id, validated.acceptance);
  const records = await toRecords(db, [data as MilestoneRow], engagementId);

  return {
    record: records[0],
    warnings:
      records[0].unknownAcceptanceRefs.length > 0
        ? [
            `Acceptance names ${records[0].unknownAcceptanceRefs.join(", ")}, which ` +
              `this engagement has no ingested requirement for. Saved and reported ` +
              `rather than silently accepted (FR-12) — ingest the spec, or correct ` +
              `the reference.`,
          ]
        : [],
  };
}

/** FR-10. Update a milestone and its acceptance criteria. */
export async function updateContractMilestone(
  milestoneId: string,
  input: MilestoneInput,
): Promise<RegistryWriteResult<MilestoneRecord>> {
  await requireOperator();
  const validated = validateMilestone(input);
  const db = createServiceClient();

  const [amount, notes] = await Promise.all([
    encryptAll(db, [validated.amount === null ? null : String(validated.amount)]),
    encryptAll(db, [validated.notes]),
  ]);

  const { data, error } = await db
    .from("contract_milestone")
    .update({
      name: validated.name,
      amount: amount[0],
      currency: validated.currency,
      due_date: validated.dueDate,
      notes: notes[0],
    })
    .eq("id", milestoneId)
    .select(COLUMNS)
    .single();

  if (error || !data) throw registryError(error, "Updating the milestone");

  await writeAcceptance(db, data.id, validated.acceptance);
  const records = await toRecords(db, [data as MilestoneRow], data.engagement_id);

  return {
    record: records[0],
    warnings:
      records[0].unknownAcceptanceRefs.length > 0
        ? [
            `Acceptance names ${records[0].unknownAcceptanceRefs.join(", ")}, which ` +
              `this engagement has no ingested requirement for (FR-12).`,
          ]
        : [],
  };
}

/**
 * FR-11. Record the date a milestone was submitted — one action, one field.
 *
 * `null` clears it.
 */
export async function setMilestoneSubmitted(
  milestoneId: string,
  submittedOn: string | null,
): Promise<MilestoneRecord> {
  await requireOperator();
  const value = validateMilestoneDate(submittedOn, "submittedOn");
  const db = createServiceClient();

  const { data, error } = await db
    .from("contract_milestone")
    .update({ submitted_at: value })
    .eq("id", milestoneId)
    .select(COLUMNS)
    .single();

  if (error || !data) throw registryError(error, "Recording the submitted date");
  return (await toRecords(db, [data as MilestoneRow], data.engagement_id))[0];
}

/** FR-11. Record the date a milestone was paid — one action, one field. */
export async function setMilestonePaid(
  milestoneId: string,
  paidOn: string | null,
): Promise<MilestoneRecord> {
  await requireOperator();
  const value = validateMilestoneDate(paidOn, "paidOn");
  const db = createServiceClient();

  const { data, error } = await db
    .from("contract_milestone")
    .update({ paid_at: value })
    .eq("id", milestoneId)
    .select(COLUMNS)
    .single();

  if (error || !data) throw registryError(error, "Recording the paid date");
  return (await toRecords(db, [data as MilestoneRow], data.engagement_id))[0];
}

/** FR-10 + FR-12. Every milestone on an engagement, with its acceptance refs. */
export async function listMilestones(engagementId: string): Promise<MilestoneRecord[]> {
  await requireOperator();
  const db = createServiceClient();

  const { data, error } = await db
    .from("contract_milestone")
    .select(COLUMNS)
    .eq("engagement_id", engagementId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .range(0, 999);

  if (error) throw registryError(error, "Listing milestones");
  return toRecords(db, (data ?? []) as MilestoneRow[], engagementId);
}

/**
 * Money totals for an engagement, computed after decryption.
 *
 * §7a: "contract_milestone.amount is encrypted, so no SQL aggregation over
 * money. Totals are computed server-side after decryption." This function is
 * that sentence. A milestone whose amount does not decrypt to a finite number
 * contributes nothing and is counted in `unreadable` — it is never treated as
 * zero, because a silently-zero milestone understates what a client owes.
 */
export async function milestoneTotals(engagementId: string): Promise<{
  currency: string | null;
  committed: number;
  submitted: number;
  paid: number;
  unreadable: number;
}> {
  const milestones = await listMilestones(engagementId);
  const currencies = new Set(milestones.map((milestone) => milestone.currency));

  let committed = 0;
  let submitted = 0;
  let paid = 0;
  let unreadable = 0;

  for (const milestone of milestones) {
    if (milestone.amount === null) {
      unreadable += 1;
      continue;
    }
    committed += milestone.amount;
    if (milestone.submittedAt !== null) submitted += milestone.amount;
    if (milestone.paidAt !== null) paid += milestone.amount;
  }

  return {
    // Mixed currencies are reported as null rather than summed together, which
    // would be a plausible wrong number — the worst output this product has.
    currency: currencies.size === 1 ? [...currencies][0] : null,
    committed,
    submitted,
    paid,
    unreadable,
  };
}
