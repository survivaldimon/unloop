-- Throttle for the public silent-signup endpoint (docs/credits-economy.md §7).
--
-- credits-auth takes an email from anyone and creates an auth user. That table
-- is shared with the CRM, so an unthrottled endpoint lets a script bury 106 real
-- accounts under a million junk ones — and fire the CRM's new-user trigger a
-- million times on the way. The signup grant (20 credits) can't buy anything on
-- its own, so this guards the shared database, not the credit balance.
--
-- Keyed by IP: one visitor completes the funnel once, so a generous ceiling
-- still leaves scripted bulk creation nowhere to go.

create table if not exists public.looplore_auth_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists looplore_auth_attempts_ip_idx
  on public.looplore_auth_attempts (ip, created_at desc);
-- Lets a manual sweep of the whole table stay cheap.
create index if not exists looplore_auth_attempts_time_idx
  on public.looplore_auth_attempts (created_at);

alter table public.looplore_auth_attempts enable row level security;

/**
 * Returns true when this IP may create another account, recording the attempt.
 * An unknown IP is allowed through: we would rather serve a visitor behind a
 * stripped header than block them, and the ceiling still holds for everyone the
 * platform does identify.
 */
create or replace function public.credits_auth_throttle(
  p_ip text,
  p_limit integer default 10,
  p_window interval default interval '1 hour'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if p_ip is null or btrim(p_ip) = '' then
    return true;
  end if;

  -- Prune just this IP's expired rows — indexed, and bounded by the ceiling.
  delete from looplore_auth_attempts
   where ip = p_ip and created_at < now() - p_window;

  select count(*) into v_count
    from looplore_auth_attempts
   where ip = p_ip and created_at >= now() - p_window;

  if v_count >= p_limit then
    return false;
  end if;

  insert into looplore_auth_attempts (ip) values (p_ip);
  return true;
end;
$$;

revoke all on function public.credits_auth_throttle(text, integer, interval)
  from public, anon, authenticated;
grant execute on function public.credits_auth_throttle(text, integer, interval) to service_role;
