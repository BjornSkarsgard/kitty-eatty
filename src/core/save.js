// Сохранение прогресса. Пока — localStorage браузера / WebView. На Яндекс Играх позже подменим
// хранилище на их данные игрока: остальной код работает только через функции этого файла.
//
// Что храним (версия v на случай, если формат поменяется):
//   current  — индекс уровня, который открыть при запуске (последний начатый);
//   unlocked — сколько уровней открыто (индекс самого дальнего доступного);
//   best     — { id уровня: лучшее число ходов } — есть запись, значит уровень пройден;
//   coins    — монеты (за победы; тратятся на отмены, позже — в магазине);
//   undos    — запас отмен хода, общий на всю игру; hints, jars — запас подсказок «Нюх» и банок «+1 банка»;
//   undoProgress — сколько новых уровней пройдено к следующей бесплатной отмене;
//   catLevel, xp — уровень кота (общий на игрока) и опыт, набранный к следующему;
//   lives, refillAt — жизни и момент (мс, Date.now), когда придёт следующая (null — жизни полные);
//   infiniteUntil — до какого момента бесконечные жизни (null — нет);
//   msDone — id уровня последнего забранного рубежа на карте (0 — ни одного);
//   skins, skin — открытые окрасы (id из CONFIG.skins) и окрас обычного кота («Найдёныш»);
//   breedSkins — { id ультракота: окрас } — у каждой породы свой (нет — окрас породы по умолчанию, look);
//   chests   — неоткрытые сундуки;
//   daily — награды за вход: { last: 'ГГГГ-ММ-ДД' последней, streak: сколько дней серии забрано,
//     penalized: за какой last пропуск уже учтён,
//     miss: { from, to } — последний откат серии (показать в окне), extra: дополнительные (чит разработки) };
//   names, name — открытые клички (id из src/theme/cats/names.js) и выбранная ('#custom' — своя); custom — своя кличка (или null);
//   nameTokens — неиспользованные «именные таблички» (можно придумать кличку самому);
//   ultras, ultra — купленные / подаренные ультракоты (id из theme/cats/ultras.js) и выбранный (null — играем обычным котом);
//   ultraIntro — окно знакомства с ультракотом уже показано; ultCharge — сколько уровней пройдено с последней ульты
//     (CONFIG.ultRecharge и больше — ульта готова);
//   settings — { sound, music, fx, vibro }: переключатели под шестерёнкой.
import { CONFIG } from '../config.js';
import { MILESTONES } from './milestones.js';
import { dailyReward } from './daily.js';
import { TEST_TOOLS } from '../dev.js';

const KEY = 'kittyeatty.save';
const VERSION = 16;
const E = CONFIG.economy;
const C = CONFIG.catXp;
const LV = CONFIG.lives;
const B = CONFIG.boosters;
const LIFE_MS = LV.refillMinutes * 60 * 1000;
const START_SKINS = CONFIG.skins.filter((k) => k.start).map((k) => k.id);
const NAMES = CONFIG.nameList; // список кличек — из темы (theme/cats/names.js), сюда приходит через CONFIG
const START_NAMES = NAMES.filter((n) => n.start).map((n) => n.id);
export const CUSTOM = '#custom';

