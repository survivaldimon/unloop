# Этап 2 аудита — пакет на «го»: данные, пороги, тексты, фикстуры

Дата: 03.08.2026. Ветка `claude/test-quality-analysis-47ec2e`, ждёт мержа в
main по «го» основателя. Прод на момент сборки пуст (2 анонимные сессии,
0 покупок) — результаты меняются молча, решение основателя зафиксировано
в `docs/tests-quality-audit.md` §7.

## Что в пакете

Этап 2 целиком — от вычищенного вес-слоя до перегнанных фикстур:

1. **Вес-слой** (коммиты 8487a2c, c2b4ff0, 18d886d): реестр шкал (канон 130),
   A-список линта 301→0, полюса sixteen_types переразмечены (18 вопросов),
   реверсы romantic (3), social_battery перекодирована в интровертную ось
   (16 инверсий), love_languages сведён к осевым предпочтениям (−155 весов
   «чужих черт»), полюсные примеси вычищены из 16 тестов состояния.
2. **Пороги** (коммит 30debad): profileSelection всех 19 тестов заменён через
   `tools/tests-import/fixes/<id>.json` и откалиброван персонной симуляцией
   до попадания в утверждённые коридоры `docs/tests-target-distributions.md`.
   Обоснование каждого порога — в `$note` внутри profileSelection фикса.
3. **Новые профили** (тексты ru+en в fixes → profilesAdd):
   - love_languages: «Сделал и принёс» (забота+подарки), «Из рук в руки»
     (прикосновения+подарки) — два недостающих комбо;
   - emotional_intelligence: три byTop-подпрофиля средней полосы —
     «Понимаешь на слух» (восприятие/понимание), «Поставленный голос»
     (управление/использование/мотивация), «Живой диалог» (эмпатия/соцнавыки).
4. **~100 whyThisProfile переписаны** (overrides + зеркало в контенте): все
   тексты, называвшие старые пороги, теперь называют новые; переписаны
   концептуально устаревшие (ось интроверсии social_battery, формула mixed у
   дружбы, «большинство сценариев» флагмана, WHY «Строителя границ»).
5. **ENGINE_VERSION = 2** — `src/tests/engine.ts` (tests-generate-report
   импортирует оттуда) + собственная константа `tests-portrait`. DB-default
   колонок оставлен 1 осознанно: строки без явной версии читаются как
   «старые» и лечатся пересчётом при следующей платной операции.
6. **Golden-фикстуры перегнаны от нового канона**: `npm run tests:fixtures`
   (`tools/tests-import/generate-fixtures.mjs`) — TS-движок по текущим
   `src/content/tests`; reference-scoring.mjs остался историческим эталоном
   оригинала. Добавлена фикстура text_conflict_communication (не существовала).
7. **Робот получил вердикты**: `tools/tests-audit/corridors.json` (машинная
   форма коридоров) + `check-corridors.mjs` — симуляция вне коридора = FAIL;
   недостижимый профиль = FAIL.

## Отклонения от стартовых «рычагов» коридор-дока

Коридоры — закон, стартовые значения порогов — стартовые; где они
конфликтовали, победил коридор. Все случаи задокументированы в $note:

