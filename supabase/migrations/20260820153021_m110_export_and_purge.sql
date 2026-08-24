-- Delivery Ledger — M1.10. FR-60 export, FR-61 archive and hard deletion.
--
-- Three things happen here and the first one is the load-bearing one.
--
-- 1. `test_result.test_case_id` stops being an enforced foreign key. CR-002 §2.4
--    requires exactly this and the reason is in §1 of that CR: `test_result`
--    carries a `before update or delete` trigger refusing every role, and
--    `engagement → test_case → test_result` was a cascade chain, so
--    `delete from public.engagement` raised `restrict_violation` and FR-61 was
--    unbuildable. Dropping the constraint leaves the column as a RECORDED
--    IDENTIFIER that may point at a row which no longer exists — "the intended
--    state, not a defect" (CR-002 §2.4). `tests/purge-boundary.test.ts` asserts
--    the whole cascade graph so a later migration cannot quietly restore it.
--
-- 2. `app.export_document()` — FR-60's single function returning one document.
--
-- 3. `app.purge_engagement()` — FR-61's hard deletion, audited in the same
--    transaction as the delete it records.

-- ---------------------------------------------------------------------------
-- 1. The append-only boundary (CR-002 §2.4)
-- ---------------------------------------------------------------------------

alter table public.test_result
  drop constraint test_result_test_case_id_fkey;

comment on column public.test_result.test_case_id is
  'CR-002 §2.4. An identifier, NOT an enforced reference. This table is '
  'append-only and outlives the engagement whose test cases it records, so after '
  'FR-61 hard deletion this column names a `test_case` row that no longer '
  'exists. A reader must treat an unresolvable value here as expected. The '
  'foreign key was dropped rather than made `on delete set null` because SET '
  'NULL is an UPDATE, which the append-only trigger refuses just as flatly as a '
  'DELETE.';

-- ---------------------------------------------------------------------------
-- 2. FR-60 — the export, as ONE function returning ONE document
-- ---------------------------------------------------------------------------
--
-- §7a's stated reason for a single function is that "a table-by-table export
-- ships silently incomplete the day any table crosses the API's row cap, and
-- `audit_log` gets there first". PostgREST answers an unbounded read with 200
-- rows by default and caps at 1000, with `error === null` either way, so a
-- truncated export is indistinguishable from a complete one at the call site.
-- Reading inside the database removes the cap from the path entirely.
--
-- **Three decisions are recorded here rather than left to be discovered.**
--
-- (a) SECURITY INVOKER, unlike this schema's other `app.*` helpers. Those are
--     DEFINER because they wrap crypto the caller must not hold directly. This
--     one reads every table in the product, and definer rights would mean that
--     a grant widened by mistake — one `grant execute … to authenticated` — is a
--     full-database read for any signed-in session, RLS and all. As an invoker
--     function it can never return more than the caller could already select.
--     `service_role` calls it and already holds BYPASSRLS, so nothing is lost.
--
-- (b) The encrypted columns come out DECRYPTED. An export exists so that this
--     system is not a single point of failure (§8, "Deletion and export"), and
--     every scenario in which the export is the thing you reach for is a
--     scenario in which the Vault key went with the project. Ciphertext in that
--     file is the same number of bytes and none of the record. The document
--     says `"encryption": "decrypted"` in its own header so that whoever holds
--     the file knows what they are holding: it is client prose and contract
--     amounts in the clear, and it should be treated the way §7a treats the
--     database it came out of.
--
-- (c) `agent_token.token_hash` is withheld, and the document says so. §7a:
--     `agent_token` is "never returned by any read endpoint". A bcrypt hash in
--     a file on a laptop is an offline cracking target and nothing about an
--     export needs one — the plaintext was shown once at creation and stored
--     nowhere. Omitting it silently would be the worse half of this; the
--     `omitted` array is what keeps the export honest about being complete.

