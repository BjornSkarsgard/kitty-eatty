// Семидневный расчёт потребности, НЕ предсказание поведения/удержания игроков.
// node tools/economy-cohorts.mjs [--json]
// Недостающие монеты учитываются как долг: график побед не останавливается.
// Жизни/бусты покупаются по одной за монеты; пакеты и реклама — заданные сценарии.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { CONFIG as C } from '../src/config.js';

const demands = {
  low: { undos: 0.5, hints: 0.15, jars: 0.08, lives: 0.2 },
  medium: { undos: 1, hints: 0.3, jars: 0.2, lives: 0.5 },
  high: { undos: 1.5, hints: 0.4, jars: 0.3, lives: 0.8 },
};
const cohorts = ['free', 'ads', 'paid', 'paid+ads'];
const worker = process.argv.indexOf('--worker');
if (worker < 0) {
  const rows = [];
  for (const variant of ['current', 'soft', 'scarcity']) for (const demand of Object.keys(demands)) for (const cohort of cohorts) {
    const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--worker', variant, demand, cohort], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout);
    rows.push(JSON.parse(r.stdout));
  }
  if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
  else console.table(rows.map(r => ({ variant: r.variant, demand: r.demand, cohort: r.cohort,
    balance: r.balance, peakDebt: r.peakDebt, daysInDebt: r.daysInDebt, lifePurchases: r.bought.lives,
    ads: r.ads, rub: r.rub })));
} else {
  const [variant, demand, cohort] = process.argv.slice(worker + 1);
  const bulkFloor = process.argv.includes('--bulk-floor');
  if (variant === 'soft' || variant === 'scarcity') {
    C.economy.startCoins = 100;
    C.economy.winCoins = { normal: 15, hard: 25, nightmare: 35 };
    C.economy.undoEveryLevels = 5;
    C.catXp.rewardCoins = 15; C.catXp.rewardCoinsPerLevel = 3;
    C.catXp.hintEvery = 4; C.catXp.jarEvery = 8;
    C.milestones.chapter.coins = 100; C.dailyLogin.capDay = 14;
  }
  if (variant === 'scarcity') {
    C.economy.startCoins = 50;
    C.economy.winCoins = { normal: 8, hard: 15, nightmare: 25 };
    C.economy.undoEveryLevels = 10;
    C.catXp.rewardCoins = 5; C.catXp.rewardCoinsPerLevel = 1;
    C.catXp.rewardUndos = 0; C.catXp.bonusUndoEvery = 5;
    C.catXp.hintEvery = 6; C.catXp.jarEvery = 10;
    C.milestones.chapter.coins = 50; C.milestones.chapter.infiniteMin = 15;
    C.dailyLogin.base = 15; C.dailyLogin.step = 5;
    C.shop.packs.find(p => p.id === 'pack1').coins = 3000;
  }
  const RealDate = Date;
  const origin = new RealDate(2026, 10, 2, 12).getTime();
  let now = origin;
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  const store = new Map();
  globalThis.window = { localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } };
  Math.random = () => 0.99; // без случайной косметики и компенсаций
  const S = await import('../src/core/save.js');
  const levels = JSON.parse(readFileSync(new URL('../src/levels/levels.json', import.meta.url), 'utf8'));
  S.addWinBoost(0); // сериализовать начальное состояние в хранилище аудита
  const state = () => JSON.parse(store.get('kittyeatty.save'));
  const initial = state();
  const stock = Object.fromEntries(['coins', 'undos', 'hints', 'jars', 'lives'].map(k => [k, initial[k]]));
  const income = { ...stock };
  const bought = { undos: 0, hints: 0, jars: 0, lives: 0 };
  const prices = { undos: C.economy.undoPrice, hints: C.boosters.hint.price, jars: C.boosters.jar.price, lives: C.lives.price };
  // Нижняя граница цены при закупке больших пачек заранее: не реалистичная касса,
  // а проверка чувствительности. Остатки пачек и необходимость накопить цену исключены.
  if (bulkFloor) for (const goods of C.shop.goods) for (const option of goods.options) {
    if (!option.coins || !option.n || !option.give) continue;
    for (const key of Object.keys(prices)) if (option.give[key]) prices[key] = Math.min(prices[key], option.coins / option.give[key]);
  }
  let until = 0, refillAt = null, peakDebt = 0, ads = 0, rub = 0;
  const days = [];
  const collect = fn => {
    const before = state();
    fn();
    while (S.chestsPending()) S.openChest();
    const after = state();
    for (const k of Object.keys(stock)) { const n = after[k] - before[k]; stock[k] += n; income[k] += n; }
    const minutes = Math.max(0, (after.infiniteUntil || 0) - Math.max(now, before.infiniteUntil || 0)) / 60000;
    until = Math.max(until, now) + minutes * 60000;
  };
  const refill = () => {
    if (stock.lives >= C.lives.max) { refillAt = null; return; }
    if (refillAt === null) refillAt = now + C.lives.refillMinutes * 60000;
    while (stock.lives < C.lives.max && now >= refillAt) {
      stock.lives++; income.lives++; refillAt += C.lives.refillMinutes * 60000;
    }
    if (stock.lives >= C.lives.max) refillAt = null;
  };
  const spend = key => {
    if (key === 'lives') {
      if (until > now) return;
      refill();
    }
    if (stock[key] > 0) stock[key]--;
    else {
      stock.coins -= prices[key];
      bought[key]++;
      peakDebt = Math.max(peakDebt, -stock.coins);
    }
    if (key === 'lives' && refillAt === null && stock.lives < C.lives.max) refillAt = now + C.lives.refillMinutes * 60000;
  };
  const accumulator = { undos: 0, hints: 0, jars: 0, lives: 0 };
  const pack = C.shop.packs.find(p => p.id === 'pack1');
  for (let day = 0; day < 7; day++) {
    now = origin + day * 86400000;
    refill();
    collect(() => S.claimDaily());
    if (day === 0 && cohort.includes('paid')) {
      // Гипотетическая покупка: платежи не вызываются и в игре выключены.
      rub += pack.price;
      stock.coins += pack.coins; income.coins += pack.coins;
      for (const k of ['undos', 'hints', 'jars']) { stock[k] += pack.boosters; income[k] += pack.boosters; }
      until = Math.max(until, now) + pack.infiniteH * 3600000;
    }
    if (cohort === 'ads') {
      // Четыре ролика за день: 2 × 100 монет, 1 Нюх, 1 банка.
      collect(() => { S.adCoins(); S.adCoins(); S.adGoods('hint', { hints: 1 }); S.adGoods('addjar', { jars: 1 }); });
      ads += 4;
    } else if (cohort === 'paid+ads') {
      // Два ролика за день, оба за 100 монет. Лесенка/шкала не используются.
      collect(() => { S.adCoins(); S.adCoins(); });
      ads += 2;
    }
    for (let step = 0; step < 20; step++) {
      now = origin + day * 86400000 + (step + 1) * 45000 * 3;
      refill();
      for (const k of Object.keys(accumulator)) {
        if (k === 'hints' && S.catLevel() < C.boosters.hint.from) continue;
        if (k === 'jars' && S.catLevel() < C.boosters.jar.from) continue;
        accumulator[k] += demands[demand][k];
        while (accumulator[k] >= 1 - 1e-9) { spend(k); accumulator[k] -= 1; }
      }
      const index = day * 20 + step;
      collect(() => { S.recordWin(levels[index], index, levels[index].minMoves, levels.length); S.claimMilestones(); });
    }
    days.push({ day: day + 1, coins: stock.coins, ...Object.fromEntries(['undos', 'hints', 'jars', 'lives'].map(k => [k, stock[k]])) });
  }
  const expected = income.coins - Object.keys(bought).reduce((cost, k) => cost + bought[k] * prices[k], 0);
  if (Math.abs(expected - stock.coins) > 1e-6) throw new Error('Coin ledger mismatch');
  console.log(JSON.stringify({ variant, demand, cohort, bulkFloor, assumptions: { days: 7, wins: 140, minutesPerDay: 45,
    needPerWin: demands[demand], debt: 'unmet coin requirement; wins continue for accounting only' },
    balance: stock.coins, peakDebt, daysInDebt: days.filter(d => d.coins < 0).length, stock, income, bought, ads, rub, days }));
}
