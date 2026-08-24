-- Delivery Ledger — M2.9 work-unit i1. The schema foundation for planned work.
--
-- CR-005 §3.1, FR-87 to FR-91. This migration makes a planned row STORABLE and
-- nothing more: it writes no parser (i2), no reconciliation reader (i3), no
-- staleness derivation (i4) and no screen (u2/u4).
--
-- ---------------------------------------------------------------------------
-- What was measured on the live database before this was written, 2026-08-24
-- ---------------------------------------------------------------------------
-- Against project `onpvolboecjpdkvurjaf`, 21 columns on public.work_item, 20 rows:
--
--   * `execution_mode` is NOT NULL                    -> FR-87 needs it nullable. Changed below.
--   * `work_status` enum is
--     (pending,in_flight,done,blocked,superseded,
--      not_dispatched,unparsed)                       -> `pending` ALREADY EXISTS. No enum change.
--   * `engagement_id` is NOT NULL                     -> Q14's "engagement required at creation"
--                                                        is ALREADY enforced. No second constraint.
--   * no created_at / updated_at, only nullable
--     started_at / ended_at                           -> FR-91 has no timestamp. Added below.
--   * no plan-reference column                        -> FR-90 has no key. Added below.
--
-- One correction to the run's resolved spec, recorded because a stale measured
-- fact is worse than none. §"The existing upsert index is PARTIAL, and a new one
-- must not be" quotes the CREATE from 20260819144331_schema_21_entities.sql.
-- That statement was superseded an hour later by
-- 20260819170622_i5_upsert_targets_must_be_inferable.sql, and the live index
-- reads:
--
--   CREATE UNIQUE INDEX work_item_engagement_run_unit_key
--     ON public.work_item USING btree (engagement_id, fleet_run_id, unit)
--
-- No WHERE clause. It is already PLAIN. The rule the spec drew from it still
-- binds this migration and is obeyed below; only the claim about current state
-- was out of date.

-- ---------------------------------------------------------------------------
-- 1. FR-87 — a planned row has no execution mode yet
-- ---------------------------------------------------------------------------
-- "A work_item may be created with execution_mode unset and status = pending
-- before any run exists."
--
-- NULL here means "not yet dispatched, so nobody has decided how this gets
-- done". It is deliberately NOT a fourth enum member: a `planned` mode would
-- make every exhaustive switch in the app compile while silently gaining a
-- branch nobody wrote, whereas NULL makes the TypeScript that reads this column
-- state its intent. FR-91's whole point is that planned work must not read as
-- in-flight, and a nullable column is the version of that the type system can
-- police.

alter table public.work_item
  alter column execution_mode drop not null;

comment on column public.work_item.execution_mode is
  'FR-39 for dispatched work; NULL for FR-87 planned work, which has not been '
  'dispatched and so has no mode yet. NULL is not a fourth mode and must never be '
  'rounded to one — see FR-91: "nobody has started this" must never read as '
  '"this is in flight".';

-- ---------------------------------------------------------------------------
-- 2. FR-91 — the timestamp staleness is DERIVED from
-- ---------------------------------------------------------------------------
-- Q15 ruled: STALE at 30 days untouched, surfaced and never deleted. Staleness
-- is derived from a timestamp, never stored as a status — so this migration adds
-- the timestamp and stores no status. Nothing transitions and nothing is
-- deleted, so CR-002's append-only ruling is untouched.
--
-- `started_at` and `ended_at` could not serve: both are nullable and both are
-- properties of a RUN, so a planned row has neither by definition. Deriving
-- staleness from a column that is NULL for exactly the rows the rule applies to
-- is the shape of a rule that can never fire.

alter table public.work_item
  add column created_at timestamptz not null default now(),
  add column updated_at timestamptz not null default now();

