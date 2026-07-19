# Unloop — Производство креативов с ИИ-аватарами (EN)

Дополнение к `creative-brief.md`. Здесь: где генерировать, пошаговый пайплайн, готовые сценарии для аватаров на английском и промты под каждый инструмент.

**Формат цели:** вертикальное видео 9:16, 1080×1920, 20–35 сек, «UGC talking head» — девушка 25–35 говорит в камеру как в сторис, перебивки b-roll, крупные субтитры, энд-кард с CTA `Find my loop →` и ссылкой survivaldimon.github.io/unloop.

---

## 1. Где генерировать: три рабочих варианта

Цены примерные (меняются — проверь на сайтах), все инструменты работают из браузера.

### Вариант A — Arcads.ai · самый быстрый путь к «как у всех арбитражников»
- Платформа сделана ровно под UGC-рекламу: выбираешь ИИ-актёра из библиотеки → вставляешь текст сценария → получаешь говорящее видео.
- ~$110/мес за ~10 видео. Дорого, но нулевая возня: липсинк, эмоции, «селфи-эстетика» из коробки.
- Когда брать: если готов бюджет и нужно 10–20 вариаций быстро.

### Вариант B — HeyGen (+ CapCut) · оптимум цена/качество ⭐ рекомендую стартовать здесь
- HeyGen Creator ~$29/мес: библиотека UGC-аватаров + «photo avatar» (оживляет сгенерированное фото — можно сделать своего уникального персонажа, которого нет в чужих рекламах).
- Текст читает встроенный голос (выбрать американский женский, разговорный) или загружаешь озвучку из ElevenLabs (~$5/мес, голос теплее).
- Сборка: CapCut (бесплатно) — субтитры, b-roll, музыка, энд-кард.
- Когда брать: соло-запуск, бюджет до $50/мес, нужен контроль над персонажем.

### Вариант C — Veo 3.1 (Google) · максимальный реализм, больше ручной работы
- Генерирует 8-секундные клипы с живой речью и звуком прямо из текстового промта — самые «неотличимые от живых» UGC-кадры сейчас.
- Доступ: подписка Google AI Pro (~$20/мес, лимит генераций) в приложении Gemini/Flow, либо по API через fal.ai / Replicate (~$3–6 за 8-сек клип).
- Минус: клипы по 8 сек, персонажа между клипами держать сложнее (нужен режим «ingredients»/референс-кадр). Реалистичный путь: **говорящую голову делать в HeyGen/Arcads, а Veo использовать для hook-шотов и b-roll**.
- Когда брать: когда захочется поднять CTR за счёт «вау, это точно живой человек» первых двух секунд.

Альтернативы, если что-то не зайдёт: Creatify (~$39/мес, дешёвый аналог Arcads), Captions.ai (мобильный, быстрые UGC-аватары), Kling / Hailuo (дешёвый b-roll из картинки).

---

## 2. Пошаговый пайплайн (вариант B, HeyGen + CapCut)

**Шаг 1. Персонаж.** Либо выбери в HeyGen готового UGC-аватара (критерии ниже), либо сгенерируй своё фото персонажа (промт в разделе 5) и создай из него Photo Avatar. Один персонаж = вся кампания: зритель начнёт её узнавать, а ты сможешь докручивать сценарии без пересборки.

Критерии выбора аватара: женщина ~25–35, «обычная симпатичная», не модельная; casual-одежда (свитер/футболка); фон — спальня/диван/машина; поза «селфи на вытянутой руке» или «телефон на подставке». Никаких студий и офисов.

**Шаг 2. Сценарий.** Возьми готовый из раздела 4 (или свой по формуле: хук ≤2 сек → история 15–20 сек → CTA 5 сек; 30 сек ≈ 75–85 английских слов). Прогони по чёрному списку из `creative-brief.md` §5.

**Шаг 3. Озвучка.** В HeyGen выбери разговорный голос (US female, «conversational») или сгенерируй в ElevenLabs: голос тёплый, чуть усталый, «подруга рассказывает»; настройки — stability ~45%, style ~30%, скорость естественная. Загрузи аудио в HeyGen.

**Шаг 4. Говорящая голова.** Сгенерируй видео 9:16. В скрипте расставь паузы точками и тире — аватар будет дышать естественнее. Одна генерация = один сценарий целиком.

**Шаг 5. B-roll (опционально, но сильно поднимает удержание).** 2–3 перебивки по 1.5–2 сек: телефон в темноте, «typing…», скринкаст самого теста (запиши экран прохождения квиза — это ещё и продукт показывает). Сток: Pexels/Pixabay (бесплатно) или сгенерируй в Veo/Kling (промты в разделе 6).

