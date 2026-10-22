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
  ],

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
    maxPerRow: 4,
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
