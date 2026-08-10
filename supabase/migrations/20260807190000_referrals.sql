-- The compare loop ("invite a friend to compare") and personal referral codes
-- (docs/referrals-compare.md; session G2 of docs/audit-2026-08-07.md §6.3).
-- Apply to prod ONLY with the founder's explicit go.
--
-- Design notes:
--   * Taking a test is the free top of the funnel (docs/subscription-economy.md
--     §3), so the whole loop is free: an invite is a link, a comparison is two
--     finished attempts of the SAME test, and the reward is a small grant.
--   * Rewards never leave the server rail. Every credit comes from credits_grant
--     (service_role only) called inside these definer functions, under a key
--     that carries the PAIR of accounts — so a pair is paid once and only once,
--     whichever route it took (comparison or referral code), and a replay after
--     a lost response cannot double-grant.
--   * On top of the pair key: at most REWARD_CAP grants per account per rolling
--     30 days, and a side with no account is not paid at all until it has one.
--     Farming the loop from two mailboxes therefore buys one reward, once —
--     less than the daily claim already gives away, and it costs a real signup.
--   * Reading a comparison is gated on PARTICIPATION, not on holding the link
--     (docs/audit-2026-08-07.md §2.1 — "UUID = the right to act"): the caller
--     presents their OWN side's session UUID, and once that session is claimed,
--     the owner's JWT is required on top.
--   * The invite link reveals NOTHING until the friend finishes the test: not
--     the result, not the scales, not an email — only which test it is. That
--     closes both the leak (a forwarded link would otherwise be somebody's
--     psych profile) and the priming (seeing the answer before answering).
--   * Raw answers are never part of a comparison in either direction. Only the
--     aggregate outcome — profile, type code, factor/scale percentages.
--
-- Constants live twice on purpose: here, and in
-- supabase/functions/_shared/credits-config.ts (REFERRAL) for the UI copy.
-- Keep them in sync.

-- ---------------------------------------------------------------------------
-- 1. Ledger kind for the referral grant
-- ---------------------------------------------------------------------------

-- Same drop-and-recreate as previous kind migrations: the CHECK must carry the
-- FULL list, or every previously valid kind starts failing inserts.
--
-- `grant_gift` is in this list because gifts (docs/gifts.md) shipped to prod on
-- 08.08, after this migration was written. Dropping and recreating the CHECK
-- from a list that predates them would have quietly outlawed every gift
-- redemption. Whoever adds the next kind: read the LIVE constraint first
-- (pg_get_constraintdef on looplore_credit_ledger_kind_check), not this file.
alter table public.looplore_credit_ledger
  drop constraint if exists looplore_credit_ledger_kind_check;
