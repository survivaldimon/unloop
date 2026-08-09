-- Session S1 of the 07.08.2026 audit (docs/audit-2026-08-07.md §2.1): the rate
-- limiter behind the critical-three fixes.
--
-- Numbered 150000, not 160000: three sibling sessions (S2, S3, G2) all reached
-- for the 160000 slot. S1 is the Э9 blocker and goes in first, so it sits one
-- slot ahead of all of them. Nothing here collides with theirs — S2 owns
-- looplore_client_ip and the webhook dedup, S3 the read-side RPCs, G2 the
-- referral ledger kinds.
--
-- Why a generic limiter rather than a third bespoke table: looplore_auth_attempts
-- and looplore_test_attempts each exist because their guard functions predate
-- each other and nobody wanted one shared failure mode across account creation.
-- The new call sites (photo analysis, result emails) have no such history, and
-- three more single-purpose tables would be worse than one scoped table whose
-- rows are indistinguishable except by a scope string.
--
-- Posture: callers never hand this function a blank key — _shared/caller.ts
-- turns an unreadable address into a shared "unknown" bucket, so an attacker
-- who strips X-Forwarded-For lands in one crowded bucket rather than being
-- waved through. The blank-key branch below is therefore a dead defensive
-- path, kept so a future caller that forgets cannot fail open silently on the
-- SQL side too. photoread-analyze layers a second, key-independent daily
-- ceiling on top regardless.

-- ---------------------------------------------------------------------------
-- 1. Attempt log
-- ---------------------------------------------------------------------------

create table if not exists public.looplore_rate_attempts (
  id bigint generated always as identity primary key,
  scope text not null,
  key text not null,
  created_at timestamptz not null default now()
);

-- The limiter's only read pattern: rows of one (scope, key) inside a window.
create index if not exists looplore_rate_attempts_scope_key_idx
  on public.looplore_rate_attempts (scope, key, created_at desc);
-- Lets a manual sweep of the whole table stay cheap.
create index if not exists looplore_rate_attempts_time_idx
  on public.looplore_rate_attempts (created_at);

alter table public.looplore_rate_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- 2. The limiter
-- ---------------------------------------------------------------------------

/**
 * Returns true when this (scope, key) may act again, recording the attempt.
 * A blank key is allowed through: better to serve a visitor behind a stripped
 * header than to block them — callers pair this with a global-scope check that
 * has no such escape hatch.
 *
 * Pruning happens twice, because per-key pruning alone is not enough: it only
 * ever touches keys that come back, and an IP that visits once and never
 * returns would leave its rows behind forever. So each call also sweeps a
 * bounded slice of everything older than the widest window any caller uses.
 * Bounded on purpose — a full DELETE on a hot path is how a rate limiter
 * becomes the outage.
 */
create or replace function public.looplore_rate_limit(
  p_scope text,
  p_key text,
  p_limit integer,
  p_window interval
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_scope is null or btrim(p_scope) = '' or p_limit is null or p_limit <= 0 then
    return false;
  end if;
  if p_key is null or btrim(p_key) = '' then
    return true;
  end if;

  delete from looplore_rate_attempts
   where scope = p_scope and key = p_key and created_at < now() - p_window;

  -- Garbage collection for keys that never come back. 48h is comfortably past
  -- the widest window in use (24h); the LIMIT keeps the cost per call flat and
  -- the time index keeps it off a sequential scan.
  delete from looplore_rate_attempts
   where id in (
     select id from looplore_rate_attempts
      where created_at < now() - interval '48 hours'
      limit 200
   );

  select count(*) into v_count
    from looplore_rate_attempts
   where scope = p_scope and key = p_key and created_at >= now() - p_window;

  if v_count >= p_limit then
    return false;
  end if;

  insert into looplore_rate_attempts (scope, key) values (p_scope, p_key);
  return true;
end;
$$;

-- Edge functions call this with the service role; no client ever should.
revoke all on function public.looplore_rate_limit(text, text, integer, interval)
  from public, anon, authenticated;
grant execute on function public.looplore_rate_limit(text, text, integer, interval)
  to service_role;

-- DEPLOY ORDER: this migration must land BEFORE the edge functions that call
-- it. rateLimit() in _shared/caller.ts fails closed, so functions deployed
-- against a database without this RPC answer 429 to every photo analysis and
-- silently drop every result email. The reload makes PostgREST see the new
-- function immediately instead of on its next cache cycle.
notify pgrst, 'reload schema';
