// Сохранение прогресса. Пока — localStorage браузера / WebView. На Яндекс Играх позже подменим
// хранилище на их данные игрока: остальной код работает только через функции этого файла.
//
// Что храним (версия v на случай, если формат поменяется):
//   current  — индекс уровня, который открыть при запуске (последний начатый);
//   unlocked — сколько уровней открыто (индекс самого дальнего доступного);
//   best     — { id уровня: лучшее число ходов } — из него считаются звёзды;
//   coins    — монеты (за победы; тратятся на отмены, позже — в магазине);
//   undos    — запас отмен хода, общий на всю игру;
//   undoProgress — сколько новых уровней пройдено к следующей бесплатной отмене;
//   catLevel, xp — уровень кота (общий на игрока) и опыт, набранный к следующему;
//   lives, refillAt — жизни и момент (мс, Date.now), когда они разом станут полными (null — уже полные);
//   skins, skin — открытые рескины обычного кота (id из CONFIG.skins) и выбранный;
//   settings — { sound, music, fx, vibro }: переключатели под шестерёнкой.
import { CONFIG } from './config.js';

const KEY = 'kittyeatty.save';
const VERSION = 5;
const E = CONFIG.economy;
const C = CONFIG.catXp;
const LV = CONFIG.lives;
const START_SKINS = CONFIG.skins.filter((k) => k.start).map((k) => k.id);

const SETTINGS = { sound: true, music: true, fx: true, vibro: true };
const empty = () => ({ v: VERSION, current: 0, unlocked: 0, best: {}, coins: E.startCoins, undos: E.startUndos, undoProgress: 0, catLevel: 1, xp: 0, lives: LV.max, refillAt: null, skins: [...START_SKINS], skin: START_SKINS[0], settings: { ...SETTINGS } });

// Старые версии сохранения дополняем до текущей, прогресс не теряется.
function migrate(d) {
  if (d.v === 1) d = { ...d, v: 2, coins: E.startCoins, undos: E.startUndos, undoProgress: 0 };
  if (d.v === 2) d = { ...d, v: 3, catLevel: 1, xp: 0 };
  if (d.v === 3) d = { ...d, v: 4, lives: LV.max, refillAt: null };
  if (d.v === 4) {
    // рескины за уже пройденные уровни кота — сразу открыты
    const byLevel = CONFIG.skins.filter((k) => k.catLevel && k.catLevel <= d.catLevel).map((k) => k.id);
    d = { ...d, v: 5, skins: [...START_SKINS, ...byLevel], skin: START_SKINS[0] };
  }
  if (d && !Number.isFinite(d.xp)) d.xp = 0; // битый опыт — с нуля, уровень кота не трогаем
  if (d && !d.settings) d.settings = {};
  if (d) d.settings = { ...SETTINGS, ...d.settings }; // новые переключатели — со значением по умолчанию
  return d;
}

let data = null;

// localStorage может быть недоступен (приватный режим, запрет в настройках) — тогда прогресс живёт
// только до закрытия игры, но ничего не ломается.
function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const d = raw && migrate(JSON.parse(raw));
    if (d && d.v === VERSION && Number.isInteger(d.coins) && Number.isInteger(d.undos) && Number.isInteger(d.current) && Number.isInteger(d.unlocked) && Number.isInteger(d.catLevel) && Number.isInteger(d.lives) && Array.isArray(d.skins) && d.best) return d;
  } catch (e) { /* нет доступа или битые данные — начинаем заново */ }
  return empty();
}

function write() {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) { /* нет места или доступа — молча, прогресс останется в памяти */ }
}

function get() {
  if (!data) data = read();
  return data;
}

// Индекс уровня для запуска, не дальше открытых и не дальше последнего.
export function currentLevel(count) {
  const d = get();
  return Math.max(0, Math.min(d.current, d.unlocked, count - 1));
}

// Индекс самого дальнего открытого уровня — «край» прогресса на карте.
export function unlockedLevel(count) {
  return Math.max(0, Math.min(get().unlocked, count - 1));
}

export function setCurrentLevel(index) {
  const d = get();
  if (d.current === index) return;
  d.current = index;
  write();
}

// Победа: запоминаем лучший результат, открываем следующий уровень и запускаться будем с него
// (даже если игру закрыли, не нажав «Дальше»). Награда — CONFIG.economy:
// за первое прохождение монеты за победу и звёзды и шаг к бесплатной отмене;
// за переигровку — монеты только за новые звёзды (фармить старые уровни невыгодно). Так же опыт кота.
// Возвращает, что показать в окне победы: { stars, coins, undos, xp, cat: { level, xp } — каким кот был до победы,
// levelUps: [{ level, coins, undos }] — новые уровни кота и их награды (уже начислены) }.
export function recordWin(level, index, moves, count) {
  const d = get();
  const prevStars = levelStars(level);
  const stars = starsFor(moves, level.minMoves);
  if (!(d.best[level.id] <= moves)) d.best[level.id] = moves;
  const reward = { stars, coins: 0, undos: 0, xp: 0, cat: { level: d.catLevel, xp: d.xp }, levelUps: [] };
  if (prevStars === 0) {
    reward.coins = E.winCoins + E.coinsPer25Levels * Math.floor(index / 25) + E.starCoins * stars;
    reward.xp = C.winXp + C.starXp * stars + C.xpPer10Levels * Math.floor(index / 10);
    d.undoProgress += 1;
    if (d.undoProgress >= E.undoEveryLevels) {
      d.undoProgress = 0;
      reward.undos = 1;
    }
  } else {
    reward.coins = E.starCoins * Math.max(0, stars - prevStars);
    reward.xp = C.starXp * Math.max(0, stars - prevStars);
  }
  d.coins += reward.coins;
  d.undos += reward.undos;
  d.xp += reward.xp;
  while (d.xp >= catNeed(d.catLevel)) {
    d.xp -= catNeed(d.catLevel);
    d.catLevel += 1;
    const up = catReward(d.catLevel);
    d.coins += up.coins;
    d.undos += up.undos;
    if (up.skin && !d.skins.includes(up.skin)) d.skins.push(up.skin);
    reward.levelUps.push(up);
  }
  const next = Math.min(index + 1, count - 1);
  d.unlocked = Math.max(d.unlocked, next);
  d.current = next;
  write();
  return reward;
}

