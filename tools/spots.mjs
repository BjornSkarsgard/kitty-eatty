// Белые пятна кота (мордочка и грудка) из готовых частей: node tools/spots.mjs
// - берёт src/assets/cat_head.png и cat_body.png, вырезает из них пятно заданной формы;
// - пятно не вылезает за контур: в него попадает только заливка внутри обводки;
// - пиксели берутся с исходника как есть (белое — белым, тень — серым), поэтому тень на пятне совпадает;
// - холст того же размера, что и исходник: игра кладёт пятно поверх с теми же координатами.
// Форма — объединение эллипсов (доли ширины и высоты картинки). taper > 0 сужает эллипс кверху (яйцо).
// Крути числа ниже и перезапускай.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'src', 'assets');

const SPOTS = [
  {
    from: 'cat_head', to: 'cat_spots_head',
    // две щёчки под носом + подбородок
    shapes: [
      { x: 0.40, y: 0.77, rx: 0.16, ry: 0.13 },
      { x: 0.60, y: 0.77, rx: 0.16, ry: 0.13 },
      { x: 0.50, y: 0.85, rx: 0.19, ry: 0.12 },
    ],
  },
  {
    from: 'cat_body', to: 'cat_spots_body',
    // грудка: яйцо, сужается кверху, к шее (верх всё равно прикрыт головой)
    shapes: [
      { x: 0.50, y: 0.50, rx: 0.21, ry: 0.32, taper: 0.45 },
    ],
  },
];
const EDGE = 2;       // мягкий край пятна, px
const BRIGHT = 150;   // светлее этого — заливка (белое или тень), темнее — контур

// Маска заливки: заливка от центра по светлым непрозрачным пикселям, контур её останавливает.
function fillMask({ w, h, rgba }) {
  const mask = new Uint8Array(w * h);
  const light = (i) => rgba[i * 4 + 3] > 200 && (rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3 > BRIGHT;
  const stack = [((h >> 1) * w) + (w >> 1)];
  while (stack.length) {
    const i = stack.pop();
    if (mask[i] || !light(i)) continue;
    mask[i] = 1;
    const x = i % w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (i >= w) stack.push(i - w);
    if (i < w * (h - 1)) stack.push(i + w);
  }
  return mask;
}

// Насколько пиксель внутри формы: 1 — внутри, 0 — снаружи, между — край шириной EDGE.
function coverage(px, py, shapes, w, h) {
  let best = 0;
  for (const s of shapes) {
    const rx = s.rx * w, ry = s.ry * h;
    const dy = (py - s.y * h) / ry;
    const dx = (px - s.x * w) / (rx * (1 + (s.taper ?? 0) * Math.max(-1, Math.min(1, dy))));
    const d = Math.sqrt(dx * dx + dy * dy);
    // расстояние до границы эллипса примерно в пикселях
    const dist = (1 - d) * Math.min(rx, ry);
    best = Math.max(best, Math.min(1, Math.max(0, dist / EDGE + 0.5)));
  }
  return best;
}

for (const spot of SPOTS) {
  const img = decodePNG(readFileSync(join(ASSETS, `${spot.from}.png`)));
  const { w, h, rgba } = img;
  const mask = fillMask(img);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const a = coverage(x + 0.5, y + 0.5, spot.shapes, w, h);
      if (!a) continue;
      out[i * 4] = rgba[i * 4];
      out[i * 4 + 1] = rgba[i * 4 + 1];
      out[i * 4 + 2] = rgba[i * 4 + 2];
      out[i * 4 + 3] = Math.round(a * 255);
    }
  }
  writeFileSync(join(ASSETS, `${spot.to}.png`), encodePNG({ w, h, rgba: out }));
  console.log(`${spot.to}.png ← ${spot.from}.png (${w}×${h})`);
}