create or replace function app.export_document()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with tables as (
    select jsonb_build_object(
      'operator', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.operator r
      ),
      'agent_token', (
        select coalesce(jsonb_agg((to_jsonb(r) - 'token_hash') order by r.id), '[]'::jsonb)
        from public.agent_token r
      ),
      'engagement', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.engagement r
      ),
      'contract_milestone', (
        select coalesce(jsonb_agg(
          (to_jsonb(r) - 'amount' - 'notes') || jsonb_build_object(
            'amount', app.decrypt_field(r.amount),
            'notes',  app.decrypt_field(r.notes)
          ) order by r.id), '[]'::jsonb)
        from public.contract_milestone r
      ),
      'acceptance_criterion', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.acceptance_criterion r
      ),
      'requirement', (
        select coalesce(jsonb_agg(
          (to_jsonb(r) - 'text') || jsonb_build_object(
            'text', app.decrypt_field(r.text)
          ) order by r.id), '[]'::jsonb)
        from public.requirement r
      ),
      'fleet_run', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.fleet_run r
      ),
      'stack', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.stack r
      ),
      'blocker', (
        select coalesce(jsonb_agg(
          (to_jsonb(r) - 'description') || jsonb_build_object(
            'description', app.decrypt_field(r.description)
          ) order by r.id), '[]'::jsonb)
        from public.blocker r
      ),
      'external_wait', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.external_wait r
      ),
      'work_item', (
        select coalesce(jsonb_agg(
          (to_jsonb(r) - 'description' - 'raw_status') || jsonb_build_object(
            'description', app.decrypt_field(r.description),
            'raw_status',  app.decrypt_field(r.raw_status)
          ) order by r.id), '[]'::jsonb)
        from public.work_item r
      ),
      'work_item_dependency', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.work_item_dependency r
      ),
      'work_item_requirement', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.work_item_requirement r
      ),
      'work_session', (
        select coalesce(jsonb_agg(
          (to_jsonb(r) - 'summary') || jsonb_build_object(
            'summary', app.decrypt_field(r.summary)
          ) order by r.id), '[]'::jsonb)
        from public.work_session r
      ),
      'test_case', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.test_case r
      ),
      'test_result', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.test_result r
      ),
      'open_question', (
        select coalesce(jsonb_agg(
          (to_jsonb(r) - 'question' - 'best_guess' - 'answer') || jsonb_build_object(
            'question',   app.decrypt_field(r.question),
            'best_guess', app.decrypt_field(r.best_guess),
            'answer',     app.decrypt_field(r.answer)
          ) order by r.id), '[]'::jsonb)
        from public.open_question r
      ),
      'audit_log', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.audit_log r
      ),
      'defect', (
        select coalesce(jsonb_agg(
          (to_jsonb(r) - 'description' - 'wont_fix_reason') || jsonb_build_object(
            'description',     app.decrypt_field(r.description),
            'wont_fix_reason', app.decrypt_field(r.wont_fix_reason)
          ) order by r.id), '[]'::jsonb)
        from public.defect r
      ),
      'release', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.release r
      ),
      'release_requirement', (
        select coalesce(jsonb_agg(to_jsonb(r) order by r.id), '[]'::jsonb)
        from public.release_requirement r
      )
    ) as doc
  )
  select jsonb_build_object(
    'format', 'delivery-ledger-export',
    'version', 1,
    'exported_at', now(),
    'encryption', 'decrypted',
    'omitted', jsonb_build_array(
      jsonb_build_object(
        'column', 'agent_token.token_hash',
        'reason', 'Spec 7a: agent_token is never returned by any read endpoint. '
                  'The hash is one-way and reads back as nothing useful, so it '
                  'costs the export nothing and would be an offline cracking '
                  'target in a file. Every other column of the table is here.'
      ),
      jsonb_build_object(
        'column', 'app.rate_limit_counters',
        'reason', 'Ephemeral throttling state - a token id, a window and a count '
                  '- meaningless an hour after it is written and describing no '
                  'client and no delivery. It is also the unclassified 22nd '
                  'table behind blocker B24, which this omission does not settle.'
      )
    ),
    'tables', doc,
    -- Derived from the document rather than counted a second time, so the count
    -- and the rows cannot disagree. This is what makes a truncated file
    -- detectable by whoever finds it.
    'counts', (select jsonb_object_agg(key, jsonb_array_length(value)) from jsonb_each(doc))
  )
  from tables;
