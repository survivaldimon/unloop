# Meta Ads для Looplore: пиксель, Conversions API, запуск кампании

## Зачем это, если уже есть PostHog

PostHog отвечает на вопрос «что происходит внутри воронки». Meta Ads он не помогает ничем: алгоритм Меты оптимизирует показы только по событиям, которые получает **сама Мета**. Поэтому в код добавлен второй, параллельный слой аналитики:

1. **Оптимизация закупки.** Мета показывает рекламу не «всем подряд», а людям, похожим на тех, кто уже дошёл до нужного события. Без событий Purchase/InitiateCheckout она оптимизирует по кликам — это в разы дороже.
2. **Атрибуция и ROAS.** В Ads Manager будет видно: кампания X принесла N покупок на $M при затратах $K — по каждой кампании, адсету и креативу.
3. **Аудитории.** События позволяют собирать кастомные аудитории (все, кто прошёл квиз, но не купил → ретаргетинг) и lookalike-аудитории покупателей.
4. **Срез воронки по кампаниям в PostHog.** utm-метки из ссылок объявлений подмешиваются ко всем событиям PostHog — воронку можно разбить по `utm_campaign` / `utm_content` и увидеть, какой креатив приводит людей, которые *доходят до конца*, а не просто кликают.

## Как устроено (уже в коде)

**Браузерный пиксель** — [src/lib/meta.ts](src/lib/meta.ts), включается ключом `VITE_META_PIXEL_ID` в [.env.production](.env.production). Без ключа — полный no-op, как PostHog. События маппятся из существующей воронки ([src/lib/analytics.ts](src/lib/analytics.ts)), ничего дублировать не надо:

| Событие воронки | Событие Меты | Зачем Мете |
|---|---|---|
| загрузка сайта | `PageView` | база |
| `quiz_start` | `QuizStart` (кастомное) | верх воронки, дешёвая оптимизация |
| `quiz_complete` | `QuizComplete` (кастомное) | вовлечённые |
| `email_submitted` | `Lead` | лиды + advanced matching по email |
| `teaser_view` | `ViewContent` | увидели оффер |
| `unlock_click` | `InitiateCheckout` ($14.99) | начали чекаут |
| оплата подтверждена | `Purchase` ($14.99) | **главное событие оптимизации** |

**Серверный Purchase (Conversions API)** — вебхук Polar ([supabase/functions/unloop-polar-webhook](supabase/functions/unloop-polar-webhook/index.ts)) после установки `paid_at` шлёт Purchase напрямую в Graph API. Зачем дубль: браузерный пиксель теряет ~20–30 % конверсий (блокировщики рекламы, iOS, закрытая вкладка), а вебхук срабатывает всегда. Оба события идут с одинаковым `event_id = purchase_<session_id>` — Мета склеивает их в одну покупку, двойного счёта нет.

Для точной привязки покупки к клику по объявлению куки `_fbp`/`_fbc` + user-agent/IP покупателя едут через метаданные чекаута Polar в вебхук и уходят в CAPI вместе с SHA-256-хэшем email. Всё это уже задеплоено и молчит, пока не появятся секреты.

**UTM-атрибуция** — [src/lib/attribution.ts](src/lib/attribution.ts): `utm_*` и `fbclid` из ссылки объявления сохраняются в localStorage и подмешиваются super-props ко всем событиям PostHog.

## Что нужно от основателя (~30 минут)

### 1. Пиксель (Events Manager)

1. [business.facebook.com](https://business.facebook.com) → создать Business Portfolio (если ещё нет).
2. **Events Manager → Connect data → Web** → назвать «Looplore» → получится **Pixel ID** (длинное число).
3. Вставить в [.env.production](.env.production): `VITE_META_PIXEL_ID=<число>`, закоммитить в main — Actions пересоберёт сайт.

### 2. Conversions API (серверный Purchase)

1. Events Manager → выбрать пиксель → **Settings → Conversions API → Generate access token**.
2. Положить оба секрета в Vault проекта Supabase (SQL Editor):
   ```sql
   select vault.create_secret('<Pixel ID>', 'META_PIXEL_ID');
   select vault.create_secret('<токен>', 'META_CAPI_TOKEN');
   ```
3. Для проверки: Events Manager → **Test Events** → скопировать код `TEST…` и временно добавить `select vault.create_secret('TEST…', 'META_TEST_EVENT_CODE');` — серверные события появятся во вкладке Test Events. После проверки удалить секрет (Vault → delete), иначе события не будут считаться боевыми.

### 3. Домен и проверка

1. Business Settings → **Brand Safety → Domains** → добавить `looplore.app`, подтвердить TXT-записью в Cloudflare (DNS only).
2. Проверка пикселя: открыть сайт с расширением **Meta Pixel Helper** — должны светиться PageView и события по мере прохождения; либо Events Manager → Test Events → вкладка Browser.
3. Проверка CAPI: сделать sandbox-покупку (код E2ETEST) с включённым META_TEST_EVENT_CODE — в Test Events придёт Purchase с пометкой Server и Deduplicated рядом с браузерным.

## Как запускать кампанию

- **Цель:** Sales → conversion event **Purchase**. Это правильная цель с первого дня, даже пока покупок мало.
- **Правило 50 конверсий/неделю на адсет:** пока Purchase меньше ~50/нед, алгоритм не выходит из learning phase. Это нормально — не переключай оптимизацию на клики. Если совсем пусто в первые дни, временный компромисс — оптимизация на `InitiateCheckout` или `Lead`, потом вернуть Purchase.
- **UTM-шаблон** — в поле URL parameters объявления (Мета сама подставит значения):
  ```
  utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}
  ```
  Тогда в PostHog воронка разобьётся по кампаниям и креативам (Breakdown → `utm_campaign` / `utm_content`).
- **Стартовая структура:** 1 кампания → 1–2 адсета (broad, US, 25–45; интересы не сужать — креатив сам таргетирует) → 3–4 креатива из [marketing/creative-brief.md](marketing/creative-brief.md). Бюджет $20–30/день на адсет, первые выводы — не раньше 3–4 дней.
- **Ретаргетинг (позже):** кастомная аудитория «QuizComplete за 30 дней минус Purchase» — самые дешёвые продажи.

## Важно: гео и приватность

Сайт сейчас **без cookie-баннера**. Для таргетинга на США и большинство не-европейских рынков это нормально; для **ЕС/Великобритании пиксель без согласия нарушает GDPR/ePrivacy** — либо не таргетируем ЕС (рекомендация для старта: US, CA, AU), либо сначала добавляем consent-баннер (отдельная задача).

Email в Мету уходит только SHA-256-хэшем; сырой email не покидает нашу инфраструктуру (advanced matching в пикселе хэширует на клиенте).

## Чек-лист перед первым долларом бюджета

- [ ] `VITE_META_PIXEL_ID` в .env.production, сайт пересобран
- [ ] `META_PIXEL_ID` + `META_CAPI_TOKEN` в Vault
- [ ] Домен looplore.app верифицирован в Business Manager
- [ ] Test Events: браузерные события идут, серверный Purchase приходит с пометкой Deduplicated
- [ ] `META_TEST_EVENT_CODE` удалён из Vault
- [ ] Платежи переведены в production (POLAR_ENV=production, UNLOOP_REQUIRE_PAYMENT=true, «test mode» убран с пейволла)
- [ ] Таргетинг без ЕС/UK (или добавлен consent-баннер)
- [ ] UTM-шаблон вставлен в объявления
