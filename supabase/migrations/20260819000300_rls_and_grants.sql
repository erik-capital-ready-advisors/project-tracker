-- Delivery Ledger — M1.1 row-level security, policies, and table grants.
--
-- READ THIS BEFORE VERIFYING ANYTHING IN HERE.
--
-- `pg_class.relrowsecurity = true` is NOT evidence that this migration did
-- anything. This project carries a Supabase event trigger, `ensure_rls`, calling
-- `public.rls_auto_enable()` — a SECURITY DEFINER function this build did not
-- write — which enables RLS on every table created in `public`. All 21 tables
-- came out of the previous migration with the flag already set and with no
-- policy and no grant behind it: RLS on, zero policies, which denies everything
-- and looks identical to a correct configuration from the flag alone.
--
-- So every check on this file asserts the POLICY (pg_policies: its command, its
-- role, its qual/with_check) and the GRANT (aclexplode over pg_class.relacl),
-- never the flag.
--
-- The privilege model, stated once:
--
--   anon           — nothing. No policy, no grant, on any table. Spec 7a: "there
--                    is no public surface". Revoking the grant as well as writing
--                    no policy is deliberate: with a grant present and RLS
--                    filtering, an unauthorised read returns `200 []`, which is
--                    indistinguishable from a wide-open table that happens to be
--                    empty. With no grant it returns 401/42501, which is
--                    diagnostic. On an empty database that difference is the
--                    entire test.
--
--   authenticated  — SELECT only, gated on app.is_operator(), which requires
--                    both aal2 (FR-2) and a deliberately granted role (FR-3).
--                    Plus INSERT on the two append-only tables. No UPDATE and no
--                    DELETE anywhere: every mutation in this product is a server
--                    action or an ingest route, not a browser write.
--
--   service_role   — retains the Supabase defaults and holds BYPASSRLS, so RLS
--                    is not a boundary against it. What bounds it is the
--                    append-only TRIGGERS (which fire for every role) and the
--                    handler-layer capability checks that work-unit i4 owns.

-- ---------------------------------------------------------------------------
-- The chokepoint
-- ---------------------------------------------------------------------------
-- Every policy in this file routes through app.is_operator(). One predicate,
-- one place to get MFA right, and one place to read when auditing. The
-- alternative — conjoining `aal2` into ~25 hand-edited policies — is how one of
-- them ends up without it.
--
-- SECURITY DEFINER is load-bearing twice over: it lets the function read
-- public.operator without recursing into public.operator's own SELECT policy,
-- and it means the caller needs no privileges on the operator table.

create or replace function app.is_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.assurance_satisfied()
     and exists (
           select 1
             from public.operator o
            where o.id = (select auth.uid())
              and o.role is not null
         )
$$;

comment on function app.is_operator() is
  'FR-2 + FR-3 chokepoint. True only for a signed-in account that (a) reached aal2 '
  'and (b) has been granted a role deliberately. Both halves fail closed: a token '
  'with no aal claim reads as not-aal2, and a brand-new account has role NULL.';

revoke execute on function app.is_operator() from public, anon, authenticated;
-- `authenticated` needs EXECUTE because RLS policy expressions are evaluated with
-- the QUERYING role's privileges. Without it every policy below errors instead of
-- denying. It discloses one boolean about the caller's own session.
grant execute on function app.is_operator() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Belt and braces: RLS is already on via the event trigger, but this migration
-- states it itself so the intent survives if the platform trigger ever changes.
-- ---------------------------------------------------------------------------

alter table public.operator              enable row level security;
alter table public.agent_token           enable row level security;
alter table public.engagement            enable row level security;
alter table public.contract_milestone    enable row level security;
alter table public.acceptance_criterion  enable row level security;
alter table public.requirement           enable row level security;
alter table public.fleet_run             enable row level security;
alter table public.stack                 enable row level security;
alter table public.blocker               enable row level security;
alter table public.external_wait         enable row level security;
alter table public.work_item             enable row level security;
alter table public.work_item_dependency  enable row level security;
alter table public.work_item_requirement enable row level security;
alter table public.work_session          enable row level security;
alter table public.test_case             enable row level security;
alter table public.test_result           enable row level security;
alter table public.open_question         enable row level security;
alter table public.audit_log             enable row level security;
alter table public.defect                enable row level security;
alter table public.release               enable row level security;
alter table public.release_requirement   enable row level security;

-- ---------------------------------------------------------------------------
-- anon: revoke everything, on every table, explicitly.
-- ---------------------------------------------------------------------------
-- The default privileges were closed in migration 000100 before these tables
-- existed, so this is currently a no-op — and it stays here anyway, because a
-- no-op revoke costs nothing and a missing one is a public database.

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from authenticated;

-- ---------------------------------------------------------------------------
-- SELECT policies + grants, one per table
-- ---------------------------------------------------------------------------

