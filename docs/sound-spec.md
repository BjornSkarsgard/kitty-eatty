# Звук: состояние и сохранённые промпты

Сверено 2026-10-30: в `src/assets/audio/` уже есть 31 MP3 — музыка `music_game`, `music_lofi`, `music_win` и 28 эффектов. Источники перечислены в `SOURCES.txt`; тарифы и даты в нём ещё не заполнены, лицензии этой сверкой не подтверждались. Промпты ниже — история и заготовки для замены/добавления, не список отсутствующих файлов. Новые генерации сначала показать вне проекта и получить одобрение Ивана. В рамках обновления документации звук не менялся.

Файлы в формате **MP3** кладём в `src/assets/audio/` с точными именами из таблиц. Если файла нет, игра молчит и не падает, поэтому добавлять можно по одному.

**Лицензия:** генерировать на платном тарифе Suno (Pro или Premier), иначе коммерческое использование запрещено. Если короткие эффекты в Suno не получаются, бери из бесплатных библиотек с лицензией **CC0**: Kenney.nl, раздел CC0 на freesound.org. Источник каждого файла записывай в `src/assets/audio/SOURCES.txt`.

## Музыка

| Файл | Что | Длина |
|---|---|---|
| `music_game.mp3` | Фон «Мяу-песенка»: мяу-песня в стиле cozy lofi (см. ниже). Зацикливается игрой. | 1–3 мин |
| `music_lofi.mp3` | Фон «Кошачий сон» (по умолчанию): инструментальный lo-fi без вокала, 85 BPM. Игрок выбирает трек в настройках (кнопка музыки). Новый трек — в `CONFIG.audio.tracks`, `beats` и `STR.tracks`. | 1–3 мин |
| `music_loading.mp3` | Не нужна: на загрузке музыки нет. | — |
| `music_win.mp3` | Джингл победы: короткий, радостный. | 2–3 с |

**Про зацикливание.** Идеальный стык конец→начало не нужен: игра сама склеивает петлю перекрёстным затуханием (последние 2,5 с трека плавно гаснут, одновременно с начала нарастает новая копия). Важно только:
- без вступления-раскачки и без концовки/затухания — трек «с середины до середины»;
- одинаковый темп и настроение на всём протяжении (без смены куплет→соло).

Если Suno всё равно делает интро и финал — отрежь их в Audacity (бесплатно): оставь кусок от начала такта до начала такта.

Пример запроса для Suno (фон):
> cozy lo-fi casual mobile game background music, ukulele, glockenspiel, soft bass, playful cats theme, calm, instrumental, no intro, no outro, no fade out, steady groove, same energy throughout

### «Мяу-песня» (вокал из мяуканья)

Своя песня с нуля, где вместо слов поют «мяу». Не перепевка известного трека: каверы и переделки чужих песен требуют лицензии правообладателя.

**Куда:** экран загрузки (`music_loading.mp3`) и, возможно, джингл победы. Фон уровня (`music_game.mp3`) лучше оставить **инструментальным**, на той же мелодии. Мяуканье поверх 10 минут игры начнёт раздражать. Если захочешь, сделаю переключатель «мяу-вокал» в настройках.

**Suno → поле Style:**
> cozy lofi hip hop, 85 bpm, cute soft cat vocals singing only "meow", dreamy mellow chords, warm Rhodes piano, vinyl crackle, soft boom bap drums, gentle bass, relaxing, catchy hook, no intro, no outro, no fade out

**Suno → поле Lyrics** (свои слова, режим Custom):
```
[Intro]
Mrrr-meow!

[Verse]
Meow meow meow meow, meow meow meow
Meow meow meow meow, meow meow meow
Mya-mya-mya meow, meow meow meow
Purr purr purr purr, meow!

[Chorus]
Meow-meow-meow-meow-meow-meow-meow!
Meow-meow-meow-meow-meow-meow-meow!
Mya-mya-meow, mya-mya-meow
Meow-meow-meow-meow, MEOW!

[Verse]
Nya nya nya nya, meow meow meow
Mrrr mrrr mrrr, meow meow meow

[Chorus]
Meow-meow-meow-meow-meow-meow-meow!
Mya-mya-meow, mya-mya-meow
Meow-meow-meow-meow, MEOW!
```

**Инструментал той же мелодии для фона:** в Suno у трека есть Remix/Cover. Сделай версию со стилем `instrumental, no vocals, cozy, softer` либо вынеси вокал в отдельную дорожку через Stems.

**Не забудь BPM.** В стиле указано 85. Если Suno сделает другой темп, напиши мне, и я подгоню вращение головы на экране загрузки (`loading.bpm` в `src/config.js`).

### «Кошачий трэп» (агрессивный рэп из мяуканья)

Шуточный трек, тоже свой, с нуля. Куда можно: трейлер и промо в магазинах, экран победы на сложных уровнях и головоломках, будущие «боссы» или испытания. Файл: `music_trap.mp3`.

**Suno → Style:**
> aggressive trap rap, 140 bpm, hard 808 bass, rattling hi-hats, dark minor piano loop, angry cat rapper vocals rapping only "meow" and "mrrrow", fast flow, ad-libs "hiss", "rrrr", "mya!", punchy, meme energy, no intro, no fade out