-- Backfill, stated rather than silent. The 20 pre-existing rows are all
-- ingested (they predate nullable execution_mode, so none is planned work) and
-- FR-91 reads only planned rows, so no derived answer depends on these values.
-- `created_at` is still moved back to the run timestamp where one exists,
-- because now() would assert these rows were created today and they were not.
-- `updated_at` is left at now(), which is literally true: this migration is
-- what last touched them. Done BEFORE the trigger below exists, so the backfill
-- does not immediately overwrite itself.

update public.work_item
   set created_at = coalesce(started_at, ended_at)
 where coalesce(started_at, ended_at) is not null
   and coalesce(started_at, ended_at) < created_at;

comment on column public.work_item.created_at is
  'When the row was first written. Rows predating migration i1 (2026-08-24) carry '
  'a backfilled value: the run''s started_at/ended_at where one existed, else the '
  'migration time.';

comment on column public.work_item.updated_at is
  'FR-91 + Q15. The timestamp 30-day staleness is DERIVED from — "untouched for 30 '
  'days" is measured here. Maintained by trigger work_item_touch_updated_at so no '
  'write path can forget it; a forgotten bump would make a live row read STALE. '
  'Staleness is never stored as a status: nothing in this product transitions a row '
  'because time passed (CR-002).';

-- The trigger function lives in schema `app`, alongside every other helper in
-- this build, and is SECURITY DEFINER with an empty search_path — the same shape
-- as app.deny_mutation() and app.reject_secret_shaped_identifiers().
--
-- SECURITY DEFINER is the one case that does not need an EXECUTE grant to the
-- writing role. The per-name REVOKE and the service_role GRANT are both written
-- anyway: the REVOKE because a function reachable by `authenticated` is a
-- PostgREST RPC endpoint, and the GRANT because omitting it is the failure that
-- returned 500 on every POST /api/ingest/run on run b0952e — 42501 naming the
-- function rather than the table, with the whole suite green. A redundant grant
-- costs nothing; a missing one costs a silent outage.

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function app.touch_updated_at() is
  'FR-91. Sets updated_at on every UPDATE so staleness cannot be defeated by a '
  'write path that forgets to bump it.';

revoke execute on function app.touch_updated_at() from public, anon, authenticated;
grant execute on function app.touch_updated_at() to service_role;

drop trigger if exists work_item_touch_updated_at on public.work_item;
create trigger work_item_touch_updated_at
  before update on public.work_item
  for each row execute function app.touch_updated_at();

-- Read index for FR-91's "planned rows untouched for N days" scan.
-- PARTIAL DELIBERATELY, and safe: the prohibition on partial indexes in this
-- repo is about UPSERT CONFLICT TARGETS, because PostgREST's on_conflict
-- parameter carries column names and cannot restate a predicate. This index is
-- never a conflict target — it is not unique — so that rule does not reach it.
create index work_item_planned_updated_idx
  on public.work_item (updated_at)
  where execution_mode is null;

comment on index public.work_item_planned_updated_idx is
  'FR-91 staleness scan over planned rows. A READ index, never an ON CONFLICT '
  'target — partial is fine here for exactly that reason.';

