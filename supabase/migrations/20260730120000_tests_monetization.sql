-- Test monetization: paid reports, the portrait SKU and the retake cooldown
-- (docs/tests-monetization.md §8). Apply to prod ONLY with the founder's
-- explicit go.
--
-- Design notes:
--   * The report cache lives on the session row, like the quiz's — a report is
--     bought for one specific set of answers, and a retake mints a new session,
--     so the purchase can never be rewritten after the fact.
--   * looplore_portraits caches by (user_id, set_hash): the same set of
--     sessions is served from cache, a new completed test changes the hash and
--     therefore prices a fresh portrait.
--   * The cooldown guards accounts only. An anonymous visitor can reset
--     localStorage and be a new stranger — but paid actions require an account,
--     so by the moment money is involved the cooldown is server-side.

-- ---------------------------------------------------------------------------
-- 1. Report cache on the session
-- ---------------------------------------------------------------------------

-- { en: {...}, ru: {...} } — both languages of one session ride on one spend.
alter table public.looplore_test_sessions
  add column if not exists report jsonb;

-- ---------------------------------------------------------------------------
-- 2. Portrait cache
-- ---------------------------------------------------------------------------

create table if not exists public.looplore_portraits (
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Hash of the participating session ids: same set = cache hit, new test =
  -- new row and a new spend.
  set_hash text not null,
  report jsonb not null,
  engine_version integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (user_id, set_hash)
);

-- No policies: the tests-portrait function (service role) is the only way in.
alter table public.looplore_portraits enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Ledger kinds for the two new spends
-- ---------------------------------------------------------------------------

-- Same drop-and-recreate as the promo migration: the CHECK must carry the FULL
-- list, or every previously valid kind starts failing inserts.
alter table public.looplore_credit_ledger
  drop constraint if exists looplore_credit_ledger_kind_check;
alter table public.looplore_credit_ledger
  add constraint looplore_credit_ledger_kind_check check (kind in (
    'purchase', 'bonus_timer',
    'grant_signup', 'grant_daily', 'grant_streak', 'grant_promo',
    'spend_report', 'spend_photo', 'spend_question', 'spend_insight',
    'spend_test_report', 'spend_portrait',
    'refund', 'adjust'
  ));

-- ---------------------------------------------------------------------------
-- 4. Retake cooldown (24 h) in the completion RPC
-- ---------------------------------------------------------------------------

-- Body identical to 20260728160000 plus the cooldown check next to the owned
-- guard. A result is a snapshot; the same test can be retaken tomorrow. Only
-- the FIRST completion of a session is gated — re-submitting an already
-- completed session stays idempotent, and anonymous sessions pass (see header).
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
       and completed_at > now() - interval '24 hours';
    if v_last is not null then
      return jsonb_build_object(
        'ok', false,
        'error', 'retake_cooldown',
        'retry_at', v_last + interval '24 hours'
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
