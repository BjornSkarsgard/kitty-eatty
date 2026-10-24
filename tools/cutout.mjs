// Вырезает картинку с зелёного фона (chroma key): node tools/cutout.mjs файл.png [ещё.png ...] [--max=512] [--notrim] [--align=образец.png]
// [--holes] [--key=magenta]
// - фон убирается заливкой от краёв картинки, поэтому белое внутри контура (морда) не трогается;
// - на сглаженном контуре убирается зелёная кайма (полупрозрачность восстанавливается);
// - пустые поля обрезаются, картинка уменьшается до --max по большей стороне;
// - результат: src/assets/<имя>.png, исходник переезжает в art-src/ (не в git).
// Без зависимостей: PNG читается и пишется через tools/png.mjs.
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { basename, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const MAX = Number((args.find((a) => a.startsWith('--max=')) || '--max=512').slice(6));
// --notrim: не обрезать поля — для наборов вариантов (глаза, рты), чтобы у всех был один кадр и центр
const NOTRIM = args.includes('--notrim');
// --align=art-src/cat_mouth_closed.png: сдвинуть картинку так, чтобы розовый нос совпал с носом на образце
const ALIGN = (args.find((a) => a.startsWith('--align=')) || '').slice(8);
// --split-pink: розовое (подушечки лап) — отдельным файлом <имя>_pink.png, чтобы перекраска кота его не трогала
const SPLIT_PINK = args.includes('--split-pink');
// --holes: фон и в замкнутых дырках (пончик) — убирается весь цвет фона, а не только связанный с краями
const HOLES = args.includes('--holes');
// --key=magenta: фон пурпурный #FF00FF — для зелёных предметов (кошачья мята), которые зелёный фон съел бы
const MAGENTA = (args.find((a) => a.startsWith('--key=')) || '').slice(6) === 'magenta';
// --thresh=N: насколько цвет фона должен выделяться, чтобы считаться фоном (0..255, по умолчанию 90). Больше — строже:
// для предметов близкого к фону цвета (фиолетовый подарок на пурпурном)
const THRESH = Number((args.find((a) => a.startsWith('--thresh=')) || '--thresh=90').slice(9));
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.log('Использование: node tools/cutout.mjs src/assets/cat_head.png [--max=512]');
  process.exit(1);
}

// ---------- обработка ----------

// «Зелёность» (или «пурпурность» при --key=magenta): насколько цвет фона выделяется в пикселе (0..255).
const greenness = MAGENTA
  ? (d, i) => Math.min(d[i], d[i + 2]) - d[i + 1]
  : (d, i) => d[i + 1] - Math.max(d[i], d[i + 2]);
let alphaOnly = false; // фон уже прозрачный — зелёное не трогаем (корм может быть зелёным)
const isKey = (d, i) => d[i + 3] < 16 || (!alphaOnly && greenness(d, i) > THRESH);

function cutout({ w, h, rgba }) {
  const d = rgba;
  alphaOnly = [0, w - 1, (h - 1) * w, h * w - 1].every((p) => d[p * 4 + 3] < 16);
  const bg = new Uint8Array(w * h);
  // заливка фона от краёв
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (!bg[p] && isKey(d, p * 4)) { bg[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  if (HOLES) for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) push(x, y);
  while (stack.length) {
    const p = stack.pop();
    const x = p % w, y = (p - x) / w;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let p = 0; p < w * h; p++) if (bg[p]) d[p * 4 + 3] = 0;

  // кайма: пиксели рядом с фоном, в которые подмешан зелёный — восстанавливаем прозрачность и цвет
  const near = (x, y) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h && bg[ny * w + nx]) return true;
    }
    return false;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = y * w + x, i = p * 4;
    if (bg[p]) continue;
    const gr = greenness(d, i);
    if (alphaOnly || gr <= 10 || !near(x, y)) continue;
    const a = Math.max(0, Math.min(1, 1 - gr / 255));
    const unmix = (c) => Math.max(0, Math.min(255, Math.round((d[i + c] - (1 - a) * 255) / Math.max(a, 0.05))));
    if (MAGENTA) {
      d[i] = unmix(0);
      d[i + 2] = unmix(2);
      const m = Math.max(d[i + 1], Math.min(d[i], d[i + 2])); // убрать остаток пурпурного
      d[i] = Math.min(d[i], m + 40);
      d[i + 2] = Math.min(d[i + 2], m + 40);
    } else {
      d[i + 1] = unmix(1);
      d[i + 1] = Math.min(d[i + 1], Math.max(d[i], d[i + 2])); // убрать остаток зелёного
    }
    d[i + 3] = Math.round(a * 255);
  }
  return { w, h, rgba: d };
}

