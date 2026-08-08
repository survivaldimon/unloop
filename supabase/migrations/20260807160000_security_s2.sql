-- Security session S2 — medium findings of docs/audit-2026-08-07.md §2.2/§2.3.
-- Apply to prod ONLY with the founder's explicit go.
--
-- Four independent fixes, all server-side:
--   1. Client IP is read from the RIGHT end of X-Forwarded-For, and an IP we
--      cannot identify no longer means "no limit at all".
--   2. Polar webhook deliveries are claimed by webhook-id before processing, so
--      a captured request replayed inside the signature's ±300s window is a
--      no-op instead of a second execution.
--   3. Subscription upserts carry the EVENT's timestamp and refuse to move the
--      row backwards, so a delayed subscription.updated:active can no longer
--      resurrect a subscription that was already canceled.
--   4. Subscription quota is checked under the same lock that records the
--      consumption, closing the read-then-insert race in canInclude.
--
-- Does not touch: credits_spend atomicity, ledger idempotency, the fail-closed
-- entitlement path, or webhook signature verification (audit §2.4).

-- ---------------------------------------------------------------------------
-- 1. Reading the caller's IP
-- ---------------------------------------------------------------------------

-- X-Forwarded-For grows LEFT to RIGHT: each proxy appends the peer it received
-- the connection from. The leftmost entry is therefore whatever the CLIENT put
-- in the header, which is why split_part(…, ',', 1) let anyone pick their own
-- throttle bucket by sending a random value. The rightmost entries are the ones
-- written by infrastructure.
--
-- Returning the rightmost PUBLIC address stays correct whatever number of
-- internal hops sit in front of us, and a client that prepends a public address
-- of its own cannot move the boundary: the forgery lands to the LEFT of the
-- entry the gateway appended. Mirrors clientIp() in
-- supabase/functions/_shared/client-ip.ts — keep the two in sync.
create or replace function public.looplore_client_ip(p_forwarded_for text)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_parts text[];
  v_raw text;
  v_ip text;
  v_inet inet;
  v_parsed boolean;
  i integer;
begin
  if p_forwarded_for is null or btrim(p_forwarded_for) = '' then
    return null;
  end if;

  v_parts := string_to_array(p_forwarded_for, ',');
  for i in reverse coalesce(array_length(v_parts, 1), 0) .. 1 loop
    v_raw := btrim(v_parts[i]);
    continue when v_raw = '';

    -- "[2001:db8::1]:443" → "2001:db8::1"; "203.0.113.7:9000" → "203.0.113.7".
    -- A bare IPv6 is full of colons, so only a single colon means host:port.
    if left(v_raw, 1) = '[' then
      v_ip := split_part(substring(v_raw from 2), ']', 1);
    elsif length(v_raw) - length(replace(v_raw, ':', '')) = 1 then
      v_ip := split_part(v_raw, ':', 1);
    else
      v_ip := v_raw;
    end if;

    -- Postgres keeps ::ffff:10.0.0.1 in the IPv6 family, where <<= against an
    -- IPv4 network is silently false — the mapped form would sail straight
    -- through the private check below. Unwrap it to the v4 it actually is, so
    -- both notations also land in the SAME throttle bucket.
    if v_ip ~* '^::ffff:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$' then
      v_ip := substring(v_ip from 8);
    end if;

    -- Proxies put all sorts of things in this header ("unknown", hostnames,
    -- obfuscated tokens); none of them may become a throttle key. The flag
    -- keeps the jump out of the exception handler, which plpgsql is fussy about.
    v_parsed := true;
    begin
      v_inet := v_ip::inet;
    exception when others then
      v_parsed := false;
    end;
    continue when not v_parsed;

    -- Private, loopback, link-local, CGNAT and "this network" are our own
    -- infrastructure's hops, not a visitor. Cross-family <<= is simply false.
    if not (v_inet <<= inet '10.0.0.0/8'
         or v_inet <<= inet '172.16.0.0/12'
         or v_inet <<= inet '192.168.0.0/16'
         or v_inet <<= inet '127.0.0.0/8'
         or v_inet <<= inet '169.254.0.0/16'
         or v_inet <<= inet '100.64.0.0/10'
         or v_inet <<= inet '0.0.0.0/8'
         or v_inet <<= inet '::1/128'
         or v_inet <<= inet 'fc00::/7'
         or v_inet <<= inet 'fe80::/10') then
      return host(v_inet);
    end if;
  end loop;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Throttles: an unidentifiable caller shares one bucket, not a free pass
