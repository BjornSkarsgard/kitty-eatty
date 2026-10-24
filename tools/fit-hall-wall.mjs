// Кусок стены между арками холла: node tools/fit-hall-wall.mjs art-src/hall_wall_raw.png [--from=300 --to=720]
// - из исходника (2:3, как hall_arch) вырезается полоса x from..to (там картина и цветок, края — пустая стена);
// - масштаб и сдвиг подбираются так, чтобы плинтус и пол совпали с hall_arch (высоты — константы ниже);
// - цвет по краям полосы подгоняется под края hall_arch построчно (блик и светлая стена исходника не дают шва),
//   к середине поправка плавно сходит на нет;
// - результат: art-src/hall_wall.png высотой с экран; в игру — JPG src/assets/hall_wall.jpg (System.Drawing, качество 85),
//   ширину вписать в config room.wallGap.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => Number((args.find((a) => a.startsWith(`--${k}=`)) || `=${d}`).split('=')[1]);
const FROM = opt('from', 300);
const TO = opt('to', 720);
const H = 1280; // высота экрана
// верх плинтуса и начало пола в исходниках (px по высоте 1536): у арки и у стены
const ARCH = { base: 1270, floor: 1365, h: 1536 };
const WALL = { base: 1195, floor: 1270 };

const src = decodePNG(readFileSync(args.find((a) => !a.startsWith('--'))));
const arch = decodePNG(readFileSync(join(ROOT, 'src/assets/hall_arch.png'))); // уже по высоте экрана

// стена → координаты арки: плинтус и пол на тех же высотах
const s = (ARCH.floor - ARCH.base) / (WALL.floor - WALL.base);
const off = ARCH.base - WALL.base * s;
const k = (H / ARCH.h) * s; // исходник стены → экран
const top = off * (H / ARCH.h);
const w = Math.round((TO - FROM) * k);
const out = Buffer.alloc(w * H * 4);
const px = (img, x, y, c) => img.rgba[(Math.min(img.h - 1, Math.max(0, y)) * img.w + Math.min(img.w - 1, Math.max(0, x))) * 4 + c];
for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) {
  const sx = FROM + x / k;
  const sy = (y - top) / k;
  const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0;
  for (let c = 0; c < 3; c++) {
    const v = px(src, x0, y0, c) * (1 - fx) * (1 - fy) + px(src, x0 + 1, y0, c) * fx * (1 - fy)
      + px(src, x0, y0 + 1, c) * (1 - fx) * fy + px(src, x0 + 1, y0 + 1, c) * fx * fy;
    out[(y * w + x) * 4 + c] = v;
  }
  out[(y * w + x) * 4 + 3] = 255;
}

// средний цвет полоски столбцов [x0, x1) в строках y±R
const R = 24;
function mean(img, x0, x1, y) {
  const m = [0, 0, 0];
  let n = 0;
  for (let yy = Math.max(0, y - R); yy <= Math.min(H - 1, y + R); yy++) for (let x = x0; x < x1; x++) {
    for (let c = 0; c < 3; c++) m[c] += img.rgba[(yy * img.w + x) * 4 + c];
    n++;
  }
  return m.map((v) => v / n);
}
// край арки (side 0 — левый, 1 — правый): на высоте ламп край — это лампа, там берём цвет стены чуть выше и ниже
const LAMP = [170, 470];
function archEdge(y, side) {
  if (y > LAMP[0] && y < LAMP[1]) {
    const t = (y - LAMP[0]) / (LAMP[1] - LAMP[0]);
    const a = archEdge(LAMP[0], side), b = archEdge(LAMP[1], side);
    return a.map((v, c) => v + (b[c] - v) * t);
  }
  return side ? mean(arch, arch.w - 8, arch.w, y) : mean(arch, 0, 8, y);
}
const img = { w, h: H, rgba: out };
const fixes = [];
for (let y = 0; y < H; y++) {
  // слева от стены — правый край арки, справа — левый край следующей
  const tl = archEdge(y, 1), tr = archEdge(y, 0);
  const l = mean(img, 0, 8, y), r = mean(img, w - 8, w, y);
  fixes.push({ l: tl.map((v, c) => v / Math.max(1, l[c])), r: tr.map((v, c) => v / Math.max(1, r[c])) });
}
const fixed = Buffer.from(out);
for (let y = 0; y < H; y++) for (let x = 0; x < w; x++) {
  const u = x / (w - 1);
  // поправка полная у краёв, к середине (трети ширины) сходит на нет
  const wl = Math.max(0, 1 - u * 3), wr = Math.max(0, 1 - (1 - u) * 3);
  for (let c = 0; c < 3; c++) {
    const f = 1 + (fixes[y].l[c] - 1) * wl + (fixes[y].r[c] - 1) * wr;
    const i = (y * w + x) * 4 + c;
    fixed[i] = Math.max(0, Math.min(255, Math.round(out[i] * f)));
  }
}
const outPath = join(ROOT, 'art-src', 'hall_wall.png');
writeFileSync(outPath, encodePNG({ w, h: H, rgba: fixed }));
console.log(`hall_wall: ${w}×${H} (масштаб ${k.toFixed(3)}) → art-src/hall_wall.png; room.wallGap = ${w}`);
