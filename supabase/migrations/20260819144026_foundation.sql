-- Delivery Ledger — M1.1 foundation
-- Extensions, the unexposed `app` schema, default-privilege hygiene, the Vault
-- column key, and the crypto / predicate helpers every later migration builds on.
--
-- Two facts this file is written against, both measured on THIS project rather
-- than inferred (see the specialist report for the query output):
--
--   1. The `postgres` default ACL in schema `public` grants `anon` and
--      `authenticated` `arwdDxtm` on every newly created table. The `D` is
--      TRUNCATE, which row-level security does not govern at all. So RLS alone
--      is not a barrier here; the grants have to be closed as well.
--   2. `ALTER DEFAULT PRIVILEGES ... ON FUNCTIONS` does NOT remove PUBLIC's
--      EXECUTE on a new function — that is a property of CREATE FUNCTION itself.
--      Every function below therefore carries an explicit per-name REVOKE.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------------------
-- The `app` schema
-- ---------------------------------------------------------------------------
-- Helpers live here rather than in `public` because PostgREST exposes only
-- `public` and `graphql_public`. A SECURITY DEFINER decrypt helper sitting in an
-- exposed schema with a stray grant is a general-purpose decryption oracle
-- reachable by anyone holding the publishable key that ships in the browser
-- bundle. Keeping it out of the exposed schema removes the endpoint question
-- entirely; the per-name REVOKEs below are the second layer.

create schema if not exists app;

comment on schema app is
  'Internal helpers and infrastructure. Deliberately NOT in PostgREST''s exposed '
  'schema list — nothing here is a REST endpoint. Adding `app` to the project''s '
  'exposed schemas would turn every function in it into a callable RPC; do not.';

revoke all on schema app from public;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Default privileges: close the door for every object created from here on
-- ---------------------------------------------------------------------------
-- Scoped to role `postgres` and to our two schemas. This project hosts only
-- this application (verified: zero public tables, zero migrations before this
-- one), so there is no other tenant for a privilege-tightening change to break.

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on functions from anon, authenticated;

alter default privileges for role postgres in schema app
  revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema app
  revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema app
  revoke all on functions from anon, authenticated;

-- ---------------------------------------------------------------------------
-- The column-encryption key, generated in the database and left in Vault
-- ---------------------------------------------------------------------------
-- The key is never passed in from the application, never printed, and never
-- leaves Vault. `.env.example` carries only its NAME.

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'delivery_ledger_column_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'base64'),
      'delivery_ledger_column_key',
      'Delivery Ledger pgcrypto column key (spec 7a). Generated in-database 2026-08-19; never leaves Vault.'
    );
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Crypto helpers
-- ---------------------------------------------------------------------------

-- Reads the key and RAISES if it is absent.
--
-- The natural implementation returns NULL when the Vault lookup finds nothing,
-- which makes a renamed or deleted secret read as *absent data* rather than as
-- a failure. That is silent data loss on a table whose whole point is that it
-- holds a client's contract amounts. Fail loudly instead.
create or replace function app.encryption_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
    from vault.decrypted_secrets
   where name = 'delivery_ledger_column_key';

  if v_key is null then
    raise exception
      'delivery_ledger: Vault secret "delivery_ledger_column_key" is absent or unreadable'
      using errcode = 'config_file_error',
            hint = 'Returning NULL here would make a renamed secret look like empty data. '
                   'Restore or re-create the Vault secret under exactly this name.';
  end if;

  return v_key;
end;
$$;

create or replace function app.encrypt_field(plaintext text)
returns bytea
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if plaintext is null then
    return null;
  end if;
  return extensions.pgp_sym_encrypt(plaintext, app.encryption_key());
end;
$$;

create or replace function app.decrypt_field(ciphertext bytea)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if ciphertext is null then
    return null;
  end if;
  return extensions.pgp_sym_decrypt(ciphertext, app.encryption_key());
end;
$$;

comment on function app.encrypt_field(text) is
  'pgp_sym_encrypt with the Vault key. Returns bytea — declare every encrypted column bytea. '
  'Output is non-deterministic (random session key), so ciphertext is not a stable dedupe key.';

-- ---------------------------------------------------------------------------
-- Agent-token hashing (spec 7a: hashed with crypt(), never encrypted —
-- nothing ever needs to read a token back)
-- ---------------------------------------------------------------------------

create or replace function app.hash_token(p_token text)
returns text
language sql
volatile
security definer
set search_path = ''
as $$ select extensions.crypt(p_token, extensions.gen_salt('bf', 12)) $$;

