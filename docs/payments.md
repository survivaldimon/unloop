# Платежи (Polar основной, Paddle запасной)

Оба провайдера — merchant of record, оба поддерживают юрлицо Казахстана.
Lemon Squeezy отклонён: куплен Stripe и сворачивается в Stripe Managed
Payments, который юрлица КЗ не принимает. Прямой Stripe из КЗ невозможен;
путь через Delaware LLC (Stripe Atlas) — $500 + ~$1000/год + форма 5472
(штраф $25k за пропуск) — не окупается до заметных оборотов.

| | **Polar.sh** (основной) | **Paddle** (запасной) |
|---|---|---|
| Старт продаж | Сразу после регистрации (ревью — перед первой выплатой) | После верификации 2–7 дней |
| Комиссия | 5% + $0.50 (free plan) | 5% + $0.50 |
| Выплаты в КЗ | Stripe Connect Express (КЗ явно в списке) | Wire USD (SWIFT/IBAN) или Payoneer, порог $100 |
| Риски | Молодая платформа, медленный саппорт | Дольше онбординг |

Выбор провайдера: `VITE_PAYMENTS_PROVIDER=polar|paddle` (+общий флаг
`VITE_PAYMENTS_ENABLED`). Обе интеграции живут параллельно: фронт —
`src/lib/payments/{polar,paddle}.ts`, вебхуки — отдельные edge-функции.

## Архитектура (Polar)

```
Teaser (кнопка unlock, VITE_PAYMENTS_ENABLED=true, PROVIDER=polar)
  └─ edge fn unloop-polar-checkout: POST /v1/checkouts/ c metadata.session_id
       (токен только на сервере: Vault POLAR_ACCESS_TOKEN/PRODUCT_ID/ENV)
  └─ оверлей @polar-sh/checkout (lazy-чанк) ← url сессии
       ↓ оплата (событие JS "success" → мгновенный UI-переход)
Polar → webhook order.paid → edge fn unloop-polar-webhook
       (Standard Webhooks: HMAC-SHA256 по `id.ts.body`, base64, окно ±5 мин,
        секрет polar_whs_… как есть — НЕ base64-декодировать)
       → unloop_sessions.paid_at + paid_meta + stage='paid'
       ↑
Фронт после "success" поллит RPC unloop_get_paid_status (2.5 с, до 90 с)
```

Архитектура Paddle аналогична (см. `unloop-payment-webhook`, подпись
`Paddle-Signature: ts=…;h1=…`, HMAC по `ts:body`, hex). Оплаченная сессия
разблокируется и при возврате на тизер (одноразовая проверка paid_at).

## Безопасность БД

- У anon **нет прямого доступа** к `unloop_sessions`: запись — через
  security-definer RPC `unloop_save_session` (белый список колонок), статус
  оплаты — через `unloop_get_paid_status(session_id)`; session UUID играет
  роль bearer-токена.
- Вебхуки идемпотентны (повтор не перезаписывает paid_at), проверяют подпись
  и timestamp-окно.
- Секреты — в Supabase Vault, читаются через service-role-only RPC
  `unloop_get_secret` (env-переменные функций в приоритете):
  `POLAR_ACCESS_TOKEN`, `POLAR_PRODUCT_ID`, `POLAR_ENV`,
  `POLAR_WEBHOOK_SECRET`, `PADDLE_WEBHOOK_SECRET`.
- Серверный гейт LLM-генерации: env `UNLOOP_REQUIRE_PAYMENT=true` на функции
  `unloop-generate-report` → 402 для неоплаченных. Включить при запуске.

## Настройка Polar sandbox (шаги основателя, ~10 минут)

1. Зарегистрироваться: **https://sandbox.polar.sh/start** (отдельная среда;
   логин GitHub/Google), создать организацию.
2. Organization settings → создать **Organization Access Token**
   (`polar_oat_…`).
3. `POLAR_ACCESS_TOKEN=<токен> node scripts/polar-setup.mjs` — создаст продукт
   «Unloop Full Report» ($24) и webhook-endpoint `order.paid` → напечатает
   4 SQL-команды для Vault (product id, webhook secret и т.д.). Выполнить их
   в SQL-редакторе Supabase или отдать Claude.
4. `.env.local`: `VITE_PAYMENTS_ENABLED=true`, `VITE_PAYMENTS_PROVIDER=polar`
   (+ Supabase URL/anon key). `npm run dev` → квиз → оплата картой
   `4242 4242 4242 4242`.

Прод-запуск Polar: то же самое на **polar.sh** (не sandbox), в Vault
`POLAR_ENV=production` + прод-токен/product id/webhook secret, во фронте
`VITE_PAYMENTS_ENABLED=true` в `.env.production`. До первой выплаты Polar
попросит пройти ревью организации — продажи при этом уже идут.

## Paddle (запасной путь)

Sandbox: https://sandbox-vendors.paddle.com/signup → API key + client-side
token → `PADDLE_API_KEY=<key> node scripts/paddle-setup.mjs` (продукт, цена,
webhook destination; секрет → Vault `PADDLE_WEBHOOK_SECRET`). Фронт:
`VITE_PAYMENTS_PROVIDER=paddle`, `VITE_PADDLE_ENV`, `VITE_PADDLE_CLIENT_TOKEN`,
`VITE_PADDLE_PRICE_ID`. Live: верификация 2–7 дней; до подачи — купить домен
(github.io + gmail — риск отказа), на лендинге Terms (с юр. именем компании),
Privacy, Refund Policy, контакты. Тест-карты: `4242 4242 4242 4242`
(3DS: `4000 0038 0000 0446`).
