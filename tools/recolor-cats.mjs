// Коты всех цветов из синего: node tools/recolor-cats.mjs
// - берёт src/assets/cat_blue_*.png и пишет cat_<цвет>_*.png для остальных цветов из CONFIG.colors;
// - перекрашивается только голубая шерсть (и веки): оттенок сдвигается к цвету кота, насыщенность и яркость
//   масштабируются, поэтому свет, блики и тени сохраняются; белые пятна, розовые уши и нос не трогаются;
// - на границе шерсти с белым пятном перекраска плавно ослабевает — без каймы.
// Глаза (кроме ворчливых и закрытых, у них веко в цвет шерсти) и рот общие, их не перекрашиваем.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';
import { CONFIG } from '../src/config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'src', 'assets');
export const CAT_NAMES = ['red', 'blue', 'yellow', 'green', 'purple', 'orange', 'teal', 'white', 'brown', 'pink'];
const PARTS = ['head', 'body', 'tail', 'leg_l', 'leg_r', 'eyes_grumpy', 'eyes_closed'];
const HUE_RANGE = 32;   // градусы: насколько далеко от оттенка шерсти ещё перекрашиваем в полную силу
const HUE_FADE = 18;    // и за сколько градусов после этого сходит на нет
const SAT_MIN = 0.12;   // ниже — белое/серое, не трогаем
const SAT_FULL = 0.3;

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

const hueDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const smooth = (e0, e1, x) => Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));

// Цвет шерсти синего кота — средний по туловищу (по насыщенным голубым пикселям).
function furColor() {
  const { rgba } = decodePNG(readFileSync(join(ASSETS, 'cat_blue_body.png')));
  let n = 0;
  const acc = [0, 0, 0];
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 250) continue;
    const [h, s, v] = rgb2hsv(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (h > 190 && h < 235 && s > 0.35 && v > 0.5) {
      acc[0] += rgba[i]; acc[1] += rgba[i + 1]; acc[2] += rgba[i + 2]; n++;
    }
  }
  return rgb2hsv(acc[0] / n, acc[1] / n, acc[2] / n);
}

const [h0, s0, v0] = furColor();
console.log(`шерсть синего кота: оттенок ${h0.toFixed(0)}°, насыщенность ${s0.toFixed(2)}, яркость ${v0.toFixed(2)}`);

CONFIG.colors.forEach(({ fill }, c) => {
  const name = CAT_NAMES[c];
  if (name === 'blue') return;
  const [h1, s1, v1] = rgb2hsv((fill >> 16) & 255, (fill >> 8) & 255, fill & 255);
  for (const part of PARTS) {
    const img = decodePNG(readFileSync(join(ASSETS, `cat_blue_${part}.png`)));
    const d = img.rgba;
    for (let i = 0; i < d.length; i += 4) {
      if (!d[i + 3]) continue;
      const [h, s, v] = rgb2hsv(d[i], d[i + 1], d[i + 2]);
      const w = (1 - smooth(HUE_RANGE, HUE_RANGE + HUE_FADE, hueDist(h, h0))) * smooth(SAT_MIN, SAT_FULL, s);
      if (!w) continue;
      const rgb = hsv2rgb(h1 + (h - h0), Math.min(1, (s * s1) / s0), Math.min(1, (v * v1) / v0));
      for (let k = 0; k < 3; k++) d[i + k] = Math.round(d[i + k] * (1 - w) + rgb[k] * w);
    }
    writeFileSync(join(ASSETS, `cat_${name}_${part}.png`), encodePNG(img));
  }
  console.log(`cat_${name}_*: ${PARTS.length} файлов`);
});
