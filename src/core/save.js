// Сохранение прогресса. Пока — localStorage браузера / WebView. На Яндекс Играх позже подменим
// хранилище на их данные игрока: остальной код работает только через функции этого файла.
//
// Что храним (версия v на случай, если формат поменяется):
//   current  — индекс уровня, который открыть при запуске (последний начатый);
//   unlocked — сколько уровней открыто (индекс самого дальнего доступного);
//   best     — { id уровня: лучшее число ходов } — есть запись, значит уровень пройден;
//   coins    — монеты (за победы; тратятся на отмены, позже — в магазине);
//   undos    — запас отмен хода, общий на всю игру;
//   undoProgress — сколько новых уровней пройдено к следующей бесплатной отмене;
//   catLevel, xp — уровень кота (общий на игрока) и опыт, набранный к следующему;
//   lives, refillAt — жизни и момент (мс, Date.now), когда они разом станут полными (null — уже полные);
//   skins, skin — открытые рескины обычного кота (id из CONFIG.skins) и выбранный;
//   chests   — неоткрытые сундуки;
//   daily — { last: 'ГГГГ-ММ-ДД' последнего подарка, day: какой по счёту следующий };
//   names, name — открытые клички (id из src/theme/cats/names.js) и выбранная ('#custom' — своя); custom — своя кличка (или null);
//   nameTokens — неиспользованные «именные таблички» (можно придумать кличку самому);
//   settings — { sound, music, fx, vibro }: переключатели под шестерёнкой.
import { CONFIG } from '../config.js';

const KEY = 'kittyeatty.save';
const VERSION = 8;
const E = CONFIG.economy;
const C = CONFIG.catXp;
const LV = CONFIG.lives;
const START_SKINS = CONFIG.skins.filter((k) => k.start).map((k) => k.id);
const NAMES = CONFIG.nameList; // список кличек — из темы (theme/cats/names.js), сюда приходит через CONFIG
const START_NAMES = NAMES.filter((n) => n.start).map((n) => n.id);
export const CUSTOM = '#custom';

