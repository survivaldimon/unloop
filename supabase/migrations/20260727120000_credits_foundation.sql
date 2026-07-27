-- Credit economy foundation (docs/credits-economy.md).
-- First migration kept in VCS for this project: earlier schema (unloop_sessions,
-- photoread_sessions, their RPCs, Vault helpers) lives only in the Supabase
-- project. Apply to prod ONLY with the founder's explicit go.
--
-- Money/credit invariants:
--   * looplore_credit_ledger is append-only; every balance change is one row with a
--     UNIQUE idempotency_key — webhook retries and generation retries are free.
--   * looplore_credit_accounts.balance is a cache maintained in the same transaction
--     as the ledger insert (row-locked), never written anywhere else.
--   * Spends never overdraw; only refund/adjust may push a balance negative.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.looplore_credit_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0,
  -- Personal paywall-offer window: set once at the first paywall view; buying
  -- before (offer_started_at + 15 min) earns the +25% pack bonus. Checked
  -- server-side by credits-polar-checkout; see OFFER_* in credits-config.ts.
  offer_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.looplore_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null,
  kind text not null check (kind in (
    'purchase', 'bonus_timer',
    'grant_signup', 'grant_daily', 'grant_streak',
    'spend_report', 'spend_photo', 'spend_question', 'spend_insight',
    'refund', 'adjust'
  )),
  ref text,
  idempotency_key text not null unique,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists looplore_credit_ledger_user_idx
  on public.looplore_credit_ledger (user_id, created_at desc);

create table if not exists public.looplore_chat_messages (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  funnel text not null check (funnel in ('quiz', 'photoread')),
  user_id uuid references auth.users (id) on delete set null,
  question text not null,
  answer text not null,
  credits integer not null,
  created_at timestamptz not null default now()
);

create index if not exists looplore_chat_messages_session_idx
  on public.looplore_chat_messages (session_id, id);

-- Daily insight cache (stage D — table laid down now so the schema is final).
create table if not exists public.looplore_daily_insights (
  user_id uuid not null references auth.users (id) on delete cascade,
  insight_date date not null,
  text text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, insight_date)
);

-- Funnel sessions gain an owner. Possession of the session UUID stays the
-- capability for reading content; the user_id is who pays for generation.
alter table public.unloop_sessions
  add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.photoread_sessions
  add column if not exists user_id uuid references auth.users (id) on delete set null;

-- Locked down: no policies on purpose — only service_role and the
-- security-definer RPCs below ever touch these tables.
alter table public.looplore_credit_accounts enable row level security;
alter table public.looplore_credit_ledger enable row level security;
alter table public.looplore_chat_messages enable row level security;
alter table public.looplore_daily_insights enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Ledger RPCs (service_role only)
-- ---------------------------------------------------------------------------

