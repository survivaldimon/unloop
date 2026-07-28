-- Rename the psych-test RPCs into the looplore_ namespace and put guard rails
-- on the anon-callable ones (docs/tests-integration.md, Э5 follow-up).
--
-- Why the rename: the database is shared with the tutoring-school CRM, and the
-- convention there (see credits_foundation) is that every Looplore object
-- carries a looplore_/credits_ prefix. "test" is exactly the kind of word the
-- school side owns too, so test_session_get was a collision waiting to happen.
-- Safe to drop-and-recreate: looplore_test_sessions has 0 rows in prod and no
-- deployed frontend calls the old names.
--
-- Why the guards: these endpoints are anon-callable by design (the session
-- UUID is the capability, as in the quiz and photo funnels), which means they
-- are also script-callable. Three rails, none of which a legitimate client can
-- hit:
--   * a claimed session refuses writes from anyone but its owner ('owned');
--   * payload params are capped at 64 KB ('too_large') — real answer maps are
--     a few KB;
--   * creating NEW sessions is capped per IP (~60/hour, 'rate_limited') with
--     the same posture as credits_auth_throttle: an unknown IP is let through,
--     a broken limiter refuses rather than opening the door.

-- ---------------------------------------------------------------------------
-- 1. Drop the unprefixed generation
-- ---------------------------------------------------------------------------

drop function if exists public.test_session_save(uuid, text, text, jsonb);
drop function if exists public.test_session_complete(uuid, jsonb, jsonb, jsonb);
drop function if exists public.test_session_get(uuid);
drop function if exists public.test_session_claim(uuid);
drop function if exists public.test_scale_profile();
drop function if exists public.test_my_sessions();

-- ---------------------------------------------------------------------------
-- 2. Per-IP ceiling for new sessions
-- ---------------------------------------------------------------------------

-- Own table rather than a scope column on looplore_auth_attempts: the auth
-- throttle counts rows by IP alone, and teaching it scopes would touch a
-- function that guards account creation. Two tiny tables are cheaper than one
-- shared failure mode.
create table if not exists public.looplore_test_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  created_at timestamptz not null default now()
);

create index if not exists looplore_test_attempts_ip_idx
  on public.looplore_test_attempts (ip, created_at desc);
-- Lets a manual sweep of the whole table stay cheap.
create index if not exists looplore_test_attempts_time_idx
  on public.looplore_test_attempts (created_at);

alter table public.looplore_test_attempts enable row level security;

/**
 * Returns true when this IP may start another test session, recording the
 * attempt. An unknown IP is allowed through: better to serve a visitor behind
 * a stripped header than to block them, and the ceiling still holds for
 * everyone the platform does identify.
 */