**Шаг 6. Сборка в CapCut.**
- Таймлайн: хук (аватар) → перебивка → аватар → скринкаст теста → аватар CTA → энд-кард 2 сек.
- Автосубтитры → стиль: крупный белый шрифт с чёрной обводкой, 2–4 слова на строку, нижняя треть, но выше зоны интерфейса TikTok (безопасная зона ~15% снизу).
- Первые 2 секунды продублируй хук текстом на весь экран.
- Энд-кард: тёмный фон, `You don't have bad luck in love. You have a loop.` → кнопка-плашка `Find my loop →`.
- Музыка: тихий lo-fi/ambient на -20 дБ под голосом.

**Шаг 7. Вариации.** Из каждого сценария сделай 2–3 версии, меняя ТОЛЬКО хук (первые 2 сек) — остальное не перерендеривай, просто пересклей. Хуки бери из `creative-brief.md` §1.

**Шаг 8. Экспорт и запуск.** 1080×1920, mp4, до 60 сек. Именование: `unloop_av_{script}_{hook}_{avatar}_v1`. Стартовая матрица: 2 аватара × 3 сценария × 2 хука = 12 креативов, дальше режь по CTR/CPM.

**Шаг 9. Маркировка ИИ.** TikTok: при загрузке включи тумблер «AI-generated content» (обязательно для реалистичных ИИ-людей). Meta: отдельного обязательного тумблера для обычной рекламы нет, но не оформляй ролик как «отзыв реальной клиентки» с вымышленными фактами — это «драматизация», держи формулировки в рамке личного опыта без проверяемых ложных деталей (имён, дат, «я клиент №1000»).

---

## 3. Формула сценария для аватара

```
HOOK (0–2 сек): провокация/боль, без слова «тест», без приветствий («hey guys» — нельзя).
STORY (2–20 сек): личная история от первого лица = комплаенс-безопасно. Конкретика: «ок.», 2:47, месяц третий.
PRODUCT (1 фраза): «free five-minute test», «it maps your loop step by step», «it quotes your own words back».
CTA (последние 3–5 сек): «It's free. Link below — find your loop.»
```

Тон: подруга рассказывает шёпотом-скороговоркой, самоирония, никакого «коучинга». Запрещённые слова — см. бриф §5 (никаких anxiety/trauma/healing/diagnosis и «you have [состояние]»).

---

## 4. Пять готовых сценариев для аватара (EN)

### A · «The test read me» — главный, 30 сек (~80 слов)
> A five-minute test just called me out, and I need to talk about it.
> Every relationship I've had ended the same way. He goes quiet — I double-text — he pulls away harder. I thought it was bad luck.
> This test mapped it as a loop. Five steps, same order, with my own words quoted back at me. Step two? «Your brain skips evidence and goes straight to the verdict.» …Yeah.
> It's free, it takes five minutes. Link below — find your loop.

Эмоция для аватара: заговорщицкая, «не могу молчать». B-roll: скринкаст тизера с заблюренным разбором.

### B · «Three exes, one script» — 25 сек (~70 слов)
> Three exes. One script. I can prove it.
> Month one: amazing. Month three: he's «busy». Month four: I'm spending forty minutes drafting a text that's supposed to look casual.
> I used to blame timing. Turns out I wasn't picking people — my pattern was.
> There's a free test that maps the exact loop you repeat, and shows who's actually safe for it.
> Took me five minutes. Find your loop.

Эмоция: сухая ирония, загибает пальцы на «month one / three / four».

### C · «Why do they always pull away» — 30 сек (~80 слов)
> If every person you date eventually «needs space» — listen.
> It's not a coincidence, and it's not your standards. There's usually a loop: distance shows up, the fear gets loud, you close the gap with force… they feel the pressure, they step back.
> And the distance you were scared of? You helped build it. I know. Brutal.
> But a loop breaks at exactly one step — and a free five-minute test shows you which one. Link below.

Эмоция: серьёзная, медленнее остальных, пауза после «Brutal».

### D · «The "k." text» — 20 сек (~55 слов), самый энергичный
> He texted «k period» — and I lost a whole evening. Explain that.
> Actually — a test explained it. Three letters shouldn't run my night, but they hit step one of a five-step loop I didn't even know I was in. Now I've literally seen mine, mapped out, with my own answers in it.
> Free. Thirty-two questions. Slightly too accurate. Go find your loop.

