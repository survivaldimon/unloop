-- Gifts: buy a Looplore gift for someone else (docs/gifts.md).
-- Apply to prod ONLY with the founder's explicit go.
--
-- A gift is a promo code with a buyer behind it, so it reuses the promo rail's
-- shape (one redemption, an expiry, a guessing throttle, a ledger row) and adds
-- the three things money brings with it:
--
--   * a lifecycle — pending → paid → redeemed, with `revoked` for a refund that
--     lands before anybody claimed it. The code is minted at CHECKOUT CREATION
--     and is dead until the webhook flips it to `paid`, so the buyer's own
--     browser already holds it and nothing has to hand a code back over a
--     public read.
--   * a recipient rule — a gift is for someone else, and the buyer's own
--     account cannot redeem it. Without that, "buy → redeem → refund" would be
--     a free credit machine, because a redeemed gift is never clawed back
--     (founder's decision 07.08.2026: the recipient did nothing wrong).
--   * a subscription tier that is not a subscription. Polar's recurring
--     products live on the payer's card and cannot be aimed at someone else's
--     account, so redeeming plus_month writes a SELF-EXPIRING entitlement row
--     into looplore_subscriptions instead: status active, no auto-renewal, no
--     card, gone when its period ends. Every included_* gate already reads that
--     table, so not one spending function changes.

-- ---------------------------------------------------------------------------
-- 1. Ledger kind
-- ---------------------------------------------------------------------------

-- Same drop-and-recreate as previous kind migrations: the CHECK must carry the
-- FULL list, or every previously valid kind starts failing inserts.
alter table public.looplore_credit_ledger
  drop constraint if exists looplore_credit_ledger_kind_check;
alter table public.looplore_credit_ledger
  add constraint looplore_credit_ledger_kind_check check (kind in (
    'purchase', 'bonus_timer',
    'grant_signup', 'grant_daily', 'grant_streak', 'grant_promo', 'grant_gift',
    'spend_report', 'spend_photo', 'spend_question', 'spend_insight',
    'spend_test_report', 'spend_portrait',
    'included_report', 'included_photo', 'included_question', 'included_insight',
    'included_test_report', 'included_portrait',
    'refund', 'adjust'
  ));

-- ---------------------------------------------------------------------------
-- 2. Gifts table
-- ---------------------------------------------------------------------------

create table if not exists public.looplore_gifts (
  -- Stored normalized (upper-case, alphanumeric only): the code is typed off a
  -- printed card as often as it is clicked. GIFT + 10 chars of a 32-glyph
  -- alphabet ≈ 1.1e15 combinations — the claim page reads codes without a
  -- session, so entropy is the only thing standing between a guesser and money.
  code text primary key,
  tier text not null check (tier in ('read', 'pack', 'plus_month')),
  -- Denomination is copied from the server config at mint time so a later
  -- repricing never changes what an already-sold gift is worth.
  credits integer not null default 0 check (credits >= 0),
  sub_days integer not null default 0 check (sub_days >= 0),
  amount_usd numeric(10, 2),

  buyer_user_id uuid references auth.users (id) on delete set null,
  buyer_email text,
  checkout_id text,
  order_id text,

  status text not null default 'pending'
    check (status in ('pending', 'paid', 'redeemed', 'revoked')),
  -- The buyer's money came back AFTER the recipient claimed it. The recipient
  -- keeps what they got; this is the manual-review trail, not a clawback.
  refunded_after_redeem boolean not null default false,

  -- Buyer's note, shown on the claim page and printed on the card.
  message text,
  from_name text,
  lang text not null default 'en' check (lang in ('en', 'ru')),

  redeemed_by uuid references auth.users (id) on delete set null,
  redeemed_at timestamptz,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists looplore_gifts_buyer_idx
  on public.looplore_gifts (buyer_user_id, created_at desc);
create index if not exists looplore_gifts_order_idx
  on public.looplore_gifts (order_id);

-- Locked down like the rest of the money tables: the service-role edge
-- functions and the security-definer RPCs below are the only ways in.
alter table public.looplore_gifts enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Code normalization
-- ---------------------------------------------------------------------------

-- People retype codes with the dashes the card prints, or with spaces, or in
-- lower case. Normalizing here (and NOT inside credits_redeem_promo, which
-- stays exactly as it was) keeps hand-issued promo codes matching byte for byte.
create or replace function public.looplore_gift_normalize(p_code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- 4. Mint / activate / revoke (service_role — checkout function and webhook)
-- ---------------------------------------------------------------------------

-- Called by gift-checkout the moment a checkout is created. The row is dead
-- weight until the webhook pays it: looplore_gift_public reports a pending gift
-- as "not found", and redemption refuses it outright.
create or replace function public.looplore_gift_mint(
  p_code text,
  p_tier text,
  p_credits integer,
  p_sub_days integer,
  p_amount_usd numeric,
  p_buyer_user_id uuid,
  p_buyer_email text,
  p_checkout_id text,
  p_message text,
  p_from_name text,
  p_lang text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := public.looplore_gift_normalize(p_code);
begin
  if v_code = '' or length(v_code) > 64 then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;
  insert into looplore_gifts (
    code, tier, credits, sub_days, amount_usd,
    buyer_user_id, buyer_email, checkout_id,
    message, from_name, lang
  ) values (
    v_code, p_tier, coalesce(p_credits, 0), coalesce(p_sub_days, 0), p_amount_usd,
    p_buyer_user_id, p_buyer_email, p_checkout_id,
    nullif(btrim(coalesce(p_message, '')), ''),
    nullif(btrim(coalesce(p_from_name, '')), ''),
    case when p_lang = 'ru' then 'ru' else 'en' end
  );
  return jsonb_build_object('ok', true, 'code', v_code);
exception when unique_violation then
  -- Astronomically unlikely, but the caller retries with a fresh code rather
  -- than handing the buyer somebody else's gift.
  return jsonb_build_object('ok', false, 'error', 'collision');
end;
$$;

-- order.paid → the code goes live. Upserts rather than updates: if the mint
-- was lost (a crash between checkout creation and the response), the buyer has
-- still paid and must still get a gift, so the webhook can build the row from
-- checkout metadata alone.
create or replace function public.looplore_gift_activate(
  p_code text,
  p_tier text,
  p_credits integer,
  p_sub_days integer,
  p_order_id text,
  p_amount_usd numeric,
  p_buyer_user_id uuid,
  p_buyer_email text,
  p_valid_days integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := public.looplore_gift_normalize(p_code);
  v_expires timestamptz := now() + make_interval(days => greatest(coalesce(p_valid_days, 365), 1));
begin
  if v_code = '' or length(v_code) > 64 then
    return jsonb_build_object('ok', false, 'error', 'bad_code');
  end if;

  insert into looplore_gifts (
    code, tier, credits, sub_days, amount_usd,
    buyer_user_id, buyer_email, order_id, status, paid_at, expires_at
  ) values (
    v_code, p_tier, coalesce(p_credits, 0), coalesce(p_sub_days, 0), p_amount_usd,
    p_buyer_user_id, p_buyer_email, p_order_id, 'paid', now(), v_expires
  )
  on conflict (code) do update set
    -- A redelivered webhook must not resurrect a redeemed or revoked gift.
    status = case when looplore_gifts.status = 'pending' then 'paid' else looplore_gifts.status end,
    order_id = coalesce(looplore_gifts.order_id, excluded.order_id),
    paid_at = coalesce(looplore_gifts.paid_at, excluded.paid_at),
    expires_at = coalesce(looplore_gifts.expires_at, excluded.expires_at),
    amount_usd = coalesce(looplore_gifts.amount_usd, excluded.amount_usd),
    buyer_user_id = coalesce(looplore_gifts.buyer_user_id, excluded.buyer_user_id),
    buyer_email = coalesce(looplore_gifts.buyer_email, excluded.buyer_email);

  return jsonb_build_object('ok', true, 'code', v_code);
end;
$$;

-- order.refunded → whatever is still unclaimed dies now; whatever was already
-- claimed is only flagged (the recipient keeps it — see the header).
create or replace function public.looplore_gift_revoke(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_revoked integer := 0;
  v_flagged integer := 0;
begin
  if coalesce(p_order_id, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'missing_order_id');
  end if;

  with killed as (
    update looplore_gifts set status = 'revoked'
     where order_id = p_order_id and status in ('pending', 'paid')
     returning 1
  ) select count(*) into v_revoked from killed;

  with flagged as (
    update looplore_gifts set refunded_after_redeem = true
     where order_id = p_order_id and status = 'redeemed' and refunded_after_redeem = false
     returning 1
  ) select count(*) into v_flagged from flagged;

  return jsonb_build_object(
    'ok', true,
    'revoked', v_revoked,
    'flagged', v_flagged,
    'affected', v_revoked + v_flagged
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Public read: what the claim page shows before anyone signs in
-- ---------------------------------------------------------------------------

-- Holding the code IS being the recipient, so the gift describes itself — but
-- only ever itself. Nothing here identifies the buyer beyond the name they
-- chose to sign with, and a pending (unpaid) gift does not exist yet.
create or replace function public.looplore_gift_public(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := public.looplore_gift_normalize(p_code);
  v_row looplore_gifts%rowtype;
begin
  if v_code = '' or length(v_code) > 64 then
    return jsonb_build_object('found', false);
  end if;
  select * into v_row from looplore_gifts where code = v_code;
  if not found or v_row.status = 'pending' then
    return jsonb_build_object('found', false);
  end if;
  return jsonb_build_object(
    'found', true,
    'tier', v_row.tier,
    'credits', v_row.credits,
    'sub_days', v_row.sub_days,
    'message', v_row.message,
    'from_name', v_row.from_name,
    'lang', v_row.lang,
    'state', case
      when v_row.status = 'revoked' then 'revoked'
      when v_row.status = 'redeemed' then 'redeemed'
      when v_row.expires_at is not null and v_row.expires_at <= now() then 'expired'
      else 'ready'
    end
  );
end;
$$;

-- The buyer's own list: codes they bought, with the status of each. Keyed by
-- auth.uid(), so it can only ever show your own.
create or replace function public.looplore_my_gifts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'code', g.code,
           'tier', g.tier,
           'status', case
             when g.status = 'paid' and g.expires_at is not null and g.expires_at <= now()
               then 'expired'
             else g.status
           end,
           'credits', g.credits,
           'sub_days', g.sub_days,
           'from_name', g.from_name,
           'message', g.message,
           'created_at', g.created_at,
           'expires_at', g.expires_at,
           'redeemed_at', g.redeemed_at
         ) order by g.created_at desc), '[]'::jsonb)
    from looplore_gifts g
   where auth.uid() is not null
     and g.buyer_user_id = auth.uid()
     -- An abandoned checkout leaves a pending row behind; it is noise, not a gift.
     and g.status <> 'pending';
$$;

-- ---------------------------------------------------------------------------
-- 6. Redemption
-- ---------------------------------------------------------------------------

create or replace function public.looplore_gift_redeem(
  p_user_id uuid,
  p_code text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := public.looplore_gift_normalize(p_code);
  v_row looplore_gifts%rowtype;
  v_fails integer;
  v_grant jsonb := null;
  v_base timestamptz;
  v_end timestamptz := null;
begin
  if v_code = '' or length(v_code) > 64 then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Same guessing throttle as promo codes, same table, same silence in the UI.
  delete from looplore_promo_attempts
   where user_id = p_user_id and created_at < now() - interval '1 hour';
  select count(*) into v_fails
    from looplore_promo_attempts
   where user_id = p_user_id and created_at >= now() - interval '1 hour';
  if v_fails >= 10 then
    return jsonb_build_object('ok', false, 'error', 'throttled');
  end if;

  -- Lock the row: two devices opening the same link cannot both win it.
  select * into v_row from looplore_gifts where code = v_code for update;
  -- A miss is NOT recorded here — the dispatcher tries promo codes next and
  -- logs one failed attempt for the pair, not one per table.
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_row.status = 'pending' then
    return jsonb_build_object('ok', false, 'error', 'not_paid');
  end if;
  if v_row.status = 'revoked' then
    return jsonb_build_object('ok', false, 'error', 'revoked');
  end if;
  if v_row.status = 'redeemed' then
    return jsonb_build_object('ok', false, 'error',
      case when v_row.redeemed_by = p_user_id then 'already_redeemed' else 'taken' end);
  end if;
  if v_row.expires_at is not null and v_row.expires_at <= now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;
  -- A gift is for someone else. See the header: this is what keeps a refund
  -- after redemption from being an arbitrage instead of a rare support case.
  if v_row.buyer_user_id is not null and v_row.buyer_user_id = p_user_id then
    return jsonb_build_object('ok', false, 'error', 'own_gift');
  end if;

  update looplore_gifts
     set status = 'redeemed', redeemed_by = p_user_id, redeemed_at = now()
   where code = v_code;

  -- Credit tiers: the ledger stays the only place a balance moves, and the
  -- idempotency key carries the code, so a replay cannot double-grant.
  if v_row.credits > 0 then
    v_grant := credits_grant(
      p_user_id,
      v_row.credits,
      'grant_gift',
      'gift:' || v_code,
      v_code,
      jsonb_build_object('code', v_code, 'tier', v_row.tier)
    );
    if coalesce((v_grant ->> 'ok')::boolean, false) is not true then
      raise exception 'gift grant failed for % / %', v_code, p_user_id;
    end if;
  end if;

  -- Subscription tier: one gift row per user (keyed gift:<user_id>), extended
  -- rather than duplicated. The new period starts where the recipient's
  -- existing access ends, so a gift on top of a paid plan is banked instead of
  -- burned in parallel, and two gifts simply stack.
  if v_row.sub_days > 0 then
    select max(current_period_end) into v_base
      from looplore_subscriptions
     where user_id = p_user_id
       and status in ('trialing', 'active');
    v_end := greatest(coalesce(v_base, now()), now()) + make_interval(days => v_row.sub_days);

    insert into looplore_subscriptions (
      provider_sub_id, user_id, plan, status, cancel_at_period_end,
      current_period_start, current_period_end, started_at, updated_at
    ) values (
      'gift:' || p_user_id::text, p_user_id, 'monthly', 'active', true,
      now(), v_end, now(), now()
    )
    on conflict (provider_sub_id) do update set
      status = 'active',
      cancel_at_period_end = true,
      current_period_end = excluded.current_period_end,
      updated_at = now();
  end if;

  return jsonb_build_object(
    'ok', true,
    'kind', 'gift',
    'tier', v_row.tier,
    'credits', v_row.credits,
    'sub_days', v_row.sub_days,
    'balance', (v_grant ->> 'balance')::integer,
    'access_until', v_end
  );
end;
$$;

-- One box, two kinds of code. The visitor has "a code" and should not have to
-- know which rail issued it, so credits-promo calls this and it dispatches.
-- credits_redeem_promo is untouched — including its failed-attempt bookkeeping,
-- which is what throttles a guesser when NEITHER table knows the code.
create or replace function public.credits_redeem_code(
  p_user_id uuid,
  p_code text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := public.looplore_gift_normalize(p_code);
begin
  if exists (select 1 from looplore_gifts where code = v_code) then
    return public.looplore_gift_redeem(p_user_id, p_code);
  end if;
  return public.credits_redeem_promo(p_user_id, p_code)
         || jsonb_build_object('kind', 'promo');
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Entitlement: tell a gifted month apart from a paid plan
-- ---------------------------------------------------------------------------

-- Body identical to 20260807120000 except for the two additions marked below:
--   * a paid subscription OUTRANKS a gift row when both are live, so a
--     subscriber who is given a month keeps seeing their own plan (and their
--     portal link) while the gift waits its turn;
--   * `gift` / `gift_until` so /account/ can say "a gift, until the 12th, no
--     renewal" instead of offering a Polar portal that has no customer in it.
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
  v_gift_until timestamptz;
begin
  select provider_sub_id, plan, status, cancel_at_period_end,
         trial_ends_at, current_period_start, current_period_end
    into v_sub
    from looplore_subscriptions
   where user_id = p_user_id
     and status in ('trialing', 'active')
     and (current_period_end is null
          or now() <= current_period_end + interval '3 days')
   order by (provider_sub_id like 'gift:%'), current_period_end desc nulls last
   limit 1;

  if not found then
    return jsonb_build_object('active', false);
  end if;

  select max(current_period_end) into v_gift_until
    from looplore_subscriptions
   where user_id = p_user_id
     and status in ('trialing', 'active')
     and provider_sub_id like 'gift:%'
     and current_period_end > now();

  -- Rolling 30-day window (see 20260807120000). Counts only included_* rows:
  -- paid credit spends never eat into subscription quotas.
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
    'gift', v_sub.provider_sub_id like 'gift:%',
    'gift_until', v_gift_until,
    'photos_used', coalesce(v_photos, 0),
    'questions_used', coalesce(v_questions, 0)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Author's console
-- ---------------------------------------------------------------------------

-- select * from looplore_gift_stats;
create or replace view public.looplore_gift_stats
with (security_invoker = true) as
  select g.code,
         g.tier,
         g.status,
         g.credits,
         g.sub_days,
         g.amount_usd,
         g.buyer_email,
         g.refunded_after_redeem,
         g.created_at,
         g.paid_at,
         g.redeemed_at,
         g.expires_at
    from looplore_gifts g
   order by g.created_at desc;

-- ---------------------------------------------------------------------------
-- 9. Execution grants
-- ---------------------------------------------------------------------------

revoke all on function public.looplore_gift_mint(text, text, integer, integer, numeric, uuid, text, text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.looplore_gift_activate(text, text, integer, integer, text, numeric, uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.looplore_gift_revoke(text) from public, anon, authenticated;
revoke all on function public.looplore_gift_redeem(uuid, text) from public, anon, authenticated;
revoke all on function public.credits_redeem_code(uuid, text) from public, anon, authenticated;
revoke all on function public.looplore_active_sub(uuid) from public, anon, authenticated;

grant execute on function public.looplore_gift_mint(text, text, integer, integer, numeric, uuid, text, text, text, text, text) to service_role;
grant execute on function public.looplore_gift_activate(text, text, integer, integer, text, numeric, uuid, text, integer) to service_role;
grant execute on function public.looplore_gift_revoke(text) to service_role;
grant execute on function public.looplore_gift_redeem(uuid, text) to service_role;
grant execute on function public.credits_redeem_code(uuid, text) to service_role;
grant execute on function public.looplore_active_sub(uuid) to service_role;

-- The claim page reads a gift before anyone has signed in; the buyer's list is
-- keyed by auth.uid() and can only ever return their own rows.
grant execute on function public.looplore_gift_public(text) to anon, authenticated;
grant execute on function public.looplore_my_gifts() to authenticated;
