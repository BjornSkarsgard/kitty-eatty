// Прогон меты «средним игроком» по всем уровням: время, монеты, опыт, уровни кота, сундуки, рескины, ультракоты.
//   node tools/meta-sim.mjs            — таблица по вехам
//   node tools/meta-sim.mjs --levels   — плюс уровни кота: на каком уровне игры получен и что дал
// Числа меты — META ниже (черновик к docs/meta.md); когда Иван утвердит, переедут в src/config.js.
// Игрок — модель с допущениями PLAYER: это не правда о людях, а способ увидеть темп и перекосы экономики.
// Случайность (выпадение рескинов) — с постоянным зерном, прогон повторяем.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = JSON.parse(readFileSync(join(ROOT, 'src/levels/levels.json'), 'utf8'));
const SHOW_LEVELS = process.argv.includes('--levels');
// --saver[=доля ×2]: «копилка» — всё на 3 звезды, монеты не тратит (по ней ставим цену первого ультракота)
const SAVER = process.argv.find((a) => a.startsWith('--saver'));

const META = {
  win: { coins: 10, coinsPer25Levels: 2, starCoins: 5, xp: 20, starXp: 5, xpPer10Levels: 2 }, // за первое прохождение
  catNeed: (L) => 60 + 30 * (L - 1),        // опыта от уровня кота L до L+1
  catReward: (L) => ({                       // награда за уровень кота L
    coins: 25 + 5 * L,
    undo: 1 + (L % 5 === 0 ? 1 : 0),
    hint: L % 3 === 0 ? 1 : 0,
    jar: L % 5 === 0 ? 1 : 0,
    chest: L % 5 === 0,                      // каждый 5-й уровень кота — сундук
    skin: [4, 12, 20, 30].includes(L),       // гарантированный рескин обычного кота
  }),
  boostersFrom: { undo: 1, hint: 4, jar: 8 }, // с какого уровня кота умение появляется
  starChestEvery: 30,                          // сундук за каждые N звёзд
  chest: { coins: 80, undo: 2, hint: 1, jar: 1, skinChance: 0.35, dupCoins: 150 }, // содержимое сундука
  daily: [30, 40, 50, 60, 80, 100, 'chest'],  // подарок дня по кругу; 7-й день — сундук
  freeUndoEvery: 3,                            // бесплатная отмена за каждые N новых уровней
  price: { undo: 30, hint: 50, jar: 100 },
  skins: { count: 20, price: 600 },            // рескины обычного кота: сколько всего, цена в магазине
  // 15 ультракотов (пород): три ступени цены
  ultra: [...Array(5).fill(15000), ...Array(5).fill(25000), ...Array(5).fill(40000)],
  ultraBoosterSave: 0.2,                       // с ультракотом нужно на столько меньше бустеров (умения сильнее)
  start: { coins: 0, undo: 3, hint: 1, jar: 1 },
};

const PLAYER = {
  secPerMove: 4,
  overheadSec: 15,                 // окно победы, переходы
  minutesPerDay: 45,
  x2Share: 0.5,                    // в скольких победах смотрит ролик «×2 монеты»
  moveRatio: (d) => 1.3 + 0.6 * d, // во сколько раз больше минимума ходов делает
  restartChance: (d) => 0.6 * d,   // переигрывает с начала (тратит половину времени впустую)
  undoUse: (d) => 0.5 + 3 * d,     // сколько отмен хотел бы за уровень
  hintUse: (d) => (d > 0.3 ? 0.5 : 0.1),
  jarUse: (d) => (d > 0.4 ? 0.3 : 0.05),
  starsAvg: (d) => Math.max(1.3, 2.6 - 2.2 * d),
  ultraReserve: 300,               // покупает ультракота, если после покупки останется столько на бустеры
};
if (SAVER) {
  PLAYER.starsAvg = () => 3;
  PLAYER.x2Share = Number(SAVER.split('=')[1] || 0);
}

let seed = 12345;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

const s = { coins: META.start.coins, undo: META.start.undo, hint: META.start.hint, jar: META.start.jar,
  xp: 0, cat: 1, chestStars: 0, sec: 0, earned: 0, earnedX2: 0, spentBoost: 0, spentUltra: 0,
  missing: { undo: 0, hint: 0, jar: 0 }, skins: new Set(), chests: 0, ultra: 0, ultraAt: [], day: 0, undoProgress: 0 };
const catLog = [];
const rows = [];
const acc = { undo: 0, hint: 0, jar: 0 }; // дробные «желания» копятся до целого

const coins = (n, x2 = false) => { s.coins += n; s.earned += n; if (x2) s.earnedX2 += n; };

function openChest() {
  const C = META.chest;
  s.chests++;
  coins(C.coins);
  s.undo += C.undo; s.hint += C.hint; s.jar += C.jar;
  if (rand() < C.skinChance) giveSkin();
}