Эмоция: возмущённо-смешливая, быстрый темп. B-roll: пузырь «k.» крупно.

### E · «Slot machine» — 25 сек (~70 слов)
> Hot on Monday, gone by Thursday — and you call that chemistry?
> Someone finally told me: to my pattern, that's not chemistry, that's a slot machine. Consistent people felt «boring», because my loop only recognized suspense as love. Ouch.
> This free test shows your pattern — plus who's actually safe for it, and who restarts the whole cycle.
> Five minutes. Find your loop.

Эмоция: «разоблачение», бровь поднята на первой фразе. B-roll: барабаны слота.

---

## 5. Промты: персонаж для Photo Avatar (Midjourney / Nano Banana / любой image-ген)

Базовый портрет (главная героиня кампании):
```
Candid iPhone selfie photo of a woman in her late 20s, soft natural makeup,
slightly tired but warm expression, oversized beige knit sweater, sitting on
a bed in a cozy dim bedroom at night, lit by a warm bedside lamp and faint
phone-screen glow, looking directly at the camera, arm slightly extended
holding the phone, realistic skin texture with visible pores, shallow depth
of field, amateur photography, vertical 9:16 --no studio lighting, makeup ads,
glamour
```

Вариации той же героини (для второго адсета):
```
...same woman, hair in a messy bun, grey t-shirt, sitting in the driver's seat
of a parked car in daylight, phone mounted on dashboard POV, natural window light...
```
```
...same woman, hoodie, on a couch under a blanket, evening living room,
TV glow in background...
```
Полученное фото загрузи в HeyGen → Photo Avatar. Один и тот же персонаж во всех роликах = узнаваемость + свой «актёр», которого нет у конкурентов.

---

## 6. Промты: hook-шоты и b-roll (Veo 3.1 / Kling)

Говорящий hook-шот в Veo (первые 8 сек ролика, дальше склейка с HeyGen-аватаром или каты b-roll):
```
Handheld selfie video, vertical 9:16, amateur iPhone footage with slight
camera shake. A woman in her late 20s in an oversized knit sweater sits on
her bed in a dim cozy bedroom at night, warm lamp light, phone-screen glow
on her face. She leans in and says directly to camera, conversational and
slightly conspiratorial: "A five-minute test just called me out — and I need
to talk about it." Natural skin texture, realistic, no music.
```
(Меняй реплику в кавычках на любой хук из брифа §1 — Veo озвучит сам.)

B-roll библиотека (по 1 промту на генерацию, 8 сек, режь на перебивки):
```
Extreme close-up of a smartphone screen in a dark bedroom, messaging app open,
"typing…" indicator appears, blinks, then disappears, moody blue screen light,
shallow depth of field, vertical 9:16, cinematic realism, no people.
```
```
Overhead shot of a phone lying face-up on a bedside table at 2 AM, screen
lights up with a single notification then fades to black, warm lamp in corner
of frame, vertical 9:16, realistic.
```
```
Close-up of a woman's thumbs typing a long message on a phone in the dark,
then holding backspace until the text is gone, screen glow on hands,
vertical 9:16, realistic, melancholic mood.
```
```
Macro shot of slot machine reels spinning and stopping on mismatched symbols:
a heart, a phone, an empty slot. Neon glow on dark background, shallow depth
of field, vertical 9:16.
```
Скринкаст продукта генерировать не нужно — запиши реальный экран прохождения теста (это бесплатно и честнее любого стока).

---

## 7. Чек-лист перед выгрузкой каждого ролика

- [ ] Хук в первых 2 сек, текстом на экране + голосом. Нет «hey guys / хеллоу».
- [ ] Сценарий от первого лица, ни одного слова из чёрного списка брифа §5.
- [ ] Субтитры крупные, в безопасной зоне, совпадают с речью.
- [ ] Есть кадр продукта (скринкаст теста) — Meta любит, когда видно, куда ведёт клик.
- [ ] Энд-кард с `Find my loop →` держится ≥2 сек.
- [ ] 1080×1920, ≤35 сек, звук нормализован, музыка тише голоса.
- [ ] TikTok: включена метка AI-generated. Meta: ролик не оформлен как проверяемый «отзыв клиента».
- [ ] Название файла по схеме `unloop_av_{script}_{hook}_{avatar}_v{n}`.

---

*Связанные файлы: `creative-brief.md` (хуки §1, чёрный список §5), исходники голоса — `src/content/patterns.ts`.*
