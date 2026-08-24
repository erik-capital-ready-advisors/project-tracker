/**
 * Every column projection the M2.8 run screens read, spelled exactly once.
 *
 * ## Why this is a module and not four inline strings
 *
 * §7a classifies four of the five tables this read layer touches as `sensitive`,
 * and the ciphertext columns on them are the ones that must never appear in a
 * projection here: `/runs` and `/runs/[run-id]` are **listing** surfaces. They
 * exist to say *which* run and *which* unit to open, not to render its prose.
 * `@/lib/questions-load`'s header sets out the reasoning at length and it is not
 * repeated: no decryption, nothing to hold in memory, and nothing that can reach
 * a `data-verify-*` attribute by mistake.
 *
 * The reason the projections live in constants rather than inline is narrower
 * and it is the whole point of the file. `qa-reviewer` found on run `29b583`
 * that adding `question, best_guess, answer` to the `/questions` select was
 * **caught by nothing** — the §7a boundary there rests on a doc comment and a
 * reviewer's attention. A constant is a target a test can assert on directly, so
 * `./columns.test.ts` asserts on these **and** on the source text of every
 * non-test file in this directory, and proves both checks go red on a planted
 * violation before trusting either.
 *
 * **If you are adding a column here, it must be clear under §7a.** Adding a
 * `bytea` column to any constant below turns a test red on purpose.
 */

/**
 * The §7a and security-baseline ciphertext columns on the tables this layer
 * reads. **A projection in this directory may never name one.**
 *
 * Sourced from `supabase/migrations/20260819144331_schema_21_entities.sql` —
 * every `bytea` column on `work_item`, `open_question`, `defect`, `requirement`
 * and `blocker`. `blocker` is included even though nothing here reads it, so the
 * guard already covers the table before a future unit adds the first query
 * against it.
 */
export const CIPHERTEXT_COLUMNS: readonly string[] = [
  // work_item — §7a `sensitive`
  "description",
  "raw_status",
  // open_question — `question`/`best_guess` §7a, `answer` security baseline (B13)
  "question",
  "best_guess",
  "answer",
  // defect — §7a `sensitive`
  "wont_fix_reason",
  // requirement — §7a `sensitive`; matched and reported by `ref`, never by text
  "text",
];

/**
 * A run's work units, for FR-93's "its work units and their outcomes".
 *
 * `description` and `raw_status` are deliberately absent. `raw_status` is the
 * one worth naming: `@/lib/server/detail/work-item.ts` reads it because on a row
 * whose `status` is `unparsed` it is the only thing that can say what the
 * artifact claimed. That argument holds for a **detail view of one work item**
 * and not for a list of twenty — the run screen's job is to get the reader to
 * the right unit, and `/work-items/<id>` already renders the prose correctly at
 * one `decrypt_field` round trip per value.
 */
export const RUN_WORK_ITEM_COLUMNS =
  "id, engagement_id, fleet_run_id, unit, execution_mode, work_type, phase, " +
  "executor, executor_kind, status, unautomated_reason, disposition, " +
  "evidence_scope, not_verified_count, started_at, ended_at, updated_at";

/**
 * The questions a run queued, for FR-93.
 *
 * Clear columns only, and identical in spirit to `@/lib/questions-load`'s
 * projection. `status` already carries the one bit a list needs from the
 * ciphertext trio — whether the question was answered — so no boolean stand-in
 * for "has an answer" is synthesized either.
 */
export const RUN_QUESTION_COLUMNS =
  "id, engagement_id, run, unit, section, confidence, answered_by, answered_at, status";

/**
 * Defects reachable from a run, for FR-93.
 *
 * `title` is clear (`text not null` in the migration) and is the label a person
 * follows; `description` and `wont_fix_reason` are the `bytea` pair and are
 * absent. See `loadRunDetail`'s note on what this edge does and does not mean.
 */
export const RUN_DEFECT_COLUMNS =
  "id, engagement_id, ref, severity, status, title, fixing_work_item_id";

/** `work_item_requirement`, for FR-93's "the requirements it touched". */
export const RUN_WORK_ITEM_REQUIREMENT_COLUMNS =
  "id, work_item_id, requirement_ref";

/**
 * The `fleet_run` row itself. §7a classifies the whole table `internal` and it
 * carries no encrypted column, so this is every column the table has.
 */
export const FLEET_RUN_COLUMNS =
  "id, engagement_id, run_id, branch, mode, started_at, ended_at, " +
  "dispatch_cap, dispatches_used, verdict, gates, " +
  "tests_passed, tests_failed, tests_skipped";

/**
 * Every projection above, for the guard test to iterate.
 *
 * Exported as a record rather than an array so a failure names *which*
 * projection is at fault — `An exit-code-only probe cannot tell a caught defect
 * from an unrelated failure` applied to an assertion message.
 */
export const RUN_PROJECTIONS: Readonly<Record<string, string>> = {
  RUN_WORK_ITEM_COLUMNS,
  RUN_QUESTION_COLUMNS,
  RUN_DEFECT_COLUMNS,
  RUN_WORK_ITEM_REQUIREMENT_COLUMNS,
  FLEET_RUN_COLUMNS,
};

/**
 * Split a PostgREST projection into the column tokens it names.
 *
 * Exported because the guard test asserts on the same decomposition the
 * production code's projections are written in, rather than on a regex the test
 * invented — a check that parses its subject differently from the way the
 * subject is written is a check that holds only by coincidence.
 *
 * Handles the two forms these projections use: a bare comma-separated list, and
 * PostgREST's embedded-resource syntax `alias:fk_column (col, col)`. Both the
 * embedding column and the embedded columns are returned, because a ciphertext
 * column smuggled inside an embed is exactly as exposed as one at the top level.
 */
export function projectionColumns(projection: string): string[] {
  const tokens: string[] = [];

  for (const raw of projection.split(",")) {
    const part = raw.trim();
    if (part === "") continue;

    // `alias:column (a, b)` and `column (a, b)` — take the key and keep going;
    // the parenthesised members arrive as their own comma-separated parts.
    const withoutParens = part.replace(/[()]/g, " ");
    for (const piece of withoutParens.split(/\s+/)) {
      const name = piece.includes(":") ? piece.slice(piece.indexOf(":") + 1) : piece;
      const clean = name.trim();
      if (clean !== "") tokens.push(clean);
    }
  }

  return tokens;
}
