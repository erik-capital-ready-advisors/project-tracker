/**
 * Every column projection the M2.2 register reads, spelled exactly once.
 *
 * ## The one column that must never appear below
 *
 * §7a classifies `work_session` **`sensitive`**, with a pgcrypto column on
 * `summary`: "a summary of hand-prompted work, which may quote anything Erik was
 * working on". This screen is a register of *hours*. It reads `stack_id`,
 * `engagement_id` and `duration_minutes` — three clear columns — and the summary
 * has no business on it at all.
 *
 * The projections live in constants rather than inline for the reason
 * `@/lib/server/runs/columns.ts` gives: `qa-reviewer` found on run `29b583` that
 * widening a `.select()` was **caught by nothing**, because the §7a boundary
 * there rested on a doc comment and a reviewer's attention. A constant is a
 * target a test can assert on, so `./columns.test.ts` asserts on these **and**
 * scans the source text of every non-test file in this directory for a
 * projection written inline — and proves both checks go red on a planted
 * violation before trusting either.
 *
 * **If you are adding a column here, it must be clear under §7a.** Adding a
 * `bytea` column to any constant below turns a test red on purpose.
 *
 * `projectionColumns` is imported rather than re-written. There is one
 * projection parser in this repository and this unit did not write a second, for
 * the same reason there is one paging helper.
 */

export { projectionColumns } from "@/lib/server/runs/columns";

/**
 * The §7a ciphertext columns on the tables this layer touches.
 *
 * Sourced from `supabase/migrations/20260819144331_schema_21_entities.sql` —
 * every `bytea` column on `work_session` and on `work_item`. `work_item` is
 * included even though nothing here reads it: it also carries `stack_id`, so it
 * is the table a future unit would most plausibly reach for, and the guard
 * should already cover it before the first query exists.
 *
 * `stack` carries no ciphertext column at all. It is §7a `internal` —
 * "technology names and which agent covers them" — and every column of it
 * renders freely.
 */
export const CIPHERTEXT_COLUMNS: readonly string[] = [
  // work_session — §7a `sensitive`
  "summary",
  // work_item — §7a `sensitive`; not read here, guarded ahead of the first query
  "description",
  "raw_status",
];

/**
 * FR-104's register rows. Every column of `stack`, because §7a classifies the
 * whole table `internal` and the screen renders all five facts.
 */
export const STACK_COLUMNS = "id, name, agent_covering, first_seen_at, last_seen_at";

/**
 * FR-105's hours and FR-104's engagement count, from the one table that holds
 * both.
 *
 * `summary` is absent, and `id` is present only because `fetchAllRows` orders on
 * it to make paging terminate correctly.
 */
export const WORK_SESSION_COLUMNS = "id, engagement_id, stack_id, duration_minutes";

/** Named so `./columns.test.ts` can iterate them rather than list them again. */
export const STACK_PROJECTIONS = {
  STACK_COLUMNS,
  WORK_SESSION_COLUMNS,
} as const;
