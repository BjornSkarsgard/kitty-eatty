# Звук: что нужно

Файлы в формате **MP3** кладём в `src/assets/audio/` с точными именами из таблиц. Если файла нет, игра молчит и не падает, поэтому добавлять можно по одному.

**Лицензия:** генерировать на платном тарифе Suno (Pro или Premier), иначе коммерческое использование запрещено. Если короткие эффекты в Suno не получаются, бери из бесплатных библиотек с лицензией **CC0**: Kenney.nl, раздел CC0 на freesound.org. Источник каждого файла записывай в `src/assets/audio/SOURCES.txt`.

## Музыка

| Файл | Что | Длина |
|---|---|---|
| `music_game.mp3` | Фон во время игры: мяу-песня в стиле cozy lofi (см. ниже). Зацикливается игрой. | 1–3 мин |
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
