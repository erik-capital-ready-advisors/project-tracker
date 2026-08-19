-- Delivery Ledger — M1.1 schema: the 21 entities of resolved-spec §7
-- (spec-approved.md as amended by approved CR-001).
--
-- Two conventions worth stating once:
--
-- * Enum where the spec states the closed set; `text` where it does not.
--   Inventing a value set the spec never wrote down would be the same move as
--   widening a regex to make a stubborn row classify.
--
-- * Every encrypted column is `bytea`, because `pgp_sym_encrypt` returns bytea.
--   PostgREST serialises bytea as a `\x`-prefixed hex string, so the generated
--   TypeScript type is `string | null` and it is NOT plaintext. Read encrypted
--   columns through `public.decrypt_field()` with the service-role client; never
--   render a raw one.
--
-- Requirement references (`FR-nn`, `D-nn`) are stored as TEXT, never as foreign
-- keys, because FR-12 and FR-65 require a reference naming something that does
-- not exist to be *reported* rather than silently accepted. A foreign key would
-- reject the row at ingest and lose the finding.

-- ---------------------------------------------------------------------------
-- Enumerations the spec states explicitly
-- ---------------------------------------------------------------------------

create type public.execution_mode      as enum ('fleet', 'hand', 'external');                                    -- FR-39
create type public.executor_kind       as enum ('agent', 'erik', 'erik_gate', 'client', 'vendor', 'unassigned'); -- FR-39/FR-40
create type public.work_status         as enum ('pending', 'in_flight', 'done', 'blocked', 'superseded', 'not_dispatched', 'unparsed'); -- FR-15
create type public.evidence_scope      as enum ('observed_live', 'observed_elsewhere', 'asserted', 'not_verified'); -- FR-43
create type public.work_disposition    as enum ('carried', 'closed');                                            -- FR-30
create type public.unautomated_reason  as enum ('no_agent_for_stack', 'credential_absent', 'human_judgment', 'client_action', 'out_of_scope', 'budget'); -- FR-29
create type public.test_harness        as enum ('vitest', 'playwright', 'database_probe');                       -- FR-46
create type public.test_status         as enum ('pass', 'fail', 'skipped', 'unparsed');
create type public.defect_source       as enum ('qa_agent', 'operator', 'client', 'api');                        -- FR-63
create type public.defect_severity     as enum ('critical', 'major', 'minor', 'unparsed');                       -- FR-63 + FR-64
create type public.defect_status       as enum ('open', 'fixed', 'verified', 'wont_fix', 'unparsed');            -- FR-63 + FR-64
create type public.release_source      as enum ('declared', 'ingested');                                         -- FR-73
create type public.wait_resolution_method as enum ('probe', 'manual');                                           -- FR-35
create type public.question_status     as enum ('open', 'answered');                                             -- FR-18
create type public.question_confidence as enum ('low', 'med', 'high');
create type public.agent_capability    as enum ('answer_read', 'ingest_write');                                  -- FR-5
create type public.actor_type          as enum ('operator', 'agent', 'system');                                  -- FR-59

comment on type public.work_status is
  'FR-15. `unparsed` is the only default. A status paragraph the parser does not '
  'recognise is stored unparsed and counted on every surface; it is never guessed at.';

-- ---------------------------------------------------------------------------
-- 1. operator — class `personal`
-- ---------------------------------------------------------------------------

create table public.operator (
  id              uuid primary key references auth.users (id) on delete cascade,
  email           text not null unique,
  display_name    text,
  role            text,
  mfa_enrolled_at timestamptz,
  created_at      timestamptz not null default now(),
  constraint operator_role_valid check (role is null or role = 'operator')
);

comment on column public.operator.role is
  'FR-3. NULL by default and deliberately so: a brand-new account receives no role '
  'and can read no table until one is granted. app.is_operator() requires a non-null '
  'role, so the deny-by-default is enforced in RLS rather than in the UI.';

-- ---------------------------------------------------------------------------
-- 2. agent_token — class `sensitive`; hashed with crypt(), never encrypted
-- ---------------------------------------------------------------------------

