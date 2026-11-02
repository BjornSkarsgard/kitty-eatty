// Лист проверки СБОРКИ из настоящих слоёв, без генерации картинки кота целиком.
// node tools/preview-breed.mjs --breed=mainecoon --assets=<папка PNG> --out=<папка>
// Использует действующий cat-layout.json; размеры мастеров должны ему соответствовать.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { CONFIG } from '../src/config.js';
import { ULTRAS } from '../src/theme/cats/ultras.js';
import { PARTS } from './cat-colors.mjs';
import { decodePNG, encodePNG } from './png.mjs';

const args = process.argv.slice(2);
const arg = key => args.find(a => a.startsWith(`--${key}=`))?.slice(key.length + 3);
if (!arg('assets') || !arg('out') || !/^[a-z][a-z0-9_]*$/.test(arg('breed') ?? '')) throw new Error('Нужны --breed, --assets и --out');
const assets = resolve(arg('assets')), out = resolve(arg('out')), breed = arg('breed');
const breedName = ULTRAS.find(u => u.id === breed)?.name ?? breed;
const layout = {
  ...JSON.parse(readFileSync(new URL('../src/theme/cats/cat-layout.json', import.meta.url), 'utf8')),
  ...CONFIG.cat.breedLayouts?.[breed],
  ...(arg('layout') ? JSON.parse(readFileSync(resolve(arg('layout')), 'utf8')) : {}),
};
const emotionSkin = arg('skin') ?? 'brown';
const samples = (arg('samples') ?? 'brown,cream,gray,black').split(',');
if (samples.length !== 4 || [emotionSkin, ...samples].some(id => !CONFIG.skins.some(s => s.id === id))) throw new Error('Нужны известный --skin и четыре окраса --samples');
const cache = new Map();
const get = key => {
  if (!cache.has(key)) cache.set(key, decodePNG(readFileSync(join(assets, `cat_${breed}_${key}.png`))));
  return cache.get(key);
};
const canvas = (w, h, opaque = false) => ({ w, h, rgba: Buffer.alloc(w * h * 4, opaque ? 255 : 0) });

// Наложение с premultiplied alpha при интерполяции — полупрозрачный контур не темнеет.
function draw(dst, src, x0, y0, scale = 1) {
  const width = Math.round(src.w * scale), height = Math.round(src.h * scale);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const tx = Math.round(x0) + x, ty = Math.round(y0) + y;
    if (tx < 0 || ty < 0 || tx >= dst.w || ty >= dst.h) continue;
    const sx = (x + 0.5) / scale - 0.5, sy = (y + 0.5) / scale - 0.5;
    const ix = Math.floor(sx), iy = Math.floor(sy), fx = sx - ix, fy = sy - iy;
    let alpha = 0;
    const rgb = [0, 0, 0];
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const px = Math.max(0, Math.min(src.w - 1, ix + dx)), py = Math.max(0, Math.min(src.h - 1, iy + dy));
      const i = (py * src.w + px) * 4;
      const a = src.rgba[i + 3] / 255 * (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
      alpha += a;
      for (let k = 0; k < 3; k++) rgb[k] += src.rgba[i + k] * a;
    }
    const i = (ty * dst.w + tx) * 4, old = dst.rgba[i + 3] / 255, a = alpha + old * (1 - alpha);
    for (let k = 0; k < 3; k++) dst.rgba[i + k] = a ? (rgb[k] + dst.rgba[i + k] * old * (1 - alpha)) / a : 0;
    dst.rgba[i + 3] = a * 255;
  }
}

