"use server";

import { requireOperator } from "@/lib/api/operator";
import { createServiceClient } from "@/lib/supabase/service";

import { registryError } from "./errors";
import type { EngagementInput, EngagementRecord, RegistryWriteResult } from "./types";
import { validateEngagement } from "./validation";

/**
 * FR-9, FR-13, FR-77, FR-78 — the engagement half of the registry.
 *
 * **This module exports async functions and nothing else.** A `'use server'`
 * module may export only async functions; exporting a `const` from one compiles
 * clean under `tsc --noEmit` and fails only under `next build`, and only once
 * something imports it. That was measured on a prior fleet run in this practice,
 * which is why the types live in `./types` and the constants in `./validation`.
 *
 * ## Why these actions read with the service-role client
 *
 * `authenticated` holds SELECT only — the RLS migration grants no UPDATE and no
 * DELETE anywhere, deliberately, because "every mutation in this product is a
 * server action or an ingest route". So a write here cannot go through the
 * session client. `requireOperator()` runs first and is the whole gate: it
 * demands a signed-in operator at `aal2` (FR-2, enforced in RLS) holding a
 * deliberately granted role (FR-3). Only then does the service-role client open.
 *
 * `agentScopedDb` is deliberately NOT applied. It exists to keep AGENT tokens
 * out of `contract_milestone`; an operator is the party §7a says may read it.
 */

function toRecord(row: {
  id: string;
  slug: string;
  client_name: string;
  source: string | null;
  contract_type: string | null;
  status: string;
  repo_path: string | null;
  spec_path: string | null;
  fleet_dir: string | null;
  stacks: string[];
  db_org: string | null;
  db_project_ref: string | null;
  hosting_team: string | null;
  hosting_project: string | null;
  production_url: string | null;
  created_at: string;
  archived_at: string | null;
}): EngagementRecord {
  return {
    id: row.id,
    slug: row.slug,
    clientName: row.client_name,
    source: row.source,
    contractType: row.contract_type,
    status: row.status,
    repoPath: row.repo_path,
    specPath: row.spec_path,
    fleetDir: row.fleet_dir,
    stacks: row.stacks,
    dbOrg: row.db_org,
    dbProjectRef: row.db_project_ref,
    hostingTeam: row.hosting_team,
    hostingProject: row.hosting_project,
    productionUrl: row.production_url,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  };
}

/**
 * One unbroken string literal on purpose. `supabase-js` parses the projection at
 * the TYPE level, so a value built by concatenation degrades to
 * `GenericStringError` and every row loses its shape. Wrapping this across lines
 * with `+` compiles for a moment and then fails four call sites at once.
 *
 * `*` is avoided for a second reason: §7a restricts what an agent may read from
 * `engagement`, and naming columns explicitly is the habit that keeps a future
 * column from joining a projection nobody re-reviewed.
 */
const COLUMNS =
  "id, slug, client_name, source, contract_type, status, repo_path, spec_path, fleet_dir, stacks, db_org, db_project_ref, hosting_team, hosting_project, production_url, created_at, archived_at";

function toRow(input: EngagementInput) {
  return {
    slug: input.slug,
    client_name: input.clientName,
    source: input.source,
    contract_type: input.contractType,
    status: input.status ?? "active",
    repo_path: input.repoPath,
    spec_path: input.specPath,
    fleet_dir: input.fleetDir,
    stacks: input.stacks,
    db_org: input.dbOrg,
    db_project_ref: input.dbProjectRef,
    hosting_team: input.hostingTeam,
    hosting_project: input.hostingProject,
    production_url: input.productionUrl,
  };
}

/** FR-9 + FR-77. Register an engagement. */
export async function createEngagement(
  input: EngagementInput,
): Promise<RegistryWriteResult<EngagementRecord>> {
  await requireOperator();
  const validated = validateEngagement(input);
  const db = createServiceClient();

  const { data, error } = await db
    .from("engagement")
    .insert(toRow(validated))
    .select(COLUMNS)
    .single();

  // FR-78's refusal arrives here as SQLSTATE 23514 from the trigger; the
  // operator sees a sentence naming the column rather than a constraint.
  if (error || !data) throw registryError(error, "Registering the engagement");

  return { record: toRecord(data), warnings: [] };
}

/** FR-9 + FR-77. Update an engagement in place. */
export async function updateEngagement(
  id: string,
  input: EngagementInput,
): Promise<RegistryWriteResult<EngagementRecord>> {
  await requireOperator();
  const validated = validateEngagement(input);
  const db = createServiceClient();

  const { data, error } = await db
    .from("engagement")
    .update(toRow(validated))
    .eq("id", id)
    .select(COLUMNS)
    .single();

  if (error || !data) throw registryError(error, "Updating the engagement");

  return { record: toRecord(data), warnings: [] };
}

/**
 * Every engagement, newest first.
 *
 * Ordered explicitly and bounded explicitly. PostgREST caps an unbounded read at
 * 1000 rows and answers 206 with `error === null`, so a truncated read is
 * indistinguishable from a complete one at the call site — and without an ORDER
 * BY the rows come back in heap order, which keeps the OLDEST and silently drops
 * the newest. A one-operator studio will not reach 1000 engagements, but the
 * habit is the control, not the number.
 */
export async function listEngagements(): Promise<EngagementRecord[]> {
  await requireOperator();
  const db = createServiceClient();

  const { data, error } = await db
    .from("engagement")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .range(0, 999);

  if (error) throw registryError(error, "Listing engagements");
  return (data ?? []).map(toRecord);
}

/** One engagement by its slug, or null. */
export async function getEngagement(slug: string): Promise<EngagementRecord | null> {
  await requireOperator();
  const db = createServiceClient();

  const { data, error } = await db
    .from("engagement")
    .select(COLUMNS)
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw registryError(error, "Reading the engagement");
  return data ? toRecord(data) : null;
}