| Тест | Рычаг | Финал | Почему |
|---|---|---|---|
| burnout, detox | `@diff12 >= 7` в фокусные | `>= 3` | при семи независимых факторах P(отрыв≥7 в средней полосе) ≈ 53% — «Тление»/«По всем фронтам» получали бы вдвое выше коридора, фокусные — вдвое ниже; 3 ≈ один шаг сетки фактора («лидер впереди хотя бы на один ответ») |
| self_confidence | balanced «@range < 12» | `< 44` | размах четырёх независимых факторов почти никогда < 12 — профиль остался бы мёртвым (0.5% при коридоре 5–10) |
| self_confidence | доминанты «@range >= 15» | `>= 53` | при ≥15 доминанты съедали бы confident (10–18% коридора) до <2% |
| social_battery | тревожность/гибкость ≥65 | ≥79 / ≥78 | латентные черты симуляции равномерны — 65 давало social_anxious 17% при коридоре 6–12 |
| toxic | ~37/58/73/86 | 39/52/63/73 | перцентили @avg; при 86 severe остался бы мёртвым |
| fomo | ~32/51/69/85 | 37/51/62/73 | то же: при 85 danger мёртв |
| imposter | ~31/49/66/83 | 37/50/61/72 | то же |
| EI | полосы ~68/54/36/23 | 63/52/41/29 | при 68 eq_master не добирал коридор 8–15 |
| values | aligned `@alignment < 22` | `< 28` | сетка фактора 12.5 держит средний разрыв высоким: <22 давало 3% при коридоре 8–15 |
| text_conflict | второй путь `diff12 >= 10` | `>= 15` | на сетке 5 п.п. при ≥10 каждый стиль выходил за коридор 12–22 |

Прочее по мелочи (границы полос на перцентилях вместо приблизительных
стартов) — в $note фиксов.

## До/после: персонная симуляция против коридоров

Симуляция — audit2.mjs, 4000 коррелированных персон на тест; «до» — состояние
main (до этапа 2), «после» — эта ветка. Полная таблица по всем 19 тестам —
ниже в приложении. Главное:

| Метрика | До | После |
|---|---|---|
| Тестов в коридорах | 2 из 19 | **19 из 19** |
| Недостижимые профили | 3 (burnout moderate, detox problematic, sc balanced) + motivator 0.0% | **0** |
| Fallback > 50% | 5 тестов (флагман 59.8%, boundaries 79.5%, friendship 65.6%…) | **0** (максимум — builder 56.8% при коридоре 45–60) |
| «Хороший» исход достижим | secure 0.9%, toxic healthy 2.6%, values aligned 0.1%, imposter minimal 1.4% | 18.9% / 19.7% / 13.4% / 16.8% |

## Проверки

- `apply-fixes.mjs --check` — дрейфа нет (идемпотентность; profilesAdd
  переведён в upsert, фикс владеет своими id).
- `audit2.mjs` + `check-corridors.mjs` — все 19 тестов в коридорах,
  недостижимых профилей нет.
- `audit.mjs` (L0) — 4 проблемы, все известные и вне пакета: отсутствуют factorNames для EI/SN/TF/JP у sixteen_types (тема этапа 3 — нулевые факторы вообще не слать в фиды). Новые профили зарегистрированы, byTop-гэпов нет, локализация полная, мёртвых ссылок нет.
- `lint-weights.mjs` — A (знак против ключёвки) — 0, было 301; B (противоречия внутри фактора) — 1, принятое исключение q16/q34 social_battery (оба веса семантически верны, зафиксировано в фиксе); E (полюсные примеси в тестах состояния) — 0. C/D — отчётные по построению: блочные паттерны структурные, у sixteen_types/love_languages минусов нет by design.
- `portrait-feed.mjs` — пересекающихся шкал на полнокаталожную персону теперь 125 (до чистки реестра было 165); срез «|score−50| → 18» по-прежнему прячет ~87% шкал с межтестовым противоречием — это цель этапа 3, в пакет не входит.
- `npm run tests:verify` — зелёный: 76 кейсов (19 тестов × 4 паттерна), 0 расхождений.

## Что осознанно НЕ вошло (и где это записано)

- Три открытых вопроса коридор-дока: №8 типология границ на 5–7 профилей
  (предложение — v2), №11 вынос «условий работы» из среднего выгорания,
  №12 переформулировка q7 детокса. Ждут отдельного решения.
- Решение 2.3A, UI-часть: перемешивание порядка вариантов при показе и
  укорачивание ассертива в худших вопросах флагмана — фронтовая работа,
  в этот пакет не входила (скоринговая часть 2.3A — правило 45/35+15 — в
  пакете).
