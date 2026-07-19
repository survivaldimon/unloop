# HeyGen для новичка — пошагово, с промтами для копипаста

Цель: получить говорящий ИИ-аватар (девушка, UGC-стиль) с озвучкой на английском, вертикальное видео 9:16, для рекламы Unloop.

---

## Этап 0 — Регистрация · 5 минут

1. Открой **heygen.com** → кнопка **Sign up** → войди через Google.
2. Бесплатный план даёт несколько видео в месяц с ватермаркой в 720p — этого хватит, чтобы всё попробовать. Карту привязывать не нужно.
3. После входа попадёшь в дашборд. Слева меню: **Home / Projects / Avatars / Voices / Templates**. Нам нужны только **Home** (создание видео) и **Avatars** (свой персонаж).

---

## Этап 1 — Первое видео со стоковым аватаром · 15 минут

Сначала сделай тест на готовом аватаре — без создания своего. Так поймёшь весь цикл за один заход.

1. **Home → кнопка Create video** (или «+ Create»). Если спросит формат — выбери **Portrait / 9:16**.
2. Откроется редактор. Вкладка **Avatar** (слева): в поиске набери `UGC` или листай фильтры **Lifestyle / Casual**.
   Кого искать: женщина ~25–35, обычная (не модельная), свитер или футболка, фон — спальня, диван или машина. Никаких офисов и костюмов.
   Кликни по аватару → он встанет на холст.
3. Под холстом — **поле Script**. Удали заглушку и вставь Сценарий A из раздела «Сценарии» ниже (просто скопируй весь блок).
4. **Голос**: рядом с полем скрипта видно имя текущего голоса — кликни по нему. В открывшемся списке поставь фильтры: **Language: English (US) · Gender: Female**. Прослушай 3–4 голоса кнопкой play, ищи «разговорный» (тег Conversational/Casual), тёплый, не дикторский. Скорость (Speed) оставь 1.0.
5. Нажми **play/preview у скрипта** — прослушай озвучку ДО генерации (это бесплатно, генерация тратит кредиты). Если голос спотыкается — поправь текст: точки и многоточия `...` дают паузы; числа лучше писать словами (`thirty-two`, не `32`).
6. Кнопка **Generate / Submit** (правый верхний угол). Рендер 2–5 минут — видео появится в **Projects**.
7. Открой результат → **Download** → MP4. На бесплатном тарифе будет ватермарка — для теста нормально, для запуска рекламы понадобится план **Creator (~$29/мес)**: убирает ватермарку и даёт 1080p.

Готово: у тебя есть первый ролик. Дальше — свой уникальный персонаж.

---

## Этап 2 — Свой персонаж (Photo Avatar) · 20 минут

Зачем: стоковых аватаров крутят все арбитражники, а свой персонаж будет только у тебя, и его можно снимать во всех роликах кампании — зритель начнёт узнавать «эту девушку».

### Вариант 1 — сгенерировать фото прямо в HeyGen
1. Слева меню **Avatars** → кнопка **Create avatar**.
2. Выбери **Photo avatar** (не «Video avatar» — тот требует съёмку реального человека).
3. Там будет опция **Generate with AI** (создать фото нейросетью): вставь промт из раздела «Промт персонажа» ниже. Если вместо свободного промта — анкета (пол/возраст/стиль), выбирай: Female · 25–35 · Casual · Bedroom/indoor.
4. Из предложенных вариантов выбери самое «живое» лицо (естественная кожа, не глянец) → сохрани аватара, назови, например, `unloop-emma`.
5. Если кнопка недоступна на бесплатном тарифе — не страдай, иди по Варианту 2 или работай со стоковым до апгрейда.

### Вариант 2 — фото из бесплатной нейросети + загрузка
1. Открой **gemini.google.com** (бесплатно, генерит картинки) → вставь промт из раздела «Промт персонажа» → скачай лучший результат.
2. В HeyGen: **Avatars → Create avatar → Photo avatar → Upload photo** → загрузи → сохрани.

### Использование
В редакторе видео (Этап 1, шаг 2) твой персонаж появится во вкладке Avatar в разделе **My avatars**. Дальше всё то же: скрипт → голос → Generate.

---

## Промт персонажа (вставить в HeyGen «Generate with AI» или в Gemini)

Главная героиня:
```
Candid iPhone selfie photo of a woman in her late 20s, soft natural makeup,
slightly tired but warm expression, oversized beige knit sweater, sitting on
a bed in a cozy dim bedroom at night, lit by a warm bedside lamp and a faint
phone-screen glow, looking directly at the camera, realistic skin texture
with visible pores, amateur photography style, vertical 9:16 format.
No studio lighting, no glamour, no heavy makeup.
```

Она же, вариация для второго адсета (машина, день):
```
Candid iPhone photo of the same woman in her late 20s, hair in a messy bun,
grey t-shirt, sitting in the driver's seat of a parked car in daylight,
natural window light, looking at the camera as if recording a story,
realistic skin texture, amateur style, vertical 9:16.
```

Она же, вариация (диван, вечер):
```
Candid iPhone photo of the same woman in her late 20s, wearing a hoodie,
sitting on a couch under a blanket in a dim living room in the evening,
soft TV glow in the background, looking at the camera, realistic, amateur
style, vertical 9:16.
```

