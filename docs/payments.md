# Платежи (Paddle)

Провайдер: **Paddle Billing** (merchant of record). Выбран вместо Lemon Squeezy:
LS куплен Stripe и сворачивается в Stripe Managed Payments, а Stripe не
поддерживает юрлица Казахстана. Paddle принимает селлеров из КЗ (КЗ нет в их
списке запрещённых стран), комиссия 5% + $0.50, выплаты — wire (USD) на
SWIFT/IBAN или Payoneer, раз в месяц, порог $100.

## Архитектура

```
Teaser (кнопка unlock)
  └─ VITE_PAYMENTS_ENABLED=false → бесплатный тестовый анлок (как раньше)
  └─ VITE_PAYMENTS_ENABLED=true  → Paddle.js v2 overlay checkout
       customData: { session_id }  ← unloop_session_id из localStorage
       ↓ оплата
Paddle → webhook transaction.completed
       → Supabase edge fn unloop-payment-webhook (проверка HMAC Paddle-Signature)
       → unloop_sessions.paid_at + paid_meta + stage='paid'
       ↑
Фронт после checkout.completed поллит RPC unloop_get_paid_status (2.5 с, до 90 с)
       → paid_at появился → unlock → генерация отчёта
```

Дополнительно: при возврате на тизер оплаченная сессия разблокируется сама
(одноразовая проверка paid_at), даже если вкладку закрыли до подтверждения.

## Безопасность БД

- У anon **нет прямого доступа** к `unloop_sessions` (ни select, ни insert/update).
- Запись воронки — только через security-definer RPC `unloop_save_session`
  (белый список колонок; `paid_at`/`paid_meta`/`report` клиенту недоступны).
- Статус оплаты — только через RPC `unloop_get_paid_status(session_id)`;
  session UUID играет роль bearer-токена.
- Вебхук проверяет `Paddle-Signature` (HMAC-SHA256, окно ±5 минут, защита от
  replay), идемпотентен (повторная доставка не перезаписывает paid_at).
- Секрет вебхука: Supabase Vault → `PADDLE_WEBHOOK_SECRET` (читается через
  service-role-only RPC `unloop_get_secret`; env-переменная в приоритете).
- Серверный гейт генерации LLM-отчёта: env `UNLOOP_REQUIRE_PAYMENT=true` на
  функции `unloop-generate-report` вернёт 402 для неоплаченных сессий.
  Сейчас выключен (тест-режим); включить при запуске платежей.

## Env-переменные фронта

| Переменная | Значение |
|---|---|
| `VITE_PAYMENTS_ENABLED` | `true` включает Paddle-чекаут; иначе тестовая кнопка |
| `VITE_PADDLE_ENV` | `sandbox` \| `production` |
| `VITE_PADDLE_CLIENT_TOKEN` | client-side token (`test_…` / `live_…`), публикуемый |
| `VITE_PADDLE_PRICE_ID` | `pri_…` цены «Unloop Full Report» ($24) |

Для локального sandbox-теста: положить их в `.env.local` (в гите игнорируется).
В прод (`.env.production`) флаг остаётся `false` до верификации live-аккаунта.

## Настройка sandbox (шаги основателя)

1. Зарегистрировать sandbox-аккаунт: https://sandbox-vendors.paddle.com/signup
   (отдельный от live, одобрение не нужно).
2. Dashboard → Developer tools → Authentication: создать **API key** и
   **client-side token** (`test_…`).
3. Запустить `PADDLE_API_KEY=<api key> node scripts/paddle-setup.mjs` — скрипт
   создаст продукт «Unloop Full Report» ($24), one-time price и webhook
   destination на edge-функцию, напечатает `VITE_PADDLE_PRICE_ID` и
   `endpoint_secret_key`.
4. Обновить секрет в Vault (SQL в дашборде Supabase или через Claude):
   `select vault.update_secret((select id from vault.secrets where name='PADDLE_WEBHOOK_SECRET'), '<endpoint_secret_key>');`
5. `.env.local`: четыре переменные из таблицы выше, `npm run dev`, пройти квиз,
   оплатить тестовой картой `4242 4242 4242 4242` (3DS: `4000 0038 0000 0446`).

## Переход в live

1. Регистрация: https://www.paddle.com/signup + верификация аккаунта
   (~2–7 рабочих дней): данные юрлица КЗ, identity, website review.
2. **Домен**: до подачи на review купить домен (например `unloop.app`) и
   повесить на GitHub Pages — `username.github.io` с gmail-почтой имеет заметный
   риск отказа. На странице должны быть: описание продукта, цена, Terms
   (с юр. именем компании), Privacy Policy, Refund Policy, контакты.
3. Прогнать `scripts/paddle-setup.mjs` с live-ключом (`PADDLE_ENV=production`),
   обновить Vault-секрет на live `endpoint_secret_key`.
4. `.env.production`: `VITE_PAYMENTS_ENABLED=true`, `VITE_PADDLE_ENV=production`,
   live token + live price id.
5. Включить `UNLOOP_REQUIRE_PAYMENT=true` (Supabase → Edge Functions →
   unloop-generate-report → Secrets) и убрать упоминание «test mode» из UI.
6. Выплаты: Paddle → Payouts — реквизиты (SWIFT/IBAN казахстанского банка в USD
   или Payoneer).