- Реверс-пункты против аквиесценции (toxic/fomo/attachment/love_languages) —
  v2, меняют длину тестов.
- Этап 3 (фиды LLM): отбор шкал портрета «сильные+противоречивые»,
  схлопывание полюсных пар, quote_candidate по направлению, не слать нулевые
  факторы sixteen — после деплоя этапа 2, по `docs/tests-spec-and-robot.md`.
- Кэш портрета не проверяет engine_version при чтении (аудит §5) — этап 3;
  до него старые кэши доживают до следующего пройденного теста.

## Деплой (только по «го»)

1. Мерж ветки в main → CI фронта собирает и деплоит SPA.
2. `supabase functions deploy tests-generate-report --project-ref ncfpxetzmeeqxgqidosj --use-api`
   и то же для `tests-portrait` (обе тянут контент статикой — редеплой
   обязателен).
3. Прод-проверка: пройти короткий тест, сверить профиль/шкалы с локальным
   расчётом; спот-чек новых профилей EI/LL.

---

## Приложение: полная таблица «до/после»

### attachment_styles_v1

| Профиль | До | После | Коридор |
|---|---|---|---|
| secure | 0.9 | **18.9** | 15–25 ✓ |
| anxious | 24.6 | **21.4** | 15–25 ✓ |
| avoidant | 24.6 | **21.7** | 15–25 ✓ |
| fearful | 26.6 | **17.9** | 10–18 ✓ |
| mixed | 23.4 | **20.2** | 15–25 ✓ |

### sixteen_types

| Профиль | До | После | Коридор |
|---|---|---|---|
| ESTJ | 9.4 | **9.4** | 3–12 ✓ |
| ENTJ | 8.9 | **8.9** | 3–12 ✓ |
| ESFJ | 7 | **7** | 3–12 ✓ |
| ENTP | 6.8 | **6.8** | 3–12 ✓ |
| ENFJ | 6.8 | **6.8** | 3–12 ✓ |
| ISTJ | 6.7 | **6.7** | 3–12 ✓ |
| ESTP | 6.6 | **6.6** | 3–12 ✓ |
| INTJ | 6.3 | **6.3** | 3–12 ✓ |
| ESFP | 5.9 | **5.9** | 3–12 ✓ |
| ISTP | 5.7 | **5.7** | 3–12 ✓ |
| ENFP | 5.5 | **5.5** | 3–12 ✓ |
| ISFJ | 5.4 | **5.4** | 3–12 ✓ |
| INTP | 5 | **5** | 3–12 ✓ |
| INFP | 4.7 | **4.7** | 3–12 ✓ |
| INFJ | 4.7 | **4.7** | 3–12 ✓ |
| ISFP | 4.6 | **4.6** | 3–12 ✓ |

### ipip_big_five

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_balanced | 6.5 | **6.3** | 2–12 ✓ |
| profile_creative_thinker | 13.6 | **13.6** | 2–14 ✓ |
| profile_extrovert | 11.9 | **11.9** | 2–14 ✓ |
| profile_introvert | 8.5 | **8** | 2–14 ✓ |
| profile_innovator | 8.2 | **8.2** | 2–14 ✓ |
| profile_achiever | 7.3 | **7.3** | 2–14 ✓ |
| profile_social_butterfly | 6.4 | **6.4** | 2–14 ✓ |
| profile_steady | 6.3 | **6.1** | 2–14 ✓ |
| profile_reliable_helper | 6.3 | **6.3** | 2–14 ✓ |
| profile_introspective | 5.2 | **5.2** | 2–14 ✓ |
| profile_sensitive_soul | 4.7 | **4.7** | 2–14 ✓ |
| profile_peacemaker | 4.5 | **4.3** | 2–14 ✓ |
| profile_leader | 4.3 | **4.3** | 2–14 ✓ |
| profile_quiet_achiever | 2.6 | **2.6** | 2–14 ✓ |
| profile_explorer | 2.4 | **2.4** | 2–14 ✓ |
| profile_deep_thinker | 1.3 | **2.4** | 2–14 ✓ |