function giveSkin() {
  const id = Math.floor(rand() * META.skins.count);
  if (s.skins.has(id)) coins(META.chest.dupCoins); // повтор — монетами
  else s.skins.add(id);
}

function useBooster(kind, want) {
  acc[kind] += want * (s.ultra ? 1 - META.ultraBoosterSave : 1);
  while (acc[kind] >= 1) {
    acc[kind] -= 1;
    if (s.cat < META.boostersFrom[kind]) return; // умения ещё нет
    if (s[kind] > 0) { s[kind]--; continue; }
    // нет в запасе — покупает за монеты, если хватает больше чем на 2 покупки (иначе обходится или смотрит ролик)
    if (!SAVER && s.coins >= META.price[kind] * 2) { s.coins -= META.price[kind]; s.spentBoost += META.price[kind]; continue; }
    s.missing[kind]++;
  }
}

const milestones = new Set([10, 25, 50, 75, 100, 130, 160, 200, 250, 300]);
for (let i = 0; i < LEVELS.length; i++) {
  const l = LEVELS[i];
  const d = l.difficulty || 0;
  const t = l.minMoves * PLAYER.moveRatio(d) * PLAYER.secPerMove + PLAYER.overheadSec;
  s.sec += t * (1 + PLAYER.restartChance(d) * 0.5);
  // подарок дня — в начале каждого игрового дня
  const day = Math.floor(s.sec / 60 / PLAYER.minutesPerDay);
  while (s.day <= day) {
    const g = META.daily[s.day % META.daily.length];
    if (g === 'chest') openChest(); else coins(g);
    s.day++;
  }
  useBooster('undo', PLAYER.undoUse(d));
  useBooster('hint', PLAYER.hintUse(d));
  useBooster('jar', PLAYER.jarUse(d));
  // победа
  const stars = Math.round(PLAYER.starsAvg(d) * 10) / 10;
  const win = META.win.coins + META.win.coinsPer25Levels * Math.floor(i / 25) + META.win.starCoins * stars;
  coins(win);
  if (rand() < PLAYER.x2Share) coins(win, true); // ролик «×2»
  s.xp += META.win.xp + META.win.starXp * stars + META.win.xpPer10Levels * Math.floor(i / 10);
  s.chestStars += stars;
  while (s.chestStars >= META.starChestEvery) { s.chestStars -= META.starChestEvery; openChest(); }
  if (++s.undoProgress >= META.freeUndoEvery) { s.undoProgress = 0; s.undo++; }
  while (s.xp >= META.catNeed(s.cat)) {
    s.xp -= META.catNeed(s.cat);
    s.cat++;
    const r = META.catReward(s.cat);
    coins(r.coins);
    s.undo += r.undo; s.hint += r.hint; s.jar += r.jar;
    if (r.chest) openChest();
    if (r.skin) giveSkin();
    catLog.push({ cat: s.cat, level: i + 1, h: (s.sec / 3600).toFixed(1), r });
  }
  // ультракот — как только хватает с запасом
  while (!SAVER && s.ultra < META.ultra.length && s.coins >= META.ultra[s.ultra] + PLAYER.ultraReserve) {
    s.coins -= META.ultra[s.ultra]; s.spentUltra += META.ultra[s.ultra];
    s.ultra++;
    s.ultraAt.push(`${s.ultra}: ур. ${i + 1}, день ${Math.floor(s.sec / 60 / PLAYER.minutesPerDay) + 1}`);
  }
  if (milestones.has(i + 1)) {
    rows.push({
      'ур.': i + 1, 'часов': (s.sec / 3600).toFixed(1), 'день': Math.floor(s.sec / 60 / PLAYER.minutesPerDay) + 1, 'кот': s.cat,
      'монеты': Math.round(s.coins), 'заработано': Math.round(s.earned), 'из них ×2': Math.round(s.earnedX2),
      'на бустеры': s.spentBoost, 'на ультра': s.spentUltra, 'ультра': s.ultra, 'рескинов': s.skins.size, 'сундуков': s.chests,
      'не хватило (о/п/м)': `${s.missing.undo}/${s.missing.hint}/${s.missing.jar}`,
    });
  }
}

console.table(rows);
if (SHOW_LEVELS) {
  console.table(catLog.map((c) => ({ 'кот': c.cat, 'на уровне': c.level, 'часов': c.h, 'монеты': c.r.coins,
    'бустеры': ['undo', 'hint', 'jar'].filter((k) => c.r[k]).join(' '), 'сундук': c.r.chest ? 'да' : '', 'рескин': c.r.skin ? 'да' : '' })));
}
console.log('ультракоты куплены:', s.ultraAt.join('; ') || 'ни одного');
