import { resolveRefs, resolvedId } from "./refs";
import type { RefQuery } from "./refs";
import {
  decryptProse,
  fetchById,
  fetchEngagement,
  fetchWhere,
  requiredText,
  text,
} from "./rows";
import type { DetailDb, DetailEngagement, DetailOptions, DetailRef, Prose } from "./types";
import { danglingRef, toRef } from "./types";

/**
 * FR-81 for `contract_milestone` — **the operator's view of the one table an
 * agent token may never reach.**
 *
 * ## FR-86, and why this loader is safe to exist
 *
 * > **FR-86** Detail views and navigation add **no new decryption surface
 * > reachable by an agent token.**
 *
 * §7a: "operator only; agent tokens are refused this table". The refusal is not
 * in RLS and cannot be — agent tokens are not Postgres roles, and the handler
 * reads with `service_role`, which holds BYPASSRLS. It lives in
 * `AGENT_FORBIDDEN_TABLES`, enforced by the `agentScopedDb` runtime Proxy, and
 * `/api/answer/committed` already answers an agent `403 forbidden_table`.
 *
 * Two things keep FR-86 true of this module:
 *
 *   1. **There is no JSON route for it, and this unit built none.** Every caller
 *      reaches it through `src/lib/detail-load.ts`, which calls
 *      `requireOperator()` beside the query. An agent-reachable detail endpoint
 *      is exactly the new decryption surface FR-86 forbids.
 *   2. **The refusal still fires if anything ever does route an agent here.**
 *      `agentScopedDb` is a runtime Proxy; the `DetailDb` cast is compile-time
 *      and cannot see it, let alone remove it. `from("contract_milestone")`
 *      throws `forbidden_table` regardless of what type the caller wrote down.
 *
 * ## Two encrypted columns, one from §7a and one from the baseline
 *
 * §7a names "**pgcrypto column on `amount`**, key in Supabase Vault". `notes` is
 * encrypted under the **security baseline** — the migration states it: "§7a
 * names only `amount` but classifies the whole table `sensitive`, and the
 * baseline requires column encryption for sensitive data unless the spec
 * explicitly waives it." B13 tracks Erik's confirmation. The report names
 * `notes` individually as baseline-sourced.
 *
 * ## `amountUnreadable` is not a decoration
 *
 * A value that decrypts to something that is not a number becomes `null` with
 * the flag set, never `0`. A milestone worth `0` and a milestone whose amount
 * could not be read are different claims, **and one of them is a number Erik
 * would put in an invoice.** The flag is keyed on the ciphertext being present,
 * so a milestone nobody has priced yet carries no warning.
 *
 * ## What this deliberately does NOT compute
 *
 * FR-50/FR-51's `billable` / `claimed` / `open` state is derived by
 * `committedAnswer` from the acceptance criteria's coverage, and it is not
 * recomputed here. FR-81 asks for fields and references; a second implementation
 * of the invoice gate on a detail view is exactly the kind of drift the FR-82
 * "nothing new is derived" clause exists to prevent. If the milestone view wants
 * that state, it comes from `readCommitted` and not from a copy.
 */
export interface ContractMilestoneDetail {
  kind: "contract_milestone";
  id: string;
  engagement: DetailEngagement | null;

  name: string;
  /**
   * §7a `sensitive`, pgcrypto, decrypted server-side. `null` when nothing was
   * stored **or** when the stored value could not be read — `amountUnreadable`
   * is what tells those apart.
   */
  amount: number | null;
  amountUnreadable: boolean;
  currency: string;
  dueDate: string | null;
  submittedAt: string | null;
  paidAt: string | null;
  /** Encrypted under the BASELINE, not §7a. See B13. */
  notes: Prose;

  /** Outbound. The requirements this milestone's acceptance criteria name. */
  acceptance: DetailRef[];
}

const COLUMNS =
  "id, engagement_id, name, amount, currency, due_date, submitted_at, paid_at, notes";

export async function loadContractMilestoneDetail(
  db: DetailDb,
  id: string,
  options: DetailOptions = {},
): Promise<ContractMilestoneDetail | null> {
  const withProse = options.withProse !== false;
  const row = await fetchById(db, "contract_milestone", COLUMNS, id);
  if (row === null) return null;

  const rowId = requiredText(row.id);
  const engagementId = requiredText(row.engagement_id);
  const ciphertext = text(row.amount);

  const [engagement, secrets, criterionRows] = await Promise.all([
    fetchEngagement(db, engagementId),
    // `amount` is decrypted whatever `withProse` says: it is not prose, it is
    // the field FR-54 asks for by name, and a milestone view that renders no
    // amount is not a milestone view. `notes` follows `withProse`, and both go
    // through one batch so a detail page pays one round trip rather than two.
    decryptProse(db, [ciphertext], true).then(async (amount) => ({
      amount: amount[0],
      notes: (await decryptProse(db, [text(row.notes)], withProse))[0],
    })),
    fetchWhere(
      db,
      "acceptance_criterion",
      "id, milestone_id, requirement_ref",
      "milestone_id",
      rowId,
    ),
  ]);

  const parsed =
    secrets.amount.state === "present" && secrets.amount.text !== null
      ? Number(secrets.amount.text)
      : null;
  const amount = parsed !== null && Number.isFinite(parsed) ? parsed : null;

  const queries: RefQuery[] = criterionRows.map((one) => ({
    kind: "requirement" as const,
    ref: requiredText(one.requirement_ref),
    engagementId,
  }));
  const resolution = await resolveRefs(db, queries);

  return {
    kind: "contract_milestone",
    id: rowId,
    engagement,
    name: requiredText(row.name),
    amount,
    // Keyed on the CIPHERTEXT being present, not on the plaintext. A row that
    // stored no amount and a row whose amount could not be read both arrive as
    // `null`, and only the second one is a problem.
    amountUnreadable: ciphertext !== null && amount === null,
    currency: requiredText(row.currency) || "USD",
    dueDate: text(row.due_date),
    submittedAt: text(row.submitted_at),
    paidAt: text(row.paid_at),
    notes: secrets.notes,
    acceptance: queries.map((query) => {
      const resolved = resolvedId(resolution, query);
      return resolved === null
        ? danglingRef(
            "requirement",
            query.ref,
            "This acceptance criterion names a requirement that has not been ingested for this engagement.",
          )
        : toRef("requirement", resolved, query.ref);
    }),
  };
}
