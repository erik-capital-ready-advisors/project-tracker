-- Delivery Ledger — M1.1 rate-limit counter (FR-8) and the exposed RPC surface.
--
-- Why a Postgres-backed limiter rather than a vendor one: FR-8 requires limits
-- PER TOKEN. Vercel's WAF on the Pro plan can only count by IP or JA4 Digest;
-- keying a rate-limit rule on an arbitrary header such as `Authorization` is
-- Enterprise-only. An in-memory limiter does not survive Vercel's ephemeral
-- function instances. So this is forced, not chosen.
--
-- Fixed-window, which carries the standard boundary-burst weakness: a caller can
-- send `limit` requests in the last instant of one window and `limit` again in
-- the first instant of the next, so the true worst case is 2x the nominal rate
-- over a window boundary. Acceptable for v1 on a single-operator product;
-- a sliding window is the upgrade if it ever matters.

create table app.rate_limit_counters (
  token_id      uuid        not null,
  window_start  timestamptz not null,
  request_count int         not null default 1,
  primary key (token_id, window_start)
);

alter table app.rate_limit_counters enable row level security;

comment on table app.rate_limit_counters is
  'FR-8. RLS is ON with ZERO POLICIES, and that is deliberate rather than an '
  'oversight — the usual reading of "RLS on, no policy" is a broken table, so it is '
  'stated here. This table lives in the unexposed `app` schema, carries no grant to '
  'anon or authenticated, and is reachable only through '
  'app.check_and_increment_rate_limit(), which is SECURITY DEFINER. Nothing should '
  'ever read it directly.';

comment on column app.rate_limit_counters.token_id is
  'References public.agent_token(id) by value, deliberately WITHOUT a foreign key: '
  'the limiter must be able to count requests bearing a token id that does not '
  'resolve, which is exactly the traffic worth limiting.';

-- ---------------------------------------------------------------------------
-- The counter
-- ---------------------------------------------------------------------------

create or replace function app.check_and_increment_rate_limit(
  p_token_id       uuid,
  p_limit          int,
  p_window_seconds int
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_count  int;
begin
  if p_token_id is null then
    raise exception 'delivery_ledger: rate limit requires a token id'
      using errcode = 'invalid_parameter_value';
  end if;

  if p_limit is null or p_limit <= 0 or p_window_seconds is null or p_window_seconds <= 0 then
    raise exception
      'delivery_ledger: rate limit (%) and window seconds (%) must both be positive',
      p_limit, p_window_seconds
      using errcode = 'invalid_parameter_value',
            hint = 'A zero or null limit must not read as "unlimited". Fail closed.';
  end if;

  -- Floor the clock onto a fixed window boundary so concurrent callers agree on
  -- which bucket they are in without a read-then-write race.
  v_window := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds
  );

  insert into app.rate_limit_counters as c (token_id, window_start, request_count)
  values (p_token_id, v_window, 1)
  on conflict (token_id, window_start)
    do update set request_count = c.request_count + 1
  returning c.request_count into v_count;

  -- Single statement, so the increment and the verdict cannot drift apart under
  -- concurrency. Returns false once the count has passed the limit.
  return v_count <= p_limit;
end;
$$;

comment on function app.check_and_increment_rate_limit(uuid, int, int) is
  'FR-8. Increments and returns TRUE while the caller is within the limit, FALSE once '
  'over. Always increments, including on a refusal, so a caller cannot hold a window '
  'open by hammering it. Callers translate FALSE into HTTP 429.';

-- Rows go stale the moment their window closes. This function exists so a purge
-- is possible; it is deliberately NOT SCHEDULED — FR-62 says nothing is deleted
-- automatically and no retention timer runs until a retention period is stated
-- (Q3 is open). These are ephemeral counters rather than records, so a schedule
-- is defensible later; it is not this unit's call to make.
create or replace function app.prune_rate_limit_counters(p_older_than interval default interval '1 day')
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_deleted int;
begin
  delete from app.rate_limit_counters
   where window_start < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- The exposed RPC surface
-- ---------------------------------------------------------------------------
-- Everything above lives in `app`, which PostgREST does not expose, so none of it
-- is callable over REST. These thin wrappers in `public` are the only door, and
-- each is granted to `service_role` ALONE.
--
-- That grant is the whole control. A decrypt helper reachable by `anon` or
-- `authenticated` is a general-purpose decryption oracle: anyone holding the
-- publishable key that ships in the browser bundle could post ciphertext to
-- /rest/v1/rpc/decrypt_field and read it back, and column encryption would not
-- survive it. Verify by reading `proacl` and confirming there is no leading `=`
-- entry (PUBLIC) — not by re-reading this file.

create or replace function public.encrypt_field(plaintext text)
returns bytea
language sql volatile security definer set search_path = ''
as $$ select app.encrypt_field(plaintext) $$;

create or replace function public.decrypt_field(ciphertext bytea)
returns text
language sql stable security definer set search_path = ''
as $$ select app.decrypt_field(ciphertext) $$;

create or replace function public.hash_agent_token(p_token text)
returns text
language sql volatile security definer set search_path = ''
as $$ select app.hash_token(p_token) $$;

create or replace function public.verify_agent_token(p_token text, p_hash text)
returns boolean
language sql stable security definer set search_path = ''
as $$ select app.verify_token(p_token, p_hash) $$;

create or replace function public.check_and_increment_rate_limit(
  p_token_id uuid, p_limit int, p_window_seconds int
)
returns boolean
language sql volatile security definer set search_path = ''
as $$ select app.check_and_increment_rate_limit(p_token_id, p_limit, p_window_seconds) $$;

create or replace function public.prune_rate_limit_counters(p_older_than interval default interval '1 day')
returns int
language sql volatile security definer set search_path = ''
as $$ select app.prune_rate_limit_counters(p_older_than) $$;

-- Per-name REVOKE on every one. ALTER DEFAULT PRIVILEGES does not do this:
-- PUBLIC's EXECUTE on a new function is a property of CREATE FUNCTION itself,
-- not a role grant, so the default-privileges statement parses, succeeds, and
-- changes nothing — which is worse than useless, because it reads like a control.

revoke execute on function app.check_and_increment_rate_limit(uuid, int, int) from public, anon, authenticated;
revoke execute on function app.prune_rate_limit_counters(interval)             from public, anon, authenticated;
revoke execute on function public.encrypt_field(text)                          from public, anon, authenticated;
revoke execute on function public.decrypt_field(bytea)                         from public, anon, authenticated;
revoke execute on function public.hash_agent_token(text)                       from public, anon, authenticated;
revoke execute on function public.verify_agent_token(text, text)               from public, anon, authenticated;
revoke execute on function public.check_and_increment_rate_limit(uuid, int, int) from public, anon, authenticated;
revoke execute on function public.prune_rate_limit_counters(interval)          from public, anon, authenticated;

grant execute on function public.encrypt_field(text)                            to service_role;
grant execute on function public.decrypt_field(bytea)                           to service_role;
grant execute on function public.hash_agent_token(text)                         to service_role;
grant execute on function public.verify_agent_token(text, text)                 to service_role;
grant execute on function public.check_and_increment_rate_limit(uuid, int, int) to service_role;
grant execute on function public.prune_rate_limit_counters(interval)            to service_role;
