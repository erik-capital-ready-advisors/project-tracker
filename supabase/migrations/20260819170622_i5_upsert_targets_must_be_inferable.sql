-- Delivery Ledger — work-unit i5. Makes every FR-22 upsert target something
-- `ON CONFLICT (columns)` can actually infer.
--
-- ---------------------------------------------------------------------------
-- The measurement this migration exists for
-- ---------------------------------------------------------------------------
-- Observed on this project, 2026-08-19, before any of the ingest writer was
-- written. Against an existing (engagement_id, fleet_run_id, unit) row:
--
--   insert ... on conflict (engagement_id, fleet_run_id, unit) do update ...
--     -> ERROR 42P10: there is no unique or exclusion constraint matching the
--        ON CONFLICT specification
--
--   insert ... on conflict (engagement_id, fleet_run_id, unit)
--       where fleet_run_id is not null and unit is not null do update ...
--     -> INFERRED
--
-- Postgres infers a PARTIAL unique index only when the statement restates the
-- index predicate. That is fine in hand-written SQL and impossible over
-- PostgREST: `on_conflict` is a query parameter that takes column names and has
-- no way to carry a WHERE clause. So `supabase-js`
-- `.upsert(rows, { onConflict: 'engagement_id,fleet_run_id,unit' })` emits the
-- first form above and fails 42P10 every time.
--
-- This is worth stating rather than just fixing, because it fails in the most
-- expensive direction available: the schema looks right, i1's index comment
-- names the correct SQL, the TypeScript compiles, and the break appears only
-- when a real ingest runs against a run that already has rows — that is, on the
-- SECOND post, which is precisely the FR-22 idempotency case.
--
-- ---------------------------------------------------------------------------
-- Why replacing the partial index loses nothing
-- ---------------------------------------------------------------------------
-- A plain unique index over the same columns is NULLS DISTINCT by default, so a
-- row with a NULL in any indexed column never conflicts with another. That is
-- the same set of enforced pairs the partial index gave: it excluded exactly the
-- rows that a NULLS DISTINCT index declines to match. Hand and external work
-- items — which carry neither a run nor a unit — remain unconstrained, which is
-- what FR-16's partial index was protecting.
--
-- FR-16 is unchanged: two runs in the same repository may each define a unit
-- called `i1` and stay distinct records, because `fleet_run_id` is part of the
-- key.

drop index if exists public.work_item_engagement_run_unit_key;

create unique index work_item_engagement_run_unit_key
  on public.work_item (engagement_id, fleet_run_id, unit);

comment on index public.work_item_engagement_run_unit_key is
  'FR-16 + FR-22. Ingest upserts against this: on conflict (engagement_id, '
  'fleet_run_id, unit). Deliberately NOT partial — a partial unique index cannot '
  'be inferred by ON CONFLICT unless the statement restates its predicate, and '
  'PostgREST''s on_conflict parameter takes column names only, so a partial index '
  'here makes every supabase-js upsert fail 42P10 on the second post. NULLS '
  'DISTINCT (the default) already exempts hand and external work items, which '
  'carry neither a run nor a unit, so nothing is enforced here that was not '
  'enforced by the partial form.';

-- Same defect, same fix, in the index this run added an hour earlier.
drop index if exists public.open_question_source_key_idx;

create unique index open_question_source_key_idx
  on public.open_question (engagement_id, source_key);

comment on index public.open_question_source_key_idx is
  'FR-22. Ingest upserts on conflict (engagement_id, source_key). Not partial, '
  'for the reason on work_item_engagement_run_unit_key. A row predating '
  'source_key carries NULL there and, under NULLS DISTINCT, still cannot collide '
  'with anything.';