alter table public.looplore_credit_ledger
  add constraint looplore_credit_ledger_kind_check check (kind in (
    'purchase', 'bonus_timer',
    'grant_signup', 'grant_daily', 'grant_streak', 'grant_promo',
    'grant_gift', 'grant_referral',
    'spend_report', 'spend_photo', 'spend_question', 'spend_insight',
    'spend_test_report', 'spend_portrait',
    'included_report', 'included_photo', 'included_question', 'included_insight',
    'included_test_report', 'included_portrait',
    'refund', 'adjust'
  ));

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- One invite per finished attempt: the link belongs to the result it was made
-- from, so a retake mints a new attempt and therefore a new link, and an old
-- comparison can never be re-pointed at a newer result.
create table if not exists public.looplore_compare_invites (
  code text primary key,
  test_id text not null,
  inviter_session_id uuid not null unique
    references public.looplore_test_sessions (id) on delete cascade,
  -- Kill switch in the inviter's own hands: stops new joins, keeps the
  -- comparisons that already happened visible to both sides.
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- One row per accepted invite. User ids are deliberately NOT snapshotted here:
-- a session's owner is resolved through looplore_test_sessions at settle time,
-- because a side is often anonymous when the comparison happens and signs in
-- later (looplore_test_session_claim only ever claims unowned sessions, so the
-- owner is stable once set).
create table if not exists public.looplore_comparisons (
  id uuid primary key default gen_random_uuid(),
  code text not null references public.looplore_compare_invites (code) on delete cascade,
  test_id text not null,
  inviter_session_id uuid not null
    references public.looplore_test_sessions (id) on delete cascade,
  invitee_session_id uuid not null
    references public.looplore_test_sessions (id) on delete cascade,
  -- Settled = the side was offered its grant; the amount is 0 when the pair had
  -- already been paid on an earlier comparison. A capped side stays unsettled
  -- so a later sweep can pay it once the window frees up.
  inviter_rewarded_at timestamptz,
  inviter_reward integer not null default 0,
  invitee_rewarded_at timestamptz,
  invitee_reward integer not null default 0,
  created_at timestamptz not null default now(),
  unique (code, invitee_session_id)
);

create index if not exists looplore_comparisons_inviter_idx
  on public.looplore_comparisons (inviter_session_id, created_at desc);
create index if not exists looplore_comparisons_invitee_idx
  on public.looplore_comparisons (invitee_session_id, created_at desc);

-- The personal referral code is an ordinary promo code (docs/credits-economy.md
-- §5.1) plus an owner. Everything the promo rail already does — one redemption
-- per account, budget under a row lock, expiry, guess throttling, ledger
-- visibility — is reused as is; this table only says who gets the other half.
create table if not exists public.looplore_referral_codes (
  user_id uuid primary key references auth.users (id) on delete cascade,
  code text not null unique references public.looplore_promo_codes (code) on delete cascade,
  created_at timestamptz not null default now()
);

-- No policies anywhere: the security-definer RPCs below are the only way in.
alter table public.looplore_compare_invites enable row level security;
alter table public.looplore_comparisons enable row level security;
alter table public.looplore_referral_codes enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Internals (never callable from a client)
-- ---------------------------------------------------------------------------

-- Uppercase hex out of gen_random_uuid(): strong randomness, no ambiguous
-- glyphs (hex has no O/0 or I/1 clash), short enough to read down a phone.
create or replace function public.looplore_referral_random_code(
  p_prefix text,
  p_len integer
) returns text
language sql
security definer
set search_path = public
as $$
  select upper(coalesce(p_prefix, '') || substr(replace(gen_random_uuid()::text, '-', ''), 1, p_len));
$$;

/**
 * Pay one side of a referral. The whole anti-farm story lives here:
 *   * both accounts must exist and differ (a self-invite pays nothing);
 *   * the idempotency key carries the sorted PAIR, so two people can earn from
 *     each other exactly once — through a comparison, a referral code, or both;
 *   * a rolling 30-day cap bounds what any single account can ever collect.
 * Returns a reason rather than raising, so callers can tell the difference
 * between "already earned with this friend" and "hit the monthly cap".
 */
create or replace function public.looplore_referral_reward(
  p_user_id uuid,
  p_peer_id uuid,
  p_source text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Mirrors REFERRAL in credits-config.ts — keep in sync.
  v_reward constant integer := 20;
  v_cap constant integer := 5;
  v_used integer;
  v_key text;
  v_grant jsonb;
begin
  if p_user_id is null or p_peer_id is null then
    return jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;
  if p_user_id = p_peer_id then
    return jsonb_build_object('ok', false, 'reason', 'self');
  end if;

  select count(*) into v_used
    from looplore_credit_ledger
   where user_id = p_user_id
     and kind = 'grant_referral'
     and created_at > now() - interval '30 days';
  if v_used >= v_cap then
    return jsonb_build_object('ok', false, 'reason', 'capped');
  end if;

  v_key := 'refpair:' || least(p_user_id, p_peer_id)::text
                      || ':' || greatest(p_user_id, p_peer_id)::text
                      || ':' || p_user_id::text;

  -- The balance still only ever moves through the ledger rail.
  v_grant := credits_grant(
    p_user_id,
    v_reward,
    'grant_referral',
    v_key,
    -- ref is visible in the account's history; the peer's id stays in meta,
    -- which credits_my_ledger does not expose.
    p_source,
    jsonb_build_object('peer', p_peer_id, 'source', p_source)
  );
  if coalesce((v_grant ->> 'ok')::boolean, false) is not true then
    return jsonb_build_object('ok', false, 'reason', 'grant_failed');
  end if;
  if (v_grant ->> 'duplicate') = 'true' then
    return jsonb_build_object('ok', true, 'credits', 0, 'reason', 'pair_seen');
  end if;
  return jsonb_build_object(
    'ok', true,
    'credits', v_reward,
    'reason', 'ok',
    'balance', (v_grant ->> 'balance')::integer
  );
end;
$$;

/** One side of a comparison, as the other side is allowed to see it. */
create or replace function public.looplore_compare_side(p_session_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select jsonb_build_object(
           -- Aggregate only. Raw answers never cross to the other side.
           'profile_id', s.outcome -> 'profileId',
           'type_code', s.outcome -> 'typeCode',
           'factors', coalesce(s.outcome -> 'factorPercentages', '{}'::jsonb),
           'scales', coalesce(s.outcome -> 'scaleScores', '{}'::jsonb),
           'completed_at', s.completed_at
         )
    from looplore_test_sessions s
   where s.id = p_session_id;
$$;

/** The comparison as seen from one participating session. */
create or replace function public.looplore_compare_row(
  p_comparison_id uuid,
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cmp looplore_comparisons;
  v_mine boolean;
begin
  select * into v_cmp from looplore_comparisons where id = p_comparison_id;
  if not found then return null; end if;
  v_mine := v_cmp.inviter_session_id = p_session_id;
  return jsonb_build_object(
    'id', v_cmp.id,
    'test_id', v_cmp.test_id,
    'created_at', v_cmp.created_at,
    'is_inviter', v_mine,
    'you', looplore_compare_side(case when v_mine then v_cmp.inviter_session_id else v_cmp.invitee_session_id end),
    'friend', looplore_compare_side(case when v_mine then v_cmp.invitee_session_id else v_cmp.inviter_session_id end),
    'reward', case when v_mine then v_cmp.inviter_reward else v_cmp.invitee_reward end
  );
end;
$$;

/**
 * Try to pay both sides of one comparison. Idempotent by construction: a side
 * already settled is skipped, and the pair key stops a second payout even if
 * the same two people compare on five different tests.
 */
create or replace function public.looplore_compare_settle(p_comparison_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cmp looplore_comparisons;
  v_inviter uuid;
  v_invitee uuid;
  v_a jsonb := null;
  v_b jsonb := null;
begin
  select * into v_cmp from looplore_comparisons where id = p_comparison_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select user_id into v_inviter from looplore_test_sessions where id = v_cmp.inviter_session_id;
  select user_id into v_invitee from looplore_test_sessions where id = v_cmp.invitee_session_id;

  if v_cmp.inviter_rewarded_at is null then
    v_a := looplore_referral_reward(v_inviter, v_invitee, 'compare');
    if coalesce((v_a ->> 'ok')::boolean, false) then
      update looplore_comparisons
         set inviter_rewarded_at = now(),
             inviter_reward = coalesce((v_a ->> 'credits')::integer, 0)
       where id = p_comparison_id;
    end if;
  end if;

  if v_cmp.invitee_rewarded_at is null then
    v_b := looplore_referral_reward(v_invitee, v_inviter, 'compare');
    if coalesce((v_b ->> 'ok')::boolean, false) then
      update looplore_comparisons
         set invitee_rewarded_at = now(),
             invitee_reward = coalesce((v_b ->> 'credits')::integer, 0)
       where id = p_comparison_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'inviter', v_a, 'invitee', v_b);
end;
$$;

revoke all on function public.looplore_referral_random_code(text, integer)
  from public, anon, authenticated;
revoke all on function public.looplore_referral_reward(uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.looplore_compare_side(uuid)
  from public, anon, authenticated;
revoke all on function public.looplore_compare_row(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.looplore_compare_settle(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The compare loop (session UUID is the capability, owner's JWT on top)
-- ---------------------------------------------------------------------------

/**
 * Mint (or re-open) the invite link for a finished attempt. Anonymous visitors
 * can invite — the share is the free half of the product, and the reward waits
 * politely until both sides have an account.
 */
create or replace function public.looplore_compare_invite(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_test text;
  v_owner uuid;
  v_completed timestamptz;
  v_code text;
  i integer;
begin
  select test_id, user_id, completed_at into v_test, v_owner, v_completed
    from looplore_test_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  -- A claimed session belongs to its account: the bare UUID stops being enough
  -- the moment somebody signs in and claims it.
  if v_owner is not null and (auth.uid() is null or auth.uid() <> v_owner) then
    return jsonb_build_object('ok', false, 'error', 'owned');
  end if;
  if v_completed is null then
    return jsonb_build_object('ok', false, 'error', 'not_completed');
  end if;

  select code into v_code from looplore_compare_invites where inviter_session_id = p_session_id;
  if v_code is not null then
    -- Same button re-opens a link the inviter had switched off.
    update looplore_compare_invites set active = true where code = v_code;
    return jsonb_build_object('ok', true, 'code', v_code, 'active', true);
  end if;

  for i in 1..5 loop
    v_code := looplore_referral_random_code('', 8);
    begin
      insert into looplore_compare_invites (code, test_id, inviter_session_id)
      values (v_code, v_test, p_session_id);
      return jsonb_build_object('ok', true, 'code', v_code, 'active', true);
    exception when unique_violation then
      v_code := null;
    end;
  end loop;
  return jsonb_build_object('ok', false, 'error', 'internal');
end;
$$;

/**
 * What a bare link is allowed to say before the friend has taken the test:
 * which test, and whether the link still works. Nothing about the inviter, and
 * nothing about their result.
 */
create or replace function public.looplore_compare_peek(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_row looplore_compare_invites;
begin
  if v_code = '' or length(v_code) > 32 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_row from looplore_compare_invites where code = v_code;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'test_id', v_row.test_id, 'active', v_row.active);
end;
$$;

/**
 * The friend joins with their OWN finished attempt of the same test. This is
 * the only place a comparison is created, and it also settles the reward, so
 * the happy path is one round trip.
 */
create or replace function public.looplore_compare_join(
  p_code text,
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_invite looplore_compare_invites;
  v_test text;
  v_owner uuid;
  v_completed timestamptz;
  v_inviter_owner uuid;
  v_inviter_completed timestamptz;
  v_id uuid;
  v_settle jsonb;
  v_mine jsonb;
begin
  if v_code = '' or length(v_code) > 32 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  select * into v_invite from looplore_compare_invites where code = v_code;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  select test_id, user_id, completed_at into v_test, v_owner, v_completed
    from looplore_test_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_owner is not null and (auth.uid() is null or auth.uid() <> v_owner) then
    return jsonb_build_object('ok', false, 'error', 'owned');
  end if;
  if v_completed is null then
    return jsonb_build_object('ok', false, 'error', 'not_completed');
  end if;
  if v_test <> v_invite.test_id then
    return jsonb_build_object('ok', false, 'error', 'test_mismatch');
  end if;

  select user_id, completed_at into v_inviter_owner, v_inviter_completed
    from looplore_test_sessions where id = v_invite.inviter_session_id;
  if v_inviter_completed is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Comparing with yourself is not a comparison. Caught on the session (same
  -- device) and on the account (two devices, one login); the two-mailbox case
  -- is caught later, by the pair key and the cap.
  if p_session_id = v_invite.inviter_session_id then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;
  if v_owner is not null and v_inviter_owner is not null and v_owner = v_inviter_owner then
    return jsonb_build_object('ok', false, 'error', 'self');
  end if;

  -- A switched-off link refuses NEW joins; one already made stays readable.
  select id into v_id
    from looplore_comparisons
   where code = v_code and invitee_session_id = p_session_id;
  if v_id is null then
    if not v_invite.active then
      return jsonb_build_object('ok', false, 'error', 'inactive');
    end if;
    insert into looplore_comparisons (code, test_id, inviter_session_id, invitee_session_id)
    values (v_code, v_invite.test_id, v_invite.inviter_session_id, p_session_id)
    on conflict (code, invitee_session_id) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id
        from looplore_comparisons
       where code = v_code and invitee_session_id = p_session_id;
    end if;
  end if;

  -- The comparison is the product; the reward is a bonus on top. A failing
  -- payout must not take the comparison down with it — the insert above lives
  -- in the outer block and survives this one.
  begin
    v_settle := looplore_compare_settle(v_id);
  exception when others then
    v_settle := jsonb_build_object('ok', false);
  end;
  v_mine := looplore_compare_row(v_id, p_session_id);

  return jsonb_build_object(
    'ok', true,
    'comparison', v_mine,
    -- nullif: a side that was already settled comes back as JSON null, which
    -- coalesce would happily keep.
    'reward', coalesce(
      nullif(v_settle -> 'invitee', 'null'::jsonb),
      jsonb_build_object('ok', false, 'reason', 'settled')
    )
  );
end;
$$;

/**
 * Everything the result screen needs about this attempt's loop in one call: the
 * invite link (if any) and every comparison this session takes part in.
 * Participation is the gate — an id alone opens nothing.
 */
create or replace function public.looplore_compare_list(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_code text;
  v_active boolean;
  v_rows jsonb;
begin
  select user_id into v_owner from looplore_test_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_owner is not null and (auth.uid() is null or auth.uid() <> v_owner) then
    return jsonb_build_object('ok', false, 'error', 'owned');
  end if;

  select code, active into v_code, v_active
    from looplore_compare_invites where inviter_session_id = p_session_id;

  select coalesce(jsonb_agg(looplore_compare_row(t.id, p_session_id) order by t.created_at desc), '[]'::jsonb)
    into v_rows
    from (
      select id, created_at
        from looplore_comparisons
       where inviter_session_id = p_session_id
          or invitee_session_id = p_session_id
       order by created_at desc
       limit 20
    ) t;

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'active', coalesce(v_active, false),
    'comparisons', v_rows
  );
end;
$$;

/** The inviter switches the link off. Comparisons already made stay visible. */
create or replace function public.looplore_compare_revoke(
  p_code text,
  p_session_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_owner uuid;
begin
  select user_id into v_owner from looplore_test_sessions where id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  if v_owner is not null and (auth.uid() is null or auth.uid() <> v_owner) then
    return jsonb_build_object('ok', false, 'error', 'owned');
  end if;

  update looplore_compare_invites
     set active = false
   where code = v_code and inviter_session_id = p_session_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return jsonb_build_object('ok', true, 'active', false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Account-scoped: settling late rewards and the personal code
-- ---------------------------------------------------------------------------

/**
 * Pay whatever this account has earned but could not be paid yet — the usual
 * case being a comparison made before one of the two sides had an account.
 * Called on sign-in, next to the session claim.
 */
create or replace function public.looplore_referral_settle_mine()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_row record;
  v_res jsonb;
  v_credits integer := 0;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  for v_row in
    select c.id
      from looplore_comparisons c
      join looplore_test_sessions si on si.id = c.inviter_session_id
      join looplore_test_sessions sj on sj.id = c.invitee_session_id
     where (si.user_id = v_user and c.inviter_rewarded_at is null)
        or (sj.user_id = v_user and c.invitee_rewarded_at is null)
     order by c.created_at desc
     limit 20
  loop
    v_res := looplore_compare_settle(v_row.id);
    v_credits := v_credits
      + coalesce((v_res -> 'inviter' ->> 'credits')::integer, 0)
      + coalesce((v_res -> 'invitee' ->> 'credits')::integer, 0);
  end loop;

  return jsonb_build_object('ok', true, 'credits', v_credits);
end;
$$;

/**
 * The account's personal referral code, minted on first ask. It IS a promo code
 * (docs/credits-economy.md §5.1) — the rail already carries budget, expiry,
 * one-per-account, guess throttling and ledger visibility. Budget and expiry
 * are mandatory here, not optional: a code worth N credits is N/95 free reads
 * for everyone who ever sees it.
 */
create or replace function public.looplore_referral_my_code()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Mirrors REFERRAL in credits-config.ts — keep in sync.
  v_credits constant integer := 20;
  v_max constant integer := 25;
  v_days constant integer := 90;
  v_cap constant integer := 5;
  v_user uuid := auth.uid();
  v_code text;
  v_mine text;
  v_row looplore_promo_codes%rowtype;
  v_used integer;
  i integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'error', 'sign_in_required');
  end if;

  select code into v_code from looplore_referral_codes where user_id = v_user;

  if v_code is null then
    for i in 1..5 loop
      v_code := looplore_referral_random_code('LL', 6);
      begin
        insert into looplore_promo_codes (code, credits, max_redemptions, expires_at, note)
        values (v_code, v_credits, v_max, now() + make_interval(days => v_days),
                'referral:' || v_user::text);
        -- Two tabs asking at once: the second one loses and adopts the first
        -- one's code, and the code it had just minted is swept, not left live.
        insert into looplore_referral_codes (user_id, code) values (v_user, v_code)
        on conflict (user_id) do nothing;
        select code into v_mine from looplore_referral_codes where user_id = v_user;
        if v_mine is distinct from v_code then
          delete from looplore_promo_codes where code = v_code;
          v_code := v_mine;
        end if;
        exit;
      exception when unique_violation then
        -- Code collision: draw another one.
        v_code := null;
      end;
    end loop;
    if v_code is null then
      return jsonb_build_object('ok', false, 'error', 'internal');
    end if;
  end if;

  select * into v_row from looplore_promo_codes where code = v_code;

  select count(*) into v_used
    from looplore_credit_ledger
   where user_id = v_user
     and kind = 'grant_referral'
     and created_at > now() - interval '30 days';

  return jsonb_build_object(
    'ok', true,
    'code', v_code,
    'credits', v_row.credits,
    'active', v_row.active,
    'redeemed_count', v_row.redeemed_count,
    'max_redemptions', v_row.max_redemptions,
    'expires_at', v_row.expires_at,
    'reward', 20,
    'rewards_used', v_used,
    'rewards_cap', v_cap
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The promo rail learns about code owners
-- ---------------------------------------------------------------------------

-- Body identical to 20260727140000_promo_codes.sql plus two additions, both
-- no-ops for every code that is not somebody's personal referral code:
--   * redeeming your own code is refused (it would be a self-referral);
--   * a successful redemption pays the owner through the same reward helper,
--     under the same pair key and the same cap as a comparison — so a pair
--     cannot collect twice by using both mechanics.
create or replace function public.credits_redeem_promo(
  p_user_id uuid,
  p_code text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_row looplore_promo_codes%rowtype;
  v_fails integer;
  v_grant jsonb;
  v_owner uuid;
begin
  if v_code = '' or length(v_code) > 64 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Guessing throttle. Codes are short enough to brute-force from a script, so
  -- a signed-in account gets 10 wrong guesses an hour and no more.
  delete from looplore_promo_attempts
   where user_id = p_user_id and created_at < now() - interval '1 hour';
  select count(*) into v_fails
    from looplore_promo_attempts
   where user_id = p_user_id and created_at >= now() - interval '1 hour';
  if v_fails >= 10 then
    return jsonb_build_object('ok', false, 'error', 'throttled');
  end if;

  -- Lock the code so the last redemption slot can only be taken once.
  select * into v_row from looplore_promo_codes where code = v_code for update;

  if not found or not v_row.active then
    insert into looplore_promo_attempts (user_id, code) values (p_user_id, v_code);
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Own referral code: a real code correctly typed, so it is not a wrong guess
  -- and must not count against the throttle.
  select user_id into v_owner from looplore_referral_codes where code = v_code;
  if v_owner is not null and v_owner = p_user_id then
    return jsonb_build_object('ok', false, 'error', 'own_code');
  end if;

  if v_row.expires_at is not null and v_row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  -- Already redeemed by this account: not an error, and not a second grant.
  if exists (
    select 1 from looplore_promo_redemptions
     where code = v_code and user_id = p_user_id
  ) then
    return jsonb_build_object('ok', false, 'error', 'already_redeemed');
  end if;

  if v_row.max_redemptions is not null and v_row.redeemed_count >= v_row.max_redemptions then
    return jsonb_build_object('ok', false, 'error', 'exhausted');
  end if;

  insert into looplore_promo_redemptions (code, user_id, credits)
  values (v_code, p_user_id, v_row.credits);

  update looplore_promo_codes
     set redeemed_count = redeemed_count + 1
   where code = v_code;

  -- The ledger is still the only place a balance changes. Its idempotency key
  -- carries the pair, so a replay after a lost response cannot double-grant.
  v_grant := credits_grant(
    p_user_id,
    v_row.credits,
    'grant_promo',
    'promo:' || v_code || ':' || p_user_id::text,
    v_code,
    jsonb_build_object('code', v_code, 'note', v_row.note)
  );
  if coalesce((v_grant ->> 'ok')::boolean, false) is not true then
    raise exception 'promo grant failed for % / %', v_code, p_user_id;
  end if;

  -- The other half of a personal code. Capped and pair-keyed inside the helper,
  -- and wrapped: the friend's credits are not hostage to the owner's half.
  if v_owner is not null then
    begin
      perform looplore_referral_reward(v_owner, p_user_id, 'code');
    exception when others then
      null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'credits', v_row.credits,
    'balance', (v_grant ->> 'balance')::integer,
    'referral', v_owner is not null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Execution grants
-- ---------------------------------------------------------------------------

-- Session UUID is the capability (with the owner's JWT required once claimed),
-- exactly like the rest of the tests funnel.
grant execute on function public.looplore_compare_invite(uuid) to anon, authenticated;
grant execute on function public.looplore_compare_peek(text) to anon, authenticated;
grant execute on function public.looplore_compare_join(text, uuid) to anon, authenticated;
grant execute on function public.looplore_compare_list(uuid) to anon, authenticated;
grant execute on function public.looplore_compare_revoke(text, uuid) to anon, authenticated;

-- Account-scoped: these read auth.uid(), so anon has nothing to gain.
revoke all on function public.looplore_referral_settle_mine() from public, anon;
revoke all on function public.looplore_referral_my_code() from public, anon;
grant execute on function public.looplore_referral_settle_mine() to authenticated;
grant execute on function public.looplore_referral_my_code() to authenticated;

-- Unchanged: the promo redemption stays service_role only (credits-promo).
revoke all on function public.credits_redeem_promo(uuid, text) from public, anon, authenticated;
grant execute on function public.credits_redeem_promo(uuid, text) to service_role;

-- Instant kill switch for the loop, without touching the credit rail:
--   revoke execute on function public.looplore_compare_invite(uuid) from anon, authenticated;
--   revoke execute on function public.looplore_compare_join(text, uuid) from anon, authenticated;
--   revoke execute on function public.looplore_referral_my_code() from authenticated;
-- (plus VITE_REFERRALS_ENABLED=false on the front, which hides the UI).
