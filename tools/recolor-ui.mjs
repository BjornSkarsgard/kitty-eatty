// Цветные варианты кнопок из фиолетовых заготовок: node tools/recolor-ui.mjs
// - берёт src/assets/ui_btn_square.png и ui_btn_round.png, пишет ui_btn_<форма>_<цвет>.png для цветов UI_COLORS;
// - сдвигается оттенок всех насыщенных пикселей (фиолетовое тело и бок), насыщенность и яркость масштабируются
//   к целевому цвету — блики и тени сохраняются; белые блики не трогаются.
// Цвета — те же, что у кнопок кодом (src/config.js, ui): выход, переключатель вкл / выкл.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';
import { CONFIG } from '../src/config.js';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets');
const UI_COLORS = { red: CONFIG.ui.exitColor, green: CONFIG.ui.onColor, gray: CONFIG.ui.offColor };

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const smooth = (e0, e1, x) => Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));

for (const shape of ['square', 'round']) {
  const src = decodePNG(readFileSync(join(ASSETS, `ui_btn_${shape}.png`)));
  // средний цвет тела заготовки — от него считаем сдвиг
  let n = 0;
  const acc = [0, 0, 0];
  for (let i = 0; i < src.rgba.length; i += 4) {
    if (src.rgba[i + 3] < 250) continue;
    const [, s, v] = rgb2hsv(src.rgba[i], src.rgba[i + 1], src.rgba[i + 2]);
    if (s > 0.4 && v > 0.5) { acc[0] += src.rgba[i]; acc[1] += src.rgba[i + 1]; acc[2] += src.rgba[i + 2]; n++; }
  }
  const [h0, s0, v0] = rgb2hsv(acc[0] / n, acc[1] / n, acc[2] / n);
  for (const [name, fill] of Object.entries(UI_COLORS)) {
    const [h1, s1, v1] = rgb2hsv((fill >> 16) & 255, (fill >> 8) & 255, fill & 255);
    const img = { w: src.w, h: src.h, rgba: Buffer.from(src.rgba) };
    const d = img.rgba;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
      const w = smooth(0.08, 0.25, s); // белые блики не трогаем
      if (!w) continue;
      const rgb = hsv2rgb(h1 + (h - h0), Math.min(1, (s * s1) / s0), Math.min(1, (v * v1) / v0));
      for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] * (1 - w) + rgb[k] * w);
    }
    writeFileSync(join(ASSETS, `ui_btn_${shape}_${name}.png`), encodePNG(img));
    console.log(`ui_btn_${shape}_${name}.png`);
  }
}
