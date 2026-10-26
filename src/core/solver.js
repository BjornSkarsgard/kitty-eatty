// Солвер: правила ходов (как в src/core/Board.js) и поиск минимального решения A*. Общий для генератора уровней
// (tools/lib.mjs) и подсказки в игре (src/core/hint.js). Миска — массив порций снизу вверх, порция — индекс цвета.
// ice — лёд (необязательно): ice[i] = k — банка i заморожена, пока не собрано k банок (0 / нет — не заморожена).
// Собранную банку разобрать нельзя, поэтому число собранных только растёт, и растаявшая банка больше не замерзает:
// заморожена ли банка — видно по самому состоянию, хранить отдельно не нужно.
// Скрытый корм «?»: порция цвета c записана как c + HID. Верхняя всегда открыта; скрытая обрывает серию сверху
// (topRun сравнивает значения — скрытая с открытой не совпадает) и открывается, когда уйдёт порция над ней (applyMove).
export const HID = 1000;
export const colorOf = (x) => x % HID;
// Состояние с маской скрытых (mask[i][s] = 1 — скрыта).
export const withHidden = (st, mask) => revealLone(st.map((b, i) => b.map((c, s) => (mask?.[i]?.[s] ? c + HID : c))));

// Все оставшиеся скрытые порции одного цвета — угадывать нечего, открываем все (как Board.reveal в игре).
export function revealLone(st) {
  let color = -1;
  for (const b of st) for (const x of b) {
    if (x < HID) continue;
    if (color < 0) color = x - HID;
    else if (x - HID !== color) return st;
  }
  return color < 0 ? st : st.map((b) => (b.some((x) => x >= HID) ? b.map(colorOf) : b));
}

export function topRun(b) {
  if (!b.length) return 0;
  const c = b[b.length - 1];
  let run = 1;
  while (run < b.length && b[b.length - 1 - run] === c) run++;
  return run;
}

export const isComplete = (b, cap) => b.length === cap && b.every((c) => colorOf(c) === colorOf(b[0]));
export const isSolved = (st, cap) => st.every((b) => !b.length || isComplete(b, cap));

// «Почти собранная» миска — на старте уровня выглядит как недосмотр:
// cap-1 порций одного цвета снизу, а сверху либо пусто (собирается одним ходом), либо одна чужая (двумя).
export const isNearComplete = (b, cap) =>
  (b.length === cap - 1 || b.length === cap) && b.slice(0, cap - 1).every((c) => c === b[0]);

// Канонический ключ: порядок мисок не важен — кроме замороженных (у них своя метка) и банок другой вместимости (caps).
export const keyOf = (st, ice, caps) =>
  st.map((b, i) => b.join(',') + (ice?.[i] ? `#${ice[i]}` : '') + (caps ? `@${caps[i]}` : '')).sort().join('|');

export const completedCount = (st, cap) => st.reduce((n, b) => n + (isComplete(b, cap) ? 1 : 0), 0);
// Заморожена ли сейчас банка i.
const frozen = (ice, i, done) => !!ice && ice[i] > done;

// Все разумные ходы [from, to, n]. Отсекаем заведомо бесполезные:
// переливание целой однотонной миски в пустую и перебор нескольких пустых мисок (одинаковой вместимости).
// cap — сколько порций в собранной банке; caps[i] — сколько влезает в банку i, если банки разные (+1 банка ультракота).
export function legalMoves(st, cap, ice, caps) {
  const res = [];
  const done = ice ? completedCount(st, cap) : 0;
  for (let f = 0; f < st.length; f++) {
    const s = st[f];
    if (!s.length || isComplete(s, cap) || frozen(ice, f, done)) continue;
    const c = s[s.length - 1];
    const run = topRun(s);
    const emptyTried = new Set(); // вместимости пустых банок, куда уже пробовали
    for (let t = 0; t < st.length; t++) {
      if (t === f || frozen(ice, t, done)) continue;
      const d = st[t];
      const room = caps ? caps[t] : cap;
      if (d.length >= room) continue;
      if (d.length) {
        if (d[d.length - 1] !== c) continue;
      } else {
        if (emptyTried.has(room) || run === s.length) continue;
        emptyTried.add(room);
      }
      res.push([f, t, Math.min(run, room - d.length)]);
    }
  }
  return res;
}

// cap — для скрытого корма: в собранной банке открывается всё (как Board.reveal).
export function applyMove(st, [f, t, n], cap) {
  const ns = st.slice();
  ns[f] = st[f].slice(0, st[f].length - n);
  const top = ns[f].length - 1;
  if (top >= 0 && ns[f][top] >= HID) { ns[f] = ns[f].slice(); ns[f][top] -= HID; } // открылась порция под ушедшими
  ns[t] = st[t].concat(st[f].slice(st[f].length - n));
  if (cap && isComplete(ns[t], cap)) ns[t] = ns[t].map(colorOf);
  return revealLone(ns);
}

// Допустимая эвристика для A*: каждый ход уменьшает её не больше чем на 1.
// = число «стыков» разных цветов внутри мисок + лишние миски с одинаковым цветом на дне.
function heuristic(st) {
  let h = 0;
  const bottoms = new Map();
  for (const b of st) {
    if (!b.length) continue;
    for (let i = 1; i < b.length; i++) if (colorOf(b[i]) !== colorOf(b[i - 1])) h++;
    bottoms.set(colorOf(b[0]), (bottoms.get(colorOf(b[0])) || 0) + 1);
  }
  for (const n of bottoms.values()) h += n - 1;
  return h;
}

class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= x.f) break;
      a[i] = a[p]; i = p;
    }
    a[i] = x;
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= a.length) break;
        const r = l + 1;
        const m = r < a.length && a[r].f < a[l].f ? r : l;
        if (a[m].f >= last.f) break;
        a[i] = a[m]; i = m;
      }
      a[i] = last;
    }
    return top;
  }
}

// Минимальное решение A*. Возвращает { moves: [[from,to],...], expanded }; false — решения нет (перебрано всё);
// null — не уложились в maxExpanded. caps — вместимость каждой банки, если разная (см. legalMoves);
// weight > 1 — взвешенный A*: решение находится намного быстрее, но уже не обязательно самое короткое (подсказке хватит).
export function solve(start, cap, maxExpanded = 2_000_000, ice = null, { caps = null, weight = 1 } = {}) {
  const key = (st) => keyOf(st, ice, caps);
  const startKey = key(start);
  const g = new Map([[startKey, 0]]);
  const heap = new Heap();
  heap.push({ st: start, g: 0, f: weight * heuristic(start), prev: null, move: null });
  let expanded = 0;
  while (heap.size) {
    const node = heap.pop();
    if (node.g > g.get(key(node.st))) continue;
    if (isSolved(node.st, cap)) {
      const moves = [];
      for (let n = node; n.prev; n = n.prev) moves.push([n.move[0], n.move[1]]);
      return { moves: moves.reverse(), expanded };
    }
    if (++expanded > maxExpanded) return null;
    for (const m of legalMoves(node.st, cap, ice, caps)) {
      const ns = applyMove(node.st, m, cap);
      const k = key(ns);
      const ng = node.g + 1;
      if (g.has(k) && g.get(k) <= ng) continue;
      g.set(k, ng);
      heap.push({ st: ns, g: ng, f: ng + weight * heuristic(ns), prev: node, move: m });
    }
  }
  return false;
}