---

## Сценарии — копипаст в поле Script

Тексты уже отформатированы под озвучку: многоточия = паузы, числа словами, «k.» переписано так, чтобы робот прочитал правильно. Один сценарий = одно видео.

### Сценарий A · «The test read me» · ~30 сек — начни с него
```
A five-minute test just called me out... and I need to talk about it.
Every relationship I've had ended the same way. He goes quiet... I double-text... he pulls away harder. I thought it was bad luck.
This test mapped it as a loop. Five steps, same order, every time... with my own words quoted back at me.
Step two? "Your brain skips evidence, and goes straight to the verdict." ...Yeah.
It's free, and it takes five minutes. Link below — go find your loop.
```

### Сценарий B · «Three exes, one script» · ~25 сек
```
Three exes. One script. I can prove it.
Month one: amazing. Month three: he's "busy". Month four: I'm spending forty minutes drafting a text that's supposed to look casual.
I used to blame timing. Turns out... I wasn't picking people. My pattern was.
There's a free test that maps the exact loop you repeat, and shows who's actually safe for it.
Took me five minutes. Go find your loop.
```

### Сценарий C · «Why do they always pull away» · ~30 сек
```
If every person you date eventually "needs space"... listen.
It's not a coincidence, and it's not your standards. There's usually a loop. Distance shows up... the fear gets loud... you close the gap with force... they feel the pressure... they step back.
And the distance you were scared of? You helped build it. I know. Brutal.
But a loop breaks at exactly one step... and a free five-minute test shows you which one. Link below.
```

### Сценарий D · «The "k." text» · ~20 сек · самый энергичный
```
He texted me one letter. "K." ...And I lost a whole evening. Explain that.
Actually... a test explained it. One letter shouldn't run my night. But it hit step one of a five-step loop I didn't even know I was in.
Now I've seen my loop... mapped out... with my own answers inside it.
It's free. Thirty-two questions. Slightly too accurate. Go find your loop.
```

### Сценарий E · «Slot machine» · ~25 сек
```
Hot on Monday... gone by Thursday. And you call that chemistry?
Someone finally told me: to my pattern, that's not chemistry... that's a slot machine. Consistent people felt "boring", because my loop only recognized suspense as love. Ouch.
This free test shows your pattern... plus who's actually safe for it, and who restarts the whole cycle.
Five minutes. Go find your loop.
```

---

## Этап 3 — Субтитры и финальная сборка в CapCut · 20 минут

HeyGen отдаёт «голую» говорящую голову. Рекламный вид ролик приобретает в CapCut (бесплатно: capcut.com или десктоп-приложение).

1. **New project** → перетащи в таймлайн видео из HeyGen.
2. Добавь перебивку: запиши экран прохождения своего теста (Windows: **Win+Alt+R** пишет экран; телефон: встроенная запись экрана) и вставь 2–3 секунды скринкаста в середину ролика — Meta любит, когда видно продукт.
3. **Text → Auto captions → English** → субтитры создадутся сами. Стиль: белый жирный шрифт, чёрная обводка, 2–4 слова на строку, позиция — нижняя треть, но не в самом низу (там интерфейс TikTok).
4. Первые 2 секунды: продублируй первую фразу крупным текстом на весь экран (обычный Text-слой).
5. В конец добавь энд-кард на 2 секунды: чёрный фон, текст `You don't have bad luck in love. You have a loop.` и ниже плашка `Find my loop →`.
6. Музыка: любой спокойный lo-fi из библиотеки CapCut, громкость -20 дБ (голос должен доминировать).
7. **Export**: 1080×1920, 30 fps, MP4.

---

## Этап 4 — Вариации и порядок работы

1. Один сценарий = одно видео в HeyGen. Начни со Сценария A на стоковом аватаре (бесплатно, с ватермаркой) — просто чтобы пройти весь путь.
2. Если результат нравится → план Creator (~$29/мес) → создай своего Photo Avatar → перегенерируй A, потом B–E.
3. Вариации хука: не перегенерируй всё видео — в CapCut просто заменяй первые 2 секунды (текст на экране + при желании перезаписанная первая фраза отдельной короткой генерацией в HeyGen).
4. Схема имён файлов: `unloop_av_A_hook1_emma_v1.mp4`.
5. При заливке в TikTok включи тумблер **AI-generated content**.

---

## Частые грабли

- **Голос звучит как диктор** → ищи теги Conversational/Casual, не Narration.
- **Аватар тараторит** → добавь многоточия, разбей длинные предложения точками.
- **Робот странно читает слово** → напиши фонетически (`thirty-two`, `K. Just K.`).
- **Кредиты кончились на тестах** → всегда слушай превью озвучки до Generate; сама генерация — самое дорогое действие.
- **Лицо на фото «пластиковое»** → в промт добавь `realistic skin texture with visible pores, amateur photography`, убери слова beautiful/perfect.
- **Слова из чёрного списка** (anxiety, trauma, healing, diagnosis, «you have…») — в сценариях выше их нет; если пишешь свой текст, сверься с `creative-brief.md` §5, иначе Meta зарежет объявление.