create table public.agent_token (
  id           uuid primary key default gen_random_uuid(),
  label        text not null,
  token_hash   text not null unique,
  capabilities public.agent_capability[] not null default '{}',
  expires_at   timestamptz not null,
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.agent_token is
  'Spec 7a: bearer credentials. The plaintext is shown once at creation and stored '
  'only as a bcrypt hash. Never returned by any read endpoint. '
  'Recommended plaintext shape for FR-4/FR-8: `dl_<this row''s id>_<random>` — so a '
  'handler can look the row up by id and verify ONE hash, rather than bcrypt-comparing '
  'every token on every request, which is an O(n) cost on an unauthenticated path.';

comment on column public.agent_token.created_at is
  'Not named in spec §7''s field list; added to support 7a''s stated retention '
  '("until revoked, then 90 days for audit"), which needs a dated record.';

-- ---------------------------------------------------------------------------
-- 3. engagement — class `personal` (+ CR-001 FR-77 provisioning identifiers)
-- ---------------------------------------------------------------------------

create table public.engagement (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  client_name     text not null,
  source          text,
  contract_type   text,
  status          text not null default 'active',
  repo_path       text,
  spec_path       text,
  fleet_dir       text,
  stacks          text[] not null default '{}',
  db_org          text,
  db_project_ref  text,
  hosting_team    text,
  hosting_project text,
  production_url  text,
  created_at      timestamptz not null default now(),
  archived_at     timestamptz,
  constraint engagement_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint engagement_production_url_https
    check (production_url is null or production_url ~ '^https://')
);

comment on column public.engagement.client_name is
  'Spec 7a stated exception: deliberately NOT encrypted, because it is the display '
  'and grouping key on every screen and every endpoint. The money sits on '
  'contract_milestone.amount and is encrypted. A reduction in exposure, stated as such.';

comment on column public.engagement.db_project_ref is
  'FR-77/FR-78. An identifier, never a secret. Enforced by the trigger below.';

create trigger engagement_reject_secret_shaped_identifiers
  before insert or update on public.engagement
  for each row execute function app.reject_secret_shaped_identifiers();

-- FR-26: a session that resolves to no known engagement is stored against this
-- row and listed for attribution, rather than discarded.
insert into public.engagement (slug, client_name, source, status)
values ('unassigned', 'Unassigned', 'system', 'active')
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- 4. contract_milestone — class `sensitive`
-- ---------------------------------------------------------------------------

create table public.contract_milestone (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagement (id) on delete cascade,
  name          text not null,
  amount        bytea,
  currency      text not null default 'USD',
  due_date      date,
  submitted_at  timestamptz,
  paid_at       timestamptz,
  notes         bytea,
  unique (engagement_id, name)
);

comment on table public.contract_milestone is
  'Spec 7a: operator only; AGENT TOKENS ARE REFUSED THIS TABLE ENTIRELY (FR-5). '
  'RLS cannot express that refusal, because agent tokens are not Postgres roles — '
  'they are bearer credentials validated in the route handler, which then reads with '
  'the service-role key, and service_role holds BYPASSRLS. The refusal is therefore '
  'a handler-layer obligation on work-unit i4 and must be tested there.';

comment on column public.contract_milestone.amount is
  'pgp_sym ciphertext (spec 7a). Consequence, stated in 7a: NO SQL AGGREGATION OVER '
  'MONEY. Totals are computed server-side after decryption.';

comment on column public.contract_milestone.notes is
  'pgp_sym ciphertext. Source: security baseline, not spec 7a — 7a names only `amount` '
  'but classifies the whole table `sensitive`, and the baseline requires column '
  'encryption for sensitive data unless the spec explicitly waives it. 7a wrote explicit '
  'waivers for defect.title and engagement.client_name and wrote none for this column.';

-- ---------------------------------------------------------------------------
-- 5. acceptance_criterion — class `internal`
-- ---------------------------------------------------------------------------

create table public.acceptance_criterion (
  id              uuid primary key default gen_random_uuid(),
  milestone_id    uuid not null references public.contract_milestone (id) on delete cascade,
  requirement_ref text not null,
  unique (milestone_id, requirement_ref)
);

-- ---------------------------------------------------------------------------
-- 6. requirement — class `sensitive`
-- ---------------------------------------------------------------------------

create table public.requirement (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagement (id) on delete cascade,
  ref           text not null,
  section       text,
  text          bytea,
  unique (engagement_id, ref)
);

comment on column public.requirement.text is
  'pgp_sym ciphertext (spec 7a); `ref` and `section` are left clear. Consequence: '
  'requirements are matched, joined and reported by FR-nn and never by their text.';

-- ---------------------------------------------------------------------------
-- 7. fleet_run — class `internal`
-- ---------------------------------------------------------------------------

create table public.fleet_run (
  id              uuid primary key default gen_random_uuid(),
  engagement_id   uuid not null references public.engagement (id) on delete cascade,
  run_id          text not null,
  branch          text,
  mode            text,
  started_at      timestamptz,
  ended_at        timestamptz,
  dispatch_cap    int,
  dispatches_used int,
  verdict         text,
  unique (engagement_id, run_id)
);

-- ---------------------------------------------------------------------------
-- 8. stack — class `internal`
-- ---------------------------------------------------------------------------

create table public.stack (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  agent_covering text,
  first_seen_at timestamptz,
  last_seen_at  timestamptz
);

-- ---------------------------------------------------------------------------
-- 9. blocker — class `sensitive`
-- ---------------------------------------------------------------------------

create table public.blocker (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagement (id) on delete cascade,
  ref           text,
  owner         text,
  description   bytea,
  opened_at     timestamptz,
  resolved_at   timestamptz,
  disposition   public.work_disposition,
  constraint blocker_engagement_ref_key unique nulls not distinct (engagement_id, ref)
);

comment on column public.blocker.description is
  'pgp_sym ciphertext (spec 7a). This field carries verbatim prose written by '
  'specialists mid-build — client database identifiers, provisioning failures, named '
  'custodians. That is why the table is sensitive despite looking operational.';

-- ---------------------------------------------------------------------------
-- 10. external_wait — class `personal`
-- ---------------------------------------------------------------------------

create table public.external_wait (
  id                uuid primary key default gen_random_uuid(),
  engagement_id     uuid not null references public.engagement (id) on delete cascade,
  label             text not null,
  owner             text,
  owner_type        text,
  reason            text,
  started_at        timestamptz,
  expected_by       date,
  resolved_at       timestamptz,
  resolved_by       text,
  resolution_method public.wait_resolution_method,
  probe_target      text,
  unique (engagement_id, label)
);

comment on table public.external_wait is
  'Spec 7a class `personal`, at rest `provider default` — so `reason` is deliberately '
  'left clear. That is 7a''s explicit call for this table, not an omission.';

-- ---------------------------------------------------------------------------
-- 11. work_item — class `sensitive`
-- ---------------------------------------------------------------------------

create table public.work_item (
  id                 uuid primary key default gen_random_uuid(),
  engagement_id      uuid not null references public.engagement (id) on delete cascade,
  fleet_run_id       uuid references public.fleet_run (id) on delete set null,
  unit               text,
  execution_mode     public.execution_mode not null,
  work_type          text,
  phase              int,
  description        bytea,
  executor           text,
  executor_kind      public.executor_kind not null default 'unassigned',
  status             public.work_status not null default 'unparsed',
  unautomated_reason public.unautomated_reason,
  disposition        public.work_disposition,
  evidence_scope     public.evidence_scope,
  not_verified_count int not null default 0,
  stack_id           uuid references public.stack (id) on delete set null,
  blocker_id         uuid references public.blocker (id) on delete set null,
  external_wait_id   uuid references public.external_wait (id) on delete set null,
  raw_status         bytea,
  started_at         timestamptz,
  ended_at           timestamptz,
  -- FR-41: work blocked because no agent exists for its stack IS an erik_gate.
  -- Stated as an invariant so no ingest path can produce the contradiction.
  constraint work_item_no_agent_implies_erik_gate
    check (unautomated_reason is distinct from 'no_agent_for_stack'
           or executor_kind = 'erik_gate')
);

-- FR-16: unit ids are scoped by engagement AND run. Two runs in the same
-- repository may each define a unit called `i1` and stay distinct records.
-- Partial, because hand and external work items carry neither a run nor a unit.
create unique index work_item_engagement_run_unit_key
  on public.work_item (engagement_id, fleet_run_id, unit)
  where fleet_run_id is not null and unit is not null;

comment on index public.work_item_engagement_run_unit_key is
  'FR-16 + FR-22. Ingest upserts against this: '
  'on conflict (engagement_id, fleet_run_id, unit) where fleet_run_id is not null and unit is not null.';

comment on column public.work_item.external_wait_id is
  'Spec §7 states the relationship "an external wait blocks many work items" but lists '
  'no join entity among the 21, so it is modelled as this one-to-many FK rather than '
  'as a 22nd table.';

-- ---------------------------------------------------------------------------
-- 12. work_item_dependency — class `internal`
-- ---------------------------------------------------------------------------

create table public.work_item_dependency (
  id            uuid primary key default gen_random_uuid(),
  work_item_id  uuid not null references public.work_item (id) on delete cascade,
  depends_on_id uuid not null references public.work_item (id) on delete cascade,
  unique (work_item_id, depends_on_id),
  constraint work_item_dependency_no_self check (work_item_id <> depends_on_id)
);

comment on table public.work_item_dependency is
  'FR-42. Both ends are real foreign keys, so an edge naming a unit that does not '
  'exist cannot be stored — the ingest path drops and counts it instead.';

-- ---------------------------------------------------------------------------
-- 13. work_item_requirement — class `internal`
-- ---------------------------------------------------------------------------

create table public.work_item_requirement (
  id              uuid primary key default gen_random_uuid(),
  work_item_id    uuid not null references public.work_item (id) on delete cascade,
  requirement_ref text not null,
  unique (work_item_id, requirement_ref)
);

-- ---------------------------------------------------------------------------
-- 14. work_session — class `sensitive`
-- ---------------------------------------------------------------------------

create table public.work_session (
  id                uuid primary key default gen_random_uuid(),
  engagement_id     uuid not null references public.engagement (id) on delete cascade,
  work_item_id      uuid references public.work_item (id) on delete set null,
  started_at        timestamptz not null,
  ended_at          timestamptz,
  duration_minutes  int,
  stack_id          uuid references public.stack (id) on delete set null,
  working_directory text,
  files_changed     int,
  commits           int,
  summary           bytea,
  source            text,
  constraint work_session_natural_key
    unique nulls not distinct (engagement_id, working_directory, started_at)
);

-- ---------------------------------------------------------------------------
-- 15. test_case — class `internal`
-- ---------------------------------------------------------------------------

create table public.test_case (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagement (id) on delete cascade,
  harness       public.test_harness not null,
  file          text not null,
  title         text not null,
  covers        text[] not null default '{}',
  authored_by   text,
  certified_by  text,
  unique (engagement_id, file, title)
);

comment on column public.test_case.covers is
  'FR-45/FR-66. Requirement and defect references (`FR-nn`, `D-nn`) read out of the '
  'test''s own title. Text refs, not foreign keys — see the header note.';

-- ---------------------------------------------------------------------------
-- 16. test_result — class `internal`, append-only
-- ---------------------------------------------------------------------------

create table public.test_result (
  id             uuid primary key default gen_random_uuid(),
  test_case_id   uuid not null references public.test_case (id) on delete cascade,
  status         public.test_status not null default 'unparsed',
  evidence_scope public.evidence_scope,
  evidence_ref   text,
  run_at         timestamptz not null default now(),
  certified_by   text
);

comment on table public.test_result is
  'Spec 7a: indefinite, APPEND-ONLY. FR-69 derives regressions from this history — a '
  'test whose latest result is fail and which has an earlier pass. An UPDATE here would '
  'erase the evidence a regression is computed from, which is why the ban is a trigger '
  'and not a convention.';

create trigger test_result_append_only
  before update or delete on public.test_result
  for each row execute function app.deny_mutation();

create trigger test_result_no_truncate
  before truncate on public.test_result
  for each statement execute function app.deny_mutation();

-- ---------------------------------------------------------------------------
-- 17. open_question — class `sensitive`
-- ---------------------------------------------------------------------------

create table public.open_question (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagement (id) on delete cascade,
  run           text,
  unit          text,
  section       text,
  question      bytea,
  best_guess    bytea,
  confidence    public.question_confidence,
  answer        bytea,
  answered_by   text,
  answered_at   timestamptz,
  status        public.question_status not null default 'open'
);

comment on column public.open_question.answer is
  'pgp_sym ciphertext. Source: security baseline, not spec 7a — 7a names `question` and '
  '`best_guess` and is silent on `answer`, but an answer quotes the same client decisions '
  'the question does, and the table is classified sensitive. Queued for Erik to confirm.';

comment on table public.open_question is
  'No natural unique key, deliberately: `question` is ciphertext and pgp_sym output is '
  'non-deterministic, so it cannot serve as a dedupe key, and (engagement, run, unit, '
  'section) is not unique — one unit may queue several questions about one section. '
  'FR-22 idempotency for this table therefore needs a plaintext digest column or a '
  'delete-and-reinsert-per-run strategy. That is work-unit i4''s call, not the schema''s.';

-- ---------------------------------------------------------------------------
-- 18. audit_log — class `internal`, append-only (FR-59)
-- ---------------------------------------------------------------------------

create table public.audit_log (
  id           bigint generated always as identity primary key,
  actor        text,
  actor_type   public.actor_type not null,
  action       text not null,
  target_table text,
  target_id    text,
  created_at   timestamptz not null default now()
);

comment on table public.audit_log is
  'FR-59. Actor, action, target identifiers, timestamp — and NO RECORD CONTENTS. '
  'Append-only is enforced by the triggers below rather than by policy alone, because '
  'RLS does not apply to service_role and service_role is what writes these rows.';

create trigger audit_log_append_only
  before update or delete on public.audit_log
  for each row execute function app.deny_mutation();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function app.deny_mutation();

-- ---------------------------------------------------------------------------
-- 19. defect — class `sensitive` (CR-001)
-- ---------------------------------------------------------------------------

create table public.defect (
  id                  uuid primary key default gen_random_uuid(),
  engagement_id       uuid not null references public.engagement (id) on delete cascade,
  ref                 text not null,
  source              public.defect_source not null,
  severity            public.defect_severity not null default 'unparsed',
  title               text not null,
  description         bytea,
  status              public.defect_status not null default 'open',
  wont_fix_reason     bytea,
  requirement_ref     text,
  fixing_work_item_id uuid references public.work_item (id) on delete set null,
  reported_at         timestamptz not null default now(),
  reported_by         text,
  verified_at         timestamptz,
  unique (engagement_id, ref),
  -- FR-67: wont_fix requires a stated reason. A decision, not a gap.
  constraint defect_wont_fix_needs_reason
    check (status <> 'wont_fix' or wont_fix_reason is not null)
);

comment on column public.defect.title is
  'CR-001 §4 stated exception: deliberately NOT encrypted, because it is the display key '
  'on the Broken screen and endpoint. The operator guide carries the rule that makes this '
  'safe — the title is a short label; reproduction detail, data samples and client '
  'specifics belong in the encrypted description.';

comment on column public.defect.wont_fix_reason is
  'pgp_sym ciphertext. Source: security baseline, not spec 7a — same reasoning as '
  'contract_milestone.notes. Queued for Erik to confirm.';

-- ---------------------------------------------------------------------------
-- 20. release — class `internal` (CR-001)
-- ---------------------------------------------------------------------------

create table public.release (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagement (id) on delete cascade,
  identifier    text not null,
  environment   text not null,
  url           text,
  deployed_at   timestamptz,
  source        public.release_source not null,
  recorded_by   text,
  unique (engagement_id, identifier, environment),
  constraint release_url_https check (url is null or url ~ '^https://')
);

-- ---------------------------------------------------------------------------
-- 21. release_requirement — class `internal` (CR-001)
-- ---------------------------------------------------------------------------

create table public.release_requirement (
  id              uuid primary key default gen_random_uuid(),
  release_id      uuid not null references public.release (id) on delete cascade,
  requirement_ref text not null,
  unique (release_id, requirement_ref)
);

-- ---------------------------------------------------------------------------
-- Indexes on foreign keys and the columns the six answers filter on.
-- Encrypted columns are absent from every index by necessity: ciphertext cannot
-- be indexed, sorted, LIKE-matched or joined on.
-- ---------------------------------------------------------------------------

create index contract_milestone_engagement_idx  on public.contract_milestone (engagement_id);
create index contract_milestone_due_date_idx    on public.contract_milestone (due_date);
create index acceptance_criterion_milestone_idx on public.acceptance_criterion (milestone_id);
create index acceptance_criterion_ref_idx       on public.acceptance_criterion (requirement_ref);
create index requirement_engagement_idx         on public.requirement (engagement_id);
create index fleet_run_engagement_idx           on public.fleet_run (engagement_id);
create index blocker_engagement_idx             on public.blocker (engagement_id);
create index blocker_open_idx                   on public.blocker (engagement_id) where resolved_at is null;
create index external_wait_engagement_idx       on public.external_wait (engagement_id);
create index external_wait_open_idx             on public.external_wait (expected_by) where resolved_at is null;
create index work_item_engagement_idx           on public.work_item (engagement_id);
create index work_item_fleet_run_idx            on public.work_item (fleet_run_id);
create index work_item_status_idx               on public.work_item (status);
create index work_item_unparsed_idx             on public.work_item (engagement_id) where status = 'unparsed';
create index work_item_executor_kind_idx        on public.work_item (executor_kind);
create index work_item_stack_idx                on public.work_item (stack_id);
create index work_item_blocker_idx              on public.work_item (blocker_id);
create index work_item_external_wait_idx        on public.work_item (external_wait_id);
create index work_item_dependency_item_idx      on public.work_item_dependency (work_item_id);
create index work_item_dependency_dep_idx       on public.work_item_dependency (depends_on_id);
create index work_item_requirement_item_idx     on public.work_item_requirement (work_item_id);
create index work_item_requirement_ref_idx      on public.work_item_requirement (requirement_ref);
create index work_session_engagement_idx        on public.work_session (engagement_id);
create index work_session_work_item_idx         on public.work_session (work_item_id);
create index work_session_stack_idx             on public.work_session (stack_id);
create index test_case_engagement_idx           on public.test_case (engagement_id);
create index test_case_covers_idx               on public.test_case using gin (covers);
create index test_result_test_case_idx          on public.test_result (test_case_id, run_at desc);
create index open_question_engagement_idx       on public.open_question (engagement_id, run, unit);
create index open_question_open_idx             on public.open_question (engagement_id) where status = 'open';
create index audit_log_created_at_idx           on public.audit_log (created_at desc);
create index audit_log_target_idx               on public.audit_log (target_table, target_id);
create index defect_engagement_idx              on public.defect (engagement_id);
create index defect_open_idx                    on public.defect (engagement_id, severity) where status = 'open';
create index defect_requirement_ref_idx         on public.defect (requirement_ref);
create index defect_fixing_work_item_idx        on public.defect (fixing_work_item_id);
create index release_engagement_idx             on public.release (engagement_id);
create index release_requirement_release_idx    on public.release_requirement (release_id);
create index release_requirement_ref_idx        on public.release_requirement (requirement_ref);
