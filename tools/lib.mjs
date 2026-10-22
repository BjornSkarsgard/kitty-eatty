// Общие функции генератора: правила ходов (как в src/core/Board.js), солвер A*, обратные ходы, оценка трудности.
// Миска — массив порций снизу вверх, порция — индекс цвета.

export function topRun(b) {
  if (!b.length) return 0;
  const c = b[b.length - 1];
  let run = 1;
  while (run < b.length && b[b.length - 1 - run] === c) run++;
  return run;
}

export const isComplete = (b, cap) => b.length === cap && b.every((c) => c === b[0]);
export const isSolved = (st, cap) => st.every((b) => !b.length || isComplete(b, cap));

// Канонический ключ: порядок мисок не важен.
export const keyOf = (st) => st.map((b) => b.join(',')).sort().join('|');

// Все разумные ходы [from, to, n]. Отсекаем заведомо бесполезные:
// переливание целой однотонной миски в пустую и перебор нескольких пустых мисок.
export function legalMoves(st, cap) {
  const res = [];
  for (let f = 0; f < st.length; f++) {
    const s = st[f];
    if (!s.length || isComplete(s, cap)) continue;
    const c = s[s.length - 1];
    const run = topRun(s);
    let emptyTried = false;
    for (let t = 0; t < st.length; t++) {
      if (t === f) continue;
      const d = st[t];
      if (d.length >= cap) continue;
      if (d.length) {
        if (d[d.length - 1] !== c) continue;
      } else {
        if (emptyTried || run === s.length) continue;
        emptyTried = true;
      }
      res.push([f, t, Math.min(run, cap - d.length)]);
    }
  }
  return res;
}

export function applyMove(st, [f, t, n]) {
  const ns = st.slice();
  ns[f] = st[f].slice(0, st[f].length - n);
  ns[t] = st[t].concat(st[f].slice(st[f].length - n));
  return ns;
}

// Допустимая эвристика для A*: каждый ход уменьшает её не больше чем на 1.
// = число «стыков» разных цветов внутри мисок + лишние миски с одинаковым цветом на дне.
function heuristic(st) {
  let h = 0;
  const bottoms = new Map();
  for (const b of st) {
    if (!b.length) continue;
    for (let i = 1; i < b.length; i++) if (b[i] !== b[i - 1]) h++;
    bottoms.set(b[0], (bottoms.get(b[0]) || 0) + 1);
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

// Минимальное решение A*. Возвращает { moves: [[from,to],...], expanded } или null.
export function solve(start, cap, maxExpanded = 2_000_000) {
  const startKey = keyOf(start);
  const g = new Map([[startKey, 0]]);
  const heap = new Heap();
  heap.push({ st: start, g: 0, f: heuristic(start), prev: null, move: null });
  let expanded = 0;
  while (heap.size) {
    const node = heap.pop();
    if (node.g > g.get(keyOf(node.st))) continue;
    if (isSolved(node.st, cap)) {
      const moves = [];
      for (let n = node; n.prev; n = n.prev) moves.push([n.move[0], n.move[1]]);
      return { moves: moves.reverse(), expanded };
    }
    if (++expanded > maxExpanded) return null;
    for (const m of legalMoves(node.st, cap)) {
      const ns = applyMove(node.st, m);
      const k = keyOf(ns);
      const ng = node.g + 1;
      if (g.has(k) && g.get(k) <= ng) continue;
      g.set(k, ng);
      heap.push({ st: ns, g: ng, f: ng + heuristic(ns), prev: node, move: m });
    }
  }
  return null;
}

// Обратный ход: точная отмена какого-то допустимого прямого хода F→T на k порций.
// Поэтому из любого состояния, полученного обратными ходами, решённое достижимо.
export function inverseMoves(st, cap) {
  const res = [];
  for (let t = 0; t < st.length; t++) {
    const tb = st[t];
    if (!tb.length) continue;
    const c = tb[tb.length - 1];
    const run = topRun(tb);
    for (let k = 1; k <= run; k++) {
      // после снятия в T сверху должен остаться тот же цвет или пусто (прямой ход клал на такой же)
      if (k !== tb.length && k === run) continue;
      for (let f = 0; f < st.length; f++) {
        if (f === t) continue;
        const fb = st[f];
        if (fb.length + k > cap) continue;
        const fTop = fb.length ? fb[fb.length - 1] : -1;
        // прямой ход должен переложить ровно k: если под ними тот же цвет, ограничить может только место в T
        if (fTop === c && cap - (tb.length - k) !== k) continue;
        // источник прямого хода не может быть собранной миской
        if (fb.length + k === cap && (fTop === c || !fb.length)) {
          const after = fb.concat(Array(k).fill(c));
          if (isComplete(after, cap)) continue;
        }
        res.push([t, f, k]);
      }
    }
  }
  return res;
}

export function solvedState(colors, cap, empties) {
  const st = [];
  for (let c = 0; c < colors; c++) st.push(Array(cap).fill(c));
  for (let e = 0; e < empties; e++) st.push([]);
  return st;
}

// Детерминированный ГСЧ, чтобы генерация повторялась при том же seed.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Трудность: доля случайных прохождений, зашедших в тупик (0 — легко, 1 — без мысли не пройти).
// Игрок-бот ходит случайно, но не возвращается в уже виденные состояния.
export function deadEndRate(start, cap, rand, playouts = 120, maxSteps = 400) {
  let fails = 0;
  for (let p = 0; p < playouts; p++) {
    let st = start;
    const seen = new Set([keyOf(st)]);
    let ok = false;
    for (let step = 0; step < maxSteps; step++) {
      if (isSolved(st, cap)) { ok = true; break; }
      const opts = legalMoves(st, cap).map((m) => applyMove(st, m)).filter((ns) => !seen.has(keyOf(ns)));
      if (!opts.length) break;
      st = opts[Math.floor(rand() * opts.length)];
      seen.add(keyOf(st));
    }
    if (!ok) fails++;
  }
  return fails / playouts;
}

// «Вольный» обратный ход: верхняя порция в любую миску, где есть место (цвет не важен).
// Перемешивает гораздо сильнее точных обратных ходов, но решаемость уже не гарантирована — её проверяет солвер.
export function scramble(colors, cap, empties, steps, rand) {
  let st = solvedState(colors, cap, empties);
  for (let i = 0; i < steps; i++) {
    const from = pickIndex(st, (b) => b.length > 0, rand);
    const to = pickIndex(st, (b, j) => j !== from && b.length < cap, rand);
    st = applyMove(st, [from, to, 1]);
  }
  // Выравнивание: перекладываем из самой пустой непустой миски в неполные,
  // пока все миски не станут полными или пустыми.
  for (;;) {
    const partial = st.map((b, i) => i).filter((i) => st[i].length > 0 && st[i].length < cap);
    if (!partial.length) break;
    partial.sort((a, b) => st[a].length - st[b].length);
    const from = partial[0];
    const to = partial[1 + Math.floor(rand() * (partial.length - 1))];
    st = applyMove(st, [from, to, 1]);
  }
  return st;
}

function pickIndex(st, ok, rand) {
  const idx = st.map((b, i) => i).filter((i) => ok(st[i], i));
  return idx[Math.floor(rand() * idx.length)];
}
