// Общие функции генератора: обратные ходы, перемешивание, оценка трудности. Правила ходов и солвер —
// src/core/solver.js (тот же код считает подсказку в игре), здесь они реэкспортируются.
import { topRun, isComplete, isSolved, legalMoves, applyMove, keyOf } from '../src/core/solver.js';

export * from '../src/core/solver.js';

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
export function deadEndRate(start, cap, rand, playouts = 120, maxSteps = 400, ice = null) {
  let fails = 0;
  for (let p = 0; p < playouts; p++) {
    let st = start;
    const seen = new Set([keyOf(st, ice)]);
    let ok = false;
    for (let step = 0; step < maxSteps; step++) {
      if (isSolved(st, cap)) { ok = true; break; }
      const opts = legalMoves(st, cap, ice).map((m) => applyMove(st, m, cap)).filter((ns) => !seen.has(keyOf(ns, ice)));
      if (!opts.length) break;
      st = opts[Math.floor(rand() * opts.length)];
      seen.add(keyOf(st, ice));
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