const SETTINGS = { sound: true, music: true, fx: true, vibro: true };
const empty = () => ({ v: VERSION, current: 0, unlocked: 0, best: {}, coins: E.startCoins, undos: E.startUndos, undoProgress: 0, catLevel: 1, xp: 0, lives: LV.max, refillAt: null, skins: [...START_SKINS], skin: START_SKINS[0], chests: 0, daily: { last: null, day: 0 },
  names: [...START_NAMES], name: START_NAMES[0], custom: null, nameTokens: 0, settings: { ...SETTINGS } });

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
  if (d.v === 5) d = { ...d, v: 6, chests: 0, chestStars: 0, daily: { last: null, day: 0 } };
  if (d.v === 6) {
    const byLevel = NAMES.filter((n) => n.catLevel && n.catLevel <= d.catLevel).map((n) => n.id);
    d = { ...d, v: 7, names: [...START_NAMES, ...byLevel], name: START_NAMES[0], custom: null, nameTokens: 0 };
  }
  if (d.v === 7) {
    // звёзд за ходы больше нет (сложные уровни вместо них) — накопленные к сундуку просто забываем
    const { chestStars, ...rest } = d;
    d = { ...rest, v: 8 };
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
    if (d && d.v === VERSION && Number.isInteger(d.coins) && Number.isInteger(d.undos) && Number.isInteger(d.current) && Number.isInteger(d.unlocked) && Number.isInteger(d.catLevel) && Number.isInteger(d.lives) && Array.isArray(d.skins) && Number.isInteger(d.chests) && d.daily && Array.isArray(d.names) && d.best) return d;
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
// (даже если игру закрыли, не нажав «Дальше»). Награда — CONFIG.economy, только за первое прохождение
// (фармить старые уровни нельзя): монеты (на сложном и кошмарном — ×kindCoins), опыт кота, шаг к бесплатной отмене.
// Возвращает, что показать в окне победы: { coins, undos, xp, cat: { level, xp } — каким кот был до победы,
// levelUps: [{ level, coins, undos, skin, chest }] — новые уровни кота и их награды (уже начислены),
// chests — сколько сундуков добавилось (за уровни кота) }.
export function recordWin(level, index, moves, count) {
  const d = get();
  const first = !levelPassed(level);
  if (!(d.best[level.id] <= moves)) d.best[level.id] = moves;
  const reward = { coins: 0, undos: 0, xp: 0, cat: { level: d.catLevel, xp: d.xp }, levelUps: [], chests: 0 };
  if (first) {
    reward.coins = (E.winCoins + E.coinsPer25Levels * Math.floor(index / 25)) * (E.kindCoins[level.kind] ?? 1);
    reward.xp = C.winXp + C.xpPer10Levels * Math.floor(index / 10);
    d.undoProgress += 1;
    if (d.undoProgress >= E.undoEveryLevels) {
      d.undoProgress = 0;
      reward.undos = 1;
    }
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
    if (up.name && !d.names.includes(up.name)) d.names.push(up.name);
    if (up.chest) reward.chests += 1;
    reward.levelUps.push(up);
  }
  d.chests += reward.chests;
  const next = Math.min(index + 1, count - 1);
  d.unlocked = Math.max(d.unlocked, next);
  d.current = next;
  write();
  return reward;
}

// Пройден ли уровень хоть раз.
export const levelPassed = (level) => get().best[level.id] !== undefined;

// ---------- уровень кота ----------

// Опыта от уровня кота level до следующего.
export const catNeed = (level) => C.needBase + C.needStep * (level - 1);

// Награда за достижение уровня кота level.
function catReward(level) {
  return {
    level,
    coins: C.rewardCoins + C.rewardCoinsPerLevel * level,
    undos: C.rewardUndos + (level % C.bonusUndoEvery === 0 ? 1 : 0),
    skin: CONFIG.skins.find((k) => k.catLevel === level)?.id ?? null, // рескин за этот уровень кота
    chest: level % CONFIG.chest.everyCatLevels === 0,
    name: NAMES.find((n) => n.catLevel === level)?.id ?? null, // кличка за этот уровень кота
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

// ---------- сундуки и подарок дня ----------

export const chestsPending = () => get().chests;

// Содержимое сундука — сразу начисляется. Возвращает, что показать: [{ icon, n }] и [{ skin }].
function rollChest(d) {
  const C = CONFIG.chest;
  const items = [{ icon: 'coin', n: C.coins }, { icon: 'undo', n: C.undos }];
  d.coins += C.coins;
  d.undos += C.undos;
  rollName(d, items);
  if (Math.random() < C.skinChance) {
    const pool = CONFIG.skins.filter((k) => !k.catLevel && !d.skins.includes(k.id));
    if (pool.length) {
      const k = pool[Math.floor(Math.random() * pool.length)];
      d.skins.push(k.id);
      items.push({ skin: k.id });
    } else {
      d.coins += C.dupCoins;
      items[0].n += C.dupCoins;
    }
  }
  return items;
}

// Кличка из сундука: с шансом — новая (редкость по весам; все этой редкости есть — монеты), очень редко — именная табличка.
function rollName(d, items) {
  const N = CONFIG.names;
  if (Math.random() < N.uniqueChance) {
    d.nameTokens += 1;
    items.push({ token: 1 });
    return;
  }
  if (Math.random() >= N.chestChance) return;
  const total = Object.values(N.weights).reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  const rarity = Object.keys(N.weights).find((k) => (r -= N.weights[k]) < 0) ?? 'common';
  const pool = NAMES.filter((n) => n.rarity === rarity && !n.catLevel && !d.names.includes(n.id));
  if (!pool.length) {
    d.coins += N.dupCoins;
    items[0].n += N.dupCoins;
    return;
  }
  const n = pool[Math.floor(Math.random() * pool.length)];
  d.names.push(n.id);
  items.push({ name: n.id });
}

// Открыть один сундук; null — сундуков нет.
export function openChest() {
  const d = get();
  if (d.chests <= 0) return null;
  d.chests -= 1;
  const items = rollChest(d);
  write();
  return items;
}

const today = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

// extra — подарки сверх «раз в день» (выдаются читом разработки devGive)
export const dailyAvailable = () => get().daily.last !== today() || (get().daily.extra || 0) > 0;

// Забрать подарок дня; null — сегодня уже забран. Возвращает { day (1..7), items }.
export function claimDaily() {
  const d = get();
  const extra = d.daily.extra || 0;
  if (d.daily.last === today() && !extra) return null;
  const i = d.daily.day % CONFIG.daily.length;
  const g = CONFIG.daily[i];
  let items;
  if (g === 'chest') items = rollChest(d);
  else {
    d.coins += g;
    items = [{ icon: 'coin', n: g }];
  }
  // сегодняшний уже забран — тратится дополнительный
  d.daily = { last: today(), day: i + 1, extra: d.daily.last === today() ? extra - 1 : extra };
  write();
  return { day: i + 1, items };
}

// ---------- клички ----------

export const namesOwned = () => get().names;
export const selectedName = () => get().name;
export const customName = () => get().custom;
export const nameTokens = () => get().nameTokens;

// Как зовут кота сейчас (текст).
export function catName() {
  const d = get();
  if (d.name === CUSTOM && d.custom) return d.custom;
  return NAMES.find((n) => n.id === d.name)?.name ?? NAMES[0].name;
}

export function selectName(id) {
  const d = get();
  if (id === CUSTOM ? !d.custom : !d.names.includes(id)) return false;
  d.name = id;
  write();
  return true;
}

// Купить кличку за монеты; false — не продаётся, уже есть или не хватает монет.
export function buyName(id) {
  const d = get();
  const n = NAMES.find((x) => x.id === id);
  const price = n && CONFIG.names.price[n.rarity];
  if (!price || n.catLevel || d.names.includes(id) || d.coins < price) return false;
  d.coins -= price;
  d.names.push(id);
  write();
  return true;
}

// Своя кличка (уже проверенная checkCustomName): тратит именную табличку и сразу выбирается.
export function setCustomName(s) {
  const d = get();
  if (d.nameTokens <= 0) return false;
  d.nameTokens -= 1;
  d.custom = s;
  d.name = CUSTOM;
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

// Жизни за ролик. Пока не вызывается — понадобится на этапе 6 (реклама).
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

// Начислить отмены. Пока не вызывается — понадобится на этапе 6 (отмена за рекламу).
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

// ---------- для разработки ----------

// Начислить монеты, сундуки, подарки дня (только в режиме разработки, ссылкой ?give=coins2000,chests3,gifts3).
export function devGive({ coins = 0, chests = 0, gifts = 0, tokens = 0 }) {
  const d = get();
  d.nameTokens += tokens;
  d.coins += coins;
  d.chests += chests;
  d.daily.extra = (d.daily.extra || 0) + gifts;
  write();
}
