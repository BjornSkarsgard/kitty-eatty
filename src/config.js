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
  bowlDoneStroke: 0xffd43b, // ободок собранной банки

  // Порция корма в банке
  portion: {
    layerLighten: 0.55, // насколько светлее слой, если есть картинка корма (0 — цвет корма, 1 — белый)
    layerDarken: 0.28,  // для очень светлых цветов (белый) слой наоборот темнее
    iconHeight: 0.8,    // картинка корма не выше этой доли высоты слоя…
    iconWidth: 0.6,     // …и не шире этой доли его ширины
  },

  // Банка для корма (рисуется кодом)
  jar: {
    glass: 0xdfe7ff,      // стекло
    glassAlpha: 0.16,
    rim: 0xcfd8ff,        // горлышко
    rimHeight: 16,
    rimOverhang: 6,       // насколько горлышко шире банки с каждой стороны
    base: 0x8c6a4f,       // подставка-миска снизу
    baseHeight: 18,
    baseOverhang: 12,
    highlightAlpha: 0.35, // блик на стекле
    radius: 18,
  },

  layout: {
    titleY: 60,
    catsFloorY: 234,    // где стоят лапы котов (подоконник на фоне bg_game)
    catSpacing: 120,    // максимум между котами
    bowlsTop: 300,      // зона банок
    bowlsBottom: 1050,  // низ нижнего ряда банок (стол на фоне); банки «стоят» на нём
    maxPerRow: 6,
    sideMargin: 24,     // отступ мисок от краёв экрана
    bowlWidth: 120,
    portionHeight: 58,
    bowlPadding: 10,
    bowlGapX: 40,
    bowlGapY: 80,
    buttonsY: 1212,
  },

  anim: {
    liftY: 34,            // насколько поднимается выбранная серия
    liftDuration: 110,
    moveUp: 70,           // высота дуги над мисками при перекладывании
    moveDuration: 120,    // каждый из трёх отрезков пути
    moveStagger: 45,      // задержка между порциями одной серии
    shakeDistance: 10,
    shakeDuration: 50,
    // кот: фон
    idleBreath: 0.04,     // дыхание: насколько тело раздувается
    idleBreathDuration: 1300,
    idleTailAngle: 14,    // размах хвоста, градусы
    idleTailDuration: 900,
    blinkMin: 1800,       // моргание: случайный интервал
    blinkMax: 5000,
    blinkDuration: 130,

    // кот: ходьба
    walkSpeed: 520,       // px/с
    walkMinDuration: 350,
    stepDuration: 150,    // один шаг
    stepLift: 7,          // насколько поднимается лапа
    stepAngle: 10,        // наклон лапы при шаге, градусы
    walkBob: 4,           // подпрыгивание тела на шаге
    walkSway: 3,          // покачивание тела, градусы

    // кот: кормление
    meowDuration: 260,
    hopHeight: 90,        // высота прыжка
    hopSpeed: 900,        // px/с
    hopMinDuration: 320,
    squash: 0.12,         // сплющивание при приземлении
    squashDuration: 90,
    catEatOffsetY: 62,    // где кот стоит относительно верха банки
    eatPerPortion: 260,   // один укус
    eatDip: 16,           // насколько голова ныряет в банку
    eatTilt: 8,           // наклон головы при укусе, градусы
    crumbs: 7,            // крошек на укус
    hearts: 5,            // сердечек, когда наелся
    catReturnDelay: 350,

    // реакции кота на тап (5 штук, выбирается случайная)
    poke: {
      hold: 220,           // пауза в конце реакции
      jumpHeight: 45, jumpDuration: 170,
      nopeAngle: 14, nopeDuration: 90, nopeRepeat: 2,
      purrDuration: 220, purrTilt: 10, purrHearts: 3,
      flipHeight: 70, flipDuration: 520,
      scaredHeight: 30, scaredDuration: 140,
    },

    winDelay: 900,        // пауза перед окном победы
    confetti: 60,
  },

  // Части кота. x/y — где часть на коте; artScale/artX/artY — подгонка картинок из src/assets
  // (artScaleX — если ширину нужно масштабировать отдельно от высоты).
  cat: {
    tail: { x: 22, y: 50, artScale: 0.12, originX: 0.22, originY: 0.95 }, // x/y — основание хвоста
    body: { x: 0, y: 58, artScale: 0.13, originX: 0.5, originY: 1 }, // y — низ лап
    leg: { x: 11, y: 29, artScale: 0.065, artScaleX: 0.09, originX: 0.5, originY: 0.06 },  // x/y — «плечо» левой лапы, правая зеркально
    head: { x: 0, y: -22, artScale: 0.16, artY: -12 },
    eyes: { x: 0, y: -6, artScale: 0.146, variantScale: { grumpy: 1.15 } },  // глаза и рты — без обрезки полей (cutout --notrim), чтобы варианты совпадали
    mouth: { x: 0, y: 9, artScale: 0.19 },
  },

  audio: {
    sfx: 0.7,       // громкость эффектов
    undo: 0.8,      // множитель звука отмены
    music: 0.35,    // громкость музыки
    musicFade: 600, // мс, плавное включение/выключение
    loopCrossfade: 2500, // мс, перекрёстное затухание на стыке петли музыки
  },

  // Экран загрузки: вид изнутри миски вверх. Кот заглядывает через ободок (голова внутрь, лапы на ободке)
  // и обходит его по кругу в ритм музыки.
  loading: {
    bpm: 85,             // темп музыки загрузки (поменять под реальный трек)
    beatsPerOrbit: 8,    // за сколько долей кот обходит круг
    radius: 250,         // радиус ободка
    rimWidth: 28,
    wall: 0xe0895c,      // стенки миски у ободка
    wallDark: 0x9c4f33,  // стенки миски у краёв экрана
    opening: 0xfff3e0,   // проём (то, что видно сверху)
    rimColor: 0xf6b48a,
    catScale: 2.2,
    headInset: 62,       // насколько голова свешивается внутрь круга
    pawSpread: 104,      // лапы — по сторонам от головы
    pawAngle: 180,       // поворот лап, градусы (0 — пальчики к центру)
    pawArtSize: 38,      // высота картинки лапы (cat_paw_grip) до умножения на catScale
    pawLift: 12,         // постукивание лапой на долю
    headAngle: 180,      // поворот головы относительно ободка, градусы (0 — уши наружу)
    headBob: 14,         // покачивание головой, градусы
    pulse: 0.16,         // «подпрыгивание» головы на долю
    minDuration: 4800,   // показывать не меньше, мс
    color: 2,            // цвет кота на загрузке (индекс в colors)
  },
};
