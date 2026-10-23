// Ореол для свечения порции: node tools/portion-glow.mjs
// Берёт силуэт src/assets/portion_layer.png, добавляет поля и размывает — получается мягкий белый ореол
// той же формы (src/assets/portion_glow.png). Игра кладёт его под плитку, красит tint'ом и пульсирует в такт.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';
import { CONFIG } from '../src/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'src', 'assets');
const PAD = CONFIG.portion.glowPad; // поля вокруг плитки, px картинки
const BLUR = 11;                     // радиус размытия (три прохода box blur ≈ гаусс)

const src = decodePNG(readFileSync(join(ASSETS, 'portion_layer.png')));
const w = src.w + PAD * 2;
const h = src.h + PAD * 2;
let a = new Float32Array(w * h);
for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) a[(y + PAD) * w + x + PAD] = src.rgba[(y * src.w + x) * 4 + 3] / 255;

function boxBlur(inp, r, horizontal) {
  const out = new Float32Array(w * h);
  const [n, m] = horizontal ? [h, w] : [w, h];
  for (let i = 0; i < n; i++) {
    const at = (j) => (horizontal ? inp[i * w + j] : inp[j * w + i]);
    let sum = 0;
    for (let j = -r; j <= r; j++) sum += at(Math.min(m - 1, Math.max(0, j)));
    for (let j = 0; j < m; j++) {
      const k = horizontal ? i * w + j : j * w + i;
      out[k] = sum / (2 * r + 1);
      sum += at(Math.min(m - 1, j + r + 1)) - at(Math.max(0, j - r));
    }
  }
  return out;
}
for (let pass = 0; pass < 3; pass++) a = boxBlur(boxBlur(a, BLUR, true), BLUR, false);

const out = Buffer.alloc(w * h * 4);
for (let i = 0; i < w * h; i++) {
  out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = 255;
  out[i * 4 + 3] = Math.round(Math.min(1, a[i] * 2.2) * 255);
}
writeFileSync(join(ASSETS, 'portion_glow.png'), encodePNG({ w, h, rgba: out }));
console.log(`portion_glow.png ${w}×${h} (поля ${PAD} px, размытие ${BLUR})`);