function assembled(skin, mood = 'open', headOnly = false) {
  const im = canvas(557, 557);
  const part = (key, image) => draw(im, image, layout[key][0] * layout.scale, layout[key][1] * layout.scale);
  if (!headOnly) for (const p of ['tail', 'body', 'leg_l', 'leg_r']) part(p, get(`${skin}_${p}`));
  part('head', get(`${skin}_head`));
  part('eyes', get(['open', 'happy'].includes(mood) ? `eyes_${mood}` : `${skin}_eyes_${mood}`));
  const open = mood === 'happy';
  part(open ? 'mouth_open' : 'mouth', get(open ? 'mouth_open' : 'mouth_closed'));
  return im;
}

// Подписи через уже используемый проектом ffmpeg, сама сборка — без внешних библиотек.
function save(im, name, labels) {
  const raw = join(out, name.replace('.png', '-plain.png')), target = join(out, name);
  writeFileSync(raw, encodePNG(im));
  const quote = s => s.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "’");
  const font = quote(join(process.env.WINDIR ?? 'C:/Windows', 'Fonts', 'arial.ttf'));
  const filter = labels.map(({ x, y, text, size = 22 }) => `drawtext=fontfile='${font}':text='${quote(text)}':x=${x}:y=${y}:fontsize=${size}:fontcolor=0x26334a`).join(',');
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw, '-vf', filter, '-frames:v', '1', '-update', '1', target], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`Не удалось подписать лист: ${result.error ?? result.stderr}. Сборка сохранена: ${raw}`);
  console.log(target);
}

mkdirSync(out, { recursive: true });
const sheet = canvas(1200, 1040, true);
const labels = [{ x: 28, y: 20, text: `${breedName}: сборка из отдельных частей`, size: 30 }];
samples.forEach((id, i) => {
  draw(sheet, assembled(id), i * 300 + 10, 65, 0.5);
  labels.push({ x: i * 300 + 85, y: 347, text: CONFIG.skins.find(s => s.id === id).name });
});
labels.push({ x: 28, y: 399, text: 'Четыре отдельных состояния глаз; закрытый и открытый рот', size: 25 });
['open', 'happy', 'grumpy', 'closed'].forEach((mood, i) => {
  draw(sheet, assembled(emotionSkin, mood, true), i * 300 - 15, 435, 0.6);
  labels.push({ x: i * 300 + 75, y: 650, text: ['Обычный', 'Довольный', 'Ворчливый', 'Моргание'][i] });
});
labels.push({ x: 28, y: 699, text: 'Слои: синий рабочий мастер + общие глаза и рот', size: 25 });
const pieces = [...PARTS.map(p => ({ key: `blue_${p}`, text: ({ head: 'Голова', body: 'Тело', tail: 'Хвост', leg_l: 'Лапа левая', leg_r: 'Лапа правая', paw: 'Лапка', eyes_grumpy: 'Ворчливые', eyes_closed: 'Закрытые' })[p] })),
  ...['eyes_open', 'eyes_happy', 'mouth_closed', 'mouth_open'].map((p, i) => ({ key: p, text: ['Открытые', 'Довольные', 'Рот закрыт', 'Рот открыт'][i] }))];
pieces.forEach(({ key, text }, i) => {
  const x = i % 6 * 200, y = 745 + Math.floor(i / 6) * 145;
  const im = get(key), scale = Math.min(160 / im.w, 104 / im.h, 1.5);
  draw(sheet, im, x + (200 - im.w * scale) / 2, y + (104 - im.h * scale) / 2, scale);
  labels.push({ x: x + 25, y: y + 110, text, size: 19 });
});
save(sheet, 'kit-preview.png', labels);

const palette = canvas(1000, 900, true);
const names = [{ x: 24, y: 18, text: '20 окрасов — один комплект частей, перекраска скриптом', size: 25 }];
CONFIG.skins.forEach((skin, i) => {
  const x = i % 5 * 200, y = 60 + Math.floor(i / 5) * 205;
  draw(palette, assembled(skin.id, 'open', true), x - 38, y, 0.5);
  names.push({ x: x + 42, y: y + 170, text: skin.name, size: 20 });
});
save(palette, 'palette-preview.png', names);