### emotional_intelligence

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_eq_master | 1.9 | **14.5** | 8–15 ✓ |
| profile_emotionally_intelligent | 19.3 | **29.2** | 20–30 ✓ |
| profile_developing_eq | 58.5 | **6.1** | 0–10 ✓ |
| profile_low_eq | 18.6 | **19** | 12–20 ✓ |
| profile_very_low_eq | 1.8 | **4.1** | 3–7 ✓ |
| profile_developing_voice | 0 | **11.3** | — |
| profile_developing_listener | 0 | **8.3** | — |
| profile_developing_dialogue | 0 | **7.4** | — |
| **Σ byTop-подпрофили середины** | 0 | **27** | 18–28 ✓ |

### self_confidence_multiscale_v1

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_high_confidence | 2.1 | **10.6** | 6–12 ✓ |
| profile_confident | 0.9 | **10.8** | 10–18 ✓ |
| profile_balanced | 0 | **7.2** | 5–10 ✓ |
| profile_self_believer | 6.3 | **6.3** | 3–8 ✓ |
| profile_social_confident | 6.7 | **6.1** | 3–8 ✓ |
| profile_self_accepting | 5 | **5.2** | 3–8 ✓ |
| profile_resilient | 5.5 | **5.7** | 3–8 ✓ |
| profile_doubter | 11.2 | **6.3** | 5–10 ✓ |
| profile_shy | 10.7 | **6.6** | 5–10 ✓ |
| profile_self_critical | 10.7 | **6.2** | 5–10 ✓ |
| profile_cautious | 9.7 | **5.8** | 5–10 ✓ |
| profile_developing | 3.3 | **7.3** | 5–12 ✓ |
| profile_low_confidence | 25.4 | **11.6** | 8–15 ✓ |
| profile_struggling | 2.4 | **4.6** | 3–7 ✓ |

Недостижимые: до — profile_balanced; после — нет.

### toxic_patterns

| Профиль | До | После | Коридор |
|---|---|---|---|
| healthy_relationships | 2.6 | **19.7** | 15–25 ✓ |
| mild_toxicity | 33.3 | **36.1** | 30–40 ✓ |
| moderate_toxicity | 51.1 | **27.9** | 25–33 ✓ |
| high_toxicity | 12 | **12.3** | 8–14 ✓ |
| severe_toxicity | 1 | **4** | 2–5 ✓ |

### friendship_red_flags_v1

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_low_risk | 5 | **18.6** | 15–25 ✓ |
| profile_moderate_risk | 43.6 | **42.5** | 35–45 ✓ |
| profile_elevated_risk | 45.6 | **29.9** | 22–32 ✓ |
| profile_high_risk | 5.7 | **9.1** | 5–10 ✓ |

### boundaries_people_pleasing

| Профиль | До | После | Коридор |
|---|---|---|---|
| people_pleaser | 16.2 | **31.9** | 25–35 ✓ |
| boundary_builder | 79.5 | **56.8** | 45–60 ✓ |
| boundary_master | 4.3 | **11.3** | 10–18 ✓ |

### imposter_syndrome

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_minimal | 1.4 | **16.8** | 12–20 ✓ |
| profile_mild | 23.5 | **33.3** | 30–40 ✓ |
| profile_moderate | 54.7 | **29.5** | 22–32 ✓ |
| profile_high | 19.8 | **15.8** | 10–16 ✓ |
| profile_severe | 0.6 | **4.6** | 2–5 ✓ |

