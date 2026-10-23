// Передний слой банки из целой банки: node tools/jar-layers.mjs
// Берёт src/assets/jar_back.png (вся банка: стенки, тёмное нутро, горлышко, донышко) и пишет jar_front.png:
// - горлышко сверху и кольцо донышка снизу (от CONFIG.jar.art.floor) — как есть, непрозрачные (корм уходит под них);
//   пол банки над кольцом — как стенки: корм лежит на нём;
// - тонкий внешний край стекла — как есть;
// - всё между стенками — только блики: насколько пиксель светлее тёмного нутра в этой строке, настолько
//   он непрозрачен и бел. Поверх корма они лягут как отражение на стекле.
// Границы (в пикселях файла) — CONFIG.jar.art, их же игра использует для растяжки банки по высоте.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';
import { CONFIG } from '../src/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'src', 'assets');
const A = CONFIG.jar.art;
const GAIN = 1.3; // усиление бликов

const img = decodePNG(readFileSync(join(ASSETS, 'jar_back.png')));
const { w, h, rgba } = img;
const out = Buffer.alloc(rgba.length);
const lum = (i) => (rgba[i] + rgba[i + 1] + rgba[i + 2]) / 3;

for (let y = 0; y < h; y++) {
  // яркость нутра в этой строке — медиана середины банки
  const mid = [];
  for (let x = Math.round(w * 0.3); x < Math.round(w * 0.8); x++) mid.push(lum((y * w + x) * 4));
  mid.sort((a, b) => a - b);
  const base = mid[mid.length >> 1] ?? 0;
  for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    const solid = y < A.top || y >= A.floor || x < A.edge || x >= w - A.edge;
    if (solid) {
      for (let k = 0; k < 4; k++) out[i + k] = rgba[i + k];
      continue;
    }
    const a = Math.min(1, Math.max(0, ((lum(i) - base) / (255 - base)) * GAIN));
    out[i] = out[i + 1] = out[i + 2] = 255;
    out[i + 3] = Math.round(a * rgba[i + 3]);
  }
}
writeFileSync(join(ASSETS, 'jar_front.png'), encodePNG({ w, h, rgba: out }));
console.log(`jar_front.png ${w}×${h}: горлышко до y=${A.top}, кольцо донышка от y=${A.floor}, край ${A.edge} px`);
