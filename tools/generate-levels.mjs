// Генерация уровней: npm run levels
// Для каждого уровня: перемешиваем решённое состояние обратными ходами, солвер A* находит минимальное
// решение, оцениваем трудность и из нескольких кандидатов берём ближайшего к целевой трудности.
// Результат: src/levels/levels.json (игра только читает его).
import { writeFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { Board } from '../src/core/Board.js';
import { scramble, solve, deadEndRate, keyOf, isComplete, isNearComplete, rng, withHidden as hiddenState } from './lib.mjs';

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
  const P = G.puzzle;
  if (n >= P.from && n % P.every === P.offset) {
    const t = (n - P.from) / (G.count - P.from);
    return {
      colors: Math.round(lerp(P.colors[0], P.colors[1], t)),
      capacity: P.capacity,
      empties: P.empties,
      dead: lerp(P.dead[0], P.dead[1], t),
      puzzle: true,
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

const levels = [];
const used = new Set();
const t0 = Date.now();

for (let n = 1; n <= G.count; n++) {
  const p = paramsFor(n);
  let best = null;
  let attempts = 0;
  const tries = G.candidates * (p.tries ?? 1);
  while (attempts < tries * 20 && (best === null || attempts < tries)) {
    attempts++;
    const bowls = scramble(p.colors, p.capacity, p.empties, p.colors * p.capacity * 3, rand);
    if (bowls.some((b) => isComplete(b, p.capacity))) continue;
    if (n >= G.noNearCompleteFrom && bowls.some((b) => isNearComplete(b, p.capacity))) continue;
    const key = keyOf(bowls);
    if (used.has(key)) continue;
    const sol = solve(bowls, p.capacity, 500_000);
    if (!sol || sol.moves.length < p.colors * G.minMovesPerColor) continue;
    const dead = deadEndRate(bowls, p.capacity, rand, 80);
    const score = Math.abs(dead - p.dead);
    if (!best || score < best.score) best = { bowls, sol, dead, score, key };
  }
  if (!best) throw new Error(`Не удалось сгенерировать уровень ${n} (${JSON.stringify(p)})`);

  const mech = mechanicsFor(n, p.kind);
  let sol = best.sol;
  let dead = best.dead;
  let ice = null;
  let iceArr = null;
  if (mech.ice) {
    const placed = placeIce(best.bowls, p.capacity, n);
    if (placed) {
      ice = placed.ice;
      iceArr = placed.iceArr;
      sol = placed.sol;
      dead = deadEndRate(best.bowls, p.capacity, mrand, 80, 400, placed.iceArr);
    } else if (mech.intro === 'ice') throw new Error(`Не удалось заморозить банку на уровне-знакомстве ${n}`);
  }
  const level = {
    id: n,
    capacity: p.capacity,
    minMoves: sol.moves.length,
    difficulty: Math.round(dead * 100) / 100,
    bowls: best.bowls,
    solution: sol.moves,
  };
  if (p.puzzle) level.puzzle = true;
  if (p.kind) level.kind = p.kind;
  if (ice) level.ice = ice;
  if (mech.hiddenFull || mech.hiddenPart) {
    level.hidden = hideMask(best.bowls, mech.hiddenFull);
    // скрытая порция не переезжает вместе с верхней — решение и минимум ходов считаем заново с маской
    const hs = solve(hiddenState(best.bowls, level.hidden), p.capacity, 2_000_000, iceArr);
    if (!hs) throw new Error(`Уровень ${n} со скрытым кормом не решается`);
    level.solution = hs.moves;
    level.minMoves = hs.moves.length;
  }
  if (mech.intro) level.intro = mech.intro;
  if (!verify(level)) throw new Error(`Решение уровня ${n} не прошло проверку игровой логикой`);
  used.add(best.key);
  levels.push(level);
  if (n % 25 === 0) console.log(`  ${n}/${G.count}  ${((Date.now() - t0) / 1000).toFixed(1)} с`);
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
const puzzles = levels.filter((l) => l.puzzle);
console.log('\nГоловоломки (1 пустая миска, в средних выше не учтены):');
console.log(puzzles.map((l) => `${l.id}: ${Math.max(...l.bowls.flat()) + 1} цв, ${l.minMoves} х, ${l.difficulty}`).join(' | '));
const withIce = levels.filter((l) => l.ice).map((l) => l.id);
const withHidden = levels.filter((l) => l.hidden).map((l) => l.id);
console.log(`
Лёд — ${withIce.length} уровней (первый ${withIce[0]}), скрытый корм — ${withHidden.length} (первый ${withHidden[0]})`);
const special = levels.filter((l) => l.kind);
console.log('\nСложные (h) и кошмарные (N), в средних выше не учтены:');
console.log(special.map((l) => `${l.id}${l.kind === 'hard' ? 'h' : 'N'}: ${Math.max(...l.bowls.flat()) + 1} цв, ${l.minMoves} х, ${l.difficulty}`).join(' | '));
console.log(`\nГотово: ${levels.length} уровней за ${((Date.now() - t0) / 1000).toFixed(1)} с → src/levels/levels.json`);