### fomo_social_comparison_v1

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_excellent | 1.4 | **16.4** | 12–20 ✓ |
| profile_good | 23.4 | **36.7** | 30–40 ✓ |
| profile_warning | 55.4 | **29.1** | 22–32 ✓ |
| profile_critical | 19 | **13.7** | 8–14 ✓ |
| profile_danger | 0.8 | **4** | 2–5 ✓ |

### burnout_diagnostic_v1

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_minimal | 2 | **15.3** | 10–18 ✓ |
| profile_mild | 20.1 | **30** | 22–32 ✓ |
| profile_moderate | 0 | **8.1** | 5–10 ✓ |
| profile_severe | 18.5 | **10.2** | 6–12 ✓ |
| profile_critical | 2.1 | **3.9** | 2–5 ✓ |
| profile_emotional_exhaustion | 9.1 | **4.6** | 4–9 ✓ |
| profile_cynicism | 8.1 | **4.5** | 4–9 ✓ |
| profile_inefficacy | 8 | **4.6** | 4–9 ✓ |
| profile_somatic | 8.4 | **4.9** | 4–9 ✓ |
| profile_cognitive | 8.1 | **4.5** | 4–9 ✓ |
| profile_demotivation | 7.5 | **4.7** | 4–9 ✓ |
| profile_work_overload | 8 | **4.8** | 4–9 ✓ |
| **Σ семь фокусных** | 57.2 | **32.6** | 28–38 ✓ |

Недостижимые: до — profile_moderate; после — нет.

### digital_detox_test

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_healthy | 1.9 | **17.1** | 12–20 ✓ |
| profile_moderate_use | 32.2 | **32** | 25–35 ✓ |
| profile_problematic | 0 | **7.8** | 5–10 ✓ |
| profile_severe | 11.4 | **5.2** | 5–10 ✓ |
| profile_critical | 0.7 | **2.6** | 1–4 ✓ |
| profile_addiction_focus | 9.6 | **6.3** | 4–9 ✓ |
| profile_attention_focus | 8.3 | **4.7** | 4–9 ✓ |
| profile_social_focus | 8.5 | **5.9** | 4–9 ✓ |
| profile_health_focus | 7.5 | **5** | 4–9 ✓ |
| profile_productivity_focus | 7.1 | **4.9** | 4–9 ✓ |
| profile_emotional_focus | 6.1 | **4.5** | 4–9 ✓ |
| profile_usage_focus | 6.8 | **4** | 4–9 ✓ |
| **Σ семь фокусных** | 53.9 | **35.3** | 28–38 ✓ |

Недостижимые: до — profile_problematic; после — нет.

### social_battery_v1

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_extrovert | 2.8 | **10.8** | 8–14 ✓ |
| profile_introvert | 2.8 | **10** | 8–14 ✓ |
| profile_deep_introvert | 0.2 | **4.4** | 3–7 ✓ |
| profile_balanced | 35.7 | **13.3** | 0–18 ✓ |
| profile_ambivert_social | 13.3 | **9.9** | 6–12 ✓ |
| profile_ambivert_introvert | 12.1 | **9.3** | 6–12 ✓ |
| profile_social_anxious | 9.8 | **10.3** | 6–12 ✓ |
| profile_adaptive | 9.6 | **9.2** | 4–10 ✓ |
| profile_social_recharger | 3.6 | **6.7** | 3–8 ✓ |
| profile_group_lover | 3 | **6.7** | 3–8 ✓ |
| profile_solitude_seeker | 3.5 | **4** | 3–8 ✓ |
| profile_quick_drainer | 3.7 | **5.4** | 3–8 ✓ |

### values_priorities_v1

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_aligned | 0.1 | **13.4** | 8–15 ✓ |
| profile_energy_misaligned | 46.1 | **23** | 18–28 ✓ |
| profile_values_without_action | 5.9 | **11.3** | 6–12 ✓ |
| profile_burnout_risk | 0.1 | **3.4** | 2–6 ✓ |
| profile_freedom_seeker | 6.4 | **7.6** | 5–10 ✓ |
| profile_stability_seeker | 5.9 | **6.6** | 5–10 ✓ |
| profile_relationships_focused | 3.6 | **8.8** | 5–10 ✓ |
| profile_growth_oriented | 3 | **7.3** | 5–10 ✓ |
| profile_balanced | 28.9 | **18.6** | 0–20 ✓ |

