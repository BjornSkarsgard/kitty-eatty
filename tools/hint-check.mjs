// Проверка подсказки «Нюх» вне игры: node tools/hint-check.mjs [число уровней]
// На каждом уровне делаем несколько случайных допустимых ходов (уходим с записанного решения), потом идём только
// по подсказкам до победы. Печатает, сколько раз подсказка дала ход / откат / тупик и самое долгое время поиска.
import { readFileSync } from 'node:fs';
import { Board } from '../src/core/Board.js';
import { hintFor } from '../src/core/hint.js';

const levels = JSON.parse(readFileSync(new URL('../src/levels/levels.json', import.meta.url), 'utf8'));
const count = Number(process.argv[2] || levels.length);
let seed = 7;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const stat = { move: 0, back: 0, stuck: 0, unsolved: 0, worstMs: 0, worstLevel: 0 };

for (const level of levels.slice(0, count)) {
  const b = new Board(level);
  for (let k = 0; k < 6; k++) {
    const moves = [];
    b.bowls.forEach((_, f) => b.bowls.forEach((__, t) => { if (b.canMove(f, t)) moves.push([f, t]); }));
    if (!moves.length) break;
    b.move(...moves[Math.floor(rand() * moves.length)]);
  }
  for (let guard = 0; guard < 300 && !b.isSolved(); guard++) {
    const t0 = performance.now();
    const h = hintFor(level, b);
    const ms = performance.now() - t0;
    if (ms > stat.worstMs) { stat.worstMs = ms; stat.worstLevel = level.id; }
    if (!h) break;
    if (h.move) {
      stat.move++;
      if (!b.move(...h.move)) throw new Error(`уровень ${level.id}: подсказка дала недопустимый ход ${h.move}`);
    } else {
      stat[h.stuck ? 'stuck' : 'back']++;
      for (let k = 0; k < h.back; k++) b.undo();
    }
  }
  if (!b.isSolved()) stat.unsolved++;
}
console.log(`уровней ${count}: ходов ${stat.move}, откатов «сбились» ${stat.back}, «тупик» ${stat.stuck}, не дошли до победы ${stat.unsolved}`);
console.log(`самый долгий поиск ${stat.worstMs.toFixed(0)} мс (уровень ${stat.worstLevel})`);
