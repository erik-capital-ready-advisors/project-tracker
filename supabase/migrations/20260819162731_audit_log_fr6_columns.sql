-- Delivery Ledger — M1.2 Access (work-unit i4)
-- FR-6: "Every token use is written to the audit log with the capability, the
-- endpoint and the outcome."
--
-- i1 built `public.audit_log` with actor / actor_type / action / target_table /
-- target_id / created_at, which satisfies FR-59's list exactly. FR-6 names three
-- further facts, and this migration gives each one a column rather than letting
-- the handler concatenate all three into `action`.
--
-- Why columns rather than a formatted string: the operator's audit view has to
-- answer "what has this token done today" and "what was refused this week".
-- Against a single free-text `action` those are `like` scans over a table whose
-- stated retention is *indefinite* and which §7a says gets there first among all
-- tables in row count. Against three columns they are ordinary predicates.
--
-- All four columns are NULLABLE, deliberately. An operator action
-- (`token.issue`, `token.revoke`) has no capability and no endpoint; an
-- append-only row written by a database trigger has neither. A NOT NULL here
-- would force a placeholder value, and a placeholder in an audit log is a lie
-- with a schema constraint behind it.
--
-- This is additive DDL. It does not fire the row-level append-only triggers
-- (`audit_log_append_only`, `audit_log_no_truncate`) — those are BEFORE
-- UPDATE/DELETE/TRUNCATE on rows, and ADD COLUMN is none of those. The existing
-- table-level `grant select, insert on public.audit_log to authenticated`
-- extends to new columns automatically, so no grant is added or changed here and
-- `anon` gains nothing.

alter table public.audit_log
  add column if not exists capability text,
  add column if not exists endpoint   text,
  add column if not exists outcome    text,
  add column if not exists status     integer;

-- ---------------------------------------------------------------------------
-- Closed value sets, enforced rather than documented
-- ---------------------------------------------------------------------------
-- `capability` is text carrying the WIRE spelling (`answer:read`), not the
-- `public.agent_capability` enum (`answer_read`). The audit log is the surface a
-- human reads, and FR-5 spells the capabilities with a colon; storing the enum
-- would mean every audit screen and export re-spells them on the way out. The
-- check constraint is what keeps that from becoming a free-text column where a
-- typo can hide.

alter table public.audit_log
  add constraint audit_log_capability_valid
  check (capability is null or capability in ('answer:read', 'ingest:write'));

alter table public.audit_log
  add constraint audit_log_outcome_valid
  check (outcome is null or outcome in ('allowed', 'refused', 'error'));

-- A sane HTTP status or nothing. Catches a caller passing a row count or a
-- boolean into this column, which is otherwise silent.
alter table public.audit_log
  add constraint audit_log_status_valid
  check (status is null or (status >= 100 and status <= 599));

-- ---------------------------------------------------------------------------
-- FR-59's hard rule, restated where it will be read
-- ---------------------------------------------------------------------------

comment on column public.audit_log.capability is
  'FR-6. The capability the bearer token exercised, in its wire spelling '
  '(`answer:read` / `ingest:write`). NULL for operator and system actions.';

comment on column public.audit_log.endpoint is
  'FR-6. Method and PATHNAME only — never the query string. Dropping the query '
  'string is a control, not an omission: `?client=<a client name>` or a search '
  'parameter carrying prose would put record contents into a table §7a '
  'classifies `internal` precisely because it holds none. See '
  '`endpointOf()` in src/lib/api/audit.ts, which is the only thing that builds '
  'this value.';

comment on column public.audit_log.outcome is
  'FR-6. allowed | refused | error. Derived from the HTTP status actually '
  'returned, so a refusal cannot be recorded as an allow by a caller that '
  'forgot to set it.';

comment on column public.audit_log.status is
  'The HTTP status actually returned, so the shape of a refusal is recoverable '
  'without re-deriving it from prose.';

-- ---------------------------------------------------------------------------
-- One index, for the query the token screen actually runs
-- ---------------------------------------------------------------------------
-- "What has this token done, most recent first." The existing
-- audit_log_created_at_idx serves the global feed; this serves the per-actor
-- view without a full scan once the table is large, which §7a says it will be.

create index if not exists audit_log_actor_created_at_idx
  on public.audit_log (actor, created_at desc);