-- 1. operator (7a: operator only) — and only their own row.
create policy operator_select on public.operator
  for select to authenticated
  using (app.is_operator() and id = (select auth.uid()));
grant select on public.operator to authenticated;

-- 2. agent_token (7a: operator only; never returned by any read endpoint).
-- The operator can list their tokens — label, capabilities, expiry, revocation —
-- because FR-7 puts rotation and revocation in the interface. The hash is
-- withheld at the COLUMN level rather than by convention: `token_hash` is simply
-- absent from the grant, so `select *` fails rather than leaking it.
create policy agent_token_select on public.agent_token
  for select to authenticated
  using (app.is_operator());
grant select (id, label, capabilities, expires_at, last_used_at, revoked_at, created_at)
  on public.agent_token to authenticated;

-- 3. engagement (7a: operator; agent tokens may read name and slug).
create policy engagement_select on public.engagement
  for select to authenticated
  using (app.is_operator());
grant select on public.engagement to authenticated;

-- 4. contract_milestone (7a: operator only; AGENT TOKENS REFUSED ENTIRELY).
-- The agent-token refusal is NOT expressible here — see the table comment.
create policy contract_milestone_select on public.contract_milestone
  for select to authenticated
  using (app.is_operator());
grant select on public.contract_milestone to authenticated;

-- 5–21: operator and agents.
create policy acceptance_criterion_select on public.acceptance_criterion
  for select to authenticated using (app.is_operator());
grant select on public.acceptance_criterion to authenticated;

create policy requirement_select on public.requirement
  for select to authenticated using (app.is_operator());
grant select on public.requirement to authenticated;

create policy fleet_run_select on public.fleet_run
  for select to authenticated using (app.is_operator());
grant select on public.fleet_run to authenticated;

create policy stack_select on public.stack
  for select to authenticated using (app.is_operator());
grant select on public.stack to authenticated;

create policy blocker_select on public.blocker
  for select to authenticated using (app.is_operator());
grant select on public.blocker to authenticated;

create policy external_wait_select on public.external_wait
  for select to authenticated using (app.is_operator());
grant select on public.external_wait to authenticated;

create policy work_item_select on public.work_item
  for select to authenticated using (app.is_operator());
grant select on public.work_item to authenticated;

create policy work_item_dependency_select on public.work_item_dependency
  for select to authenticated using (app.is_operator());
grant select on public.work_item_dependency to authenticated;

create policy work_item_requirement_select on public.work_item_requirement
  for select to authenticated using (app.is_operator());
grant select on public.work_item_requirement to authenticated;

create policy work_session_select on public.work_session
  for select to authenticated using (app.is_operator());
grant select on public.work_session to authenticated;

create policy test_case_select on public.test_case
  for select to authenticated using (app.is_operator());
grant select on public.test_case to authenticated;

create policy open_question_select on public.open_question
  for select to authenticated using (app.is_operator());
grant select on public.open_question to authenticated;

create policy defect_select on public.defect
  for select to authenticated using (app.is_operator());
grant select on public.defect to authenticated;

create policy release_select on public.release
  for select to authenticated using (app.is_operator());
grant select on public.release to authenticated;

create policy release_requirement_select on public.release_requirement
  for select to authenticated using (app.is_operator());
grant select on public.release_requirement to authenticated;

-- ---------------------------------------------------------------------------
-- The two append-only tables: INSERT permitted, UPDATE and DELETE denied.
-- ---------------------------------------------------------------------------
-- Denied three ways, because each layer covers a role the others do not:
--   * no UPDATE/DELETE policy       — closes `authenticated`
--   * REVOKE from service_role      — closes the server's own credential
--   * BEFORE UPDATE/DELETE/TRUNCATE trigger — closes every role including the
--     table owner, and is the only one of the three that TRUNCATE respects,
--     since row-level security does not govern TRUNCATE at all.

create policy audit_log_select on public.audit_log
  for select to authenticated using (app.is_operator());
create policy audit_log_insert on public.audit_log
  for insert to authenticated with check (app.is_operator());
grant select, insert on public.audit_log to authenticated;
revoke update, delete, truncate on public.audit_log from service_role;

create policy test_result_select on public.test_result
  for select to authenticated using (app.is_operator());
create policy test_result_insert on public.test_result
  for insert to authenticated with check (app.is_operator());
grant select, insert on public.test_result to authenticated;
revoke update, delete, truncate on public.test_result from service_role;

comment on trigger audit_log_append_only on public.audit_log is
  'FR-59. Note for whoever builds FR-61 hard deletion: this guard has no escape '
  'hatch, deliberately. Spec 7a says audit_log and test_result are append-only and '
  'retained indefinitely, so a hard delete that cascades into either will fail here '
  'rather than quietly succeed. That tension between FR-61 and 7a is queued for Erik, '
  'not resolved in this migration.';
