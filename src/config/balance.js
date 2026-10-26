// Баланс: экономика, жизни, опыт кота, сундуки, подарок дня, генерация уровней, флаги рекламы и магазина.
// Собирается в CONFIG (src/config.js).
export const BALANCE = {
  // Реклама за награды (src/rewarded.js). enabled — настоящий SDK (этап 6); пока выключен: в тестовой сборке вместо ролика
  // окно «тестовая реклама», в обычной — «скоро».
  // ladder — лесенка на главной (иконка ролика): после at роликов за день — награда; shopCoins — монеты в магазине;
  // goodsEveryMin — самый дешёвый вариант подсказки / банки / отмены раз в столько минут; life — жизнь за ролик.
  ads: {
    enabled: false,
    ladder: [{ at: 1, coins: 50 }, { at: 3, coins: 150 }, { at: 5, chests: 1 }],
    shopCoins: { coins: 100, perDay: 3 },
    goodsEveryMin: 60,
    life: { perDay: 3, everyMin: 60 },
  },
  // Магазин (src/view/ShopView.js): вкладка открыта, товары за монеты работают. Рубли — после ИП (payments,
  // RuStore Pay SDK): до тех пор на кнопках «Скоро». Цены в рублях здесь — только витрина: настоящие приходят из
  // RuStore (CLAUDE.md: цены и состав — на сервере, начислять только после проверки). Бесплатное за ролик — ads.enabled.
  shop: {
    enabled: true,
    payments: false,
    // наборы (как в Magic Sort, docs/magic-sort.md): монеты, бесконечные жизни (ч), каждого умения — подсказок,
    // банок, отмен — по boosters, «Без рекламы» (noAds); art — картинка coins_<art>; tag — ленточка
    packs: [
      { id: 'starter', price: 119, coins: 1000, infiniteH: 1, boosters: 1, art: 3, tag: 'sale' },
      { id: 'pack1', price: 499, coins: 2000, infiniteH: 3, boosters: 1, noAds: true, art: 3 },
      { id: 'pack2', price: 1190, coins: 4000, infiniteH: 6, boosters: 3, noAds: true, art: 4 },
      { id: 'pack3', price: 2299, coins: 8000, infiniteH: 12, boosters: 8, noAds: true, art: 5, tag: 'popular' },
      { id: 'pack4', price: 5199, coins: 20000, infiniteH: 36, boosters: 18, noAds: true, art: 5 },
      { id: 'pack5', price: 11590, coins: 60000, infiniteH: 72, boosters: 36, noAds: true, art: 6, tag: 'best' },
    ],
    // монеты отдельно
    coinPacks: [
      { coins: 1000, price: 229 }, { coins: 5000, price: 890 }, { coins: 10000, price: 1699 },
      { coins: 25000, price: 2890 }, { coins: 50000, price: 5790 }, { coins: 100000, price: 11590 },
    ],
    // нижняя полка: умение или жизни и варианты количества. Вариант: n — сколько (у жизней — штук или minutes —
    // минут бесконечных; forever — навсегда), coins — цена в монетах (нет — только за рубли), rub — в рублях,
    // give — что начислить (src/core/save.js buyGoods). Цены — черновик, утрясём.
    goods: [
      { icon: 'hint', options: [
        { n: 1, coins: 50, rub: 19, give: { hints: 1 } },
        { n: 5, coins: 220, rub: 29, give: { hints: 5 } },
        { n: 15, coins: 600, rub: 59, give: { hints: 15 } },
        { n: 30, coins: 1100, rub: 149, give: { hints: 30 } },
      ] },
      { icon: 'addjar', options: [
        { n: 1, coins: 100, rub: 19, give: { jars: 1 } },
        { n: 5, coins: 450, rub: 29, give: { jars: 5 } },
        { n: 15, coins: 1250, rub: 99, give: { jars: 15 } },
        { n: 30, coins: 2300, rub: 279, give: { jars: 30 } },
      ] },
      { icon: 'undo', options: [
        { n: 5, coins: 130, rub: 19, give: { undos: 5 } },
        { n: 15, coins: 360, rub: 29, give: { undos: 15 } },
        { n: 30, coins: 650, rub: 79, give: { undos: 30 } },
        { n: 45, coins: 900, rub: 149, give: { undos: 45 } },
      ] },
      { icon: 'heart', options: [
        { n: 1, coins: 100, rub: 19, give: { lives: 1 } },
        { n: 5, coins: 450, rub: 59, give: { lives: 5 } },
        { icon: 'infinite', minutes: 30, coins: 250, rub: 29, give: { infiniteMin: 30 } },
        { icon: 'infinite', minutes: 60, coins: 400, rub: 59, give: { infiniteMin: 60 } },
        { icon: 'infinite', minutes: 720, coins: 2500, rub: 99, give: { infiniteMin: 720 } },
        { icon: 'infinite', minutes: 1440, coins: 4000, rub: 449, give: { infiniteMin: 1440 } },
        { icon: 'infinite', minutes: 4320, coins: 10000, rub: 999, give: { infiniteMin: 4320 } },
        { icon: 'infinite', minutes: 10080, coins: 20000, rub: 1499, give: { infiniteMin: 10080 } },
        { icon: 'infinite', forever: true, rub: 4999 },
      ] },
    ],
  },

  // Экономика: монеты и общий запас отмен хода (src/core/save.js).
  economy: {
    startCoins: 200,     // монет у нового игрока
    startUndos: 3,       // отмен у нового игрока
    // монет за первое прохождение уровня (за переигровку — ничего): обычный, сложный, кошмарный (level.kind)
    winCoins: { normal: 20, hard: 30, nightmare: 40 },
    // бегунок в окне победы (с уровня from): стрелка ездит туда-обратно по шкале ×2 ×3 ×4 ×3 ×2, нажал «за рекламу» —
    // монеты за уровень ×столько. zones — множитель (или 'chest' — сундук вместо монет) и ширина зоны
    // (×4 и сундук узкие — попасть трудно), sweepMs — проезд шкалы
    winBoost: {
      from: 5,
      zones: [[2, 13.5], ['chest', 3], [2, 13.5], [3, 17], [4, 8], [3, 17], [2, 13.5], ['chest', 3], [2, 13.5]],
      sweepMs: 900,
    },
    undoEveryLevels: 3,  // бесплатная отмена за каждые столько новых пройденных уровней
    undoPrice: 30,       // цена отмены в монетах
  },

  // Умения на уровне (docs/meta.md): «Нюх» — подсказка хода из решения в JSON уровня, «+1 банка» — пустая банка
  // до конца уровня. from — с какого уровня кота открывается (раньше — кнопка бледная с подписью), start — запас
  // нового игрока, price — монет за заряд, когда запас кончился (позже — и ролик). jar.perLevel — сколько банок
  // можно добавить на одном уровне.
  boosters: {
    // search — сколько позиций подсказка перебирает с поля игрока; weight — «жадность» поиска (больше — быстрее,
    // но ход ведёт не самым коротким путём)
    hint: { from: 4, start: 1, price: 50, search: 80000, weight: 3 },
    jar: { from: 8, start: 1, price: 100, perLevel: 1 },
    hintShowMs: 2200,    // сколько подсвечен подсказанный ход
  },

  // Ультракоты (docs/meta.md): цена по ярусу (tier в src/theme/cats/ultras.js); первый — подарок, не продаётся.
  // ultraIntroLevel — пройден этот уровень: окно знакомства с первым ультракотом (силуэт, «будет на N уровне»).
  ultraPrices: [10000, 17000, 27000],
  ultraIntroLevel: 25,
  ultInstinct: 5,         // «Чутьё» бурманской: столько следующих правильных ходов подсвечиваются по очереди
  ultLazy: 2,             // «Лентяй» персидской: столько правильных ходов кот делает сам
  ultInfiniteDev: true,   // тест: в npm run dev и тестовой сборке GitHub Pages ульта всегда готова; в обычную сборку не попадает
  ultRecharge: 5,         // ульта восстанавливается за столько пройденных уровней (переигровка старых тоже считается)

  // Сундуки (docs/meta.md): в конце каждой главы (рубеж на карте), 7-й день наград за вход и 5-й ролик за день.
  // Внутри: монеты, отмены, с шансом skinChance — рескин обычного кота, которого ещё нет (не из тех, что за уровни кота);
  // все уже есть — вместо рескина dupCoins монет.
  chest: {
    coins: 80,
    undos: 2,
    hints: 1,
    jars: 1,
    skinChance: 0.35,
    dupCoins: 150,
  },
  // Награды за вход (подарок дня, src/core/daily.js): раз в календарный день, день серии N.
  // Ценность дня N (в монетах) = base + step × (N − 1), растёт до capDay-го дня, дальше не растёт.
  // Вид награды — по дню недели серии: монеты / отмены / монеты / бесконечные жизни / монеты / банки / сундук + монеты.
  // Умения и жизни переводятся из ценности по их цене (отмена — economy.undoPrice, банка — boosters.jar.price,
  // минута бесконечных жизней — coinsPerMinute); сундук считается за chestValue монет.
  // Пропуск дня — серия сбрасывается на 1-й день.
  dailyLogin: { base: 30, step: 10, capDay: 28, coinsPerMinute: 2, chestValue: 150 },

  // Рубежи на карте («Путешествие», src/core/milestones.js): каждые every уровней. Середина главы — мелочь по кругу
  // из cycle, конец главы (levelGen.chapter) — сундук, монеты и бесконечные жизни. Награда выдаётся окном на главной,
  // когда рубеж открылся (уровень пройден).
  milestones: {
    every: 10,             // рубеж — каждые столько уровней: середина главы (levelGen.chapter = 20) и её конец
    cycle: [{ undos: 1 }, { hints: 1 }, { lives: 1 }], // середина главы — мелочь по кругу: отмена, нюх, жизнь
    chapter: { chests: 1, coins: 200, infiniteMin: 60 }, // конец главы — сундук, монеты и ∞ жизни на час
  },

  // Жизни (docs/meta.md): одна сгорает на «Заново» или при выходе из уровня, где уже был ход (после подтверждения).
  // Сами — по одной каждые refillMinutes, до max (таймер идёт и пока игра закрыта); за ролик — adGives;
  // за монеты — по одной, только когда ролик показать нельзя (пока реклама выключена — всегда).
  lives: {
    max: 5,
    refillMinutes: 30,
    price: 100,          // монет за жизнь
    adGives: 2,          // за ролик (этап 6), не больше max
  },

  // Уровень кота (docs/meta.md): опыт за победы копится в общий на игрока уровень кота.
  catXp: {
    winXp: 35,           // опыта за первое прохождение уровня (за переигровку — ничего; на сложных не умножается)…
    xpPer10Levels: 2,    // …плюс столько за каждые 10 уровней
    needBase: 60,        // опыта до 2-го уровня кота…
    needStep: 30,        // …и на столько больше до каждого следующего
    rewardCoins: 25,     // награда за новый уровень кота: монеты rewardCoins + rewardCoinsPerLevel × уровень…
    rewardCoinsPerLevel: 5,
    rewardUndos: 1,      // …отмены…
    bonusUndoEvery: 5,   // …и ещё одна на каждом таком уровне…
    hintEvery: 3,        // …подсказка на каждом таком уровне…
    jarEvery: 5,         // …и банка на каждом таком
    barWidth: 420,       // полоска опыта в окне победы
    barHeight: 38,
    barFillMs: 700,      // мс: полоска доезжает (на каждый уровень кота — заново)
  },

  // Генерация уровней (tools/generate-levels.mjs). После правки: npm run levels
  levelGen: {
    seed: 20261022,
    count: 300,
    candidates: 24,     // сколько вариантов пробуем на каждый уровень, берём ближайший к цели
    // Ступени сложности: до какого уровня, цвета (от→до внутри ступени), вместимость,
    // пустые миски, целевая трудность (доля случайных прохождений, зашедших в тупик, от→до).
    tiers: [
      { upTo: 10,  colors: [2, 4], capacity: 4, empties: 2, dead: [0.0, 0.1] },
      { upTo: 40,  colors: [4, 6], capacity: 4, empties: 2, dead: [0.05, 0.3] },
      { upTo: 80,  colors: [6, 8], capacity: 4, empties: 2, dead: [0.25, 0.45] },
      { upTo: 130, colors: [6, 8], capacity: 5, empties: 2, dead: [0.35, 0.55] },
      { upTo: 200, colors: [8, 9], capacity: 5, empties: 2, dead: [0.5, 0.7] },
      { upTo: 300, colors: [9, 10], capacity: 5, empties: 2, dead: [0.65, 0.9] },
    ],
    breatherEvery: 5,      // каждый N-й уровень — передышка
    breatherFactor: 0.4,   // во сколько раз ниже целевая трудность на передышке
    // Головоломки: короткие уровни всего с одной пустой миской, вставляются через каждые `every` уровней.
    puzzle: { from: 120, every: 10, offset: 3, colors: [3, 5], capacity: 4, empties: 1, dead: [0.4, 0.8] },
    minMovesPerColor: 1.5, // отсев слишком коротких уровней: минимум ходов ≥ цвета × это
    noNearCompleteFrom: 11, // с этого уровня отсеиваем почти собранные банки: cap-1 одного цвета снизу и сверху пусто или одна чужая
    // Главы по `chapter` уровней. В главе «сложные» (kind: 'hard') на местах `hard.at`, последний уровень главы —
    // «кошмарный» (kind: 'nightmare'). Они строятся от обычных параметров своего места (без передышки): цветов больше
    // на `colors` (не больше, чем цветов в теме), целевая трудность выше на `dead` (не больше 0.95), кандидатов ×`tries`.
    chapter: 20,
    hard: { at: [7, 14], colors: 1, dead: 0.2, tries: 2 },
    nightmare: { colors: 1, dead: 0.35, tries: 3 },
    // Механики (блокеры), docs/meta.md. intro — первый уровень с механикой (окно «Новинка!»), до него её нет;
    // дальше — на доле share уровней (на сложных и кошмарных ×kindBoost). Случайность — своя (seed + 1),
    // поэтому уровни без механик такие же, как без этого раздела.
    //   hiddenPart — скрытый корм «?»: каждая не верхняя порция скрыта с шансом part (верхняя всегда видна);
    //   hiddenFull — скрыто всё, кроме верхних порций (вместо hiddenPart, не вместе);
    //   ice — замороженные банки: jars штук (с уровня jars2From — до двух), тает после thaw[0]…thaw[1] собранных банок.
    mechanics: {
      hiddenPart: { intro: 8, share: 0.3, part: 0.45 },
      hiddenFull: { intro: 41, share: 0.2 },
      ice: { intro: 21, share: 0.25, jars2From: 80, thaw: [1, 2] },
      kindBoost: 1.5,
    },
  },
};