-- ---------------------------------------------------------------------------
-- 3. FR-90 — the reconciliation key, and the mark that stands in for a merge
-- ---------------------------------------------------------------------------
-- Q13 ruled: the key is an explicit id the plan carries and the manifest echoes.
-- Where the id is absent on either side, BOTH rows stand and the collision is
-- marked — never merged. Prose similarity is excluded absolutely.
--
-- §3.1a, measured: no artifact carries such an id today. plan.md numbers tasks
-- positionally (`### Task 5:`) and the manifests have no plan-id field, so plan
-- and manifest share zero keys. M2.9 therefore builds the READ side: it accepts
-- an id where present and marks a collision where absent, which means every
-- reconciliation marks and none merges. That is the ruling satisfied, not a gap.
--
-- What is deliberately NOT modelled here, because modelling it would require the
-- thing Q13 forbids: there is no `collides_with` foreign key pairing a planned
-- row to an ingested one. With no shared key you cannot identify WHICH two rows
-- correspond — determining the pair would mean matching prose, which the ruling
-- excludes absolutely. So the mark is a property of one row ("a reconciliation
-- was attempted here and no key existed to carry it"), not an edge between two.

create type public.plan_reconciliation as enum (
  'unreconciled',  -- default: no reconciliation has been established for this row
  'keyed',         -- reconciled via an explicit plan_ref. RESERVED — the write half
                   -- of FR-90 is deferred by CR-005 §3.1a and nothing in M2.9
                   -- produces this value. Declared now because adding an enum
                   -- member later re-runs `create type` under `supabase db push`.
  'collision'      -- a reconciliation was attempted and no key existed on one or
                   -- both sides. Both rows stand, unmerged. This is the ONLY
                   -- non-default value M2.9 writes.
);

alter table public.work_item
  add column plan_ref text,
  add column plan_reconciliation public.plan_reconciliation not null default 'unreconciled';

comment on column public.work_item.plan_ref is
  'FR-90 / Q13 reconciliation key: the explicit id a plan document carries and a '
  'manifest echoes. NULL when the artifact carried none, which is every artifact '
  'today. Left CLEAR rather than encrypted: spec 7a names exactly two encrypted '
  'columns on this table (description, raw_status) and leaves identifiers clear, '
  'the same call it makes explicitly for requirement.ref beside an encrypted '
  'requirement.text, and the same treatment work_item.unit already has. It is also '
  'load-bearing — an encrypted key cannot be indexed or matched, so encrypting the '
  'reconciliation key would delete the requirement it exists for.';

comment on column public.work_item.plan_reconciliation is
  'FR-90 / Q13. Marks a row whose reconciliation could not be keyed. Deliberately '
  'NOT an edge to the colliding row: with no shared key the pair is unidentifiable '
  'except by prose similarity, which Q13 excludes absolutely.';

-- The FR-90 invariant, made unbreakable rather than remembered. Nothing may
-- claim it merged on a key while carrying no key. Written as a plain column
-- CHECK with no function call in it: a CHECK that calls a function evaluates in
-- the CALLER's role and needs its own grant, which is how a table goes silently
-- unwritable.
alter table public.work_item
  add constraint work_item_keyed_requires_plan_ref
    check (plan_reconciliation <> 'keyed' or plan_ref is not null);

-- PLAIN unique index, not partial. This one IS an upsert conflict target: i3's
-- planned-work write path needs `on conflict (engagement_id, plan_ref)` to be
-- idempotent, and PostgREST's on_conflict takes column names only. A partial
-- index here would fail 42P10 on the SECOND post, which is the only post that
-- exercises idempotency. NULLS DISTINCT (the default) means the rows with no
-- plan_ref — every row today — never collide with each other, which is exactly
-- what the partial predicate would have bought.
create unique index work_item_engagement_plan_ref_key
  on public.work_item (engagement_id, plan_ref);

comment on index public.work_item_engagement_plan_ref_key is
  'FR-90. Upsert target: on conflict (engagement_id, plan_ref). Deliberately NOT '
  'partial — see work_item_engagement_run_unit_key for the 42P10 measurement this '
  'repo already paid for.';

-- ---------------------------------------------------------------------------
-- Grants and RLS: unchanged, and that is the correct outcome
-- ---------------------------------------------------------------------------
-- No table is created here, so no new RLS surface exists. work_item already
-- carries RLS enabled with exactly one policy (work_item_select, SELECT,
-- authenticated, gated on app.is_operator()) and no anon grant of any kind.
-- Table-level GRANT SELECT covers columns added later, so the four new columns
-- inherit that policy and that grant without a line here. Asserting the policy
-- rather than the relrowsecurity flag is deliberate: this project's `ensure_rls`
-- event trigger sets the flag on every new public table with zero policies
-- behind it, so the flag is not evidence.
