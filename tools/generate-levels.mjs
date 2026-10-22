// Генерация уровней: npm run levels
// Для каждого уровня: перемешиваем решённое состояние обратными ходами, солвер A* находит минимальное
// решение, оцениваем трудность и из нескольких кандидатов берём ближайшего к целевой трудности.
// Результат: src/levels/levels.json (игра только читает его).
import { writeFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { Board } from '../src/core/Board.js';
import { scramble, solve, deadEndRate, keyOf, isComplete, rng } from './lib.mjs';

const G = CONFIG.levelGen;
const rand = rng(G.seed);
const lerp = (a, b, t) => a + (b - a) * t;

// Параметры уровня n (с 1) по ступеням из конфига.
function paramsFor(n) {
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
  let from = 1;
  for (const tier of G.tiers) {
    if (n <= tier.upTo) {
      const t = tier.upTo > from ? (n - from) / (tier.upTo - from) : 0;
      let dead = lerp(tier.dead[0], tier.dead[1], t);
      if (n % G.breatherEvery === 0) dead *= G.breatherFactor;
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
  while (attempts < G.candidates * 20 && (best === null || attempts < G.candidates)) {
    attempts++;
    const bowls = scramble(p.colors, p.capacity, p.empties, p.colors * p.capacity * 3, rand);
    if (bowls.some((b) => isComplete(b, p.capacity))) continue;
    const key = keyOf(bowls);
    if (used.has(key)) continue;
    const sol = solve(bowls, p.capacity, 500_000);
    if (!sol || sol.moves.length < p.colors * G.minMovesPerColor) continue;
    const dead = deadEndRate(bowls, p.capacity, rand, 80);
    const score = Math.abs(dead - p.dead);
    if (!best || score < best.score) best = { bowls, sol, dead, score, key };
  }
  if (!best) throw new Error(`Не удалось сгенерировать уровень ${n} (${JSON.stringify(p)})`);

  const level = {
    id: n,
    capacity: p.capacity,
    minMoves: best.sol.moves.length,
    difficulty: Math.round(best.dead * 100) / 100,
    bowls: best.bowls,
    solution: best.sol.moves,
  };
  if (p.puzzle) level.puzzle = true;
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
  const chunk = levels.slice(i, i + 10).filter((l) => !l.puzzle);
  const avg = (f) => chunk.reduce((s, l) => s + f(l), 0) / chunk.length;
  const colors = [...new Set(chunk.map((l) => Math.max(...l.bowls.flat()) + 1))].join(',');
  console.log(
    `${String(i + 1).padStart(3)}-${String(i + chunk.length).padEnd(4)}  ${colors.padEnd(6)} ${String(chunk[0].capacity).padEnd(6)} ` +
    `${String(chunk[0].bowls.filter((b) => !b.length).length).padEnd(7)} ${avg((l) => l.minMoves).toFixed(1).padEnd(10)} ${avg((l) => l.difficulty).toFixed(2)}`,
  );
}
const puzzles = levels.filter((l) => l.puzzle);
console.log('\nГоловоломки (1 пустая миска, в средних выше не учтены):');
console.log(puzzles.map((l) => `${l.id}: ${Math.max(...l.bowls.flat()) + 1} цв, ${l.minMoves} х, ${l.difficulty}`).join(' | '));
console.log(`\nГотово: ${levels.length} уровней за ${((Date.now() - t0) / 1000).toFixed(1)} с → src/levels/levels.json`);
