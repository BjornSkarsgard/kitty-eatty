# Арт: фактический состав и очередь

Сверено 2026-10-30 с `src/assets/`, CONFIG и кодом отображения. В корне ассетов 271 картинка, из них 160 частей котов. «Есть» означает наличие файла; не означает, что каждый файл используется или заново одобрен. Сад главы 2 и переход кухня → сад Иван явно одобрил 2026-10-30.

## Правило генераций

Результат сначала показать Ивану вне проекта. Только после явного одобрения сохранять в проект, подключать и коммитить. Не генерировать весь список автоматически. Стиль: мягкий объёмный мультяшный Royal Match / Magic Sort, свет сверху слева; карта — вид сверху. Имена и существующая сборка важнее старой нумерации ассетов.

## Что уже есть

| Группа | Текущее состояние |
|---|---|
| Коты | 20 окрасов × 8 частей: head, body, tail, leg_l, leg_r, paw, eyes_grumpy, eyes_closed; общие eyes_open, eyes_happy, mouth_open, mouth_closed |
| Корм | food_0…food_9.png; скрытый корм food_hidden.png; portion_layer.png и portion_glow.png |
| Банка и блокеры | jar_back.png, jar_front.png, jute_wrap.png, ice_cover.png; отдельный треснувший лёд текущему коду не нужен |
| Экраны | bg_game.jpg; пять bg_room_*.jpg; hall_wall.jpg, hall_arch.png, kitchen_door.png; shop_shelves.webp |
| Карта | map_bg_1.jpg и map_bg_2.jpg; map1_d1…d6, map1_paw, map1_fx, map_sign; четыре вида узлов |
| Интерфейс | логотип, панели, кнопки и их состояния; иконки, включая Нюх, дополнительную банку, рекламу; badge_hard и badge_nightmare |
| Награды | монетные наборы coins_1…6, pack_starter, части сундука и подарка, эффекты |
| Загрузка | loading_bowl.jpg, loading_bar_track/fill; кот собирается из существующих частей, отдельная loading_head не обязательна |

## Остаток арта для существующих систем

1. **Индивидуальный вид 15 пород.** Все ульты работают, но породы используют обычные окрасы. Начать с головы мейн-куна, затем согласовать остальные необходимые части и совместимость с CatView. Будущие имена файлов не считать уже поддерживаемым контрактом загрузки.
2. **Фоны глав 3–15.** Сейчас для них нет собственных map_bg_N. Темы перечислены ниже. Декор и частицы нужны отдельно только при решении их добавлять: отсутствие уже обработано кодом.

Переход кухня → сад на стыке глав 1–2 готов: `map_transition_2.jpg`, одобрен и подключён 2026-10-30. Деревянный пол снизу, сад сверху, открытый дверной проём между стенами. Края плавно смешиваются с фонами, указатель главы расположен сбоку. Параметры — `CONFIG.map.chapterTransition`.

Отдельные иконки всех 15 ульт не являются обязательной недостачей: текущая кнопка ульты показывает голову выбранного кота. Их можно делать после отдельного решения по UI. Основные иконки усилителей уже готовы.

| Глава | Тема | Собственный фон |
|---|---|---|
| 1 | Уютная кухня | Есть |
| 2 | Сад во дворе | Есть |
| 3 | Рыбный рынок | Нет |
| 4 | Пекарня | Нет |
| 5 | Осенний парк | Нет |
| 6 | Пляж | Нет |
| 7 | Крыши ночного города | Нет |
| 8 | Чердак | Нет |
| 9 | Библиотека | Нет |
| 10 | Зимний двор | Нет |
| 11 | Ярмарка | Нет |
| 12 | Порт | Нет |
| 13 | Сад сакуры | Нет |
| 14 | Аквариум | Нет |
| 15 | Замок кошачьего короля | Нет |

## Будущие идеи, не очередь обязательных генераций

Аксессуары, причёски, новые формы глаз, узоры, отдельные уши/нос/зрачки для дополнительных анимаций, мебель и сменные интерьеры — после решения по механике и объёму. Крышки и спящие коты не реализованы, арт для них пока не требуется. Звёзды за ходы отменены; оставшиеся ui_star-файлы не означают возврат системы.