create or replace function public.credits_grant(
  p_user_id uuid,
  p_amount integer,
  p_kind text,
  p_key text,
  p_ref text default null,
  p_meta jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  insert into looplore_credit_accounts (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  begin
    insert into looplore_credit_ledger (user_id, delta, kind, ref, idempotency_key, meta)
    values (p_user_id, p_amount, p_kind, p_ref, p_key, p_meta);
  exception when unique_violation then
    select balance into v_balance from looplore_credit_accounts where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'duplicate', true, 'balance', coalesce(v_balance, 0));
  end;
  update looplore_credit_accounts
     set balance = balance + p_amount, updated_at = now()
   where user_id = p_user_id
  returning balance into v_balance;
  return jsonb_build_object('ok', true, 'duplicate', false, 'balance', v_balance);
end;
$$;

create or replace function public.credits_spend(
  p_user_id uuid,
  p_amount integer,
  p_kind text,
  p_key text,
  p_ref text default null,
  p_meta jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount <= 0 then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  -- Fast path: this exact spend already landed — retries are free.
  if exists (select 1 from looplore_credit_ledger where idempotency_key = p_key) then
    select balance into v_balance from looplore_credit_accounts where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'duplicate', true, 'balance', coalesce(v_balance, 0));
  end if;
  insert into looplore_credit_accounts (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  select balance into v_balance
    from looplore_credit_accounts where user_id = p_user_id
    for update;
  if v_balance < p_amount then
    return jsonb_build_object('ok', false, 'error', 'insufficient', 'balance', v_balance);
  end if;
  begin
    insert into looplore_credit_ledger (user_id, delta, kind, ref, idempotency_key, meta)
    values (p_user_id, -p_amount, p_kind, p_ref, p_key, p_meta);
  exception when unique_violation then
    -- Lost a race against an identical spend that committed while we waited.
    return jsonb_build_object('ok', true, 'duplicate', true, 'balance', v_balance);
  end;
  update looplore_credit_accounts
     set balance = balance - p_amount, updated_at = now()
   where user_id = p_user_id
  returning balance into v_balance;
  return jsonb_build_object('ok', true, 'duplicate', false, 'balance', v_balance);
end;
$$;

-- Refunds / manual corrections. The only path that may push a balance negative
-- (refund of a partially spent pack) — spends are then blocked until top-up.
create or replace function public.credits_adjust(
  p_user_id uuid,
  p_delta integer,
  p_kind text,
  p_key text,
  p_ref text default null,
  p_meta jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_kind not in ('refund', 'adjust') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;
  insert into looplore_credit_accounts (user_id) values (p_user_id)
    on conflict (user_id) do nothing;
  begin
    insert into looplore_credit_ledger (user_id, delta, kind, ref, idempotency_key, meta)
    values (p_user_id, p_delta, p_kind, p_ref, p_key, p_meta);
  exception when unique_violation then
    select balance into v_balance from looplore_credit_accounts where user_id = p_user_id;
    return jsonb_build_object('ok', true, 'duplicate', true, 'balance', coalesce(v_balance, 0));
  end;
  update looplore_credit_accounts
     set balance = balance + p_delta, updated_at = now()
   where user_id = p_user_id
  returning balance into v_balance;
  return jsonb_build_object('ok', true, 'duplicate', false, 'balance', v_balance);
end;
$$;

-- Webhook fallback: attach a purchase to an account by the Polar order email.
create or replace function public.credits_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- ---------------------------------------------------------------------------
-- 3. Client RPCs
-- ---------------------------------------------------------------------------

create or replace function public.credits_my_balance()
returns integer
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (select balance from looplore_credit_accounts where user_id = auth.uid()),
    0
  );
$$;

-- First paywall view starts the personal offer window; later calls return the
-- same deadline. Interval mirrors OFFER_WINDOW_MINUTES in credits-config.ts.
create or replace function public.credits_touch_offer()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_started timestamptz;
begin
  if auth.uid() is null then
    return null;
  end if;
  insert into looplore_credit_accounts (user_id, offer_started_at)
  values (auth.uid(), now())
  on conflict (user_id) do update
    set offer_started_at = coalesce(looplore_credit_accounts.offer_started_at, excluded.offer_started_at),
        updated_at = now()
  returning offer_started_at into v_started;
  return v_started + interval '15 minutes';
end;
$$;

-- Claim a funnel session for the signed-in user. Possession of the session
-- UUID is the capability; an already-claimed session can't be stolen.
create or replace function public.unloop_link_user(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  update unloop_sessions
     set user_id = auth.uid(), updated_at = now()
   where id = p_session_id
     and (user_id is null or user_id = auth.uid());
  return found;
end;
$$;

create or replace function public.photoread_link_user(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  update photoread_sessions
     set user_id = auth.uid(), updated_at = now()
   where id = p_session_id
     and (user_id is null or user_id = auth.uid());
  return found;
end;
$$;

-- Post-checkout polling + paywall state, keyed by session UUID (same
-- capability model as unloop_get_paid_status). "spent" means the report
-- generation for this session was already paid from a balance.
create or replace function public.credits_session_state(
  p_session_id uuid,
  p_funnel text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
  v_paid timestamptz;
  v_balance integer;
begin
  if p_funnel = 'photoread' then
    select user_id, paid_at into v_user, v_paid
      from photoread_sessions where id = p_session_id;
  else
    select user_id, paid_at into v_user, v_paid
      from unloop_sessions where id = p_session_id;
  end if;
  if not found then
    return jsonb_build_object('exists', false);
  end if;
  if v_user is not null then
    select balance into v_balance from looplore_credit_accounts where user_id = v_user;
  end if;
  return jsonb_build_object(
    'exists', true,
    'legacy_paid', v_paid is not null,
    'linked', v_user is not null,
    'spent', exists (
      select 1 from looplore_credit_ledger
       where idempotency_key = 'report:' || p_session_id::text
    ),
    'balance', coalesce(v_balance, 0)
  );
end;
$$;

-- Chat history for a session (capability = session UUID), oldest first.
create or replace function public.looplore_chat_history(p_session_id uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object('q', t.question, 'a', t.answer, 'at', t.created_at) order by t.id),
    '[]'::jsonb
  )
  from (
    select id, question, answer, created_at
      from looplore_chat_messages
     where session_id = p_session_id
     order by id desc
     limit 30
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- 4. Execution grants
-- ---------------------------------------------------------------------------

revoke all on function public.credits_grant(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.credits_spend(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.credits_adjust(uuid, integer, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.credits_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.credits_grant(uuid, integer, text, text, text, jsonb) to service_role;
grant execute on function public.credits_spend(uuid, integer, text, text, text, jsonb) to service_role;
grant execute on function public.credits_adjust(uuid, integer, text, text, text, jsonb) to service_role;
grant execute on function public.credits_user_id_by_email(text) to service_role;

grant execute on function public.credits_my_balance() to authenticated;
grant execute on function public.credits_touch_offer() to authenticated;
grant execute on function public.unloop_link_user(uuid) to authenticated;
grant execute on function public.photoread_link_user(uuid) to authenticated;
grant execute on function public.credits_session_state(uuid, text) to anon, authenticated;
grant execute on function public.looplore_chat_history(uuid) to anon, authenticated;