### friendship_psychology_v1

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_mixed | 65.6 | **23.2** | 0–25 ✓ |
| motivator_inspirer | 0 | **10.1** | 1–12 ✓ |
| warm_empathic_friend | 2.5 | **9.1** | 2–12 ✓ |
| reliable_stable_friend | 10.3 | **10.2** | 2–12 ✓ |
| communication_bridge | 6.8 | **8.8** | 2–12 ✓ |
| philosophical_deep_friend | 0.9 | **7.7** | 2–12 ✓ |
| independent_free_friend | 5 | **5.3** | 2–12 ✓ |
| adventure_partner | 1.9 | **2.1** | 2–12 ✓ |
| caring_guardian | 0.8 | **2.2** | 2–12 ✓ |
| intuitive_feel_reader | 0.6 | **6.3** | 2–12 ✓ |
| social_circle_builder | 1.5 | **5.9** | 2–12 ✓ |
| calm_observer | 3.3 | **4.6** | 2–12 ✓ |
| emotional_dramatic_friend | 0.8 | **4.7** | 2–12 ✓ |
| **Σ сумма именных** | 34.4 | **77** | 70–100 ✓ |

### love_languages_v1

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_words | 10.6 | **10.3** | 8–14 ✓ |
| profile_time | 10.7 | **10** | 8–14 ✓ |
| profile_gifts | 10.2 | **9.6** | 8–14 ✓ |
| profile_service | 11.4 | **10.8** | 8–14 ✓ |
| profile_touch | 9.9 | **9.5** | 8–14 ✓ |
| profile_words_time | 4.8 | **4.1** | 3–8 ✓ |
| profile_words_service | 5.1 | **4.3** | 3–8 ✓ |
| profile_words_touch | 4.2 | **3.5** | 3–8 ✓ |
| profile_time_service | 4.3 | **3.6** | 3–8 ✓ |
| profile_time_touch | 4.3 | **3.5** | 3–8 ✓ |
| profile_service_touch | 3.9 | **3.3** | 3–8 ✓ |
| profile_time_gifts | 5.7 | **5** | 3–8 ✓ |
| profile_words_gifts | 5.3 | **4.6** | 3–8 ✓ |
| profile_service_gifts | 0 | **4.4** | 3–8 ✓ |
| profile_touch_gifts | 0 | **3.5** | 3–8 ✓ |
| profile_balanced | 9.8 | **9.8** | 5–10 ✓ |

### relationship_compatibility_v1

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_perfect_match | 3.1 | **14.8** | 10–18 ✓ |
| profile_good_potential | 59.5 | **56.4** | 45–60 ✓ |
| profile_needs_alignment | 37.4 | **28.9** | 20–30 ✓ |

### romantic_potential_v1

| Профиль | До | После | Коридор |
|---|---|---|---|
| profile_secure_romantic | 8.3 | **20.8** | 15–25 ✓ |
| profile_mixed_romantic | 53.6 | **55.8** | 45–58 ✓ |
| profile_romantic_challenges | 38 | **23.5** | 15–25 ✓ |

### text_conflict_communication

| Профиль | До | После | Коридор |
|---|---|---|---|
| the_ghoster | 10.3 | **21** | 12–22 ✓ |
| the_exploder | 9.9 | **19.7** | 12–22 ✓ |
| the_passive_avenger | 10.2 | **20.7** | 12–22 ✓ |
| the_assertive | 9.9 | **19.9** | 12–22 ✓ |
| the_mixed | 59.8 | **18.6** | 12–22 ✓ |
