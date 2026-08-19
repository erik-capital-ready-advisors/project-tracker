-- Delivery Ledger — M1.4 (work-unit i5). Two additive changes, no new table,
-- no grant added or changed. Both land on tables that already carry a §7a row,
-- so nothing here ships unclassified.
--
-- ---------------------------------------------------------------------------
-- 1. open_question.source_key — FR-22 idempotency
-- ---------------------------------------------------------------------------
-- i1 left this decision open in the open_question table comment, verbatim:
--
--   "FR-22 idempotency for this table therefore needs a plaintext digest column
--    or a delete-and-reinsert-per-run strategy."
--
-- The reason it cannot be solved without a column was re-measured on this
-- project before writing this migration: `select encrypt_field('same') =
-- encrypt_field('same')` returns FALSE. pgp_sym output is non-deterministic, so
-- `question` can never serve as a dedupe key, and (engagement, run, unit,
-- section) is not unique — one unit may queue several questions about one
-- section.
--
-- Delete-and-reinsert-per-run was rejected because it destroys operator-entered
-- answers: re-posting a run would wipe `answer`, `answered_by` and `answered_at`
-- on every question Erik had already answered. Silent loss of the operator's own
-- typed data is a worse failure than the duplicate it prevents.
--
-- `source_key` is `<artifact filename>#<record ordinal within that file>`. It is
-- CLEAR TEXT and deliberately carries no prose: a questions filename and a line
-- ordinal, both of which are already clear in `run` and `unit`. Class is
-- unchanged — this adds no new information to the row.

alter table public.open_question add column source_key text;

comment on column public.open_question.source_key is
  'FR-22. `<questions filename>#<record ordinal in that file>` — the stable natural '
  'key ingest upserts against. Clear text by necessity: pgp_sym ciphertext is '
  'non-deterministic (measured on this project: encrypt_field(x) = encrypt_field(x) '
  'is FALSE), so no encrypted column can be a dedupe key. Carries a filename and an '
  'integer, never prose, so the table''s `sensitive` class is unchanged.';

create unique index open_question_source_key_idx
  on public.open_question (engagement_id, source_key)
  where source_key is not null;

comment on index public.open_question_source_key_idx is
  'FR-22. Ingest upserts on conflict (engagement_id, source_key). Partial so that '
  'any row predating this column cannot collide on a null.';

-- ---------------------------------------------------------------------------
-- 2. fleet_run gate outcomes and test counts — FR-21
-- ---------------------------------------------------------------------------
-- §7a classifies fleet_run `internal`, contents "run identifiers, branch names,
-- dispatch counts, verdicts". A gate outcome is a verdict and a test count is a
-- count, so these sit inside the existing classification rather than extending
-- it. Nothing here is encrypted and nothing here needs to be.
--
-- Only the OUTCOME WORD is stored, never the reason excerpt that follows it in
-- the artifact. `- Build (pnpm): FAIL <excerpt>` contributes `"build":"FAIL"` and
-- the excerpt is discarded, because an excerpt is specialist prose and specialist
-- prose is what §7a classifies `sensitive` on work_item. Keeping the class honest
-- is worth more than keeping the excerpt.

create or replace function app.gates_are_closed_set(v jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v is null or (
    jsonb_typeof(v) = 'object'
    and not exists (
      select 1
        from jsonb_each_text(v) as g(gate_name, outcome)
       where outcome not in ('PASS', 'FAIL', 'NOT_RUN', 'unparsed')
    )
  );
$$;

comment on function app.gates_are_closed_set(jsonb) is
  'FR-21 + the unparsed discipline. A gate outcome this build does not recognise is '
  'stored as the literal string `unparsed`, never mapped to PASS or FAIL. This '
  'constraint is what stops a later writer inventing a fifth value.';

revoke execute on function app.gates_are_closed_set(jsonb) from public, anon, authenticated;

alter table public.fleet_run
  add column tests_passed  int,
  add column tests_failed  int,
  add column tests_skipped int,
  add column gates         jsonb not null default '{}'::jsonb,
  add constraint fleet_run_gates_closed_set check (app.gates_are_closed_set(gates)),
  add constraint fleet_run_test_counts_non_negative check (
    coalesce(tests_passed, 0)  >= 0 and
    coalesce(tests_failed, 0)  >= 0 and
    coalesce(tests_skipped, 0) >= 0
  );

comment on column public.fleet_run.gates is
  'FR-21. Gate name -> outcome word, read off the run''s checkpoint and QA report. '
  'Outcome words only (PASS / FAIL / NOT_RUN / unparsed); the reason excerpt that '
  'follows an outcome in the artifact is deliberately discarded, because it is '
  'specialist prose and this table is `internal`.';

comment on column public.fleet_run.tests_passed is
  'FR-21. As REPORTED by the run''s own QA report — a claim the run made about '
  'itself, not a measurement this product took. NULL means the artifact stated no '
  'count, which is different from zero.';