function trim(img, pad = 6) {
  const { w, h, rgba } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (rgba[(y * w + x) * 4 + 3] > 8) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  }
  if (x1 < 0) throw new Error('после вырезания ничего не осталось — фон не зелёный?');
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  const nw = x1 - x0 + 1, nh = y1 - y0 + 1;
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) rgba.copy(out, y * nw * 4, ((y + y0) * w + x0) * 4, ((y + y0) * w + x1 + 1) * 4);
  return { w: nw, h: nh, rgba: out };
}

// Уменьшение усреднением по площади (с учётом прозрачности — без тёмных/светлых ореолов).
function downscale(img, max) {
  const { w, h, rgba } = img;
  const k = Math.max(w, h) / max;
  if (k <= 1) return img;
  const nw = Math.round(w / k), nh = Math.round(h / k);
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const sx0 = Math.floor(x * k), sx1 = Math.min(w, Math.ceil((x + 1) * k));
    const sy0 = Math.floor(y * k), sy1 = Math.min(h, Math.ceil((y + 1) * k));
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
      const i = (sy * w + sx) * 4, al = rgba[i + 3];
      r += rgba[i] * al; g += rgba[i + 1] * al; b += rgba[i + 2] * al; a += al; n++;
    }
    const o = (y * nw + x) * 4;
    if (a > 0) { out[o] = r / a; out[o + 1] = g / a; out[o + 2] = b / a; }
    out[o + 3] = a / n;
  }
  return { w: nw, h: nh, rgba: out };
}

// Центр розового носа: розовые пиксели в верхней части розового (ниже может быть язык).
function noseCenter({ w, h, rgba }) {
  const pink = (i) => rgba[i + 3] > 200 && rgba[i] > 200 && rgba[i + 1] > 90 && rgba[i + 1] < 180 && rgba[i + 2] > 110 && rgba[i + 2] < 200;
  let top = h;
  for (let y = 0; y < h && top === h; y++) for (let x = 0; x < w; x++) if (pink((y * w + x) * 4)) { top = y; break; }
  if (top === h) throw new Error('--align: не нашёл розовый нос');
  let sx = 0, sy = 0, n = 0;
  for (let y = top; y < Math.min(h, top + h * 0.1); y++) for (let x = 0; x < w; x++) {
    if (pink((y * w + x) * 4)) { sx += x; sy += y; n++; }
  }
  return { x: sx / n, y: sy / n };
}

function alignTo(img, ref) {
  const a = noseCenter(img);
  const b = noseCenter(ref);
  const dx = Math.round((b.x / ref.w) * img.w - a.x);
  const dy = Math.round((b.y / ref.h) * img.h - a.y);
  console.log(`  выравнивание по носу: сдвиг ${dx}, ${dy} px`);
  const out = Buffer.alloc(img.rgba.length);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const sx = x - dx, sy = y - dy;
    if (sx >= 0 && sy >= 0 && sx < img.w && sy < img.h) img.rgba.copy(out, (y * img.w + x) * 4, (sy * img.w + sx) * 4, (sy * img.w + sx) * 4 + 4);
  }
  return { w: img.w, h: img.h, rgba: out };
}

// Только розовые пиксели (подушечки), остальное прозрачное.
function pinkOnly({ w, h, rgba }) {
  const out = Buffer.alloc(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    // насколько пиксель «розовый»: красный заметно выше зелёного, синий посередине
    const pink = Math.max(0, Math.min(1, (r - g - 40) / 60)) * (r > 150 ? 1 : 0);
    if (pink > 0) {
      out[i] = r; out[i + 1] = g; out[i + 2] = b;
      out[i + 3] = Math.round(rgba[i + 3] * pink);
    }
  }
  return { w, h, rgba: out };
}

for (const file of files) {
  const name = basename(file).replace(/\.+png$/i, '').replace(/\.+$/, '');
  const src = readFileSync(file);
  let cut = cutout(decodePNG(src));
  if (ALIGN) cut = alignTo(cut, decodePNG(readFileSync(ALIGN)));
  const img = downscale(NOTRIM ? cut : trim(cut), MAX);
  // сначала сохраняем исходник в art-src (не в git) — чтобы при желании перегнать с другими настройками
  mkdirSync(join(ROOT, 'art-src'), { recursive: true });
  writeFileSync(join(ROOT, 'art-src', `${name}.png`), src);
  const outPath = join(ROOT, 'src', 'assets', `${name}.png`);
  writeFileSync(outPath, encodePNG(img));
  if (SPLIT_PINK) {
    writeFileSync(join(ROOT, 'src', 'assets', `${name}_pink.png`), encodePNG(pinkOnly(img)));
    console.log(`  розовое → src/assets/${name}_pink.png`);
  }
  if (resolve(file) !== resolve(outPath)) unlinkSync(file); // файл с другим именем (cat_head..png) больше не нужен
  console.log(`${name}: ${img.w}×${img.h} → src/assets/${name}.png (исходник в art-src/)`);
}
