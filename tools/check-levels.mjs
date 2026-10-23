// Независимая проверка готовых уровней: npm run levels:check
// - каждый уровень решается солвером, минимум ходов совпадает с записанным;
// - записанное решение проходит через игровую логику (src/core/Board.js);
// - в каждом цвете ровно `capacity` порций, нет собранных мисок на старте, нет повторов.
import { readFileSync } from 'node:fs';
import { CONFIG } from '../src/config.js';
import { Board } from '../src/core/Board.js';
import { solve, keyOf, isComplete, isNearComplete } from './lib.mjs';

const levels = JSON.parse(readFileSync(new URL('../src/levels/levels.json', import.meta.url), 'utf8'));
const errors = [];
const seen = new Set();

for (const l of levels) {
  const err = (msg) => errors.push(`уровень ${l.id}: ${msg}`);
  const counts = new Map();
  for (const c of l.bowls.flat()) counts.set(c, (counts.get(c) || 0) + 1);
  for (const [c, n] of counts) if (n !== l.capacity) err(`цвет ${c}: ${n} порций вместо ${l.capacity}`);
  if (counts.size > CONFIG.colors.length) err(`цветов ${counts.size}, в конфиге только ${CONFIG.colors.length}`);
  if (l.bowls.some((b) => b.length > l.capacity)) err('переполненная миска');
  if (l.bowls.some((b) => isComplete(b, l.capacity))) err('миска собрана на старте');
  if (l.id >= CONFIG.levelGen.noNearCompleteFrom && l.bowls.some((b) => isNearComplete(b, l.capacity)))
    err('почти собранная миска на старте');
  const key = keyOf(l.bowls);
  if (seen.has(key)) err('повтор другого уровня');
  seen.add(key);

  const sol = solve(l.bowls, l.capacity);
  if (!sol) err('солвер не нашёл решения');
  else if (sol.moves.length !== l.minMoves) err(`минимум ходов ${sol.moves.length}, записано ${l.minMoves}`);

  const b = new Board(l);
  for (const [f, t] of l.solution) if (!b.move(f, t)) { err(`недопустимый ход ${f}→${t}`); break; }
  if (!b.isSolved()) err('записанное решение не решает уровень');
}

if (errors.length) {
  console.log(errors.join('\n'));
  console.log(`\nОШИБОК: ${errors.length}`);
  process.exit(1);
}
console.log(`Все ${levels.length} уровней прошли проверку.`);
