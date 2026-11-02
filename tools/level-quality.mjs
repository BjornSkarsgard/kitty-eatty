import { CONFIG } from '../src/config.js';
import { withHidden, deadEndRate, rng } from './lib.mjs';

// Оценивается окончательная раскладка с маской и льдом, на отдельном зерне.
export function finalDifficulty(level, samples = 400) {
  const ice = level.bowls.map(() => 0);
  for (const [i, n] of level.ice ?? []) ice[i] = n;
  const state = level.hidden ? withHidden(level.bowls, level.hidden) : level.bowls;
  return deadEndRate(state, level.capacity, rng(CONFIG.levelGen.difficulty.seed + level.id), samples, CONFIG.levelGen.difficulty.steps, ice);
}

// Четыре одинаковые верхушки дают слишком очевидное начало, даже при вместимости 5 (#12).
// Лёд не исключаем: после таяния такая заготовка тоже остаётся.
export function hasEasyOpening(level) {
  const counts = new Map();
  level.bowls.forEach(b => {
    if (!b.length) return;
    const c = b.at(-1);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  });
  return [...counts.values()].some(n => n >= Math.min(level.capacity, CONFIG.levelGen.maxSameTop + 1));
}
