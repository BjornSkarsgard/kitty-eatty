// Все числа игры, которые имеет смысл крутить руками.
export const CONFIG = {
  width: 720,      // логическое разрешение, портрет
  height: 1280,
  background: '#2b2140',

  // Цвет корма = цвет кота. Форма дублирует цвет для дальтоников.
  colors: [
    { fill: 0xff6b6b, shape: 'circle' },
    { fill: 0x4dabf7, shape: 'triangle' },
    { fill: 0xffd43b, shape: 'star' },
    { fill: 0x69db7c, shape: 'square' },
    { fill: 0xcc5de8, shape: 'diamond' },
    { fill: 0xff922b, shape: 'cross' },
    { fill: 0x3bc9db, shape: 'heart' },
    { fill: 0xf8f9fa, shape: 'ring' },
    { fill: 0xa47148, shape: 'drop' },
    { fill: 0xf783ac, shape: 'hourglass' },
  ],

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
    puzzle: { from: 120, every: 10, offset: 7, colors: [3, 5], capacity: 4, empties: 1, dead: [0.4, 0.8] },
    minMovesPerColor: 1.5, // отсев слишком коротких уровней: минимум ходов ≥ цвета × это
  },

  outline: 0x1b1426,     // толстый тёмный контур
  outlineWidth: 6,
  bowlFill: 0x3d3058,
  bowlDoneStroke: 0xffd43b, // контур собранной миски

  layout: {
    titleY: 60,
    catsY: 190,         // ряд котов
    catSpacing: 120,    // максимум между котами
    bowlsTop: 360,      // зона мисок
    bowlsBottom: 1090,
    maxPerRow: 6,
    sideMargin: 24,     // отступ мисок от краёв экрана
    bowlWidth: 120,
    portionHeight: 58,
    bowlPadding: 10,
    bowlGapX: 40,
    bowlGapY: 80,
    buttonsY: 1190,
  },

  anim: {
    liftY: 34,            // насколько поднимается выбранная серия
    liftDuration: 110,
    moveUp: 70,           // высота дуги над мисками при перекладывании
    moveDuration: 120,    // каждый из трёх отрезков пути
    moveStagger: 45,      // задержка между порциями одной серии
    shakeDistance: 10,
    shakeDuration: 50,
    catWalkDuration: 420, // кот идёт к миске
    catEatOffsetY: 70,    // где кот стоит относительно верха миски
    eatPerPortion: 160,   // съедание одной порции
    catReturnDelay: 250,
    winDelay: 600,        // пауза перед окном победы
  },
};
