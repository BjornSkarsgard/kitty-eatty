// Сохранение прогресса. Пока — localStorage браузера / WebView. На Яндекс Играх позже подменим
// хранилище на их данные игрока: остальной код работает только через функции этого файла.
//
// Что храним (версия v на случай, если формат поменяется):
//   current  — индекс уровня, который открыть при запуске (последний начатый);
//   unlocked — сколько уровней открыто (индекс самого дальнего доступного);
//   best     — { id уровня: лучшее число ходов } — из него считаются звёзды.
import { CONFIG } from './config.js';

const KEY = 'kittyeatty.save';
const VERSION = 1;

const empty = () => ({ v: VERSION, current: 0, unlocked: 0, best: {} });

let data = null;

// localStorage может быть недоступен (приватный режим, запрет в настройках) — тогда прогресс живёт
// только до закрытия игры, но ничего не ломается.
function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const d = raw && JSON.parse(raw);
    if (d && d.v === VERSION && Number.isInteger(d.current) && Number.isInteger(d.unlocked) && d.best) return d;
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
// (даже если игру закрыли, не нажав «Дальше»).
export function recordWin(index, id, moves, count) {
  const d = get();
  if (!(d.best[id] <= moves)) d.best[id] = moves;
  const next = Math.min(index + 1, count - 1);
  d.unlocked = Math.max(d.unlocked, next);
  d.current = next;
  write();
}

export function bestMoves(id) {
  return get().best[id];
}

// Сколько звёзд за прохождение: 3, 2 или 1 (правило — CONFIG.stars).
export function starsFor(moves, minMoves) {
  const S = CONFIG.stars;
  if (moves <= minMoves + Math.ceil(minMoves * S.three)) return 3;
  if (moves <= minMoves + Math.ceil(minMoves * S.two)) return 2;
  return 1;
}

// Лучшие звёзды уровня (0 — не пройден) — для карты уровней.
export function levelStars(level) {
  const best = bestMoves(level.id);
  return best === undefined ? 0 : starsFor(best, level.minMoves);
}
