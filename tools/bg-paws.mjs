// Лапки на обоях фона: node tools/bg-paws.mjs
// Ищет на art-src/bg_game.png (исходник фона) тёмные отпечатки лапок на стене и пишет:
// - tools/bg-paws.json — центры и размеры лапок в пикселях фона (игра кладёт поверх них свечение);
// - src/assets/paw_glow.png — мягкое белое свечение по форме лапки (размытый силуэт самой чёткой лапки).
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WALL = [330, 1265];  // строки стены (между подоконником и столом), px фона
const LOCAL = 24;          // радиус «фона стены» для сравнения, px
const DARK = 5;            // насколько лапка темнее стены вокруг (яркость 0–255)
const JOIN = 7;            // радиус склейки пальчиков и подушечки в одну лапку
const SIZE = [28, 90];     // размер лапки (больший из ширины/высоты), px

const img = decodePNG(readFileSync(join(ROOT, 'art-src', 'bg_game.png')));
const { w, h, rgba } = img;
const lum = new Float32Array(w * h);
for (let i = 0; i < w * h; i++) lum[i] = (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3;

// среднее по квадрату (2r+1)² через интегральную картинку
function boxMean(src, r) {
  const I = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    I[(y + 1) * (w + 1) + x + 1] = src[y * w + x] + I[y * (w + 1) + x + 1] + I[(y + 1) * (w + 1) + x] - I[y * (w + 1) + x];
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    const s = I[y1 * (w + 1) + x1] - I[y0 * (w + 1) + x1] - I[y1 * (w + 1) + x0] + I[y0 * (w + 1) + x0];
    out[y * w + x] = s / ((x1 - x0) * (y1 - y0));
  }
  return out;
}

const local = boxMean(lum, LOCAL);
const dark = new Uint8Array(w * h);
for (let y = WALL[0]; y < WALL[1]; y++) for (let x = 0; x < w; x++) {
  const i = y * w + x;
  if (local[i] - lum[i] > DARK) dark[i] = 1;
}
// склейка: расширяем тёмное, чтобы части одной лапки стали одним пятном
const near = boxMean(Float32Array.from(dark), JOIN);
const joined = new Uint8Array(w * h);
for (let i = 0; i < w * h; i++) if (near[i] > 0) joined[i] = 1;

// пятна — обходом в ширину
const seen = new Uint8Array(w * h);
const paws = [];
for (let s = 0; s < w * h; s++) {
  if (!joined[s] || seen[s]) continue;
  const q = [s];
  seen[s] = 1;
  let x0 = w, y0 = h, x1 = 0, y1 = 0, n = 0;
  while (q.length) {
    const p = q.pop();
    const x = p % w, y = (p - x) / w;
    if (dark[p]) n++;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    for (const d of [-1, 1, -w, w]) {
      const k = p + d;
      if (k >= 0 && k < w * h && joined[k] && !seen[k]) { seen[k] = 1; q.push(k); }
    }
  }
  const bw = x1 - x0 - JOIN * 2, bh = y1 - y0 - JOIN * 2;
  const size = Math.max(bw, bh);
  if (size < SIZE[0] || size > SIZE[1] || x0 <= 0 || x1 >= w - 1) continue;
  if (Math.min(bw, bh) / size < 0.6) continue; // лапка почти квадратная, плоские полоски — тени
  paws.push({ x: Math.round((x0 + x1) / 2), y: Math.round((y0 + y1) / 2), w: bw, h: bh, n });
}
paws.sort((a, b) => a.y - b.y || a.x - b.x);

// Обои — ровная сетка: ряды через шаг dy, соседние ряды сдвинуты на полшага dx. Восстанавливаем сетку по найденным
// лапкам и добавляем пропущенные (бледные, у подоконника) — с размером средней лапки.
const median = (v) => v.slice().sort((p, q) => p - q)[v.length >> 1];
const rowY = [];
for (const p of paws) { const r = rowY.find((y) => Math.abs(y - p.y) < 20); if (!r) rowY.push(p.y); }
rowY.sort((p, q) => p - q);
const dy = median(rowY.slice(1).map((y, i) => y - rowY[i]));
const xsInRow = (y) => paws.filter((p) => Math.abs(p.y - y) < 20).map((p) => p.x).sort((p, q) => p - q);
const dx = median(rowY.flatMap((y) => { const xs = xsInRow(y); return xs.slice(1).map((x, i) => x - xs[i]); }));
const avgW = median(paws.map((p) => p.w));
const avgH = median(paws.map((p) => p.h));
const ref = paws.reduce((p, q) => (q.n > p.n ? q : p));
let added = 0;
for (let y = ref.y - Math.floor((ref.y - WALL[0]) / dy) * dy; y < WALL[1] - avgH / 2; y += dy) {
  const shift = Math.round((y - ref.y) / dy) % 2 ? dx / 2 : 0;
  for (let x = ref.x + shift - Math.floor((ref.x + shift) / dx) * dx; x < w; x += dx) {
    if (y - avgH / 2 < WALL[0] || x < 0) continue;
    if (paws.some((p) => Math.abs(p.x - x) < dx / 3 && Math.abs(p.y - y) < dy / 3)) continue;
    paws.push({ x: Math.round(x), y: Math.round(y), w: avgW, h: avgH, n: 0 });
    added++;
  }
}
console.log(`сетка: шаг ${dx.toFixed(0)}×${dy.toFixed(0)}, добавлено пропущенных: ${added}`);
console.log(`лапок: ${paws.length}`);

// свечение: силуэт самой «плотной» лапки, с полями, размытый
const best = paws.reduce((a, b) => (b.n > a.n ? b : a));
const PAD = 14;
const gw = best.w + PAD * 2, gh = best.h + PAD * 2;
let a = new Float32Array(gw * gh);
for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
  const sx = best.x - Math.round(gw / 2) + x, sy = best.y - Math.round(gh / 2) + y;
  if (sx >= 0 && sy >= 0 && sx < w && sy < h) a[y * gw + x] = Math.min(1, Math.max(0, (local[sy * w + sx] - lum[sy * w + sx] - 2) / 10));
}
const blur = (src, r) => {
  const out = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    let s = 0, c = 0;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < gw && yy < gh) { s += src[yy * gw + xx]; c++; }
    }
    out[y * gw + x] = s / c;
  }
  return out;
};
a = blur(blur(a, 3), 3);
const out = Buffer.alloc(gw * gh * 4);
for (let i = 0; i < gw * gh; i++) {
  out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255;
  out[i * 4 + 3] = Math.round(Math.min(1, a[i] * 2) * 255);
}
writeFileSync(join(ROOT, 'src', 'assets', 'paw_glow.png'), encodePNG({ w: gw, h: gh, rgba: out }));
console.log(`paw_glow.png ${gw}×${gh} по лапке в (${best.x}, ${best.y})`);
// glow — ширина лапки, по которой сделано свечение: игра масштабирует его под размер каждой лапки
writeFileSync(join(ROOT, 'tools', 'bg-paws.json'),
  JSON.stringify({ bg: [w, h], glow: best.w, paws: paws.map(({ x, y, w: pw, h: ph }) => [x, y, pw, ph]) }));