## Для публикации

Иконка приложения, адаптивная иконка Android, сплэш, скриншоты с подписями и баннеры. Требования площадок проверить перед публикацией; скриншоты получать из актуальной игры. Не считать старые размеры окончательными.

## Полный реестр существующих файлов

Для каждого из 20 окрасов (yellow, orange, red, pink, blue, teal, green, purple, white, brown, gray, cream, chocolate, gold, peach, mint, lavender, smoke, black, lilac) есть восемь файлов `cat_<окрас>_<часть>.png`: `head`, `body`, `tail`, `leg_l`, `leg_r`, `paw`, `eyes_grumpy`, `eyes_closed`. Координаты стыковки — `src/theme/cats/cat-layout.json` и CONFIG.cat.

Остальные 111 картинок:

- `badge_hard.png`
- `badge_nightmare.png`
- `bg_game.jpg`
- `bg_room_collection.jpg`
- `bg_room_home.jpg`
- `bg_room_map.jpg`
- `bg_room_profile.jpg`
- `bg_room_shop.jpg`
- `btn_green.png`
- `btn_green_pressed.png`
- `btn_yellow.png`
- `btn_yellow_pressed.png`
- `chest_body.png`
- `chest_lid.png`
- `chest_open.png`
- `coins_1.png`
- `coins_2.png`
- `coins_3.png`
- `coins_4.png`
- `coins_5.png`
- `coins_6.png`
- `eyes_happy.png`
- `eyes_open.png`
- `food_0.png`
- `food_1.png`
- `food_2.png`
- `food_3.png`
- `food_4.png`
- `food_5.png`
- `food_6.png`
- `food_7.png`
- `food_8.png`
- `food_9.png`
- `food_hidden.png`
- `fx_confetti.png`
- `fx_dot.png`
- `fx_godrays.png`
- `fx_heart.png`
- `fx_puff.png`
- `fx_sparkle.png`
- `fx_star.png`
- `gift_body.png`
- `gift_lid.png`
- `hall_arch.png`
- `hall_wall.jpg`
- `ice_cover.png`
- `icon_addjar.png`
- `icon_close.png`
- `icon_coin.png`
- `icon_collection.png`
- `icon_daily.png`
- `icon_exit.png`
- `icon_fx.png`
- `icon_gear.png`
- `icon_hint.png`
- `icon_home.png`
- `icon_map.png`
- `icon_music.png`
- `icon_premium.png`
- `icon_profile.png`
- `icon_restart.png`
- `icon_shop.png`
- `icon_sound.png`
- `icon_undo.png`
- `icon_vibro.png`
- `icon_video.png`
- `jar_back.png`
- `jar_front.png`
- `jute_wrap.png`
- `kitchen_door.png`
- `loading_bar_fill.png`
- `loading_bar_track.png`
- `loading_bowl.jpg`
- `logo.png`
- `map1_d1.png`
- `map1_d2.png`
- `map1_d3.png`
- `map1_d4.png`
- `map1_d5.png`
- `map1_d6.png`
- `map1_fx.png`
- `map1_paw.png`
- `map_bg_1.jpg`
- `map_bg_2.jpg`
- `map_transition_2.jpg`
- `map_node.png`
- `map_node_current.png`
- `map_node_locked.png`
- `map_node_puzzle.png`
- `map_sign.png`
- `mouth_closed.png`
- `mouth_open.png`
- `pack_starter.png`
- `paw.png`
- `portion_glow.png`
- `portion_layer.png`
- `shop_shelves.webp`
- `ui_btn_round.png`
- `ui_btn_round_gray.png`
- `ui_btn_round_green.png`
- `ui_btn_round_red.png`
- `ui_btn_square.png`
- `ui_btn_square_gray.png`
- `ui_btn_square_green.png`
- `ui_btn_square_red.png`
- `ui_panel.png`
- `ui_pill.png`
- `ui_plate.png`
- `ui_star.png`
- `ui_star_empty.png`
- `ui_tray.png`
