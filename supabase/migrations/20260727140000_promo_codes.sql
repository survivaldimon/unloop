-- Promo codes that pay out in credits (docs/credits-economy.md §5).
-- A code is a grant with conditions attached: it never touches money, so Polar
-- discounts stay the tool for cutting a pack's price. Apply to prod ONLY with
-- the founder's explicit go.
--
-- Invariants:
--   * One redemption per account per code, enforced by the redemptions PK —
--     the ledger's own key (promo:<code>:<user>) is the second line of defence.
--   * A code's budget (max_redemptions) is spent under a row lock, so two
--     simultaneous redemptions of the last slot cannot both win.
--   * Redeeming is idempotent: the same account replaying the same code gets
--     the already_redeemed answer, never a second grant.

-- Promo grants are ledger entries like any other; the kind list has to know it.
alter table public.looplore_credit_ledger
  drop constraint if exists looplore_credit_ledger_kind_check;
alter table public.looplore_credit_ledger
  add constraint looplore_credit_ledger_kind_check check (kind in (
    'purchase', 'bonus_timer',
    'grant_signup', 'grant_daily', 'grant_streak', 'grant_promo',
    'spend_report', 'spend_photo', 'spend_question', 'spend_insight',
    'refund', 'adjust'
  ));

create table if not exists public.looplore_promo_codes (
  -- Stored and compared upper-cased: codes are typed by humans, often on phones.
  code text primary key,
  credits integer not null check (credits > 0),
  -- null = unlimited. Leave it null only for codes that are never published.
  max_redemptions integer check (max_redemptions is null or max_redemptions > 0),
  redeemed_count integer not null default 0,
  expires_at timestamptz,
  -- Kill switch: flipping this to false stops a leaked code instantly.
  active boolean not null default true,
  -- What this code is for ("testing", "blogger X") — shows up in the stats view.
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.looplore_promo_redemptions (
  code text not null references public.looplore_promo_codes (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  credits integer not null,
  created_at timestamptz not null default now(),
  primary key (code, user_id)
);

-- Failed attempts, kept only to throttle guessing. Rows older than the window
-- are dead weight; the redeem RPC prunes them as it goes.
create table if not exists public.looplore_promo_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now()
);

create index if not exists looplore_promo_attempts_user_idx
  on public.looplore_promo_attempts (user_id, created_at desc);

-- Locked down like the rest of the credit tables: service_role and the
-- security-definer RPCs below are the only ways in.
alter table public.looplore_promo_codes enable row level security;
alter table public.looplore_promo_redemptions enable row level security;
alter table public.looplore_promo_attempts enable row level security;

-- ---------------------------------------------------------------------------
-- Redemption (service_role only — called by the credits-promo edge function)
-- ---------------------------------------------------------------------------

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

  return jsonb_build_object(
    'ok', true,
    'credits', v_row.credits,
    'balance', (v_grant ->> 'balance')::integer
  );
end;
$$;

revoke all on function public.credits_redeem_promo(uuid, text) from public, anon, authenticated;
grant execute on function public.credits_redeem_promo(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- Author's console: create a code and read how it is doing, from the SQL editor
-- ---------------------------------------------------------------------------

-- select credits_promo_create('TEST1000', 1000, 5, '7 days', 'launch testing');
create or replace function public.credits_promo_create(
  p_code text,
  p_credits integer,
  p_max_redemptions integer default null,
  p_valid_for interval default null,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(btrim(p_code));
  v_expires timestamptz := case when p_valid_for is null then null else now() + p_valid_for end;
begin
  insert into looplore_promo_codes (code, credits, max_redemptions, expires_at, note)
  values (v_code, p_credits, p_max_redemptions, v_expires, p_note)
  on conflict (code) do update
    set credits = excluded.credits,
        max_redemptions = excluded.max_redemptions,
        expires_at = excluded.expires_at,
        note = excluded.note,
        active = true;
  return jsonb_build_object('ok', true, 'code', v_code, 'credits', p_credits, 'expires_at', v_expires);
end;
$$;

revoke all on function public.credits_promo_create(text, integer, integer, interval, text)
  from public, anon, authenticated;

-- select * from looplore_promo_stats;
create or replace view public.looplore_promo_stats
with (security_invoker = true) as
  select c.code,
         c.credits,
         c.redeemed_count,
         c.max_redemptions,
         c.expires_at,
         c.active,
         c.note,
         (select max(r.created_at) from looplore_promo_redemptions r where r.code = c.code)
           as last_redeemed_at
    from looplore_promo_codes c
   order by c.created_at desc;
