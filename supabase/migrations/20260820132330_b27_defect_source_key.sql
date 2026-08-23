-- Delivery Ledger — B27. One additive column on a table that already carries a
-- §7a row (CR-001 §4), no new table, no grant added or changed.
--
-- ---------------------------------------------------------------------------
-- Why ingest could not write a defect without this
-- ---------------------------------------------------------------------------
-- `src/lib/ingest/defects.ts` has parsed a QA report's `## Issues` section into
-- `Defect` records since run b0952e, with its own tests and a fixture. Nothing
-- ever called it: `plan.ts` and `persist.ts` contained no defect handling, so
-- `POST /api/ingest/run` accepted a `qaReport` and persisted zero defects while
-- `qa-report-b0952e.md` recorded 1 critical, 5 important and 6 minor. Broken —
-- the sixth answer CR-001 was written to add — rendered an empty screen that
-- was indistinguishable from a clean one.
--
-- Wiring it up hits FR-22 immediately. `defect.ref` is NOT NULL and FR-63 fixes
-- its shape as a per-engagement sequence (`D-1`, `D-2`, …), so a writer that
-- allocates the next ref on every post produces twelve NEW defects each time the
-- same report is ingested. That is the exact failure FR-22 exists to prevent,
-- and it appears only on the SECOND post.
--
-- ---------------------------------------------------------------------------
-- Why a column, and why this column
-- ---------------------------------------------------------------------------
-- The same reasoning i5 recorded for `open_question.source_key`, and it was
-- re-checked here rather than inherited: `title` is clear text but editable in
-- the source artifact, so keying on it turns a typo fix into a duplicate defect;
-- `description` is `bytea` and pgp_sym output is non-deterministic, so no
-- encrypted column can ever be a dedupe key.
--
-- `source_key` is `<qa report filename>#<finding ordinal in that file>` — the
-- identity `parseQaFindings` already assigns, made durable. CLEAR TEXT and
-- deliberately carrying no prose: a filename and an integer. The table's class
-- is unchanged, because this adds no information the row did not already hold.

alter table public.defect add column source_key text;

comment on column public.defect.source_key is
  'FR-22. `<qa report filename>#<finding ordinal in that file>` — the stable natural '
  'key ingest upserts against, so re-posting a run updates its defects instead of '
  'allocating a second set of D-nn refs. Clear text by necessity: pgp_sym ciphertext '
  'is non-deterministic, so no encrypted column can be a dedupe key, and `title` is '
  'editable in the source artifact. Carries a filename and an integer, never prose, '
  'so CR-001 §4''s class for this table is unchanged. Null for a defect that did not '
  'come from an artifact — an operator- or client-reported one.';

-- PLAIN, not partial. Postgres infers a partial unique index only when the
-- statement restates the index predicate, and PostgREST's `on_conflict` takes
-- column names with no way to carry a WHERE clause — so `.upsert()` against a
-- partial index fails 42P10, and it fails on the second post, which is the
-- idempotency case. Measured on this project 2026-08-19; see
-- 20260819170622_i5_upsert_targets_must_be_inferable.sql, which had to undo
-- exactly this mistake on two other tables.
--
-- A plain unique index is NULLS DISTINCT by default, so operator- and
-- client-reported defects carrying a null `source_key` never collide with each
-- other — the same set of pairs a partial index would have enforced.
create unique index defect_source_key_idx
  on public.defect (engagement_id, source_key);

comment on index public.defect_source_key_idx is
  'FR-22. Ingest upserts on conflict (engagement_id, source_key). Plain rather than '
  'partial so PostgREST can infer it; NULLS DISTINCT leaves defects with no artifact '
  'origin unconstrained.';