create or replace function public.looplore_test_session_throttle(
  p_ip text,
  p_limit integer default 60,
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
  delete from looplore_test_attempts
   where ip = p_ip and created_at < now() - p_window;

  select count(*) into v_count
    from looplore_test_attempts
   where ip = p_ip and created_at >= now() - p_window;

  if v_count >= p_limit then
    return false;
  end if;

  insert into looplore_test_attempts (ip) values (p_ip);
  return true;
end;
$$;

-- Internal: only the security-definer save path calls this, never a client.
revoke all on function public.looplore_test_session_throttle(text, integer, interval)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Session RPCs (anon-callable, keyed by session UUID)
-- ---------------------------------------------------------------------------

-- Autosave. Creates the row on first call; refuses to move a session to
-- another test so a stale client cannot overwrite an unrelated one.
create or replace function public.looplore_test_session_save(
  p_session_id uuid,
  p_test_id text,
  p_lang text,
  p_answers jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test text;
  v_owner uuid;
  v_found boolean;
  v_headers text;
  v_ip text;
  v_allowed boolean;
begin
  if p_session_id is null or p_test_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  -- Real payloads are a few KB (answers) and a few bytes (ids, lang); the cap
  -- refuses junk without a legitimate client ever noticing it exists.
  if pg_column_size(p_answers) > 65536
     or octet_length(p_test_id) > 256
     or octet_length(coalesce(p_lang, '')) > 256 then
    return jsonb_build_object('ok', false, 'error', 'too_large');
  end if;

  select test_id, user_id into v_test, v_owner
    from looplore_test_sessions where id = p_session_id;
  v_found := found;

  if v_found then
    -- A claimed session belongs to its account: the bare UUID stops being
    -- enough to write the moment somebody signs in and claims it.
    if v_owner is not null and (auth.uid() is null or auth.uid() <> v_owner) then
      return jsonb_build_object('ok', false, 'error', 'owned');
    end if;
    if v_test <> p_test_id then
      return jsonb_build_object('ok', false, 'error', 'test_mismatch');
    end if;
  else
    -- Creating a new row is the only path a script can mass-produce — updates
    -- ride on a UUID that already passed this gate once.
    begin
      v_headers := current_setting('request.headers', true);
      if v_headers is not null and btrim(v_headers) <> '' then
        v_ip := btrim(split_part(v_headers::jsonb ->> 'x-forwarded-for', ',', 1));
      end if;
      v_allowed := looplore_test_session_throttle(v_ip);
    exception when others then
      -- A broken limiter must not become an open door.
      v_allowed := false;
    end;
    if not coalesce(v_allowed, false) then
      return jsonb_build_object('ok', false, 'error', 'rate_limited');
    end if;
  end if;

  insert into looplore_test_sessions (id, test_id, lang, answers)
  values (p_session_id, p_test_id, coalesce(p_lang, 'en'), coalesce(p_answers, '{}'::jsonb))
  on conflict (id) do update
    set answers = coalesce(excluded.answers, looplore_test_sessions.answers),
        lang = excluded.lang,
        updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- Finish: store the computed result. Idempotent — a repeated submit of the
-- same session simply refreshes it.
create or replace function public.looplore_test_session_complete(
  p_session_id uuid,
  p_answers jsonb,
  p_outcome jsonb,
  p_scale_totals jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if pg_column_size(p_answers) > 65536
     or pg_column_size(p_outcome) > 65536
     or pg_column_size(p_scale_totals) > 65536 then
    return jsonb_build_object('ok', false, 'error', 'too_large');
  end if;

  select user_id into v_owner
    from looplore_test_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_owner is not null and (auth.uid() is null or auth.uid() <> v_owner) then
    return jsonb_build_object('ok', false, 'error', 'owned');
  end if;

  update looplore_test_sessions
     set answers = coalesce(p_answers, answers),
         outcome = p_outcome,
         scale_totals = p_scale_totals,
         completed_at = coalesce(completed_at, now()),
         updated_at = now()
   where id = p_session_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.looplore_test_session_get(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row looplore_test_sessions;
begin
  select * into v_row from looplore_test_sessions where id = p_session_id;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'id', v_row.id,
    'testId', v_row.test_id,
    'lang', v_row.lang,
    'answers', v_row.answers,
    'outcome', v_row.outcome,
    'completedAt', v_row.completed_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Ownership and the cross-test profile (authenticated)
-- ---------------------------------------------------------------------------

-- Attach an anonymous session to the account after the email step. Only claims
-- unowned sessions: knowing a UUID must never take a session from someone else.
create or replace function public.looplore_test_session_claim(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select user_id into v_owner from looplore_test_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_owner is not null and v_owner <> auth.uid() then
    return jsonb_build_object('ok', false, 'error', 'owned');
  end if;

  update looplore_test_sessions
     set user_id = auth.uid(), updated_at = now()
   where id = p_session_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- The accumulated portrait: every scale the user's completed tests touch.
-- Retakes do not double count — only the latest completed attempt per test.
create or replace function public.looplore_test_scale_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scores jsonb;
  v_tests text[];
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  with latest as (
    select distinct on (test_id) test_id, scale_totals
      from looplore_test_sessions
     where user_id = auth.uid()
       and completed_at is not null
       and scale_totals is not null
     order by test_id, completed_at desc
  ),
  summed as (
    select entry.key as scale_id,
           sum((entry.value -> 0)::numeric) as weighted,
           sum((entry.value -> 1)::numeric) as max_weighted
      from latest, jsonb_each(latest.scale_totals) as entry
     group by entry.key
  )
  select jsonb_object_agg(
           scale_id,
           round(least(100, greatest(0, weighted / nullif(max_weighted, 0) * 100)), 1)
         ),
         (select array_agg(test_id) from latest)
    into v_scores, v_tests
    from summed
   where max_weighted > 0;

  return jsonb_build_object(
    'ok', true,
    'tests', coalesce(v_tests, array[]::text[]),
    'scales', coalesce(v_scores, '{}'::jsonb)
  );
end;
$$;

-- Session list for the account: what has been taken, and what it said.
create or replace function public.looplore_test_my_sessions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'unauthenticated');
  end if;

  select coalesce(jsonb_agg(row_to_json(t)::jsonb order by t.completed_at desc), '[]'::jsonb)
    into v_rows
    from (
      select distinct on (test_id)
             id, test_id, completed_at,
             outcome -> 'profileId' as profile_id,
             outcome -> 'typeCode' as type_code
        from looplore_test_sessions
       where user_id = auth.uid()
         and completed_at is not null
       order by test_id, completed_at desc
    ) t;

  return jsonb_build_object('ok', true, 'sessions', v_rows);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Execution grants
-- ---------------------------------------------------------------------------

-- Session UUID is the capability, same as the quiz and photo funnels.
grant execute on function public.looplore_test_session_save(uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.looplore_test_session_complete(uuid, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.looplore_test_session_get(uuid) to anon, authenticated;

-- Account-scoped: these read auth.uid(), so anon has nothing to gain.
revoke all on function public.looplore_test_session_claim(uuid) from public, anon;
revoke all on function public.looplore_test_scale_profile() from public, anon;
revoke all on function public.looplore_test_my_sessions() from public, anon;
grant execute on function public.looplore_test_session_claim(uuid) to authenticated;
grant execute on function public.looplore_test_scale_profile() to authenticated;
grant execute on function public.looplore_test_my_sessions() to authenticated;
