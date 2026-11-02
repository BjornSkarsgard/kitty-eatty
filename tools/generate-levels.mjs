// Генерация уровней: npm run levels
// Для каждого уровня: перемешиваем решённое состояние обратными ходами, солвер A* находит минимальное
// решение, оцениваем трудность и из нескольких кандидатов берём ближайшего к целевой трудности.
// Результат: src/levels/levels.json (игра только читает его).
import { readFileSync, writeFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { Board } from '../src/core/Board.js';
import { finalDifficulty, hasEasyOpening } from './level-quality.mjs';
import { scramble, solve, keyOf, isComplete, isNearComplete, rng, withHidden as hiddenState } from './lib.mjs';

const G = CONFIG.levelGen;
const MX = G.mechanics;
const rand = rng(G.seed);
const mrand = rng(G.seed + 1); // для механик — отдельно, чтобы не сдвигать раскладки остальных уровней
const lerp = (a, b, t) => a + (b - a) * t;

// Сложный или кошмарный уровень n (место в главе) — или null.
function kindOf(n) {
  const pos = ((n - 1) % G.chapter) + 1;
  if (pos === G.chapter) return 'nightmare';
  return G.hard.at.includes(pos) ? 'hard' : null;
}

// Параметры уровня n (с 1) по ступеням из конфига.
function paramsFor(n) {
  const kind = kindOf(n);
  if (kind) {
    const K = G[kind];
    const p = tierParams(n, false);
    return {
      ...p,
      colors: Math.min(CONFIG.colors.length, p.colors + K.colors),
      dead: Math.min(0.95, p.dead + K.dead),
      tries: K.tries,
      kind,
    };
  }
  return tierParams(n, true);
}

// Обычный уровень n по своей ступени; breather — с передышкой на каждом breatherEvery-м.
function tierParams(n, breather) {
  let from = 1;
  for (const tier of G.tiers) {
    if (n <= tier.upTo) {
      const t = tier.upTo > from ? (n - from) / (tier.upTo - from) : 0;
      let dead = lerp(tier.dead[0], tier.dead[1], t);
      if (breather && n % G.breatherEvery === 0) dead *= G.breatherFactor;
      return {
        colors: Math.round(lerp(tier.colors[0], tier.colors[1], t)),
        capacity: tier.capacity,
        empties: tier.empties,
        dead,
      };
    }
    from = tier.upTo + 1;
  }
  throw new Error(`Нет ступени для уровня ${n}`);
}

// Какие механики на уровне n: { hiddenPart, hiddenFull, ice } и intro — какая здесь впервые.
function mechanicsFor(n, kind) {
  const k = kind ? MX.kindBoost : 1;
  const on = (m) => n === m.intro || (n > m.intro && mrand() < m.share * k);
  const res = { ice: on(MX.ice), hiddenFull: on(MX.hiddenFull) };
  res.hiddenPart = !res.hiddenFull && on(MX.hiddenPart);
  res.intro = n === MX.hiddenPart.intro ? 'hidden' : n === MX.ice.intro ? 'ice' : n === MX.hiddenFull.intro ? 'hiddenFull' : null;
  if (res.intro) { // на уровне-знакомстве — только новая механика
    res.ice = res.intro === 'ice';
    res.hiddenFull = res.intro === 'hiddenFull';
    res.hiddenPart = res.intro === 'hidden';
  }
  return res;
}

// Лёд: выбираем банки и сколько собрать до таяния; солвер проверяет, что уровень так решается.
// Морозим только банки с кормом: пустая во льду выглядит как ошибка («корм не показан»).
// Возвращает { ice: [[банка, k], …], sol } или null.
function placeIce(bowls, cap, n) {
  const full = bowls.map((_, i) => i).filter((i) => bowls[i].length);
  const count = n >= MX.ice.jars2From && mrand() < 0.5 ? 2 : 1;
  for (let attempt = 0; attempt < 30; attempt++) {
    const ice = bowls.map(() => 0);
    const list = [];
    for (let j = 0; j < count; j++) {
      let i;
      do i = full[Math.floor(mrand() * full.length)]; while (ice[i]);
      const k = MX.ice.thaw[0] + Math.floor(mrand() * (MX.ice.thaw[1] - MX.ice.thaw[0] + 1));
      ice[i] = k;
      list.push([i, k]);
    }
    const sol = solve(bowls, cap, 500_000, ice);
    if (sol) return { ice: list, iceArr: ice, sol };
  }
  return null;
}

// Скрытый корм: маска по банкам (1 — скрыта), верхняя порция всегда видна.
function hideMask(bowls, full) {
  const mask = bowls.map((b) => b.map((_, s) => (s < b.length - 1 && (full || mrand() < MX.hiddenPart.part) ? 1 : 0)));
  if (!full && !mask.flat().some(Boolean)) { // хоть одна скрытая
    const i = bowls.findIndex((b) => b.length > 1);
    if (i >= 0) mask[i][0] = 1;
  }
  return mask;
}

// Проверка решения настоящей игровой логикой.
function verify(level) {
  const b = new Board(level);
  for (const [f, t] of level.solution) if (!b.move(f, t)) return false;
  return b.isSolved() && b.history.length === level.minMoves;
}

const repair = process.argv.includes('--repair');
const original = repair ? JSON.parse(readFileSync(new URL('../src/levels/levels.json', import.meta.url), 'utf8')) : [];
const replace = new Set(original.filter(l => l.puzzle || (l.id >= G.noNearCompleteFrom && hasEasyOpening(l))).map(l => l.id));
const levels = [];
const used = new Set(original.filter(l => !replace.has(l.id)).map(l => keyOf(l.bowls)));
const t0 = Date.now();
if (repair) console.log('Замена ' + replace.size + ' уровней: ' + [...replace].join(', '));

for (let n = 1; n <= G.count; n++) {
  if (repair && !replace.has(n)) {
    const level = original[n - 1];
    level.difficulty = Math.round(finalDifficulty(level, G.difficulty.samples) * 100) / 100;
    levels.push(level);
    continue;
  }
  const p = paramsFor(n);
  const old = original[n - 1];
  // Сохраняем набор механик и знакомства; размеры берём от обычной ступени.
  const mech = old ? {
    ice: !!old.ice,
    hiddenFull: !!old.hidden && old.hidden.every(h => h.slice(0, -1).every(Boolean)),
    hiddenPart: !!old.hidden,
    intro: old.intro,
  } : mechanicsFor(n, p.kind);
  let best = null;
  let attempts = 0;
  const tries = G.candidates * (p.tries ?? 1);
  while (attempts < tries * 20 && (best === null || attempts < tries)) {
    attempts++;
    const bowls = scramble(p.colors, p.capacity, p.empties, p.colors * p.capacity * 3, rand);
    if (bowls.some(b => isComplete(b, p.capacity))) continue;
    if (n >= G.noNearCompleteFrom && bowls.some(b => isNearComplete(b, p.capacity))) continue;
    const key = keyOf(bowls);
    if (used.has(key)) continue;
    const level = { id: n, capacity: p.capacity, bowls };
    if (p.kind) level.kind = p.kind;
    if (mech.intro) level.intro = mech.intro;
    let iceArr = null;
    if (mech.ice) {
      const placed = placeIce(bowls, p.capacity, n);
      if (!placed) continue;
      level.ice = placed.ice;
      iceArr = placed.iceArr;
    }
    if (n >= G.noNearCompleteFrom && hasEasyOpening(level)) continue;
    if (mech.hiddenFull || mech.hiddenPart) level.hidden = hideMask(bowls, mech.hiddenFull);
    const state = level.hidden ? hiddenState(bowls, level.hidden) : bowls;
    const sol = solve(state, p.capacity, 500_000, iceArr);
    if (!sol || sol.moves.length < p.colors * G.minMovesPerColor) continue;
    level.solution = sol.moves;
    level.minMoves = sol.moves.length;
    // Отбор ПОСЛЕ добавления льда и скрытого корма.
    const dead = finalDifficulty(level, G.difficulty.samples);
    const score = Math.abs(dead - p.dead);
    level.difficulty = Math.round(dead * 100) / 100;
    if (!best || score < best.score) best = { level, score, key };
  }
  if (!best) throw new Error('Не удалось сгенерировать уровень ' + n);
  if (!verify(best.level)) throw new Error('Решение уровня ' + n + ' не прошло игровую проверку');
  used.add(best.key);
  levels.push(best.level);
  console.log('  ' + n + '/' + G.count + ': ' + best.level.bowls.length + ' банок, ' + best.level.minMoves + ' ходов, ' + best.level.difficulty + '; ' + ((Date.now() - t0)/1000).toFixed(1) + ' с');
}

// Один уровень на строку — удобно смотреть диффы в git.
const out = '[\n' + levels.map((l) => '  ' + JSON.stringify(l)).join(',\n') + '\n]\n';
writeFileSync(new URL('../src/levels/levels.json', import.meta.url), out);

console.log('\nУровни   цвета  вмест  пустых  ходов(ср)  трудность(ср)');
for (let i = 0; i < levels.length; i += 10) {
  const chunk = levels.slice(i, i + 10).filter((l) => !l.puzzle && !l.kind);
  const avg = (f) => chunk.reduce((s, l) => s + f(l), 0) / chunk.length;
  const colors = [...new Set(chunk.map((l) => Math.max(...l.bowls.flat()) + 1))].join(',');
  console.log(
    `${String(i + 1).padStart(3)}-${String(Math.min(i + 10, levels.length)).padEnd(4)}${colors.padEnd(6)} ${String(chunk[0].capacity).padEnd(6)} ` +
    `${String(chunk[0].bowls.filter((b) => !b.length).length).padEnd(7)} ${avg((l) => l.minMoves).toFixed(1).padEnd(10)} ${avg((l) => l.difficulty).toFixed(2)}`,
  );
}
const withIce = levels.filter((l) => l.ice).map((l) => l.id);
const withHidden = levels.filter((l) => l.hidden).map((l) => l.id);
console.log(`
Лёд — ${withIce.length} уровней (первый ${withIce[0]}), скрытый корм — ${withHidden.length} (первый ${withHidden[0]})`);
const special = levels.filter((l) => l.kind);
console.log('\nСложные (h) и кошмарные (N), в средних выше не учтены:');
console.log(special.map((l) => `${l.id}${l.kind === 'hard' ? 'h' : 'N'}: ${Math.max(...l.bowls.flat()) + 1} цв, ${l.minMoves} х, ${l.difficulty}`).join(' | '));
console.log(`\nГотово: ${levels.length} уровней за ${((Date.now() - t0) / 1000).toFixed(1)} с → src/levels/levels.json`);
