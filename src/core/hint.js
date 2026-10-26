// Подсказка «Нюх»: какой ход сделать.
// 1) Поле совпало с позицией решения, записанного в JSON уровня (после 0, 1, 2… его ходов), — следующий ход решения.
// 2) Не совпало (игрок пошёл своим путём) — ищем решение с текущего поля солвером (src/core/solver.js), но не дольше
//    CONFIG.boosters.hint.search шагов перебора: нашли — его первый ход.
// 3) Солвер доказал, что отсюда решения нет (stuck), или не уложился — откатываем копию поля по одному ходу
//    (ходы, обмены, ульты) до ближайшей позиции, откуда ещё можно выиграть (на пути решения или солвер нашёл решение),
//    и предлагаем откатиться туда.
// Банки «+1 банка» в конце списка: пустые не мешают совпадению, с кормом — поле уже не из решения.
import { CONFIG } from '../config.js';
import { Board } from './Board.js';
import { HID, solve } from './solver.js';

const keyOf = (bowls, n) => bowls.slice(0, n).map((b) => b.join(',')).join('|');
const extrasEmpty = (bowls, n) => bowls.slice(n).every((b) => !b.length);

// Ключи позиций решения → номер хода решения, с которого продолжать.
function solutionSteps(level) {
  const b = new Board(level);
  const steps = new Map([[keyOf(b.bowls, b.bowls.length), 0]]);
  level.solution.forEach(([f, t], k) => {
    b.move(f, t);
    if (!steps.has(keyOf(b.bowls, b.bowls.length))) steps.set(keyOf(b.bowls, b.bowls.length), k + 1);
  });
  return steps;
}

// Решение с текущего поля: { moves } / false — решения нет / null — не нашли за отведённый перебор.
// Ищем взвешенным A* (hint.weight): не самое короткое решение, зато быстро. Банки разной вместимости
// (+1 банка ультракота, «Тесно, но влезет») — солвер знает вместимость каждой.
function searchFrom(board) {
  const H = CONFIG.boosters.hint;
  const cap = board.capacity;
  const caps = board.caps.some((c) => c !== cap) ? board.caps : null;
  const st = board.bowls.map((b, i) => b.map((c, s) => (board.isHidden(i, s) ? c + HID : c)));
  const ice = board.bowls.map((_, i) => (board.isFrozen(i) ? board.ice[i] : 0));
  return solve(st, cap, H.search, ice, { caps, weight: H.weight });
}

// Что подсказать на поле board (Board уровня level, возможно с добавленными банками):
//   { move: [from, to] } — сделать этот ход;
//   { back: n, stuck } — сначала отменить n последних ходов (вернуться на путь решения); stuck — отсюда не решить;
//   null — подсказывать нечего (уровень решён).
export function hintFor(level, board) {
  const n = level.bowls.length;
  const steps = solutionSteps(level);
  const at = (bowls) => (extrasEmpty(bowls, n) ? steps.get(keyOf(bowls, n)) : undefined);
  const k = at(board.bowls);
  if (k !== undefined) return k < level.solution.length ? { move: level.solution[k] } : null;
  if (board.isSolved()) return null;
  const sol = searchFrom(board);
  if (sol) return { move: sol.moves[0] };
  // откатываем копию поля с конца, пока не найдём позицию, откуда ещё можно выиграть
  const copy = Object.assign(Object.create(Board.prototype), structuredClone({ ...board, changes: undefined }));
  copy.changes = { revealed: [], thawed: [], caps: false };
  let back = 0;
  while (copy.history.length) {
    copy.undo();
    back++;
    if (at(copy.bowls) !== undefined || searchFrom(copy)) break;
  }
  return { back, stuck: sol === false };
}