**Suno → Lyrics** (Custom):
```
[Intro]
(Hsss...) Mrrrow! Mya! Mya!

[Verse 1]
Meow meow meow-meow, meow meow meow!
Meow-meow-meow meow, mrrrow, meow meow!
Mya-mya-mya meow, meow-meow-MEOW!
Meow meow meow, meow meow — HSSS!

[Hook]
MEOW! MEOW! Meow-meow-meow-meow!
MRRROW! MRRROW! Meow-meow-meow-meow!
Mya-mya-mya, meow-meow-meow!
MEOW! (rrrr) MEOW! (hsss)

[Verse 2]
Meow-meow, meow-meow, meow-meow-meow-meow!
Mrrr-meow-meow, meow-meow-meow-MEOW!
Mya mya meow, mya mya meow!
Meow meow meow meow — MRRROW!

[Hook]
MEOW! MEOW! Meow-meow-meow-meow!
MRRROW! MRRROW! Meow-meow-meow-meow!
Mya-mya-mya, meow-meow-meow!
MEOW! (rrrr) MEOW! (hsss)

[Outro]
Meow... (hsss)
```

Если Suno начнёт вставлять настоящие слова, добавь в Style `no real words, only meow sounds`.

## Эффекты

| Файл | Когда звучит | Характер |
|---|---|---|
| `sfx_pick.mp3` | Подняли порцию | Короткий мягкий «поп» |
| `sfx_drop.mp3` | Порция легла в банку | Мягкий «плюх» или стук корма |
| `sfx_invalid.mp3` | Так ходить нельзя | Тихий глухой «бамп», не раздражающий |
| `sfx_complete.mp3` | Банка собрана | Блестящий «дзинь» |
| `sfx_meow_1.mp3`, `sfx_meow_2.mp3`, `sfx_meow_3.mp3` | Кот идёт есть (случайный из трёх) | Короткое милое «мяу», разные интонации |
| `sfx_chew.mp3` | Кот жуёт | Хруст корма, 0,5–1 с |
| `sfx_purr.mp3` | Кот наелся | Мурлыканье, 1–2 с |
| `sfx_button.mp3` | Нажатие кнопки | Короткий клик |
| `sfx_undo.mp3` | Отмена хода | Быстрый «вжух» назад |

Эффекты должны быть короткими, без тишины в начале и тихими: громкость я выставлю в `src/config.js`.

## Промпты для ElevenLabs Sound Effects

**Настройки:** длительность задавай вручную, как в таблице, не оставляй Auto. Prompt Influence ставь высокий, около 70–80 %: так результат ближе к тексту. На каждый промпт генерируй 3–4 варианта и выбирай лучший. Коммерческое использование разрешено только на платном тарифе, его указывай в `SOURCES.txt`.

**Общий хвост** (добавлять в конец каждого промпта):
> cute cozy mobile casual game, clean, close-mic, dry, no reverb, no music, no background noise, starts instantly with no silence

| Файл | Длит. | Промпт |
|---|---|---|
| `sfx_pick.mp3` | 0,5 с | Soft short bubbly pop, like lifting a small piece of cat food, light and playful, gentle upward pitch |
| `sfx_drop.mp3` | 0,5 с | Soft muffled plop of a small piece of kibble landing in a glass jar on top of other food, gentle wooden-ish tap |
| `sfx_invalid.mp3` | 0,5 с | Gentle dull low thud, soft rubbery double bump, polite "not allowed" feedback, not harsh, not a buzzer |
| `sfx_complete.mp3` | 1 с | Bright sparkly magical chime, two quick rising bell notes, happy reward ding with a short shimmer tail |
| `sfx_button.mp3` | 0,5 с | Short soft UI button click, rounded plastic tap, subtle and pleasant |
| `sfx_undo.mp3` | 0,5 с | Quick soft reverse whoosh, airy swoosh going backwards, light rewind feel |
| `sfx_meow_1.mp3` | 1 с | Single short cute kitten meow, curious and friendly, rising intonation "mew?" |
| `sfx_meow_2.mp3` | 1 с | Single short happy cat meow, cheerful and excited, bright "meow!" |
| `sfx_meow_3.mp3` | 1 с | Single short soft cat chirp-meow, sweet trilling "mrrp", like greeting its owner |
| `sfx_chew.mp3` | 1,5 с | Small cat eating dry kibble, four separate crunchy bites with short pauses between them, cute close-up chewing, no slurping |
| `sfx_purr.mp3` | 2 с | Content cat purring close up, warm soft steady rumble, happy and relaxed, ends with a fade |
| `music_win.mp3` | 2,5 с | Short cheerful victory jingle, xylophone and bells playing a quick rising arpeggio ending on a happy major chord, cartoon style |

**После генерации:**
- Сначала покажи результат Ивану вне проекта. После явного одобрения переименуй и положи в `src/assets/audio/`. Если ElevenLabs отдаёт не MP3, просто положи файл как есть: я сконвертирую и обрежу тишину.
- Для `music_win` в «Общем хвосте» убери слова `no music`.
- Если мяу звучит слишком реалистично или грустно, добавь `cartoon, playful`. Если звук слишком «игрушечный», убери `cute`.
