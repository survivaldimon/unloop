-- S3 (аудит 07.08.2026 §3.3): шесть RPC двух старых воронок жили ТОЛЬКО в
-- проде — их не было в VCS, поэтому ни ревью, ни истории у них не было. Это и
-- есть корень находки про почтовый релей (§2.1): никто не видел, что
-- `unloop_save_session` пишет email на чужую сессию без единой проверки.
-- Определения ниже сняты с прода 07.08.2026 (`pg_get_functiondef`) ДОСЛОВНО,
-- переписаны только в стиль репо; применение — no-op (`create or replace`
-- поверх идентичного тела).
-- Apply to prod ONLY with the founder's explicit go.
--
-- РЕВЬЮ (что видно, когда определения наконец в репо):
--
-- 1. `unloop_save_session` / `photoread_save_session` пишут в сессию по голому
--    UUID БЕЗ проверки владельца — в отличие от писчего пути тестов
--    (`looplore_test_session_save`, ветка 'owned'). Следствия:
--      · любой обладатель UUID может переписать `email` на клеймленной чужой
--        сессии — та самая заготовка почтового релея (S1);
--      · и затереть чужие `answers`/`stage`.
--    Паритетный гейт («сессия с `user_id` пишется только своим JWT») —
--    правильный фикс, но он меняет поведение живой воронки и стыкуется с
--    переделкой `unloop-send-result`, поэтому НАМЕРЕННО оставлен S1, а не
--    сделан здесь: эта миграция только фиксирует статус-кво в VCS.
--    Ограничители размера в них уже есть и работают.
--
-- 2. `unloop_get_secret` — читалка Vault. `EXECUTE` отозван у anon/authenticated
--    (в проде ACL = postgres + service_role), `search_path = ''`. Это ключевой
--    факт безопасности всего проекта, и он не был записан нигде в репо —
--    теперь записан.
--
-- 3. `*_get_paid_status` / `photoread_get_session` отдают по UUID только факт
--    оплаты и бесплатный тизер — сужать нечего.
--    Ответы квиза (`unloop_get_session`) сужены отдельной миграцией
--    20260808140000_session_read_privacy.sql.

-- ---------------------------------------------------------------------------
-- 1. Запись сессий воронок (anon по UUID)
-- ---------------------------------------------------------------------------

create or replace function public.unloop_save_session(
  p_id uuid,
  p_answers jsonb default null,
  p_pattern text default null,
  p_anx integer default null,
  p_avo integer default null,
  p_raw_scores jsonb default null,
  p_email text default null,
  p_stage text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null then
    raise exception 'session id required';
  end if;
  if length(coalesce(p_pattern, '')) > 40
     or length(coalesce(p_stage, '')) > 40
     or length(coalesce(p_email, '')) > 320
     or pg_column_size(p_answers) > 50000
     or pg_column_size(p_raw_scores) > 20000 then
    raise exception 'invalid input';
  end if;

  insert into public.unloop_sessions as s
    (id, answers, pattern, anx, avo, raw_scores, email, stage, updated_at)
  values
    (p_id, p_answers, p_pattern, p_anx, p_avo, p_raw_scores, nullif(p_email, ''), p_stage, now())
  on conflict (id) do update set
    answers    = coalesce(excluded.answers, s.answers),
    pattern    = coalesce(excluded.pattern, s.pattern),
    anx        = coalesce(excluded.anx, s.anx),
    avo        = coalesce(excluded.avo, s.avo),
    raw_scores = coalesce(excluded.raw_scores, s.raw_scores),
    email      = coalesce(excluded.email, s.email),
    stage      = coalesce(excluded.stage, s.stage),
    updated_at = now();
end;
$$;

create or replace function public.photoread_save_session(
  p_id uuid,
  p_context jsonb default null,
  p_email text default null,
  p_stage text default null,
  p_lang text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_id is null then
    raise exception 'session id required';
  end if;
  if length(coalesce(p_stage, '')) > 40
     or length(coalesce(p_email, '')) > 320
     or length(coalesce(p_lang, '')) > 5
     or pg_column_size(p_context) > 10000 then
    raise exception 'invalid input';
  end if;

  insert into public.photoread_sessions as s (id, context, email, stage, lang, updated_at)
  values (p_id, p_context, nullif(p_email, ''), coalesce(p_stage, 'created'), coalesce(p_lang, 'en'), now())
  on conflict (id) do update set
    context    = coalesce(excluded.context, s.context),
    email      = coalesce(excluded.email, s.email),
    stage      = coalesce(excluded.stage, s.stage),
    lang       = coalesce(nullif(excluded.lang, ''), s.lang),
    updated_at = now();
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Чтение статуса оплаты и фото-сессии (anon по UUID)
-- ---------------------------------------------------------------------------

create or replace function public.unloop_get_paid_status(p_session_id uuid)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select paid_at from public.unloop_sessions where id = p_session_id;
$$;

create or replace function public.photoread_get_paid_status(p_session_id uuid)
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select paid_at from public.photoread_sessions where id = p_session_id;
$$;

create or replace function public.photoread_get_session(p_session_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'stage', stage,
    'context', context,
    'teaser', teaser,
    'paid_at', paid_at,
    'has_report', report is not null,
    'lang', lang
  )
  from public.photoread_sessions
  where id = p_session_id;
$$;

-- ---------------------------------------------------------------------------
-- 3. Читалка Vault (только service_role)
-- ---------------------------------------------------------------------------

create or replace function public.unloop_get_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name;
$$;

-- ---------------------------------------------------------------------------
-- 4. Гранты (как в проде на 07.08.2026)
-- ---------------------------------------------------------------------------

grant execute on function public.unloop_save_session(uuid, jsonb, text, integer, integer, jsonb, text, text) to anon, authenticated;
grant execute on function public.photoread_save_session(uuid, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.unloop_get_paid_status(uuid) to anon, authenticated;
grant execute on function public.photoread_get_paid_status(uuid) to anon, authenticated;
grant execute on function public.photoread_get_session(uuid) to anon, authenticated;

-- Секреты Vault недостижимы с публичного ключа — единственная причина, по
-- которой ANTHROPIC/POLAR/RESEND/META-ключи не утекают через anon-RPC.
revoke all on function public.unloop_get_secret(text) from public, anon, authenticated;
grant execute on function public.unloop_get_secret(text) to service_role;
