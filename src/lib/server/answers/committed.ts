/**
 * FR-54 / FR-75 — Committed. *What did I promise a client, and can I invoice it?*
 *
 * > **FR-54** Committed lists contract milestones across all engagements with
 * > amount, due date, acceptance criteria, coverage state and invoice state.
 * > **FR-75** Committed shows, per milestone, whether its acceptance
 * > requirements are shipped, distinctly from whether they are covered.
 *
 * ---
 *
 * # Read this before wiring a client to `GET /api/answer/committed`
 *
 * **An `answer:read` agent token cannot retrieve anything from this endpoint.**
 * It receives `403 forbidden_table`, always, with no partial answer.
 *
 * That is not a defect and it is not a decision made here. Spec §7a's row for
 * `contract_milestone` reads *"operator only; agent tokens are refused this
 * table"*, and §7a's authentication posture repeats it: *"refused the
 * `contract_milestone` table entirely (FR-5). An agent has no reason to read
 * what Erik charges."* FR-54 says the answer lists milestones; §7a says agents
 * may not read them. Where a requirement and the security posture collide, the
 * posture wins, because the alternative is an agent guessing permissively at a
 * boundary and this practice has two production incidents that began exactly
 * there.
 *
 * ## Why the endpoint exists at all, then
 *
 * FR-57 requires each answer to be available at `GET /api/answer/<name>` under
 * `answer:read`. It is registered, it authenticates, it rate-limits, it writes
 * its audit row, and it refuses — visibly, with a code and a sentence saying to
 * use an operator session. The alternative was to not build the route, which
 * would have made FR-57 false and left a 404 that reads as "not implemented yet"
 * rather than as "you may not have this".
 *
 * **What an agent CAN retrieve about milestones is nothing at all.** Not the
 * name, not the due date, not the acceptance refs, not the coverage state. The
 * refusal is at the table, and every field on this answer is derived from a row
 * in it. Coverage and shipped state for *requirements* are available to an agent
 * through `GET /api/answer/untested` and `GET /api/answer/broken`, which read no
 * commercial data — that is the honest substitute and it is named here so a
 * caller does not have to discover it.
 *
 * **Queued for Erik**, because he may well want an agent to see a milestone's
 * due date and coverage state with the money withheld. That would be a widening
 * of §7a and is his call, not this unit's. If he says yes, the change is a
 * column allowlist on `contract_milestone` in `capabilities.ts` of the same
 * shape as the one already there for `engagement` — an hour's work, and a
 * boundary moved deliberately rather than by a specialist's convenience.
 *
 * ---
 *
 * ## What the operator path computes, and what it refuses to collapse
 *
 * Every verdict comes from `committedReport` in `src/lib/ingest/committed.ts`.
 * Nothing is re-derived here. That function already holds FR-50's invoice gate,
 * FR-51's `claimed`, FR-70's regression effect, FR-75's covered-vs-shipped and
 * FR-79's `contested`, and it was mutation-tested by i3 against a fixture with
 * two actors whose roles cross.
 *
 * Four distinctions this answer carries through without merging any of them:
 *
 *   * **covered vs shipped** (FR-75) — built and deployed are different claims.
 *   * **billable vs claimed** (FR-51) — a review request is not an invoice.
 *   * **billable vs contested** (FR-79) — contested is billable *and flagged*,
 *     never presented as clean.
 *   * **amount `null` vs amount `0`** — a milestone whose ciphertext would not
 *     decrypt reports `amountUnreadable`, because one of those two is a number
 *     Erik would put on an invoice.
 *
 * ## Money is added up in TypeScript, and that is §7a's doing
 *
 * `contract_milestone.amount` is pgcrypto ciphertext, so there is no SQL
 * aggregation over money — §7a states it and states why it does not matter: the
 * row count is small enough that this is not a performance question at any point
 * in this product's life. Totals here are summed after a per-row decrypt, and a
 * row that would not decrypt is **excluded from the total and counted**, not
 * treated as zero. A total that quietly omits an unreadable row is a smaller
 * number that looks complete.
 */

import { committedReport } from "@/lib/ingest/committed";
import { deriveDefectStatuses } from "@/lib/ingest/defects";
import type { MilestoneVerdict } from "@/lib/ingest/committed";
import { loadShippedIndex } from "@/lib/server/releases/shipped";

import type { AnswerDb } from "./db";
import type { CommittedFilters } from "./filters";
import {
  loadCoverageInput,
  loadDefects,
  loadEngagements,
  loadMilestones,
} from "./load";

export interface CommittedMilestone extends MilestoneVerdict {
  name: string;
  engagement: string;
  clientName: string;
  /** FR-54. Decrypted server-side. `null` when the column would not decrypt. */
  amount: number | null;
  amountUnreadable: boolean;
  currency: string;
  due: string | null;
  acceptance: string[];
  /** FR-54's invoice state, which is recorded rather than derived. */
  submitted: string | null;
  paid: string | null;
  /**
   * FR-75. The environments each acceptance requirement has shipped to, never
   * flattened to a boolean — a preview deploy and a production deploy are
   * different claims.
   */
  shippedEnvironments: Record<string, string[]>;
}