-- ---------------------------------------------------------------------------

-- Both throttles used to `return true` whenever the IP was empty, so stripping
-- the header was a complete bypass. Unknown callers now land in a single shared
-- bucket: a real visitor behind a stripped header still gets in (the ceiling is
-- wider), while a script that strips it on purpose is capped.
--
-- Signature changes, so the old overload has to go or one-argument calls become
-- ambiguous.
drop function if exists public.credits_auth_throttle(text, integer, interval);

create or replace function public.credits_auth_throttle(
  p_ip text,
  p_limit integer default 10,
  p_window interval default interval '1 hour',
  p_unknown_limit integer default 60
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_limit integer;
  v_count integer;
begin
  if p_ip is null or btrim(p_ip) = '' then
    v_key := '-unknown-';
    v_limit := greatest(p_limit, p_unknown_limit);
  else
    v_key := btrim(p_ip);
    v_limit := p_limit;
  end if;

  -- Prune just this bucket's expired rows — indexed, and bounded by the ceiling.
  delete from looplore_auth_attempts
   where ip = v_key and created_at < now() - p_window;

  select count(*) into v_count
    from looplore_auth_attempts
   where ip = v_key and created_at >= now() - p_window;

  if v_count >= v_limit then
    return false;
  end if;

  insert into looplore_auth_attempts (ip) values (v_key);
  return true;
end;
$$;

revoke all on function public.credits_auth_throttle(text, integer, interval, integer)
  from public, anon, authenticated;
grant execute on function public.credits_auth_throttle(text, integer, interval, integer)
  to service_role;

drop function if exists public.looplore_test_session_throttle(text, integer, interval);

create or replace function public.looplore_test_session_throttle(
  p_ip text,
  p_limit integer default 60,
  p_window interval default interval '1 hour',
  p_unknown_limit integer default 300
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_limit integer;
  v_count integer;
begin
  if p_ip is null or btrim(p_ip) = '' then
    v_key := '-unknown-';
    v_limit := greatest(p_limit, p_unknown_limit);
  else
    v_key := btrim(p_ip);
    v_limit := p_limit;
  end if;

  delete from looplore_test_attempts
   where ip = v_key and created_at < now() - p_window;

  select count(*) into v_count
    from looplore_test_attempts
   where ip = v_key and created_at >= now() - p_window;

  if v_count >= v_limit then
    return false;
  end if;

  insert into looplore_test_attempts (ip) values (v_key);
  return true;
end;
$$;

-- Internal: only the security-definer save path calls this, never a client.
revoke all on function public.looplore_test_session_throttle(text, integer, interval, integer)
  from public, anon, authenticated;

-- Same body as 20260728160000, with the IP read through looplore_client_ip.
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
        v_ip := looplore_client_ip(v_headers::jsonb ->> 'x-forwarded-for');
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

grant execute on function public.looplore_test_session_save(uuid, text, text, jsonb)
  to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Webhook replay protection
-- ---------------------------------------------------------------------------

-- The Standard Webhooks signature covers `id.timestamp.body` and is accepted
-- inside a ±300s window, so a captured delivery replayed within five minutes
-- verifies perfectly. Money is already protected by ledger idempotency keys;
-- entitlement was not — a replayed subscription.updated:active reinstated a
-- canceled subscription. Claiming the webhook-id before processing closes it.
create table if not exists public.looplore_webhook_events (
  webhook_id text primary key,
  received_at timestamptz not null default now()
);

create index if not exists looplore_webhook_events_received_idx
  on public.looplore_webhook_events (received_at);

alter table public.looplore_webhook_events enable row level security;

/**
 * True when this delivery is ours to process; false when it is a replay.
 *
 * A claim expires after p_stale, which is deliberately set just ABOVE the
 * signature's ±300s tolerance. That single choice covers both directions:
 *
 *   replay  — a captured request can only verify while it is under 300s old,
 *             so every replay that gets this far is still inside a live claim.
 *   crash   — a function that died mid-delivery parks its claim for p_stale and
 *             no longer, after which the provider's retry picks it up. Losing a
 *             real event is the worse failure, so the claim always expires.
 *
 * The common failure path does not wait: the webhook releases its claim
 * explicitly through looplore_webhook_release.
 */
create or replace function public.looplore_webhook_claim(
  p_webhook_id text,
  p_stale interval default interval '6 minutes'
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claimed boolean;
begin
  -- No id to dedupe on. The signature already passed, so process it rather
  -- than drop a real event: replay protection is best-effort, delivery is not.
  if p_webhook_id is null or btrim(p_webhook_id) = '' then
    return true;
  end if;

  delete from looplore_webhook_events where received_at < now() - interval '7 days';

  insert into looplore_webhook_events (webhook_id)
  values (btrim(p_webhook_id))
  on conflict (webhook_id) do update
     set received_at = now()
   where looplore_webhook_events.received_at < now() - p_stale
  returning true into v_claimed;

  return coalesce(v_claimed, false);
end;
$$;

/** Hand a claim back after a failed delivery so the retry runs immediately. */
create or replace function public.looplore_webhook_release(p_webhook_id text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from looplore_webhook_events
   where p_webhook_id is not null and webhook_id = btrim(p_webhook_id);
$$;

revoke all on function public.looplore_webhook_claim(text, interval)
  from public, anon, authenticated;
revoke all on function public.looplore_webhook_release(text)
  from public, anon, authenticated;
grant execute on function public.looplore_webhook_claim(text, interval) to service_role;
grant execute on function public.looplore_webhook_release(text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Subscription upsert that cannot move backwards
-- ---------------------------------------------------------------------------

/**
 * Replaces the webhook's plain last-write-wins upsert.
 *
 * `updated_at` now carries the EVENT's own timestamp (Polar's modified_at), not
 * the moment we happened to process it, and the row only moves forward. Without
 * this a subscription.updated:active that was delayed behind a
 * subscription.canceled — or replayed — reinstated a canceled subscription and
 * looplore_active_sub started answering `active` again.
 *
 * Returns applied=false for a stale event: nothing to retry, so the webhook
 * acknowledges it.
 */
create or replace function public.looplore_subscription_upsert(
  p_provider_sub_id text,
  p_user_id uuid,
  p_product_id text,
  p_plan text,
  p_status text,
  p_cancel_at_period_end boolean,
  p_trial_ends_at timestamptz,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_started_at timestamptz,
  p_ended_at timestamptz,
  p_event_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_applied boolean;
begin
  if p_provider_sub_id is null or btrim(p_provider_sub_id) = ''
     or p_user_id is null or p_status is null then
    return jsonb_build_object('ok', false, 'error', 'bad_request');
  end if;

  insert into looplore_subscriptions (
    provider_sub_id, user_id, product_id, plan, status, cancel_at_period_end,
    trial_ends_at, current_period_start, current_period_end,
    started_at, ended_at, updated_at
  ) values (
    btrim(p_provider_sub_id), p_user_id, p_product_id,
    case when p_plan = 'yearly' then 'yearly' else 'monthly' end,
    p_status, coalesce(p_cancel_at_period_end, false),
    p_trial_ends_at, p_current_period_start, p_current_period_end,
    p_started_at, p_ended_at, coalesce(p_event_at, now())
  )
  on conflict (provider_sub_id) do update set
    user_id = excluded.user_id,
    product_id = excluded.product_id,
    plan = excluded.plan,
    status = excluded.status,
    cancel_at_period_end = excluded.cancel_at_period_end,
    trial_ends_at = excluded.trial_ends_at,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    started_at = excluded.started_at,
    ended_at = excluded.ended_at,
    updated_at = excluded.updated_at
  where excluded.updated_at > looplore_subscriptions.updated_at
  returning true into v_applied;

  return jsonb_build_object('ok', true, 'applied', coalesce(v_applied, false));
end;
$$;

revoke all on function public.looplore_subscription_upsert(
  text, uuid, text, text, text, boolean, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.looplore_subscription_upsert(
  text, uuid, text, text, text, boolean, timestamptz, timestamptz, timestamptz,
  timestamptz, timestamptz, timestamptz
) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Subscription quota, checked atomically
-- ---------------------------------------------------------------------------

-- canInclude() read photos_used/questions_used and includedSpend() inserted
-- afterwards, so two concurrent requests could both pass the check and both
-- consume. The ceiling now lives inside the same transaction as the row that
-- consumes it. Signature changes → drop the old overload.
drop function if exists public.credits_included(uuid, text, text, text, jsonb);

create or replace function public.credits_included(
  p_user_id uuid,
  p_kind text,
  p_key text,
  p_ref text default null,
  p_meta jsonb default null,
  -- NULL = unlimited (reports, portrait). Limits live in credits-config.ts,
  -- single source of truth for prices and quotas alike.
  p_quota integer default null,
  p_window interval default interval '30 days'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_kind not like 'included\_%' escape '\' then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;

  -- Free retry, checked BEFORE the quota: re-delivery of a consumption that
  -- already landed must not start reading as over-quota once the window fills
  -- up behind it.
  if exists (select 1 from looplore_credit_ledger where idempotency_key = p_key) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if p_quota is not null then
    -- One lock covers the count and the insert. Same account row credits_spend
    -- takes, so an included consumption and a paid spend cannot interleave.
    insert into looplore_credit_accounts (user_id) values (p_user_id)
      on conflict (user_id) do nothing;
    perform 1 from looplore_credit_accounts where user_id = p_user_id for update;

    select count(*) into v_used
      from looplore_credit_ledger
     where user_id = p_user_id
       and kind = p_kind
       and created_at >= now() - p_window;

    if coalesce(v_used, 0) >= p_quota then
      -- Caller falls back to the normal credit price — no hard wall.
      return jsonb_build_object('ok', false, 'error', 'over_quota', 'used', v_used);
    end if;
  end if;

  begin
    insert into looplore_credit_ledger (user_id, delta, kind, ref, idempotency_key, meta)
    values (p_user_id, 0, p_kind, p_ref, p_key, p_meta);
  exception when unique_violation then
    -- Lost a race against an identical consumption that committed while we waited.
    return jsonb_build_object('ok', true, 'duplicate', true);
  end;
  return jsonb_build_object('ok', true, 'duplicate', false);
end;
$$;

revoke all on function public.credits_included(uuid, text, text, text, jsonb, integer, interval)
  from public, anon, authenticated;
grant execute on function public.credits_included(uuid, text, text, text, jsonb, integer, interval)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Post-purchase session minting (docs/credits-economy.md §7)
-- ---------------------------------------------------------------------------

-- credits-auth no longer hands a session to an unverified new email (that was
-- account pre-hijacking: whoever named the address first owned it). A completed
-- payment is the ownership proof that replaces the magic-link click for the one
-- case where waiting for an inbox would break delivery — the buyer who has to
-- see what they just bought.
--
-- The proof is the Polar checkout id: server-generated, high-entropy, and held
-- only by the browser that opened the checkout. Rows here are written by the
-- SIGNED webhook once the money is real, for BOTH credit packs and Looplore+
-- orders (a first-time subscriber creates no ledger row, so the ledger alone
-- would have left them stranded on the polling screen).
create table if not exists public.looplore_checkout_claims (
  checkout_id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists looplore_checkout_claims_created_idx
  on public.looplore_checkout_claims (created_at);

alter table public.looplore_checkout_claims enable row level security;

/**
 * Who paid with this checkout, if it was recent enough to still prove anything.
 * Service-role only: it is read by credits-auth, never by a client.
 */
create or replace function public.looplore_checkout_owner(
  p_checkout_id text,
  p_window interval default interval '30 minutes'
) returns uuid
language sql
security definer
set search_path = public
as $$
  select user_id from looplore_checkout_claims
   where p_checkout_id is not null
     and checkout_id = btrim(p_checkout_id)
     and created_at >= now() - p_window
   limit 1;
$$;

revoke all on function public.looplore_checkout_owner(text, interval)
  from public, anon, authenticated;
grant execute on function public.looplore_checkout_owner(text, interval) to service_role;