$$;

comment on function app.export_document() is
  'FR-60. Every record in one document, read in one function so no row cap can '
  'silently truncate it. Encrypted columns come out decrypted and the document '
  'says so; agent_token.token_hash is withheld and the document says that too.';

-- ---------------------------------------------------------------------------
-- 3. FR-61 — hard deletion, as CR-002 §2 defines it
-- ---------------------------------------------------------------------------
--
-- One `delete`, against `public.engagement`. Everything else goes by cascade.
-- That is deliberate and it is the difference between a deletion path that
-- tracks the schema and one that drifts from it: a purge naming its own fifteen
-- tables is correct until the sixteenth is added, and then it is quietly partial.
-- `tests/purge-boundary.test.ts` asserts the cascade graph instead, which is the
-- thing that actually decides what a delete destroys.
--
-- **What it does not reach, and never will** (CR-002 §2.2): `audit_log` and
-- `test_result`. Their rows outlive the engagement they refer to, and the
-- identifiers they hold stop resolving. That is the intended state, not a defect
-- — an orphaned audit row is evidence and a deleted one is a gap.
--
-- **Archived first.** FR-61 says hard deletion is "never the default", and a
-- confirmation dialog is application-layer — the same class of control this
-- project already had to strengthen once when MFA was found living in the app
-- layer alone. So the database refuses to purge an engagement that has not been
-- archived. Archiving is reversible and costs one click, which makes destruction
-- two deliberate acts instead of one. **This is a build decision extending
-- FR-61, not a requirement the spec states**; it is recorded in prod.md's
-- Decisions log for Erik to overrule.
--
-- **What the audit records, stated honestly.** One row for the engagement and
-- one per table the purge destroyed rows in, so the blast radius survives the
-- rows. The COUNTS are returned to the caller and are NOT written to the audit
-- log: `audit_log` has no column for them, FR-59 restricts that table to actor,
-- action, target and timestamp, and CR-002 §3 fixed the column set. So the log
-- answers "which tables were emptied", not "how many rows".

