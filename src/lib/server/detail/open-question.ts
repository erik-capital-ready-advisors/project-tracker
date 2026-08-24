import { resolveRefs, resolvedId } from "./refs";
import type { RefQuery } from "./refs";
import {
  decryptProse,
  fetchById,
  fetchEngagement,
  fetchIn,
  requiredText,
  text,
} from "./rows";
import type { DetailDb, DetailEngagement, DetailOptions, DetailRef, Prose } from "./types";
import { danglingRef, toRef } from "./types";

/**
 * FR-81 for `open_question` (FR-18).
 *
 * ## Three encrypted columns, and only two of them are §7a's
 *
 * §7a names "**pgcrypto columns on `question` and `best_guess`**" and is silent
 * on `answer`. `answer` is encrypted under the **security baseline**, and the
 * migration says so in terms: "an answer quotes the same client decisions the
 * question does, and the table is classified sensitive. Queued for Erik to
 * confirm." Blocker B13 tracks the confirmation. All three are read here as
 * operator prose; the report names `answer` individually as baseline-sourced.
 *
 * ## The reference this table can and cannot make
 *
 * **Nothing in the schema holds a foreign key to `open_question`** — the whole
 * of §7's model was read for this, and no other table names it. So an open
 * question has no inbound references at all, and that is a property of the
 * schema rather than a gap in this loader.
 *
 * Outbound, it has exactly one and it is a text pair rather than a key: `run`
 * and `unit`, both clear, are the fleet run id and the work-unit id the question
 * was queued from. That is a stored relationship and reading it derives nothing
 * — `fleet_run.run_id` carries the same text and `work_item.unit` carries the
 * other half, and the join is `(engagement, run, unit)`, which is exactly
 * `work_item_engagement_run_unit_key`. Where either half is missing or does not
 * resolve, the reference is `null` and renders dangling.
 *
 * ## Its own reference, and the reason it has none a person would recognise
 *
 * The `20260819144331` table comment says "No natural unique key, deliberately".
 * `20260819165903` then added `source_key` — `<artifact filename>#<record
 * ordinal>` — precisely so ingest could be idempotent. **Both are true and both
 * are recorded**: there is a natural key, it is a machine key, and no screen in
 * this product renders a filename and an ordinal as a reference a person
 * follows. `<EntityDetail identifier>` therefore gets `run:unit §section` where
 * those exist and `null` where they do not, and `fallbackLabel` covers the rest.
 */
export interface OpenQuestionDetail {
  kind: "open_question";
  id: string;
  engagement: DetailEngagement | null;

  /** The fleet run id as text (`eb2490`), not a uuid. Clear. */
  run: string | null;
  /** The work-unit id the question was queued from. Clear. */
  unit: string | null;
  /** The spec section the question is about. Clear. */
  section: string | null;
  /** §7a `sensitive`, pgcrypto. */
  question: Prose;
  /** §7a `sensitive`, pgcrypto. */
  bestGuess: Prose;
  confidence: string | null;
  /** Encrypted under the BASELINE, not §7a. See B13. */
  answer: Prose;
  answeredBy: string | null;
  answeredAt: string | null;
  status: string;
  /** `<artifact filename>#<ordinal>`. A machine key, clear, never prose. */
  sourceKey: string | null;

  /**
   * Outbound. The work item `(run, unit)` names, or `null` when the question
   * carries no unit at all. A `DetailRef` whose `id` is null is the dangling
   * case: the pair was recorded and names nothing that has been ingested.
   */
  workItem: DetailRef | null;
}

const COLUMNS =
  "id, engagement_id, run, unit, section, question, best_guess, confidence, " +
  "answer, answered_by, answered_at, status, source_key";

export async function loadOpenQuestionDetail(
  db: DetailDb,
  id: string,
  options: DetailOptions = {},
): Promise<OpenQuestionDetail | null> {
  const withProse = options.withProse !== false;
  const row = await fetchById(db, "open_question", COLUMNS, id);
  if (row === null) return null;

  const engagementId = requiredText(row.engagement_id);
  const run = text(row.run);
  const unit = text(row.unit);

  const [engagement, prose, runRows] = await Promise.all([
    fetchEngagement(db, engagementId),
    decryptProse(
      db,
      [text(row.question), text(row.best_guess), text(row.answer)],
      withProse,
    ),
    // `open_question.run` is the run id as TEXT; `work_item.fleet_run_id` is a
    // uuid. One hop through `fleet_run` is what connects them, and it is a
    // lookup rather than a derivation.
    run === null
      ? Promise.resolve([])
      : fetchIn(db, "fleet_run", "id, engagement_id, run_id", "engagement_id", [
          engagementId,
        ]),
  ]);

  const runUuid =
    run === null
      ? null
      : (runRows.find((one) => text(one.run_id) === run)?.id as string | undefined) ??
        null;

  let workItem: DetailRef | null = null;
  if (unit !== null) {
    const query: RefQuery = {
      kind: "work_item",
      ref: unit,
      engagementId,
      runId: runUuid,
    };
    const resolved = resolvedId(await resolveRefs(db, [query]), query);
    workItem =
      resolved === null
        ? danglingRef(
            "work_item",
            unit,
            run === null
              ? `No single work item in this engagement carries the unit id ${unit}. The question records no run, so the reference cannot be narrowed further.`
              : `No work item ${unit} in run ${run} has been ingested for this engagement.`,
          )
        : toRef("work_item", resolved, unit);
  }

  return {
    kind: "open_question",
    id: requiredText(row.id),
    engagement,
    run,
    unit,
    section: text(row.section),
    question: prose[0],
    bestGuess: prose[1],
    confidence: text(row.confidence),
    answer: prose[2],
    answeredBy: text(row.answered_by),
    answeredAt: text(row.answered_at),
    status: requiredText(row.status),
    sourceKey: text(row.source_key),
    workItem,
  };
}
