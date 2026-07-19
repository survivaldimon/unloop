# Аналитика Unloop (PostHog)

## Почему PostHog Cloud EU

- **Бесплатно навсегда** до 1 млн событий/мес — нашей воронке хватит с огромным запасом (полное прохождение ≈ 45 событий на человека → ~20 000 прохождений/мес бесплатно).
- Работает **со статичного SPA** — никакого своего сервера не нужно, события уходят напрямую из браузера.
- **Funnels, breakdowns, retention из коробки** — ровно то, что нужно для оптимизации квиза (GA4 это умеет сильно хуже, Plausible/Umami не умеют вовсе или платно).
- **EU-регион**: данные хранятся во Франкфурте — правильный выбор при аудитории из Европы/России (GDPR-френдли).
- Бонус: бесплатные session replay (5 000 записей/мес) — можно смотреть, как реальные люди проходят квиз.

Альтернативы, которые я отклонил: GA4 (бесплатно, но воронки и breakdown по свойствам событий мучительны, плюс cookie-баннер обязателен), Mixpanel (хороший free tier, но данные в США и жёстче лимиты на свойства), Plausible (платный), Umami (нужен свой хостинг).

## Что нужно от основателя (5 минут)

1. Зайти на **posthog.com → Get started – free**. При создании организации выбрать регион **EU** (важно: выбирается один раз).
2. Создать проект **Unloop** (тип Web).
3. Скопировать **Project API key** (начинается с `phc_...`): Settings → Project → «Project API key».
4. Открыть [.env.production](.env.production), раскомментировать строку и вставить ключ:
   ```
   VITE_POSTHOG_KEY=phc_ваш_ключ
   ```
   (`VITE_POSTHOG_HOST` можно не трогать — EU-хост уже стоит по умолчанию в коде.)
5. Закоммитить и запушить в `main` — GitHub Actions пересоберёт сайт, события начнут приходить.
6. Проверка: открыть https://survivaldimon.github.io/unloop/, покликать пару экранов → в PostHog слева **Activity** — события появляются в течение минуты.

Ключ PostHog публичный по дизайну (как anon key Supabase), коммитить его в репо безопасно. Пока ключ не вставлен, аналитика полностью выключена — код работает как no-op.

## Схема событий

| Событие | Когда | Свойства |
|---|---|---|
| `page_view` | загрузка приложения | `step` (на каком шаге открылись — важно для вернувшихся) |
| `quiz_start` | клик по CTA на лендинге | — |
| `question_answered` | выбор ответа | `question_id` (q1…q32), `block` (1–8), `index` (1–32, порядковый номер) |
| `insight_view` | показ инсайт-чекпоинта | `block` |
| `quiz_complete` | ответ на последний экран | `pattern` |
| `email_submitted` | отправка email | — (email уходит в профиль person, не в событие) |
| `email_skipped` | клик «пропустить» | — |
| `teaser_view` | показ тизера | `pattern` |
| `unlock_click` | клик «открыть полный разбор» (при включённых платежах = старт чекаута Paddle) | — |
| `report_view` | показ отчёта | `pattern` |
| `lang_switch` | переключение языка | `to` (`en`/`ru`) |

Ко **всем** событиям автоматически подмешиваются super-props:
- `lang` — текущий язык (`en`/`ru`);
- `pattern` — паттерн пользователя (появляется после завершения квиза);
- `session_db_id` — id строки в таблице `sessions` Supabase (можно связать событие с ответами).

## Дашборды: накликать за 10 минут

Сначала создай пустой дашборд: слева **Dashboards → New dashboard**, назови «Unloop Funnel». Каждый инсайт ниже после сохранения добавляй туда кнопкой **Add to dashboard**.

### 0. Action «Email screen done» (нужен для воронки, 1 минута)

Экран email завершается двумя разными событиями (submitted / skipped), для воронки их надо склеить в одно:

1. Слева **Data management → Actions → New action → From event or pageview**.
2. Название: `Email screen done`.
3. Match group 1: event = `email_submitted`.
4. **Add another match group**: event = `email_skipped`.
5. Save.

### 1. Главная воронка (3 минуты)

1. **Product analytics → New insight → Funnels**.
2. Шаги (Add step):
   1. `page_view`
   2. `quiz_start`
   3. `quiz_complete`
   4. action `Email screen done`
   5. `teaser_view`
   6. `unlock_click`
   7. `report_view`
3. Conversion window: **1 day**.
4. Save → Add to dashboard.

Читается так: самый большой обрыв между соседними ступеньками = главная точка роста. Ожидаемые больные места: `quiz_start → quiz_complete` (длина квиза) и `teaser_view → unlock_click` (сила тизера). Когда включатся платежи (`VITE_PAYMENTS_ENABLED=true`), обрыв `unlock_click → report_view` = брошенный чекаут Paddle.

### 2. Drop-off по вопросам (2 минуты)

1. **New insight → Trends**.
2. Event: `question_answered`, агрегация: **Unique users**.
3. **Breakdown** → Event properties → `index`.
4. Тип графика: **Bar chart** (Total value).
5. Save → Add to dashboard. Назови «Drop-off по вопросам».

Каждый столбик = сколько людей ответили на вопрос №N. Где столбики резко проседают — там вопрос, на котором бросают. (Если хочется видеть id вопроса вместо номера — сделай breakdown по `question_id`.) Дополнительно: тот же инсайт с breakdown по `block` покажет усталость по блокам.

### 3. Конверсия по языкам (1 минута)

1. Открой воронку из шага 1 → **⋯ → Duplicate**.
2. В копии добавь **Breakdown → Event properties → `lang`**.
3. Сохрани как «Funnel by language» → Add to dashboard.

Покажет две воронки рядом: en против ru. Если ru конвертит заметно хуже — проблема в переводах/тоне, а не в продукте.

### 4. Конверсия тизера по паттернам (1 минута)

1. **New insight → Funnels**: `teaser_view` → `unlock_click`.
2. **Breakdown → Event properties → `pattern`**.
3. Save как «Unlock rate by pattern» → Add to dashboard.

Видно, какой из паттернов «цепляет» сильнее — под слабые можно переписать текст тизера.

### 5. Мелочи по вкусу

- Trends по `email_submitted` vs `email_skipped` — доля оставляющих почту.
- Trends по `lang_switch` (breakdown `to`) — многим ли нужен второй язык.
- **Session replay** (Settings → Session replay → включить) — записи реальных прохождений, бесплатно до 5 000/мес.

## Как это устроено в коде

- Модуль: [src/lib/analytics.ts](src/lib/analytics.ts) — единственная точка входа (`track`, `setAnalyticsContext`, `identifyEmail`). Без `VITE_POSTHOG_KEY` все функции — no-op, по образцу [src/lib/supabase.ts](src/lib/supabase.ts).
- Autocapture и автоматический pageview выключены — шлём только события из таблицы выше, данные чистые.
- Email не пишется в события — только в профиль person (`identify`), при этом distinct_id = тот же uuid, что и `sessions.id` в Supabase.
- В dev-режиме ключ не подхватывается (он только в `.env.production`) — локальная разработка не мусорит в статистику.
