# Звук: что нужно

Файлы в формате **MP3** кладём в `src/assets/audio/` с точными именами из таблиц. Если файла нет, игра молчит и не падает, поэтому добавлять можно по одному.

**Лицензия:** генерировать на платном тарифе Suno (Pro или Premier), иначе коммерческое использование запрещено. Если короткие эффекты в Suno не получаются, бери из бесплатных библиотек с лицензией **CC0**: Kenney.nl, раздел CC0 на freesound.org. Источник каждого файла записывай в `src/assets/audio/SOURCES.txt`.

## Музыка

| Файл | Что | Длина |
|---|---|---|
| `music_game.mp3` | Фон во время игры: спокойная, уютная, ненавязчивая, без вокала. Ukulele, glockenspiel, мягкий бас. Должна бесшовно зацикливаться. | 1–2 мин |
| `music_loading.mp3` | Экран загрузки с крутящейся головой кота: весёлая, с чётким ритмом, запоминающаяся. **Напиши мне её BPM**, под него подгоню вращение. | 15–30 с, петля |
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
