// Прогон меты «средним игроком» по всем уровням: время, монеты, опыт, уровни кота, открытия, запас бустеров.
//   node tools/meta-sim.mjs            — таблица по вехам
//   node tools/meta-sim.mjs --levels   — плюс уровни кота: на каком уровне игры получен и что дал
// Числа меты — META ниже (черновик к docs/meta.md); когда Иван утвердит, переедут в src/config.js.
// Игрок — модель с допущениями PLAYER: это не правда о людях, а способ увидеть темп и перекосы экономики.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVELS = JSON.parse(readFileSync(join(ROOT, 'src/levels/levels.json'), 'utf8'));
const SHOW_LEVELS = process.argv.includes('--levels');

const META = {
  win: { coins: 10, coinsPer25Levels: 2, starCoins: 5, xp: 20, starXp: 5, xpPer10Levels: 2 }, // за первое прохождение
  catNeed: (L) => 60 + 30 * (L - 1),        // опыта от уровня кота L до L+1
  catReward: (L) => ({                       // награда за достижение уровня кота L
    coins: 25 + 5 * L,
    undo: 1 + (L % 5 === 0 ? 1 : 0),
    hint: L % 3 === 0 ? 1 : 0,
    jar: L % 5 === 0 ? 1 : 0,
  }),
  breedsAt: { 3: 'британская', 6: 'шотландская', 10: 'мейн-кун', 15: 'сфинкс', 21: 'сиамская', 28: 'персидская' },
  boostersFrom: { undo: 1, hint: 4, jar: 8 }, // с какого уровня кота бустер появляется (до этого не показываем)
  starChest: { every: 30, coins: 80, undo: 2, hint: 1, jar: 1 }, // сундук за каждые N звёзд
  daily: [20, 30, 40, 50, 60, 80, 120],       // монеты подарка дня по кругу (без штрафа за пропуск)
  freeUndoEvery: 3,                            // бесплатная отмена за каждые N новых уровней (уже в игре)
  price: { undo: 30, hint: 50, jar: 100 },
  start: { coins: 0, undo: 3, hint: 1, jar: 1 },
};

const PLAYER = {
  secPerMove: 4,
  overheadSec: 15,               // окно победы, переходы
  minutesPerDay: 15,
  moveRatio: (d) => 1.3 + 0.6 * d, // во сколько раз больше минимума ходов делает
  restartChance: (d) => 0.6 * d,   // переигрывает с начала (тратит половину времени впустую)
  undoUse: (d) => 0.5 + 3 * d,     // сколько отмен хотел бы за уровень
  hintUse: (d) => (d > 0.3 ? 0.5 : 0.1),
  jarUse: (d) => (d > 0.4 ? 0.3 : 0.05),
  starsAvg: (d) => Math.max(1.3, 2.6 - 2.2 * d),
};

const s = { coins: META.start.coins, undo: META.start.undo, hint: META.start.hint, jar: META.start.jar,
  xp: 0, cat: 1, stars: 0, chestStars: 0, sec: 0, earned: 0, spent: 0, bought: { undo: 0, hint: 0, jar: 0 },
  wanted: { undo: 0, hint: 0, jar: 0 }, missing: { undo: 0, hint: 0, jar: 0 }, breeds: [], day: 0, undoProgress: 0 };
const catLog = [];
const rows = [];
let acc = { undo: 0, hint: 0, jar: 0 }; // дробные «желания» копятся до целого

const add = (r, where) => {
  s.coins += r.coins || 0; s.earned += r.coins || 0;
  for (const k of ['undo', 'hint', 'jar']) s[k] += r[k] || 0;
  if (where) where.push(r);
};

function useBooster(kind, want) {
  acc[kind] += want;
  while (acc[kind] >= 1) {
    acc[kind] -= 1;
    if (s.cat < META.boostersFrom[kind]) return; // бустера ещё нет
    s.wanted[kind]++;
    if (s[kind] > 0) { s[kind]--; continue; }
    // нет в запасе — покупает за монеты, если хватает больше чем на 2 покупки (иначе обходится)
    if (s.coins >= META.price[kind] * 2) { s.coins -= META.price[kind]; s.spent += META.price[kind]; s.bought[kind]++; continue; }
    s.missing[kind]++;
  }
}

const milestones = new Set([5, 10, 20, 30, 50, 75, 100, 130, 160, 200, 250, 300]);
for (let i = 0; i < LEVELS.length; i++) {
  const l = LEVELS[i];
  const d = l.difficulty || 0;
  const t = l.minMoves * PLAYER.moveRatio(d) * PLAYER.secPerMove + PLAYER.overheadSec;
  s.sec += t * (1 + PLAYER.restartChance(d) * 0.5);
  // подарок дня — в начале каждого игрового дня
  const day = Math.floor(s.sec / 60 / PLAYER.minutesPerDay);
  while (s.day <= day) { add({ coins: META.daily[s.day % META.daily.length] }); s.day++; }
  useBooster('undo', PLAYER.undoUse(d));
  useBooster('hint', PLAYER.hintUse(d));
  useBooster('jar', PLAYER.jarUse(d));
  // победа
  const stars = Math.round(PLAYER.starsAvg(d) * 10) / 10;
  add({ coins: META.win.coins + META.win.coinsPer25Levels * Math.floor(i / 25) + META.win.starCoins * stars });
  s.xp += META.win.xp + META.win.starXp * stars + META.win.xpPer10Levels * Math.floor(i / 10);
  s.stars += stars; s.chestStars += stars;
  while (s.chestStars >= META.starChest.every) { s.chestStars -= META.starChest.every; add(META.starChest); }
  if (++s.undoProgress >= META.freeUndoEvery) { s.undoProgress = 0; s.undo++; }
  while (s.xp >= META.catNeed(s.cat)) {
    s.xp -= META.catNeed(s.cat);
    s.cat++;
    const r = META.catReward(s.cat);
    add(r);
    const breed = META.breedsAt[s.cat];
    if (breed) s.breeds.push(breed);
    catLog.push({ cat: s.cat, level: i + 1, min: Math.round(s.sec / 60), r, breed });
  }
  if (milestones.has(i + 1)) {
    rows.push({
      'ур.': i + 1, 'мин': Math.round(s.sec / 60), 'дней': (s.sec / 60 / PLAYER.minutesPerDay).toFixed(1), 'кот': s.cat,
      'монеты': Math.round(s.coins), 'всего заработ.': Math.round(s.earned), 'потрачено': s.spent,
      'отмен': s.undo, 'подск.': s.hint, 'мисок': s.jar,
      'не хватило (о/п/м)': `${s.missing.undo}/${s.missing.hint}/${s.missing.jar}`, 'пород': s.breeds.length,
    });
  }
}

console.table(rows);
if (SHOW_LEVELS) {
  console.table(catLog.map((c) => ({ 'кот': c.cat, 'на уровне': c.level, 'мин': c.min, 'монеты': c.r.coins,
    'бустеры': ['undo', 'hint', 'jar'].filter((k) => c.r[k]).join(' '), 'порода': c.breed || '' })));
}
console.log(`куплено за монеты: отмен ${s.bought.undo}, подсказок ${s.bought.hint}, мисок ${s.bought.jar}; ` +
  `хотел: ${s.wanted.undo}/${s.wanted.hint}/${s.wanted.jar}`);