export function bestMoves(id) {
  return get().best[id];
}

// Сколько звёзд за прохождение: 3, 2 или 1 (правило — CONFIG.stars).
export function starsFor(moves, minMoves) {
  const S = CONFIG.stars;
  if (moves <= minMoves + Math.ceil(minMoves * S.three)) return 3;
  if (moves <= minMoves + Math.ceil(minMoves * S.two)) return 2;
  return 1;
}

// Лучшие звёзды уровня (0 — не пройден) — для карты уровней.
export function levelStars(level) {
  const best = bestMoves(level.id);
  return best === undefined ? 0 : starsFor(best, level.minMoves);
}

// ---------- уровень кота ----------

// Опыта от уровня кота level до следующего.
export const catNeed = (level) => C.needBase + C.needStep * (level - 1);

// Награда за достижение уровня кота level.
export function catReward(level) {
  return {
    level,
    coins: C.rewardCoins + C.rewardCoinsPerLevel * level,
    undos: C.rewardUndos + (level % C.bonusUndoEvery === 0 ? 1 : 0),
    skin: CONFIG.skins.find((k) => k.catLevel === level)?.id ?? null, // рескин за этот уровень кота
  };
}

export const catLevel = () => get().catLevel;

// ---------- рескины обычного кота ----------

export const skinsOwned = () => get().skins;
export const selectedSkin = () => get().skin;

export function selectSkin(id) {
  const d = get();
  if (!d.skins.includes(id)) return false;
  d.skin = id;
  write();
  return true;
}

// Купить рескин за монеты (цена — в CONFIG.skins); false — нельзя купить, уже есть или не хватает монет.
export function buySkin(id) {
  const d = get();
  const k = CONFIG.skins.find((s) => s.id === id);
  if (!k?.price || d.skins.includes(id) || d.coins < k.price) return false;
  d.coins -= k.price;
  d.skins.push(id);
  write();
  return true;
}

// ---------- жизни ----------

// Таймер дошёл — жизни разом полные.
function refill(d) {
  if (d.refillAt !== null && Date.now() >= d.refillAt) {
    d.lives = LV.max;
    d.refillAt = null;
    write();
  }
}

export function lives() {
  const d = get();
  refill(d);
  return d.lives;
}

// Сколько мс до полных жизней (0 — уже полные).
export function livesRefillLeft() {
  const d = get();
  refill(d);
  return d.refillAt === null ? 0 : Math.max(0, d.refillAt - Date.now());
}

// Сжечь жизнь; false — жизней нет. Первая сгоревшая из полных запускает таймер.
export function loseLife() {
  const d = get();
  refill(d);
  if (d.lives <= 0) return false;
  if (d.lives >= LV.max) d.refillAt = Date.now() + LV.refillHours * 3600 * 1000;
  d.lives -= 1;
  write();
  return true;
}

// Начислить жизни (покупка, ролик), не больше максимума; стали полными — таймер не нужен.
function giveLives(d, n) {
  d.lives = Math.min(LV.max, d.lives + n);
  if (d.lives >= LV.max) d.refillAt = null;
}

// Купить жизнь за монеты; false — не хватает монет или жизни и так полные.
export function buyLife() {
  const d = get();
  refill(d);
  if (d.coins < LV.price || d.lives >= LV.max) return false;
  d.coins -= LV.price;
  giveLives(d, 1);
  write();
  return true;
}

// Жизни за ролик (этап 6).
export function addLives(n) {
  const d = get();
  giveLives(d, n);
  write();
}

// ---------- монеты и отмены ----------

export const coins = () => get().coins;
export const undos = () => get().undos;

// Потратить одну отмену; false — запаса нет.
export function spendUndo() {
  const d = get();
  if (d.undos <= 0) return false;
  d.undos -= 1;
  write();
  return true;
}

// Купить отмену за монеты (цена — CONFIG.economy.undoPrice); false — не хватает монет.
export function buyUndo() {
  const d = get();
  if (d.coins < E.undoPrice) return false;
  d.coins -= E.undoPrice;
  d.undos += 1;
  write();
  return true;
}

// Начислить отмены (за рекламу, из ящиков — позже).
export function addUndos(n) {
  get().undos += n;
  write();
}

// ---------- настройки ----------

export const setting = (key) => get().settings[key];

export function setSetting(key, value) {
  get().settings[key] = value;
  write();
}
