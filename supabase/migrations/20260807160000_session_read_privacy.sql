-- S3 (аудит 07.08.2026 §2.3 «Раскрытие данных через anon-RPC по UUID»):
-- сужение читающих anon-RPC после клейма сессии + снятие полного баланса
-- владельца с credits_session_state.
-- Apply to prod ONLY with the founder's explicit go.
--
-- Модель, к которой приводим чтение: **UUID сессии — capability только пока
-- сессия ничья**. Как только её забрал аккаунт (`user_id is not null`),
-- чтение требует JWT этого аккаунта. Ровно это правило писчий путь тестов уже
-- соблюдает (`looplore_test_session_save`/`_complete`, ветка 'owned',
-- 20260728160000_looplore_test_rpc.sql) — здесь оно доезжает до чтения.
--
-- Чего фикс НЕ трогает: неклеймленные сессии (аноним до почты), письма с
-- `?s=`/`?p=`/`?ts=` для неклеймленных сессий, кабинет (там всегда есть JWT).
-- Клеймленная сессия на чужом/разлогиненном устройстве получает маркер
-- `{"locked": true}` вместо данных — фронт по нему ведёт на вход, а не роняет
-- человека на пустой экран.

-- ---------------------------------------------------------------------------
-- 1. Квиз: ответы сессии
-- ---------------------------------------------------------------------------

-- Было (только в проде, не в VCS): `select jsonb_build_object('answers',
-- answers, 'paid_at', paid_at) ... where id = p_session_id` — любой обладатель
-- UUID читал сырые ответы квиза.
create or replace function public.unloop_get_session(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_answers jsonb;
  v_paid timestamptz;
  v_user uuid;
begin
  select answers, paid_at, user_id
    into v_answers, v_paid, v_user
    from public.unloop_sessions
   where id = p_session_id;
  if not found then
    return null;
  end if;

  if v_user is not null and (auth.uid() is null or auth.uid() <> v_user) then
    return jsonb_build_object('locked', true);
  end if;

  return jsonb_build_object('answers', v_answers, 'paid_at', v_paid);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Тесты: ответы + outcome сессии
-- ---------------------------------------------------------------------------

-- Кросс-девайс тут идёт только из кабинета (`/account/` мнёт `?t=&ts=`
-- подписанному пользователю) — письма `?ts=` не рассылаются, так что гейт
-- ничего живого не рвёт. Не нашедшему данных фронту есть куда упасть:
-- openFromLink уже умеет достраиваться из локальных ответов.
create or replace function public.looplore_test_session_get(p_session_id uuid)
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

  if v_row.user_id is not null and (auth.uid() is null or auth.uid() <> v_row.user_id) then
    return jsonb_build_object('locked', true);
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
-- 3. Чат: вся переписка по сессии
-- ---------------------------------------------------------------------------

-- Самое чувствительное из трёх: переписка про свой психо-профиль. Владелец
-- пишется в саму строку (`looplore-chat` кладёт `user_id: row.user_id`), а
-- платный чат вообще существует только у клеймленной сессии — поэтому гейт
-- строчный: чужому UUID-обладателю остаётся пустая история, владельцу — всё.
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
       and (user_id is null or user_id = auth.uid())
     order by id desc
     limit 30
  ) t;
$$;

-- ---------------------------------------------------------------------------
-- 4. Состояние пейволла: бит вместо баланса
-- ---------------------------------------------------------------------------

-- Было: `'balance', coalesce(v_balance, 0)` безусловно — утёкшая ссылка
-- показывала, сколько денег на аккаунте за ней. Стало: полный баланс только
-- владельцу (`auth.uid() = user_id`), всем остальным — один бит `covered`,
-- которого пейволлу ровно достаточно.
--
-- Почему бит, а не «просто убрать»: пост-чекаутный поллинг обязан работать и
-- у покупателя БЕЗ сессии в браузере (знакомый email → magic-link → человек
-- продолжает анонимно, а вебхук привязывает покупку по email и сам клеймит
-- сессию). Убери сигнал совсем — оплаченный разбор не откроется.
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
  -- Цена разбора обоих обслуживаемых здесь воронок (CREDIT_COSTS.report_quiz
  -- и report_photo, supabase/functions/_shared/credits-config.ts — обе 95).
  -- Это ТОЛЬКО подсказка пейволлу: реальное списание всё так же считается по
  -- тому конфигу на сервере, а credits_spend откажет недофинансированному
  -- аккаунту. Разъезд константы даёт максимум лишний показ пейволла, не
  -- бесплатный контент.
  c_report_cost constant integer := 95;
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
    'covered', coalesce(v_balance, 0) >= c_report_cost
  ) || case
         when v_user is not null and auth.uid() = v_user
           then jsonb_build_object('balance', coalesce(v_balance, 0))
         else '{}'::jsonb
       end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Гранты
-- ---------------------------------------------------------------------------

-- create or replace сохраняет привилегии, но повторяем явно — миграция должна
-- читаться как полное определение доступа.
grant execute on function public.unloop_get_session(uuid) to anon, authenticated;
grant execute on function public.looplore_test_session_get(uuid) to anon, authenticated;
grant execute on function public.looplore_chat_history(uuid) to anon, authenticated;
grant execute on function public.credits_session_state(uuid, text) to anon, authenticated;
