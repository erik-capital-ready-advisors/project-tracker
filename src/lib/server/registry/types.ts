/**
 * The shapes the registry's server actions take and return.
 *
 * Deliberately a separate module from `engagements.ts` and `milestones.ts`:
 * those two carry `'use server'`, and a `'use server'` module may export only
 * async functions. Type-only exports are erased before that check runs, but
 * keeping them out entirely means nobody has to know that — and a prior fleet
 * run in this practice measured that `tsc --noEmit` does NOT catch a violation
 * of that rule, so the only gate that would is `next build`.
 */

/** FR-9 + FR-77. Everything Erik types about an engagement. */
export interface EngagementInput {
  slug: string;
  clientName: string;
  /** How the work was sourced. Free text by Erik's decision — no enum. */
  source: string | null;
  /** Free text by Erik's decision — no enum. */
  contractType: string | null;
  /** Free text by Erik's decision — no enum. Defaults to `active`. */
  status: string | null;
  repoPath: string | null;
  specPath: string | null;
  fleetDir: string | null;
  stacks: string[];
  /** FR-77. Identifiers, never secrets — the database refuses secret shapes. */
  dbOrg: string | null;
  dbProjectRef: string | null;
  hostingTeam: string | null;
  hostingProject: string | null;
  productionUrl: string | null;
}

export interface EngagementRecord extends EngagementInput {
  id: string;
  createdAt: string;
  archivedAt: string | null;
}

/** FR-10 + FR-11. */
export interface MilestoneInput {
  name: string;
  /** §7a: encrypted at rest, so there is no SQL aggregation over it. */
  amount: number | null;
  currency: string;
  dueDate: string | null;
  notes: string | null;
  /** FR-10. The requirement refs that constitute acceptance. */
  acceptance: string[];
}

export interface MilestoneRecord {
  id: string;
  engagementId: string;
  name: string;
  amount: number | null;
  currency: string;
  dueDate: string | null;
  submittedAt: string | null;
  paidAt: string | null;
  notes: string | null;
  acceptance: string[];
  /**
   * FR-12. Acceptance refs naming a requirement this engagement has never
   * ingested. Reported on every read, never silently accepted and never
   * rejected at write time — a foreign key would have refused the row and lost
   * the finding, which is why the schema stores these as text.
   */
  unknownAcceptanceRefs: string[];
}

/** What a write action returns. FR-12's report rides along with the success. */
export interface RegistryWriteResult<T> {
  record: T;
  /** Non-fatal findings the operator should see. Empty means none. */
  warnings: string[];
}
