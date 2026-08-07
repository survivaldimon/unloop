-- Looplore+ subscription foundation (docs/subscription-economy.md).
-- Apply to prod ONLY with the founder's explicit go.
--
-- Design (§9 of the spec):
--   * looplore_subscriptions mirrors Polar's subscription objects and is the
--     source of truth for entitlement. The webhook upserts the LAST payload it
--     saw per provider_sub_id; subscription.* events are rare (create, renew,
--     cancel), so last-write-wins is acceptable — noted trade-off.
--   * Included consumption is recorded as ZERO-delta ledger rows (kind
--     included_*). They share the idempotency keyspace with paid spends, so a
--     report can never be both bought with credits and included — whichever
--     lands first wins and retries stay free. Quotas are counted over these
--     rows in a ROLLING 30-day window (not the billing period: a yearly plan
--     has a 12-month period but monthly quotas).
--   * Entitlement check = status in (trialing, active) with a 3-day grace past
--     current_period_end, guarding against a stuck webhook locking paying
--     subscribers out at the period boundary.

-- ---------------------------------------------------------------------------
-- 1. Subscriptions table
-- ---------------------------------------------------------------------------

create table if not exists public.looplore_subscriptions (
  -- Polar subscription id. One row per Polar subscription; a user who cancels
  -- and later re-subscribes gets a second row, entitlement picks the live one.
  provider_sub_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id text,
  plan text not null check (plan in ('monthly', 'yearly')),
  -- Raw Polar status: incomplete | trialing | active | past_due | canceled | unpaid…
  status text not null,
  cancel_at_period_end boolean not null default false,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists looplore_subscriptions_user_idx
  on public.looplore_subscriptions (user_id, status);

-- Locked down: the webhook (service role) writes, the RPCs below read.
alter table public.looplore_subscriptions enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Ledger kinds for included consumption (zero-delta rows)
-- ---------------------------------------------------------------------------

-- Same drop-and-recreate as previous kind migrations: the CHECK must carry the
-- FULL list, or every previously valid kind starts failing inserts.
alter table public.looplore_credit_ledger
  drop constraint if exists looplore_credit_ledger_kind_check;
alter table public.looplore_credit_ledger
  add constraint looplore_credit_ledger_kind_check check (kind in (
    'purchase', 'bonus_timer',
    'grant_signup', 'grant_daily', 'grant_streak', 'grant_promo',
    'spend_report', 'spend_photo', 'spend_question', 'spend_insight',
    'spend_test_report', 'spend_portrait',
    'included_report', 'included_photo', 'included_question', 'included_insight',
    'included_test_report', 'included_portrait',
    'refund', 'adjust'
  ));

-- ---------------------------------------------------------------------------
-- 3. Included-consumption RPC (service_role only)
-- ---------------------------------------------------------------------------

-- Records subscription-included consumption without touching the balance.
-- Shares looplore_credit_ledger's UNIQUE idempotency_key with paid spends:
-- a duplicate (either an earlier included row OR an earlier credit spend under
-- the same key) is a free retry, exactly like credits_spend.
create or replace function public.credits_included(
  p_user_id uuid,
  p_kind text,
  p_key text,
  p_ref text default null,
  p_meta jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not like 'included\_%' escape '\' then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;
  begin
    insert into looplore_credit_ledger (user_id, delta, kind, ref, idempotency_key, meta)
    values (p_user_id, 0, p_kind, p_ref, p_key, p_meta);
  exception when unique_violation then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end;
  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Entitlement RPCs
-- ---------------------------------------------------------------------------

-- One call answers both "is this user subscribed" and "how much of the quotas
-- is used" — every spending function starts here. Service-role only.
create or replace function public.looplore_active_sub(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub record;
  v_photos integer;
  v_questions integer;
begin
  select provider_sub_id, plan, status, cancel_at_period_end,
         trial_ends_at, current_period_start, current_period_end
    into v_sub
    from looplore_subscriptions
   where user_id = p_user_id
     and status in ('trialing', 'active')
     and (current_period_end is null
          or now() <= current_period_end + interval '3 days')
   order by current_period_end desc nulls last
   limit 1;

  if not found then
    return jsonb_build_object('active', false);
  end if;

  -- Rolling 30-day window (see header). Counts only included_* rows: paid
  -- credit spends never eat into subscription quotas.
  select count(*) filter (where kind = 'included_photo'),
         count(*) filter (where kind = 'included_question')
    into v_photos, v_questions
    from looplore_credit_ledger
   where user_id = p_user_id
     and kind in ('included_photo', 'included_question')
     and created_at >= now() - interval '30 days';

  return jsonb_build_object(
    'active', true,
    'sub_id', v_sub.provider_sub_id,
    'plan', v_sub.plan,
    'status', v_sub.status,
    'trial', v_sub.status = 'trialing',
    'cancel_at_period_end', v_sub.cancel_at_period_end,
    'trial_ends_at', v_sub.trial_ends_at,
    'period_start', v_sub.current_period_start,
    'period_end', v_sub.current_period_end,
    'photos_used', coalesce(v_photos, 0),
    'questions_used', coalesce(v_questions, 0)
  );
end;
$$;

-- Client-facing mirror for /account/ and the paywalls: same shape, keyed by
-- auth.uid(). Quota LIMITS live in credits-config.ts (single source, like
-- prices) — SQL reports usage only.
create or replace function public.looplore_my_subscription()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then jsonb_build_object('active', false)
    else public.looplore_active_sub(auth.uid())
  end;
$$;

-- ---------------------------------------------------------------------------
-- 5. "Dynamics" — scale trajectories across retakes (spec §8, v1 perk)
-- ---------------------------------------------------------------------------

-- All completed attempts of one test for the signed-in user, oldest first,
-- with the factor percentages the chart draws. Server-gated to Looplore+
-- (the perk that grows with subscription lifetime): non-subscribers get the
-- attempt count for an honest teaser, never the data itself.
create or replace function public.looplore_test_dynamics(p_test_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_rows jsonb;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  select count(*) into v_count
    from looplore_test_sessions
   where user_id = auth.uid()
     and test_id = p_test_id
     and completed_at is not null;

  if (public.looplore_active_sub(auth.uid())->>'active') <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'sub_required', 'attempts', v_count);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', t.id,
           'at', t.completed_at,
           'factors', t.outcome->'factorPercentages'
         ) order by t.completed_at), '[]'::jsonb)
    into v_rows
    from (
      select id, completed_at, outcome
        from looplore_test_sessions
       where user_id = auth.uid()
         and test_id = p_test_id
         and completed_at is not null
       order by completed_at desc
       limit 24
    ) t;

  return jsonb_build_object('ok', true, 'attempts', v_count, 'rows', v_rows);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Retake cooldown 24h → 72h (subscription spec §2 #8)
-- ---------------------------------------------------------------------------

-- Founder's fair-use decision for Looplore+: a test can be retaken every N
-- days, N=3 as the default calibration — scales don't move in a day, and the
-- cooldown is the anti-abuse cap on "unlimited reports". One rule for
-- everybody (free users included): paying must never mean worse conditions.
-- Body identical to 20260730120000 except the interval.
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
  v_test text;
  v_completed timestamptz;
  v_last timestamptz;
begin
  if pg_column_size(p_answers) > 65536
     or pg_column_size(p_outcome) > 65536
     or pg_column_size(p_scale_totals) > 65536 then
    return jsonb_build_object('ok', false, 'error', 'too_large');
  end if;

  select user_id, test_id, completed_at into v_owner, v_test, v_completed
    from looplore_test_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_owner is not null and (auth.uid() is null or auth.uid() <> v_owner) then
    return jsonb_build_object('ok', false, 'error', 'owned');
  end if;

  if v_owner is not null and v_completed is null then
    select max(completed_at) into v_last
      from looplore_test_sessions
     where user_id = v_owner
       and test_id = v_test
       and id <> p_session_id
       and completed_at > now() - interval '72 hours';
    if v_last is not null then
      return jsonb_build_object(
        'ok', false,
        'error', 'retake_cooldown',
        'retry_at', v_last + interval '72 hours'
      );
    end if;
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

-- ---------------------------------------------------------------------------
-- 7. Execution grants
-- ---------------------------------------------------------------------------

revoke all on function public.credits_included(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.looplore_active_sub(uuid) from public, anon, authenticated;
grant execute on function public.credits_included(uuid, text, text, text, jsonb) to service_role;
grant execute on function public.looplore_active_sub(uuid) to service_role;

grant execute on function public.looplore_my_subscription() to authenticated;
grant execute on function public.looplore_test_dynamics(text) to authenticated;