create or replace function app.purge_engagement(p_slug text, p_actor text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_id       uuid;
  v_archived timestamptz;
  v_counts   jsonb;
  v_table    text;
  v_rows     bigint;
begin
  select id, archived_at into v_id, v_archived
  from public.engagement
  where slug = p_slug;

  if v_id is null then
    return jsonb_build_object('purged', false, 'refusal', 'no_such_engagement', 'slug', p_slug);
  end if;

  if v_archived is null then
    return jsonb_build_object(
      'purged', false,
      'refusal', 'not_archived',
      'slug', p_slug,
      'engagement_id', v_id
    );
  end if;

  -- Counted before the delete, because afterwards there is nothing left to
  -- count and "what was destroyed" is the one fact a deletion cannot recover.
  v_counts := jsonb_build_object(
    'engagement', 1,
    'contract_milestone', (
      select count(*) from public.contract_milestone where engagement_id = v_id),
    'acceptance_criterion', (
      select count(*) from public.acceptance_criterion a
      join public.contract_milestone m on m.id = a.milestone_id
      where m.engagement_id = v_id),
    'requirement', (
      select count(*) from public.requirement where engagement_id = v_id),
    'fleet_run', (
      select count(*) from public.fleet_run where engagement_id = v_id),
    'blocker', (
      select count(*) from public.blocker where engagement_id = v_id),
    'external_wait', (
      select count(*) from public.external_wait where engagement_id = v_id),
    'work_item', (
      select count(*) from public.work_item where engagement_id = v_id),
    'work_item_dependency', (
      select count(*) from public.work_item_dependency d
      join public.work_item w on w.id = d.work_item_id
      where w.engagement_id = v_id),
    'work_item_requirement', (
      select count(*) from public.work_item_requirement r
      join public.work_item w on w.id = r.work_item_id
      where w.engagement_id = v_id),
    'work_session', (
      select count(*) from public.work_session where engagement_id = v_id),
    'test_case', (
      select count(*) from public.test_case where engagement_id = v_id),
    'open_question', (
      select count(*) from public.open_question where engagement_id = v_id),
    'defect', (
      select count(*) from public.defect where engagement_id = v_id),
    'release', (
      select count(*) from public.release where engagement_id = v_id),
    'release_requirement', (
      select count(*) from public.release_requirement rr
      join public.release rel on rel.id = rr.release_id
      where rel.engagement_id = v_id)
  );

  delete from public.engagement where id = v_id;

  insert into public.audit_log (actor, actor_type, action, target_table, target_id)
  values (p_actor, 'operator', 'engagement.purge', 'engagement', v_id::text);

  for v_table, v_rows in
    select key, (value #>> '{}')::bigint from jsonb_each(v_counts)
  loop
    if v_table <> 'engagement' and v_rows > 0 then
      insert into public.audit_log (actor, actor_type, action, target_table, target_id)
      values (p_actor, 'operator', 'engagement.purge.cascade', v_table, v_id::text);
    end if;
  end loop;

  return jsonb_build_object(
    'purged', true,
    'slug', p_slug,
    'engagement_id', v_id,
    'counts', v_counts,
    -- Named in the result so the operator reads CR-002 §2.2 at the moment it
    -- applies to them, rather than finding out from a dangling identifier later.
    'retained', jsonb_build_array('audit_log', 'test_result')
  );
end;
$$;

comment on function app.purge_engagement(text, text) is
  'FR-61 as CR-002 §2 defines it. One delete against public.engagement; the rest '
  'by cascade. Refuses an engagement that is not archived. Never reaches '
  'audit_log or test_result, whose rows outlive the engagement and whose '
  'identifiers stop resolving - the intended state, per CR-002 §2.4.';

-- ---------------------------------------------------------------------------
-- 4. The exposed surface
-- ---------------------------------------------------------------------------
-- `app` is not exposed by PostgREST, so these two thin wrappers in `public` are
-- the only door, and each is granted to `service_role` alone.
--
-- Both are SECURITY INVOKER, unlike the crypto wrappers in
-- `…_rate_limit_and_rpcs.sql`. Those are DEFINER because their whole job is to
-- lend a privilege the caller must not hold. These two lend nothing: they read
-- and destroy the caller's own tables, and definer rights would only mean that
-- a grant widened by mistake becomes a full-database read or a delete path for
-- whoever received it.

create or replace function public.export_everything()
returns jsonb
language sql stable security invoker set search_path = ''
as $$ select app.export_document() $$;

create or replace function public.purge_engagement(p_slug text, p_actor text)
returns jsonb
language sql volatile security invoker set search_path = ''
as $$ select app.purge_engagement(p_slug, p_actor) $$;

-- Per-name REVOKE on every one. ALTER DEFAULT PRIVILEGES does not do this:
-- PUBLIC's EXECUTE on a new function is a property of CREATE FUNCTION itself.
-- And every REVOKE ... FROM public needs its matching GRANT ... TO service_role,
-- because the revoke removes the EXECUTE service_role inherited THROUGH PUBLIC —
-- that is defect C1 of run b0952e, and it killed Mode-1 ingest completely.

revoke execute on function app.export_document()                    from public, anon, authenticated;
revoke execute on function app.purge_engagement(text, text)         from public, anon, authenticated;
revoke execute on function public.export_everything()               from public, anon, authenticated;
revoke execute on function public.purge_engagement(text, text)      from public, anon, authenticated;

grant execute on function app.export_document()                     to service_role;
grant execute on function app.purge_engagement(text, text)          to service_role;
grant execute on function public.export_everything()                to service_role;
grant execute on function public.purge_engagement(text, text)       to service_role;
