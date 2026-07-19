# Email «твой результат» — состояние и чек-лист включения

## Что уже сделано

- **Edge-функция `unloop-send-result`** (Supabase, проект kabinet `ncfpxetzmeeqxgqidosj`) — задеплоена.
  Принимает `{ session_id, email, lang, pattern_name, tagline, insights[] }`, шлёт письмо через Resend API.
  Защита: письмо уходит **только** на адрес, уже сохранённый в `unloop_sessions.email` для этой сессии,
  и **только один раз** на сессию (колонка `result_email_sent_at`).
- **Шаблон письма** EN/RU: тёмная тема сайта, table-верстка + inline-стили (читаемо в Gmail),
  имя паттерна, тизер из 2 инсайтов, кнопка «Открыть полный разбор» → `https://survivaldimon.github.io/unloop/`.
  Plain-text версия прилагается. Исходник: `supabase/functions/unloop-send-result/index.ts`.
- **Вызов на клиенте**: `submitEmail` в `src/App.tsx` → `saveSession(...)` → `sendResultEmail(...)`
  (fire-and-forget, переход к тизеру не блокируется; no-op без настроенного бэкенда).
- **Попутный фикс**: `saveSession` писал в несуществующую таблицу `sessions` — данные молча терялись.
  Теперь пишет через security-definer RPC `unloop_save_session` (тот же подход, что в платёжной ветке).

## Ключи и конфигурация функции

Функция читает секреты так: `Deno.env` (через `supabase secrets set`) → фолбэк Vault RPC `public.unloop_get_secret(name)`.

| Секрет | Назначение | Сейчас |
|---|---|---|
| `RESEND_API_KEY` | ключ API Resend | **отсутствует** — функция отвечает `email_not_configured` |
| `RESEND_FROM` | адрес отправителя | не задан → дефолт `Looplore <onboarding@resend.dev>` (dev-режим) |
| `UNLOOP_SITE_URL` | ссылка кнопки CTA | не задан → дефолт `https://survivaldimon.github.io/unloop/` |

Положить ключ в Vault (не светится в env):

```sql
select vault.create_secret('re_xxxxxxxx', 'RESEND_API_KEY');
```

или в env функций:

```bash
npx supabase secrets set RESEND_API_KEY=re_xxxxxxxx --project-ref ncfpxetzmeeqxgqidosj
```

## Dev-режим (до верификации домена)

Ограничение Resend без верифицированного домена: отправитель — только `onboarding@resend.dev`,
получатель — **только email владельца аккаунта Resend**. Чужим адресам API вернёт 403 —
функция вернёт `send_failed`, для пользователя это незаметно (fire-and-forget).

Тест: пройти квиз, на экране email ввести адрес владельца аккаунта — письмо придёт ему.

## Чек-лист включения после появления домена

1. **Resend → Domains → Add Domain.** Добавить домен (например `looplore.app`; для писем лучше
   поддомен, напр. `send.looplore.app` — Resend предложит сам).
2. **DNS-записи** (Resend покажет точные значения; TTL любой):
   - `MX` для поддомена отправки (feedback-smtp…, priority 10) — для bounce-обработки;
   - `TXT` SPF для того же поддомена (`v=spf1 include:amazonses.com ~all`);
   - `TXT` DKIM `resend._domainkey.<домен>` (длинный ключ `p=…`);
   - рекомендуется `TXT` DMARC: `_dmarc.<домен>` → `v=DMARC1; p=none;`.
3. Дождаться статуса **Verified** в Resend (обычно минуты, до 72 ч).
4. **Сменить отправителя**:
   ```bash
   npx supabase secrets set "RESEND_FROM=Looplore <hello@looplore.app>" --project-ref ncfpxetzmeeqxgqidosj
   ```
   (редеплой функции не нужен — env подхватывается сразу).
5. Если сайт переехал с github.io на свой домен — обновить ссылку кнопки:
   ```bash
   npx supabase secrets set UNLOOP_SITE_URL=https://looplore.app/ --project-ref ncfpxetzmeeqxgqidosj
   ```
6. **Проверка**: пройти квиз с адресом, НЕ совпадающим с владельцем аккаунта Resend, — письмо должно дойти.
   Логи: Supabase Dashboard → Edge Functions → unloop-send-result → Logs (ошибки Resend логируются с телом ответа).

## На потом (не блокирует)

- Перенос в отдельный Supabase-проект перед запуском (вместе со всей unloop_-инфрой).
- List-Unsubscribe-заголовок не нужен, пока письмо строго транзакционное (копия результата по запросу).
- Если появится маркетинговая рассылка — отдельный поддомен и согласие на подписку.
