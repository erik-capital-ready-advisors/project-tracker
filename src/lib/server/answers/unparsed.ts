/**
 * FR-58's count. **This file is the single definition of what that count counts.**
 *
 * Every screen and every endpoint in this product calls `currentUnparsedCount`
 * or `unparsedCensus` and none of them defines its own population. That is the
 * whole reason this module exists as a separate file with a docstring this long:
 * i8 observed that nobody owned the definition, chose a local one, and named the
 * consequence exactly right — *if each unit picks its own population, the six
 * endpoints report different numbers for the same state*, which is worse than
 * reporting none, because a count that disagrees with the next screen's
 * discredits both.
 *
 * ---
 *
 * ## The population
 *
 * **Every record in the ledger that a classifier could not classify, across
 * every engagement, unfiltered.** Concretely, three tables, because three tables
 * are the only ones in the 21-entity schema whose enums carry an `unparsed`
 * member:
 *
 * | Table         | Predicate                                        | Why it is in |
 * |---------------|--------------------------------------------------|--------------|
 * | `work_item`   | `status = 'unparsed'`                            | FR-15 — the manifest status a classifier could not read. i5, i6 and i8 already counted this one; it is the population they agreed on and it is preserved. |
 * | `defect`      | `severity = 'unparsed' OR status = 'unparsed'`   | **FR-64, in terms**: "A finding paragraph the parser does not classify is stored `unparsed` and counted per FR-58." The spec settles this row; it is not a judgement call. |
 * | `test_result` | `status = 'unparsed'`                            | Symmetry, and it is mine rather than the spec's — see "What is mine" below. |
 *
 * A defect that is unparsed in **both** columns counts once. The population is
 * records, not fields: "how many rows could the system not classify" is the
 * question FR-58 asks, and counting a row twice inflates the answer with no
 * corresponding record for Erik to go and look at.
 *
 * ## Why it is global and never narrowed by the caller's filters
 *
 * FR-57 says the endpoints carry "the same filters the screens offer", and it
 * would be natural to narrow this count with them. It is deliberately not
 * narrowed, for three reasons:
 *
 *   1. **A filtered count can read `0` while the ledger holds unclassified
 *      records.** Erik filters Committed to one clean engagement, sees "0
 *      unparsed", and reads it as *the system classified everything*. That is
 *      the wrong-clean this product exists to prevent, arrived at through the
 *      filter control rather than through a parser.
 *   2. **u1 already mounted the badge in the app shell**, above the screens and
 *      outside any filter. One definition means the endpoint's number and the
 *      badge's number must be the same number, and the badge has no filter to
 *      apply.
 *   3. FR-58's own sentence is a statement about the *system* — "a system that
 *      cannot classify something says so on every surface" — not about the
 *      current view.
 *
 * The per-table breakdown is returned alongside the total so a screen can show
 * *where* the unclassified records are without redefining *what* they are.
 *
 * ## Why a failure is `null` and never `0`
 *
 * `0` is a positive claim that the system classified everything it was given.
 * `null` is "not counted", which `apiOk` omits from the envelope and
 * `unparsedState` renders as `unknown` rather than as a clean zero.
 *
 * **The total is `null` if any single component could not be counted**, not the
 * sum of the ones that worked. A partial total understates, and an understated
 * unparsed count is indistinguishable from a healthy one — which is the whole
 * failure mode again, one level up. This is the one place in the file where the
 * conservative choice costs something real (a defect-table outage hides a
 * perfectly good work-item count) and it is still the right trade.
 *
 * ## What is mine rather than the spec's
 *
 * `test_result.status = 'unparsed'` is my extension. FR-64 names `defect`
 * explicitly and FR-15 names `work_item`; nothing in the spec or CR-001 names
 * `test_result`. i1 gave `test_status` an `unparsed` member anyway, and a
 * classifier default that is never counted is a silent one — precisely the
 * "diagnostics page" FR-58's second sentence rules out. Queued for Erik; the
 * breakdown makes it one line to remove if he disagrees, and removing it lowers
 * the number rather than raising it, so nothing downstream is unsafe either way.
 *
 * ## Counted, never read
 *
 * Every predicate here is on a clear enum column. Nothing in this file decrypts
 * anything, and `count: "exact", head: true` returns no row contents at all —
 * so the FR-58 count crosses no §7a boundary even though two of the three tables
 * it counts are `sensitive`.
 */

import type { AnswerQuery, CensusDb } from "./db";
import { exactCount } from "./db";

export interface UnparsedCensus {
  /**
   * The FR-58 number. `null` when any component could not be counted — never a
   * partial sum, never `0` for an unknown.
   */
  total: number | null;
  /** `work_item.status = 'unparsed'`. */
  workItems: number | null;
  /** `defect.severity = 'unparsed' OR defect.status = 'unparsed'`. */
  defects: number | null;
  /** `test_result.status = 'unparsed'`. */
  testResults: number | null;
}

const UNPARSED = "unparsed";

/**
 * The three counts, run concurrently.
 *
 * They are independent `head` requests rather than one query with a union
 * because PostgREST has no cross-table count and building one in SQL would move
 * this definition into a migration, where no unit test can reach it.
 */
export async function unparsedCensus(db: CensusDb): Promise<UnparsedCensus> {
  const [workItems, defects, testResults] = await Promise.all([
    exactCount(db, "work_item", (query: AnswerQuery) => query.eq("status", UNPARSED)),
    // One request, not two, so a defect unparsed in both columns is one record.
    exactCount(db, "defect", (query: AnswerQuery) =>
      query.or(`severity.eq.${UNPARSED},status.eq.${UNPARSED}`),
    ),
    exactCount(db, "test_result", (query: AnswerQuery) =>
      query.eq("status", UNPARSED),
    ),
  ]);

  const parts = [workItems, defects, testResults];
  const total = parts.some((part) => part === null)
    ? null
    : parts.reduce((sum: number, part) => sum + (part as number), 0);

  return { total, workItems, defects, testResults };
}

/**
 * The FR-58 number on its own, for the envelope.
 *
 * This is the function every route handler calls. It is `unparsedCensus().total`
 * and exists so a call site cannot accidentally report one component as if it
 * were the whole count.
 */
export async function currentUnparsedCount(db: CensusDb): Promise<number | null> {
  return (await unparsedCensus(db)).total;
}