create or replace function app.verify_token(p_token text, p_hash text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select p_hash is not null and p_token is not null and p_hash = extensions.crypt(p_token, p_hash) $$;

-- ---------------------------------------------------------------------------
-- FR-78: identifier columns refuse secret-shaped values
-- ---------------------------------------------------------------------------
-- A credential pasted where an identifier belongs is a credential in the
-- database. The real values these columns hold are short lowercase slugs
-- (a Supabase project ref is 20 characters), so the length floor below cannot
-- collide with a legitimate identifier.

create or replace function app.looks_like_secret(v text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v is not null and (
       -- JWT structure: three base64url segments separated by dots
       v ~ '^[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}$'
       -- a base64 payload that starts with '{"' — i.e. a JWT header, dots or not
    or v ~ '^ey[A-Za-z0-9_-]{20,}'
       -- known credential prefixes
    or v ~* '^(sb_secret_|sbp_|sk-|sk_live_|sk_test_|rk_live_|ghp_|gho_|ghs_|github_pat_|glpat-|xox[abprs]-|AKIA|ASIA|AIza|npm_|hf_|dop_v1_|shpat_|bearer\s)'
       -- PEM private key material
    or v ~ '-----BEGIN [A-Z ]*PRIVATE KEY-----'
       -- long opaque high-entropy blob: no separators an identifier would carry
    or (length(v) >= 40 and v ~ '^[A-Za-z0-9+/=_-]+$')
  );
$$;

comment on function app.looks_like_secret(text) is
  'FR-78. True when a value looks like a key or token rather than an identifier.';

create or replace function app.reject_secret_shaped_identifiers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text;
  v_val text;
begin
  foreach v_col in array array['db_org', 'db_project_ref', 'hosting_team', 'hosting_project', 'production_url']
  loop
    execute format('select ($1).%I::text', v_col) into v_val using new;
    if app.looks_like_secret(v_val) then
      raise exception
        'delivery_ledger: engagement.% refuses a secret-shaped value (FR-78)', v_col
        using errcode = 'check_violation',
              hint = 'These columns hold identifiers, never credentials. '
                     'A credential pasted here is a credential in the database. '
                     'If the value really is an identifier, it is too long or too '
                     'key-shaped to be distinguished from one — shorten it or record it elsewhere.';
    end if;
  end loop;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Append-only enforcement (FR-59)
-- ---------------------------------------------------------------------------
-- A trigger, not a convention, and not only a policy: RLS does not apply to
-- `service_role` (it holds BYPASSRLS) and every server-side write in this app
-- goes through service_role. A policy alone would leave the audit log mutable
-- by exactly the credential that writes to it. The trigger fires for every role.

create or replace function app.deny_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception
    'delivery_ledger: % on %.% is refused — this table is append-only (FR-59)',
    tg_op, tg_table_schema, tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

-- ---------------------------------------------------------------------------
-- MFA assurance (FR-2, spec 7a: enforced in RLS, not only in the app layer)
-- ---------------------------------------------------------------------------
-- `coalesce(..., '')` so a token carrying no `aal` claim at all FAILS CLOSED.

create or replace function app.assurance_satisfied()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select coalesce(auth.jwt() ->> 'aal', '') = 'aal2' $$;

comment on function app.assurance_satisfied() is
  'FR-2. True only when the session reached aal2 (a second factor was used). '
  'No carve-out is needed for the MFA-enrolment screen itself: enrolment runs '
  'through GoTrue (/auth/v1/factors, supabase.auth.mfa.enroll()), which touches '
  'no RLS-gated table in `public`. A never-enrolled operator can therefore still '
  'enrol; they simply read nothing until they have.';

-- ---------------------------------------------------------------------------
-- Per-name REVOKEs. ALTER DEFAULT PRIVILEGES does not do this — measured.
-- ---------------------------------------------------------------------------

revoke execute on function app.encryption_key() from public, anon, authenticated;
revoke execute on function app.encrypt_field(text) from public, anon, authenticated;
revoke execute on function app.decrypt_field(bytea) from public, anon, authenticated;
revoke execute on function app.hash_token(text) from public, anon, authenticated;
revoke execute on function app.verify_token(text, text) from public, anon, authenticated;
revoke execute on function app.looks_like_secret(text) from public, anon, authenticated;
revoke execute on function app.reject_secret_shaped_identifiers() from public, anon, authenticated;
revoke execute on function app.deny_mutation() from public, anon, authenticated;
revoke execute on function app.assurance_satisfied() from public, anon, authenticated;

-- Only the roles that genuinely need each one.
grant execute on function app.encrypt_field(text) to service_role;
grant execute on function app.decrypt_field(bytea) to service_role;
grant execute on function app.hash_token(text) to service_role;
grant execute on function app.verify_token(text, text) to service_role;

-- `assurance_satisfied` is referenced from RLS policy expressions, which are
-- evaluated with the QUERYING role's privileges — so `authenticated` needs
-- EXECUTE or every policy that calls it errors instead of denying. It discloses
-- one boolean about the caller's own session.
grant execute on function app.assurance_satisfied() to authenticated, service_role;
