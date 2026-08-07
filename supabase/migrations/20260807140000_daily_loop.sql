-- Stage D fast-follow: the daily free loop (docs/credits-economy.md §4, §6.5;
-- streak reward re-calibrated by docs/subscription-economy.md §6 — 7 straight
-- days now grant +95, "a read as a gift", instead of the original +50).
-- Apply to prod ONLY with the founder's explicit go.

-- One call on visit: grants today's +10 (idempotent per user+date), then
-- checks whether today completed a 7-day run and grants the streak bonus.
-- The streak key is anchored to the date that COMPLETED the run, so a longer
-- run earns a new bonus every 7th consecutive day, and re-delivery of the same
-- day is a no-op through the ledger's unique idempotency key.
create or replace function public.credits_daily_claim()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_today date;
  v_claim jsonb;
  v_streak integer;
  v_bonus jsonb := null;
  v_balance integer;
begin
  v_user := auth.uid();
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;
  v_today := (now() at time zone 'utc')::date;

  v_claim := public.credits_grant(
    v_user, 10, 'grant_daily',
    'daily:' || v_user || ':' || v_today,
    v_today::text,
    null
  );
  if (v_claim->>'ok') <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'grant_failed');
  end if;

  -- Consecutive daily claims ending today, counted over the last 14 rows —
  -- enough to see any 7-run without scanning history.
  select count(*) into v_streak
    from (
      select (ref)::date as d,
             row_number() over (order by (ref)::date desc) as rn
        from looplore_credit_ledger
       where user_id = v_user
         and kind = 'grant_daily'
         and created_at > now() - interval '15 days'
    ) t
   where t.d = v_today - (t.rn - 1)::integer;

  if v_streak >= 7 and v_streak % 7 = 0 then
    v_bonus := public.credits_grant(
      v_user, 95, 'grant_streak',
      'streak:' || v_user || ':' || v_today,
      v_today::text,
      jsonb_build_object('days', v_streak)
    );
  end if;

  select balance into v_balance from looplore_credit_accounts where user_id = v_user;
  return jsonb_build_object(
    'ok', true,
    'claimed', (v_claim->>'duplicate') <> 'true',
    'streak', coalesce(v_streak, 0),
    'streak_bonus', v_bonus is not null and (v_bonus->>'duplicate') <> 'true',
    'balance', coalesce(v_balance, 0)
  );
end;
$$;

grant execute on function public.credits_daily_claim() to authenticated;
