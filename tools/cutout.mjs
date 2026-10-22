// Вырезает картинку с зелёного фона (chroma key): node tools/cutout.mjs файл.png [ещё.png ...] [--max=512] [--notrim]
// - фон убирается заливкой от краёв картинки, поэтому белое внутри контура (морда) не трогается;
// - на сглаженном контуре убирается зелёная кайма (полупрозрачность восстанавливается);
// - пустые поля обрезаются, картинка уменьшается до --max по большей стороне;
// - результат: src/assets/<имя>.png, исходник переезжает в art-src/ (не в git).
// Без зависимостей: PNG читается и пишется вручную через zlib.
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { basename, join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const MAX = Number((args.find((a) => a.startsWith('--max=')) || '--max=512').slice(6));
// --notrim: не обрезать поля — для наборов вариантов (глаза, рты), чтобы у всех был один кадр и центр
const NOTRIM = args.includes('--notrim');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.log('Использование: node tools/cutout.mjs src/assets/cat_head.png [--max=512]');
  process.exit(1);
}

// ---------- PNG ----------

function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('не PNG');
  let pos = 8;
  let w, h, depth, type, interlace;
  const idat = [];
  let palette = null;
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const name = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (name === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; type = data[9]; interlace = data[12];
    } else if (name === 'PLTE') palette = data;
    else if (name === 'IDAT') idat.push(data);
    else if (name === 'IEND') break;
    pos += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`поддерживается только 8 бит без интерлейса (depth=${depth}, interlace=${interlace})`);
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    const prev = y ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[i - ch] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= ch ? prev[i - ch] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[i] = v & 255;
    }
  }
  // → RGBA
  const rgba = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, al = 255;
    if (type === 2) { r = px[i * 3]; g = px[i * 3 + 1]; b = px[i * 3 + 2]; }
    else if (type === 6) { r = px[i * 4]; g = px[i * 4 + 1]; b = px[i * 4 + 2]; al = px[i * 4 + 3]; }
    else if (type === 0) { r = g = b = px[i]; }
    else if (type === 4) { r = g = b = px[i * 2]; al = px[i * 2 + 1]; }
    else { const k = px[i] * 3; r = palette[k]; g = palette[k + 1]; b = palette[k + 2]; }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = al;
  }
  return { w, h, rgba };
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(name, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(name, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])));
  return Buffer.concat([head, data, crc]);
}
function encodePNG({ w, h, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- обработка ----------

// «Зелёность»: насколько зелёный канал выше остальных (0..255).
const greenness = (d, i) => d[i + 1] - Math.max(d[i], d[i + 2]);
const isKey = (d, i) => d[i + 3] < 16 || greenness(d, i) > 90;

function cutout({ w, h, rgba }) {
  const d = rgba;
  const bg = new Uint8Array(w * h);
  // заливка фона от краёв
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (!bg[p] && isKey(d, p * 4)) { bg[p] = 1; stack.push(p); }
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
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
    if (gr <= 10 || !near(x, y)) continue;
    const a = Math.max(0, Math.min(1, 1 - gr / 255));
    d[i + 1] = Math.max(0, Math.min(255, Math.round((d[i + 1] - (1 - a) * 255) / Math.max(a, 0.05))));
    d[i + 1] = Math.min(d[i + 1], Math.max(d[i], d[i + 2])); // убрать остаток зелёного
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

for (const file of files) {
  const name = basename(file).replace(/\.+png$/i, '').replace(/\.+$/, '');
  const src = readFileSync(file);
  const cut = cutout(decodePNG(src));
  const img = downscale(NOTRIM ? cut : trim(cut), MAX);
  // сначала сохраняем исходник в art-src (не в git) — чтобы при желании перегнать с другими настройками
  mkdirSync(join(ROOT, 'art-src'), { recursive: true });
  writeFileSync(join(ROOT, 'art-src', `${name}.png`), src);
  const outPath = join(ROOT, 'src', 'assets', `${name}.png`);
  writeFileSync(outPath, encodePNG(img));
  if (resolve(file) !== resolve(outPath)) unlinkSync(file); // файл с другим именем (cat_head..png) больше не нужен
  console.log(`${name}: ${img.w}×${img.h} → src/assets/${name}.png (исходник в art-src/)`);
}
