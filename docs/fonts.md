# Шрифты

Все шрифты из списка есть на Google Fonts. Кириллица у каждого проверена через Google Fonts API 2026-10-23. Лицензии OFL, Apache или Ubuntu Font License: шрифты можно бесплатно вшивать в коммерческую игру и в APK.

Ссылки открывают страницу шрифта. Свой текст для превью (например, «Накорми котиков! Уровень 12») вводится в поле «Type here to preview text».

★ отмечены шрифты, которые я бы попробовал первыми под стиль игры: толстый контур, мультяшность, округлость.

## Заголовки и логотип

Жирные, мультяшные. Нужны для «Накорми котиков», «Все котики сыты!», номера уровня.

| Шрифт | Характер |
|---|---|
| ★ [Rubik Bubbles](https://fonts.google.com/specimen/Rubik+Bubbles) | надутые пузырчатые буквы, очень «игровой» |
| ★ [Unbounded](https://fonts.google.com/specimen/Unbounded) | широкий, округлый, современный; сделан с упором на кириллицу |
| ★ [Days One](https://fonts.google.com/specimen/Days+One) | плотный, мягкие углы, хорошо читается мелко |
| [Seymour One](https://fonts.google.com/specimen/Seymour+One) | очень тяжёлый, широкий |
| [Rubik Mono One](https://fonts.google.com/specimen/Rubik+Mono+One) | тяжёлый, только заглавные |
| [Russo One](https://fonts.google.com/specimen/Russo+One) | жирный, спортивный |
| [Dela Gothic One](https://fonts.google.com/specimen/Dela+Gothic+One) | тяжёлый, с японским характером |
| [Rampart One](https://fonts.google.com/specimen/Rampart+One) | объёмные буквы с обводкой |
| [Train One](https://fonts.google.com/specimen/Train+One) | буквы с двойным контуром |
| [Rubik Moonrocks](https://fonts.google.com/specimen/Rubik+Moonrocks) | «лунные» кратеры на буквах |
| [Rubik Puddles](https://fonts.google.com/specimen/Rubik+Puddles) | буквы с «лужицами» |
| [Rubik Wet Paint](https://fonts.google.com/specimen/Rubik+Wet+Paint) | стекающая краска |
| [Pattaya](https://fonts.google.com/specimen/Pattaya) | жирный рукописный, весёлый |
| [Lobster](https://fonts.google.com/specimen/Lobster) | жирный каллиграфический (очень популярный) |
| [Pacifico](https://fonts.google.com/specimen/Pacifico) | ретро-скрипт, «пляжный» |

## Интерфейс: кнопки, цифры, окна

Округлые, хорошо читаются на маленьком экране, есть несколько жирностей.

| Шрифт | Характер |
|---|---|
| ★ [Nunito](https://fonts.google.com/specimen/Nunito) | округлые концы, дружелюбный, от тонкого до очень жирного |
| ★ [M PLUS Rounded 1c](https://fonts.google.com/specimen/M+PLUS+Rounded+1c) | полностью скруглённый, «японский мобильный» |
| [Zen Maru Gothic](https://fonts.google.com/specimen/Zen+Maru+Gothic) | мягкий скруглённый |
| [Kosugi Maru](https://fonts.google.com/specimen/Kosugi+Maru) | скруглённый, одна жирность |
| [Kiwi Maru](https://fonts.google.com/specimen/Kiwi+Maru) | скруглённый с лёгкой «рукописностью» |
| [Comfortaa](https://fonts.google.com/specimen/Comfortaa) | геометрический, круглый, лёгкий |
| [Rubik](https://fonts.google.com/specimen/Rubik) | слегка скруглённые углы, нейтральный, много жирностей |
| [Balsamiq Sans](https://fonts.google.com/specimen/Balsamiq+Sans) | «нарисованный от руки», но ровный |
| [Montserrat Alternates](https://fonts.google.com/specimen/Montserrat+Alternates) | геометрический с необычными формами букв |
| [Jost](https://fonts.google.com/specimen/Jost) | чистый геометрический |

## Рукописные: клички котов, подписи, «записки»

| Шрифт | Характер |
|---|---|
| ★ [Pangolin](https://fonts.google.com/specimen/Pangolin) | аккуратный «маркерный», мультяшный |
| [Shantell Sans](https://fonts.google.com/specimen/Shantell+Sans) | живой рукописный, можно сделать «прыгающим» |
| [Comic Relief](https://fonts.google.com/specimen/Comic+Relief) | свободный аналог Comic Sans |
| [Neucha](https://fonts.google.com/specimen/Neucha) | простой рукописный, изначально кириллический |
| [Underdog](https://fonts.google.com/specimen/Underdog) | чудаковатый, «детский» |
| [Hachi Maru Pop](https://fonts.google.com/specimen/Hachi+Maru+Pop) | очень милый, круглый «кавайный» |
| [Yomogi](https://fonts.google.com/specimen/Yomogi) | тонкий карандашный |
| [Caveat](https://fonts.google.com/specimen/Caveat) | быстрый почерк |
| [Bad Script](https://fonts.google.com/specimen/Bad+Script) | аккуратный прописной |
| [Marck Script](https://fonts.google.com/specimen/Marck+Script) | прописной с наклоном |
| [Amatic SC](https://fonts.google.com/specimen/Amatic+SC) | узкий, высокий, только заглавные |

## Без кириллицы (не подходят)

Популярные «игровые» шрифты, которые часто советуют, но русских букв в них нет: Fredoka, Baloo 2, Lilita One, Luckiest Guy, Chewy, Titan One, Bungee, Sniglet, Coiny, Grandstander, Gluten, Varela Round, Comic Neue, Cherry Bomb One, Potta One, Mochiy Pop One, RocknRoll One.

## Как будем подключать (этап 5)

- Файл шрифта кладём в проект (`src/assets/fonts/*.woff2`), а не грузим с Google: в Cordova и при плохом интернете CDN может не загрузиться.
- Берём только нужные начертания и наборы символов (кириллица и латиница). Один шрифт тогда весит 30–80 КБ.
- Phaser рисует текст на canvas: перед стартом сцены нужно дождаться загрузки шрифта, иначе первый кадр нарисуется системным шрифтом.
- Обычно хватает двух шрифтов: один для заголовков, один для интерфейса. Третий, рукописный, — только если нужен для кличек.