export interface CommittedTotals {
  currency: string | null;
  committed: number;
  billable: number;
  submitted: number;
  paid: number;
  /** Milestones excluded from every total above because `amount` would not decrypt. */
  unreadable: number;
}

export interface CommittedAnswer {
  milestones: CommittedMilestone[];
  totals: CommittedTotals;
  engagementUnknown: boolean;
  /** Named read failures, so an empty list is never mistaken for "nothing shipped". */
  warnings: string[];
}

export interface CommittedOptions {
  today: string;
}

/**
 * The operator path. Called with an agent-scoped client it throws
 * `forbidden_table` at the first read of `contract_milestone`, which is the
 * enforcement doing its job rather than an error to handle.
 */
export async function committedAnswer(
  db: AnswerDb,
  filters: CommittedFilters,
  _options: CommittedOptions,
): Promise<CommittedAnswer> {
  const engagements = await loadEngagements(db, filters.engagement);
  if (engagements.length === 0) {
    return {
      milestones: [],
      totals: emptyTotals(),
      engagementUnknown: filters.engagement !== null,
      warnings: [],
    };
  }

  const [milestones, coverage, defects] = await Promise.all([
    loadMilestones(db, engagements),
    loadCoverageInput(db, engagements),
    loadDefects(db, engagements),
  ]);

  const warnings: string[] = [];

  // FR-74/FR-75's shipped state, per engagement, from i8's loader. A failed read
  // is reported rather than folded into an empty index: an empty index reads as
  // "nothing has shipped", which is a positive claim this code did not establish.
  const shipped = new Map<string, Set<string>>();
  for (const engagement of engagements) {
    const load = await loadShippedIndex(db, engagement.id);
    if (load.error !== null) {
      warnings.push(
        `shipped state for ${engagement.slug} could not be read (${load.error}); ` +
          `its requirements are reported as not shipped, which may be wrong`,
      );
      continue;
    }
    for (const [ref, environments] of load.index) {
      const existing = shipped.get(ref);
      if (existing === undefined) shipped.set(ref, new Set(environments));
      else for (const environment of environments) existing.add(environment);
    }
  }

  // FR-66's derived defect statuses feed FR-79's `contested`. Recorded status is
  // never trusted for `verified`; `deriveDefectStatuses` computes it.
  const verdicts = deriveDefectStatuses({
    defects,
    workItems: coverage.workItems,
    tests: coverage.tests,
    results: coverage.results,
  });

  const verdictList = committedReport({
    milestones,
    coverage,
    defects,
    verdicts,
    shipped,
    ...(filters.environment === null ? {} : { environment: filters.environment }),
  });

  const byId = new Map(milestones.map((one) => [one.id, one]));
  const rows: CommittedMilestone[] = [];

  for (const verdict of verdictList) {
    const milestone = byId.get(verdict.milestone);
    if (milestone === undefined) continue;
    if (filters.state !== null && verdict.state !== filters.state) continue;

    const environments: Record<string, string[]> = {};
    for (const ref of milestone.acceptance) {
      environments[ref] = [...(shipped.get(ref) ?? [])].sort();
    }

    rows.push({
      ...verdict,
      name: milestone.name,
      engagement: milestone.engagementSlug,
      clientName: milestone.clientName,
      amount: milestone.amount,
      amountUnreadable: milestone.amountUnreadable,
      currency: milestone.currency,
      due: milestone.due,
      acceptance: milestone.acceptance,
      submitted: milestone.submitted,
      paid: milestone.paid,
      shippedEnvironments: environments,
    });
  }

  rows.sort((a, b) => {
    // Soonest due first; undated last rather than first.
    if (a.due !== b.due) {
      if (a.due === null) return 1;
      if (b.due === null) return -1;
      return a.due < b.due ? -1 : 1;
    }
    const engagement = a.engagement.localeCompare(b.engagement);
    return engagement !== 0 ? engagement : a.name.localeCompare(b.name);
  });

  return {
    milestones: rows,
    totals: totalsFor(rows),
    engagementUnknown: false,
    warnings,
  };
}

function emptyTotals(): CommittedTotals {
  return {
    currency: null,
    committed: 0,
    billable: 0,
    submitted: 0,
    paid: 0,
    unreadable: 0,
  };
}

/**
 * The four money totals, summed after decryption.
 *
 * `currency` is `null` when the rows do not agree on one. Adding amounts across
 * currencies would produce a single number that is true of no currency, which is
 * worse than declining to produce one — the same reasoning as reporting an
 * unknown count as `null` rather than `0`.
 */
function totalsFor(rows: CommittedMilestone[]): CommittedTotals {
  const totals = emptyTotals();
  const currencies = new Set<string>();

  for (const row of rows) {
    currencies.add(row.currency);
    if (row.amount === null) {
      if (row.amountUnreadable) totals.unreadable += 1;
      continue;
    }
    totals.committed += row.amount;
    if (row.state === "billable") totals.billable += row.amount;
    if (row.submitted !== null) totals.submitted += row.amount;
    if (row.paid !== null) totals.paid += row.amount;
  }

  totals.currency = currencies.size === 1 ? [...currencies][0] : null;
  return totals;
}