const SETTINGS = { sound: true, music: true, fx: true, vibro: true, track: CONFIG.audio.tracks[0] };
// Награды за рекламу на сегодня (CONFIG.ads): day — какой день, watched — сколько роликов в лесенке на главной,
// coins — сколько раз брали монеты в магазине, lives — жизни за ролик, lifeAt — когда последняя;
// goodsAt — { hint, addjar, undo }: когда последний раз брали умение за ролик (раз в час, не по дням).
const emptyAds = () => ({ day: null, watched: 0, coins: 0, lives: 0, lifeAt: 0, goodsAt: {} });
const empty = () => ({ v: VERSION, current: 0, unlocked: 0, best: {}, coins: E.startCoins, undos: E.startUndos, hints: B.hint.start, jars: B.jar.start, undoProgress: 0, catLevel: 1, xp: 0, lives: LV.max, refillAt: null, skins: [...START_SKINS], skin: START_SKINS[0], chests: 0, daily: { last: null, streak: 0 }, ads: emptyAds(), infiniteUntil: null, msDone: 0, ultras: [], ultra: null, ultraIntro: false, ultCharge: CONFIG.ultRecharge, breedSkins: {},
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
  if (d.v === 8) {
    // жизни по одной: максимум меньше, таймер — до следующей жизни, а не до всех
    const n = Math.min(d.lives, LV.max);
    d = { ...d, v: 9, lives: n, refillAt: n < LV.max ? Date.now() + LIFE_MS : null };
  }
  // рубежи на карте: уже пройденные откроются с наградой при первом заходе на главную
  if (d.v === 9) d = { ...d, v: 10, infiniteUntil: null, msDone: 0 };
  if (d.v === 10) d = { ...d, v: 11, hints: B.hint.start, jars: B.jar.start };
  if (d.v === 11) d = { ...d, v: 12, ultras: [], ultra: null, ultraIntro: false };
  if (d.v === 12) d = { ...d, v: 13, ultCharge: CONFIG.ultRecharge };
  if (d.v === 13) d = { ...d, v: 14, breedSkins: {} };
  // подарок дня по кругу из 7 → серия входов: забранные дни круга становятся днями серии
  if (d.v === 14) d = { ...d, v: 15, daily: { last: d.daily.last, streak: d.daily.day || 0, shield: true, clean: 0, extra: d.daily.extra || 0 } };
  if (d.v === 15) d = { ...d, v: 16, ads: emptyAds() };
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
// (фармить старые уровни нельзя): монеты (по виду уровня, winCoins), опыт кота, шаг к бесплатной отмене,
// сундук — за конец главы (рубеж на карте, claimMilestones).
// Возвращает, что показать в окне победы: { coins, undos, xp, cat: { level, xp } — каким кот был до победы,
// levelUps: [{ level, coins, undos, skin, chest }] — новые уровни кота и их награды (уже начислены),
// chests — 0 (сундуки — за рубежи на карте) }.
export function recordWin(level, index, moves, count) {
  const d = get();
  const first = !levelPassed(level);
  if (!(d.best[level.id] <= moves)) d.best[level.id] = moves;
  const reward = { coins: 0, undos: 0, xp: 0, cat: { level: d.catLevel, xp: d.xp }, levelUps: [], chests: 0 };
  d.ultCharge = Math.min(CONFIG.ultRecharge, d.ultCharge + 1); // ульта заряжается за любую победу, и за переигровку
  if (first) {
    reward.coins = E.winCoins[level.kind ?? 'normal'];
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
    d.hints += up.hints;
    d.jars += up.jars;
    if (up.skin && !d.skins.includes(up.skin)) d.skins.push(up.skin);
    if (up.name && !d.names.includes(up.name)) d.names.push(up.name);
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
    hints: level % C.hintEvery === 0 ? 1 : 0,
    jars: level % C.jarEvery === 0 ? 1 : 0,
    skin: CONFIG.skins.find((k) => k.catLevel === level)?.id ?? null, // рескин за этот уровень кота
    name: NAMES.find((n) => n.catLevel === level)?.id ?? null, // кличка за этот уровень кота
  };
}

export const catLevel = () => get().catLevel;
export const catXp = () => get().xp; // опыт, набранный к следующему уровню кота

// ---------- рескины обычного кота ----------

export const skinsOwned = () => get().skins;
export const selectedSkin = () => get().skin;

// Надеть окрас на выбранную сейчас породу (ультракот или обычный кот). Пока любой открытый окрас подходит
// любой породе; позже у каждой породы будет свой список.
// Родной окрас породы (look) ей доступен всегда, даже если в коллекции его нет.
export function selectSkin(id) {
  const d = get();
  const native = d.ultra && ULTRAS.find((u) => u.id === d.ultra)?.look === id;
  if (!d.skins.includes(id) && !native) return false;
  if (d.ultra) d.breedSkins = { ...d.breedSkins, [d.ultra]: id };
  else d.skin = id;
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

// ---------- ультракоты ----------

const ULTRAS = CONFIG.ultras;
export const ultrasOwned = () => get().ultras;
export const selectedUltra = () => ULTRAS.find((u) => u.id === get().ultra) ?? null;
export const ultraPrice = (u) => (u.gift ? null : CONFIG.ultraPrices[u.tier]);

// Окрас породы: id ультракота — его окрас (выбранный или по умолчанию look); null — обычного кота.
export function breedSkin(id) {
  const d = get();
  if (!id) return d.skin;
  return d.breedSkins?.[id] ?? ULTRAS.find((u) => u.id === id)?.look ?? d.skin;
}

// Каким окрасом рисовать кота сейчас — окрас выбранной породы.
export const catLook = () => breedSkin(get().ultra);

// Выбрать породу; null — обычный кот («Найдёныш»).
export function selectUltra(id) {
  const d = get();
  if (id !== null && !d.ultras.includes(id)) return false;
  d.ultra = id;
  write();
  return true;
}

// Купить ультракота за монеты (сразу выбирается); false — не продаётся, уже есть или не хватает монет.
export function buyUltra(id) {
  const d = get();
  const u = ULTRAS.find((x) => x.id === id);
  const price = u && ultraPrice(u);
  if (!price || d.ultras.includes(id) || d.coins < price) return false;
  d.coins -= price;
  d.ultras.push(id);
  d.ultra = id;
  write();
  return true;
}

// Подарок за уровень (gift): уровень пройден, а кота ещё нет — забрать (сразу выбирается). Возвращает ультракота или null.
export function claimUltraGift() {
  const d = get();
  const u = ULTRAS.find((x) => x.gift && d.best[x.gift] !== undefined && !d.ultras.includes(x.id));
  if (!u) return null;
  d.ultras.push(u.id);
  d.ultra = u.id;
  write();
  return u;
}

// Ульта: сколько уровней ещё до готовности (0 — готова) и потратить её (false — не готова).
// CONFIG.ultInfiniteDev — в режиме разработки и тестовой сборке (src/dev.js) ульта бесконечная.
// Переключатель в панели разработчика (d.dev.ultInf) важнее конфига.
const ultInf = () => TEST_TOOLS && (get().dev?.ultInf ?? CONFIG.ultInfiniteDev);
export const ultLeft = () => (ultInf() ? 0 : Math.max(0, CONFIG.ultRecharge - get().ultCharge));
export function spendUlt() {
  if (ultInf()) return true;
  const d = get();
  if (d.ultCharge < CONFIG.ultRecharge) return false;
  d.ultCharge = 0;
  write();
  return true;
}

// Пора показать знакомство с первым ультракотом (один раз, после CONFIG.ultraIntroLevel); true — отмечено, показывай.
export function takeUltraIntro() {
  const d = get();
  if (d.ultraIntro || d.best[CONFIG.ultraIntroLevel] === undefined || d.ultras.length) return false;
  d.ultraIntro = true;
  write();
  return true;
}

// ---------- сундуки и подарок дня ----------

export const chestsPending = () => get().chests;

// Содержимое сундука — сразу начисляется. Возвращает, что показать: [{ icon, n }] и [{ skin }].
function rollChest(d) {
  const C = CONFIG.chest;
  const items = [{ icon: 'coin', n: C.coins }, { icon: 'undo', n: C.undos }, { icon: 'hint', n: C.hints }, { icon: 'addjar', n: C.jars }];
  d.coins += C.coins;
  d.undos += C.undos;
  d.hints += C.hints;
  d.jars += C.jars;
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

// ---------- награды за вход (подарок дня) ----------

const yesterday = () => {
  const t = new Date();
  t.setDate(t.getDate() - 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

// Пропущен день (последний вход раньше вчера) — серия сбрасывается на 1-й день, один раз на каждый такой пропуск.
function checkMiss(d) {
  const g = d.daily;
  if (!g.last || g.last === today() || g.last === yesterday() || g.penalized === g.last) return;
  const from = g.streak;
  g.streak = 0;
  g.penalized = g.last;
  g.miss = { from, to: g.streak };
  write();
}

// extra — подарки сверх «раз в день» (выдаются читом разработки devGive)
export const dailyAvailable = () => get().daily.last !== today() || (get().daily.extra || 0) > 0;

// Что показать в окне: { day — день серии, который забрать сегодня (или уже забранный сегодня), canClaim,
// miss — сброс, если был (показать один раз) }.
export function dailyState() {
  const d = get();
  checkMiss(d);
  const g = d.daily;
  const canClaim = dailyAvailable();
  const miss = g.miss ?? null;
  return { day: canClaim ? g.streak + 1 : g.streak, canClaim, miss };
}

// Откат показали — больше не показывать.
export function dailyMissSeen() {
  const d = get();
  if (!d.daily.miss) return;
  delete d.daily.miss;
  write();
}

// Забрать награду дня серии; null — сегодня уже забрана. Сундук — в неоткрытые (кнопка «Сундук»).
// Возвращает { day, reward }.
export function claimDaily() {
  const d = get();
  checkMiss(d);
  const g = d.daily;
  const extra = g.extra || 0;
  if (g.last === today() && !extra) return null;
  const day = g.streak + 1;
  const r = dailyReward(day);
  d.coins += r.coins;
  d.undos += r.undos;
  d.jars += r.jars;
  d.chests += r.chests;
  if (r.infiniteMin) d.infiniteUntil = Math.max(Date.now(), d.infiniteUntil || 0) + r.infiniteMin * 60 * 1000;
  g.streak = day;
  if (g.last === today()) g.extra = extra - 1; // сегодняшняя уже забрана — тратится дополнительная
  g.last = today();
  write();
  return { day, reward: r };
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

// Сколько раз дотикал таймер (в том числе пока игра была закрыта) — столько жизней пришло, по одной.
function refill(d) {
  if (d.refillAt === null || Date.now() < d.refillAt) return;
  while (d.refillAt !== null && Date.now() >= d.refillAt) {
    d.lives += 1;
    d.refillAt = d.lives >= LV.max ? null : d.refillAt + LIFE_MS;
  }
  d.lives = Math.min(d.lives, LV.max);
  write();
}

// Сколько жизней можно тратить; пока идут бесконечные — всегда полные.
export function lives() {
  const d = get();
  refill(d);
  return infiniteLeft() > 0 ? LV.max : d.lives;
}

// Сколько мс ещё идут бесконечные жизни (0 — не идут).
export function infiniteLeft() {
  const u = get().infiniteUntil;
  return u ? Math.max(0, u - Date.now()) : 0;
}

// Сколько мс до следующей жизни (0 — жизни полные).
export function livesRefillLeft() {
  const d = get();
  refill(d);
  return d.refillAt === null ? 0 : Math.max(0, d.refillAt - Date.now());
}

// Сжечь жизнь; false — жизней нет. Первая сгоревшая из полных запускает таймер, дальше он уже идёт.
export function loseLife() {
  const d = get();
  refill(d);
  if (infiniteLeft() > 0) return true; // бесконечные — ничего не сгорает
  if (d.lives <= 0) return false;
  d.lives -= 1;
  if (d.lives < LV.max && d.refillAt === null) d.refillAt = Date.now() + LIFE_MS; // сверх максимума таймер не идёт
  write();
  return true;
}

// Начислить жизни (покупка, ролик, подарки) — можно и сверх максимума (10/5); стали полными — таймер не нужен.
// Сами по себе (refill) жизни восстанавливаются только до максимума.
function giveLives(d, n) {
  d.lives += n;
  if (d.lives >= LV.max) d.refillAt = null;
}

// Купить жизнь за монеты; false — не хватает монет.
export function buyLife() {
  const d = get();
  refill(d);
  if (d.coins < LV.price) return false;
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

// ---------- рубежи на карте ----------

// Открытые (уровень пройден), но ещё не забранные рубежи — по порядку.
export function pendingMilestones() {
  const d = get();
  return MILESTONES.filter((m) => m.id > d.msDone && d.best[m.id] !== undefined);
}

// id последнего забранного рубежа — на карте забранные уже без подарка.
export const milestonesDone = () => get().msDone;

// Забрать все открытые рубежи разом; null — нечего. Возвращает { chapter — был ли среди них конец главы,
// items: [{ icon, n }] } для окна наград; сундуки добавляются к неоткрытым, бесконечные жизни — к уже идущим.
export function claimMilestones() {
  const d = get();
  const list = pendingMilestones();
  if (!list.length) return null;
  const sum = { coins: 0, undos: 0, hints: 0, lives: 0, chests: 0, infiniteMin: 0 };
  for (const m of list) for (const k in sum) sum[k] += m.reward[k];
  d.coins += sum.coins;
  d.undos += sum.undos;
  d.hints += sum.hints;
  if (sum.lives) { refill(d); giveLives(d, sum.lives); }
  d.chests += sum.chests;
  if (sum.infiniteMin) d.infiniteUntil = Math.max(Date.now(), d.infiniteUntil || 0) + sum.infiniteMin * 60 * 1000;
  d.msDone = list[list.length - 1].id;
  write();
  const items = [['coin', sum.coins], ['undo', sum.undos], ['hint', sum.hints], ['heart', sum.lives], ['chest', sum.chests], ['infinite', sum.infiniteMin]]
    .filter(([, n]) => n > 0).map(([icon, n]) => ({ icon, n }));
  const last = list[list.length - 1];
  return { chapter: list.some((m) => m.chapter), id: last.id, items };
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

// ---------- умения на уровне: подсказка (hint) и банка (jar) ----------

const STOCK = { hint: 'hints', jar: 'jars' };
export const boosters = (kind) => get()[STOCK[kind]];
// Открыто ли умение (по уровню кота, CONFIG.boosters[kind].from).
export const boosterUnlocked = (kind) => get().catLevel >= B[kind].from;

// Потратить заряд; false — запаса нет.
export function spendBooster(kind) {
  const d = get();
  if (d[STOCK[kind]] <= 0) return false;
  d[STOCK[kind]] -= 1;
  write();
  return true;
}

// Купить заряд за монеты; false — не хватает монет.
export function buyBooster(kind) {
  const d = get();
  if (d.coins < B[kind].price) return false;
  d.coins -= B[kind].price;
  d[STOCK[kind]] += 1;
  write();
  return true;
}

// ---------- магазин ----------

// Товар за монеты (CONFIG.shop.goods): give — { hints, jars, undos, lives, infiniteMin }. false — не хватает монет.
export function buyGoods(price, give) {
  const d = get();
  refill(d);
  if (d.coins < price) return false;
  d.coins -= price;
  d.hints += give.hints || 0;
  d.jars += give.jars || 0;
  d.undos += give.undos || 0;
  if (give.lives) giveLives(d, give.lives);
  if (give.infiniteMin) d.infiniteUntil = Math.max(Date.now(), d.infiniteUntil || 0) + give.infiniteMin * 60 * 1000;
  write();
  return true;
}

// ---------- награды за рекламу ----------

// Счётчики на сегодня: новый день — лесенка, монеты и жизни с нуля (умения — по часам, их не трогаем).
function adsToday(d) {
  if (!d.ads) d.ads = emptyAds();
  if (d.ads.day !== today()) d.ads = { ...d.ads, day: today(), watched: 0, coins: 0, lives: 0 };
  return d.ads;
}

const HOUR = 60 * 60 * 1000;

// Что сейчас можно за ролик: { watched — роликов в лесенке, coinsLeft — монет в магазине осталось раз,
// livesLeft, lifeWait — мс до следующей жизни (0 — можно), goodsWait(kind) — мс до умения (0 — можно) }.
export function adsState() {
  const A = CONFIG.ads;
  const a = adsToday(get());
  const now = Date.now();
  const lifeWait = a.lives >= A.life.perDay ? Infinity : Math.max(0, (a.lifeAt || 0) + A.life.everyMin * 60000 - now);
  return {
    watched: a.watched,
    coinsLeft: Math.max(0, A.shopCoins.perDay - a.coins),
    livesLeft: Math.max(0, A.life.perDay - a.lives),
    lifeWait,
    goodsWait: (kind) => Math.max(0, (a.goodsAt[kind] || 0) + A.goodsEveryMin * 60000 - now),
  };
}

// Ролик лесенки на главной досмотрен: шаг вперёд; на шагах из CONFIG.ads.ladder — награда (монеты или сундук).
// Возвращает { step, reward } (reward — { coins } / { chests } / null) или null — на сегодня всё.
export function adLadder() {
  const d = get();
  const a = adsToday(d);
  const L = CONFIG.ads.ladder;
  if (a.watched >= L[L.length - 1].at) return null;
  a.watched += 1;
  const r = L.find((x) => x.at === a.watched) ?? null;
  if (r?.coins) d.coins += r.coins;
  if (r?.chests) d.chests += r.chests;
  write();
  return { step: a.watched, reward: r };
}

// Монеты за ролик в магазине; false — на сегодня всё.
export function adCoins() {
  const d = get();
  const a = adsToday(d);
  if (a.coins >= CONFIG.ads.shopCoins.perDay) return false;
  a.coins += 1;
  d.coins += CONFIG.ads.shopCoins.coins;
  write();
  return true;
}

// Самый дешёвый вариант умения (give) за ролик — раз в час на каждое; false — ещё рано.
export function adGoods(kind, give) {
  const d = get();
  const a = adsToday(d);
  if ((a.goodsAt[kind] || 0) + CONFIG.ads.goodsEveryMin * 60000 > Date.now()) return false;
  a.goodsAt = { ...a.goodsAt, [kind]: Date.now() };
  d.hints += give.hints || 0;
  d.jars += give.jars || 0;
  d.undos += give.undos || 0;
  write();
  return true;
}

// Жизнь за ролик — только когда жизни кончились (и не идут бесконечные); не больше CONFIG.ads.life.perDay в день
// и не чаще раза в everyMin; false — нельзя.
export function adLife() {
  const d = get();
  const A = CONFIG.ads.life;
  const a = adsToday(d);
  refill(d);
  if (d.lives > 0 || infiniteLeft() > 0) return false;
  if (a.lives >= A.perDay || (a.lifeAt || 0) + A.everyMin * 60000 > Date.now()) return false;
  a.lives += 1;
  a.lifeAt = Date.now();
  giveLives(d, 1);
  write();
  return true;
}

// Бегунок в окне победы: монеты за уровень ещё ×(k − 1) сверху (за досмотренный ролик).
// chests — сундук, если стрелка встала на сундук.
export function addWinBoost(n, chests = 0) {
  const d = get();
  d.coins += n;
  d.chests += chests;
  write();
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
// Выставить сохранение точно (только в режиме разработки, ссылкой ?set=milestone,chests2,gifts3):
//   milestone — следующий уровень с рубежом от текущего прогресса становится текущим: всё до него пройдено,
//     прошлые рубежи забраны — пройдёшь его, и откроется ровно один рубеж; levelN — то же, но уровень N;
//   chestsN — ровно N неоткрытых сундуков; giftsN — ровно N подарков дня можно забрать; coinsN — ровно N монет;
//   catN — уровень кота N (опыт с нуля); jarsN, hintsN — ровно столько банок и подсказок.
// Панель разработчика (src/view/DevPanel.js, только с тестовыми инструментами): правка сохранения как есть.
// fn(d) меняет данные напрямую; d.dev — флаги панели ({ ultInf }). Возвращает то, что вернула fn.
export function devEdit(fn) {
  if (!TEST_TOOLS) return undefined;
  const d = get();
  if (!d.dev) d.dev = {};
  const res = fn(d);
  write();
  return res;
}
export const devState = () => get();

export function devSet({ milestone = false, level = 0, chests = null, gifts = null, coins = null, cat = null, jars = null, hints = null }) {
  const d = get();
  let id = level;
  if (milestone) id = MILESTONES.find((m) => m.id > d.unlocked)?.id ?? 0; // d.unlocked — индекс, то есть id последнего пройденного
  if (id >= 1 && id <= CONFIG.levelGen.count) {
    for (let k = 1; k < id; k++) if (d.best[k] === undefined) d.best[k] = 0;
    for (let k = id; k <= CONFIG.levelGen.count; k++) delete d.best[k];
    d.unlocked = id - 1;
    d.current = id - 1;
    d.msDone = MILESTONES.filter((m) => m.id < id).at(-1)?.id ?? 0;
  }
  if (chests !== null) d.chests = chests;
  if (coins !== null) d.coins = coins;
  if (cat !== null) { d.catLevel = Math.max(1, cat); d.xp = 0; }
  if (jars !== null) d.jars = jars;
  if (hints !== null) d.hints = hints;
  if (gifts !== null) d.daily = { ...d.daily, last: today(), extra: gifts };
  write();
}

export function devGive({ coins = 0, chests = 0, gifts = 0, tokens = 0 }) {
  const d = get();
  d.nameTokens += tokens;
  d.coins += coins;
  d.chests += chests;
  d.daily.extra = (d.daily.extra || 0) + gifts;
  write();
}
