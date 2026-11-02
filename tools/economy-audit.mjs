// Аудит выдачи без расходов. Все изменения soft — только в памяти отдельного процесса.
// node tools/economy-audit.mjs [--json]
// Использует настоящий recordWin/claimMilestones/openChest, не старый META из meta-sim.
// chests — число выданных и уже открытых сундуков, не остаток. lives — старт + выдача,
// без регенерации; infiniteMin — начисленные минуты, а не остаток таймера.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../src/config.js';

if (!process.argv.includes('--worker')) {
  const reports = [];
  for (const n of [45, 100, 300]) for (const variant of ['current', 'soft']) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', String(n), variant], { encoding: 'utf8' });
    if (child.status !== 0) throw new Error(child.stderr || child.stdout);
    reports.push(JSON.parse(child.stdout));
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(reports, null, 2));
  else for (const r of reports) {
    console.log(`\n${r.variant}: ${r.levels} побед, уровень кота ${r.catLevel}`);
    console.table(r.ledger);
    console.log('Итого:', r.total);
    console.log('Подарки за 7 / 14 / 28 дней (включая открытые сундуки):', r.daily);
    console.log('Рекламный сценарий — сундук на каждой четвёртой победе с 5-го уровня:', r.winAdChests);
  }
} else {
  const at = process.argv.indexOf('--worker');
  const count = Number(process.argv[at + 1]);
  const variant = process.argv[at + 2];
  if (variant === 'soft') {
    CONFIG.economy.startCoins = 100;
    CONFIG.economy.winCoins = { normal: 15, hard: 25, nightmare: 35 };
    CONFIG.economy.undoEveryLevels = 5;
    CONFIG.catXp.rewardCoins = 15;
    CONFIG.catXp.rewardCoinsPerLevel = 3;
    CONFIG.catXp.hintEvery = 4;
    CONFIG.catXp.jarEvery = 8;
    CONFIG.milestones.chapter.coins = 100;
    CONFIG.dailyLogin.capDay = 14;
  }
  // Подмена хранилища существует только в Node; сохранение браузера не открывается.
  const store = new Map();
  globalThis.localStorage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  globalThis.window = { localStorage: globalThis.localStorage };
  // Считаем гарантированную выдачу; случайные окрасы, клички и компенсации исключены.
  Math.random = () => 0.99;
  const save = await import('../src/core/save.js');
  const { dailyReward } = await import('../src/core/daily.js');
  const levels = JSON.parse(readFileSync(new URL('../src/levels/levels.json', import.meta.url), 'utf8'));
  const zero = () => ({ coins: 0, undos: 0, hints: 0, jars: 0, chests: 0, lives: 0, infiniteMin: 0 });
  const sum = (a, b) => { for (const k of Object.keys(a)) a[k] += b[k] ?? 0; return a; };
  const chestContents = n => ({ coins: n * CONFIG.chest.coins, undos: n * CONFIG.chest.undos,
    hints: n * CONFIG.chest.hints, jars: n * CONFIG.chest.jars });
  const ledger = { start: { ...zero(), coins: save.coins(), undos: save.undos(),
    hints: CONFIG.boosters.hint.start, jars: CONFIG.boosters.jar.start, lives: CONFIG.lives.max },
    wins: zero(), cat: zero(), milestones: zero(), openedChests: zero() };
  for (let i = 0; i < count; i++) {
    const reward = save.recordWin(levels[i], i, levels[i].minMoves, levels.length);
    sum(ledger.wins, { coins: reward.coins, undos: reward.undos });
    for (const up of reward.levelUps) sum(ledger.cat, up);
    const milestone = save.claimMilestones();
    const keys = { coin: 'coins', undo: 'undos', hint: 'hints', heart: 'lives', chest: 'chests', infinite: 'infiniteMin' };
    for (const item of milestone?.items ?? []) ledger.milestones[keys[item.icon]] += item.n;
    while (save.chestsPending()) { save.openChest(); sum(ledger.openedChests, chestContents(1)); }
  }
  const total = Object.values(ledger).reduce(sum, zero());
  const actual = JSON.parse(store.get('kittyeatty.save'));
  for (const k of ['coins', 'undos', 'hints', 'jars']) {
    if (actual[k] !== total[k]) throw new Error(`Ledger mismatch ${k}: ${actual[k]} != ${total[k]}`);
  }
  const daily = {};
  for (const days of [7, 14, 28]) {
    const r = zero();
    for (let day = 1; day <= days; day++) {
      const gift = dailyReward(day);
      sum(r, gift);
      sum(r, chestContents(gift.chests));
    }
    daily[days] = r;
  }
  const adChestCount = Math.floor(Math.max(0, count - CONFIG.economy.winBoost.from + 1) / 4);
  console.log(JSON.stringify({ variant, levels: count, catLevel: actual.catLevel, ledger, total, daily,
    winAdChests: { ...zero(), ...chestContents(adChestCount), chests: adChestCount } }));
}
