-- Psychological tests imported from tests_app (docs/tests-integration.md, Э5).
-- Apply to prod ONLY with the founder's explicit go.
--
-- Design notes:
--   * Raw answers are the source of truth. The outcome is stored alongside them
--     for cheap reads, but any weight or rule change can be replayed over the
--     answers without asking users to retake anything.
--   * scale_totals holds [weighted_sum, sum_of_weights] per scale — the
--     sufficient statistics of the scale layer. Cross-test aggregation adds
--     those up and divides once; averaging finished percentages would let a
--     24-question test outweigh an 80-question one.
--   * Capability model matches the existing funnels: possession of the session
--     UUID lets you read and write that session. Nothing here spends credits,
--     so a forged outcome only misleads its own author.

-- ---------------------------------------------------------------------------
-- 1. Table
-- ---------------------------------------------------------------------------

create table if not exists public.looplore_test_sessions (
  id uuid primary key,
  test_id text not null,
  user_id uuid references auth.users (id) on delete set null,
  lang text not null default 'en',
  -- questionId -> answerId
  answers jsonb not null default '{}'::jsonb,
  -- { factorPercentages, scaleScores, profileId, typeCode }
  outcome jsonb,
  -- scaleId -> [weighted, maxWeighted]
  scale_totals jsonb,
  -- Bumped when scoring rules change, so stale rows can be found and replayed.
  engine_version integer not null default 1,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists looplore_test_sessions_user_idx
  on public.looplore_test_sessions (user_id, completed_at desc);

create index if not exists looplore_test_sessions_test_idx
  on public.looplore_test_sessions (test_id, completed_at desc);

-- No policies: every access path below is a security-definer function.
alter table public.looplore_test_sessions enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Session RPCs (anon-callable, keyed by session UUID)
-- ---------------------------------------------------------------------------

-- Autosave. Creates the row on first call; refuses to move a session to another
-- test so a stale client cannot overwrite an unrelated one.
create or replace function public.test_session_save(
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
  v_existing text;
begin
  if p_session_id is null or p_test_id is null then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  select test_id into v_existing
    from looplore_test_sessions where id = p_session_id;

  if v_existing is not null and v_existing <> p_test_id then
    return jsonb_build_object('ok', false, 'error', 'test_mismatch');
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

-- Finish: store the computed result. Idempotent — a repeated submit of the same
-- session simply refreshes it.
create or replace function public.test_session_complete(
  p_session_id uuid,
  p_answers jsonb,
  p_outcome jsonb,
  p_scale_totals jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  update looplore_test_sessions
     set answers = coalesce(p_answers, answers),
         outcome = p_outcome,
         scale_totals = p_scale_totals,
         completed_at = coalesce(completed_at, now()),
         updated_at = now()
   where id = p_session_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.test_session_get(p_session_id uuid)
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
-- 3. Ownership and the cross-test profile (authenticated)
-- ---------------------------------------------------------------------------

-- Attach an anonymous session to the account after the email step. Only claims
-- unowned sessions: knowing a UUID must never take a session from someone else.
create or replace function public.test_session_claim(p_session_id uuid)
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
create or replace function public.test_scale_profile()
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
create or replace function public.test_my_sessions()
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
-- 4. Execution grants
-- ---------------------------------------------------------------------------

-- Session UUID is the capability, same as the quiz and photo funnels.
grant execute on function public.test_session_save(uuid, text, text, jsonb) to anon, authenticated;
grant execute on function public.test_session_complete(uuid, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.test_session_get(uuid) to anon, authenticated;

-- Account-scoped: these read auth.uid(), so anon has nothing to gain.
revoke all on function public.test_session_claim(uuid) from public, anon;
revoke all on function public.test_scale_profile() from public, anon;
revoke all on function public.test_my_sessions() from public, anon;
grant execute on function public.test_session_claim(uuid) to authenticated;
grant execute on function public.test_scale_profile() to authenticated;
grant execute on function public.test_my_sessions() to authenticated;
