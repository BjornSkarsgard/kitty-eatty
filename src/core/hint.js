// Подсказка «Нюх»: ход берётся из решения, заранее записанного в JSON уровня (игра ничего не ищет сама).
// Позиции решения — поле после 0, 1, 2… его ходов. Поле игрока совпало с одной из них — подсказываем следующий
// ход решения. Не совпало — игрок ушёл с пути: ищем последний момент в его истории, когда поле совпадало,
// и предлагаем откатиться туда (дальше — снова по решению). Банки «+1 банка» в конце списка: пустые не мешают
// совпадению, с кормом — поле уже не из решения.
import { Board } from './Board.js';

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

// Что подсказать на поле board (Board уровня level, возможно с добавленными банками):
//   { move: [from, to] } — сделать этот ход;
//   { back: n } — сначала отменить n последних ходов (вернуться на путь решения);
//   null — подсказывать нечего (уровень решён).
export function hintFor(level, board) {
  const n = level.bowls.length;
  const steps = solutionSteps(level);
  const at = (bowls) => (extrasEmpty(bowls, n) ? steps.get(keyOf(bowls, n)) : undefined);
  const k = at(board.bowls);
  if (k !== undefined) return k < level.solution.length ? { move: level.solution[k] } : null;
  // прокручиваем историю игрока с начала и запоминаем последнюю позицию на пути решения
  const replay = new Board(level);
  while (replay.bowls.length < board.bowls.length) replay.addBowl();
  replay.caps = [...board.caps];
  let last = 0;
  board.history.forEach(({ from, to }, h) => {
    replay.move(from, to);
    if (at(replay.bowls) !== undefined) last = h + 1;
  });
  return { back: board.history.length - last };
}
