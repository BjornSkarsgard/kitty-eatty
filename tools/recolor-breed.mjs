// node tools/recolor-breed.mjs <manifest.json> --out=<папка> [--colors=brown,gray] [--partial] [--overwrite]
// Работает и вне проекта. Генератор изображений и сеть не используются.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { CONFIG } from '../src/config.js';
import { decodePNG, encodePNG } from './png.mjs';
import { PARTS, rgb2hsv, blueFurColor, recolorPart } from './cat-colors.mjs';

const args = process.argv.slice(2);
const arg = name => args.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const manifestPath = args.find(a => !a.startsWith('--'));
if (!manifestPath || !arg('out')) throw new Error('Нужны manifest.json и явный --out=<папка>');
const base = dirname(resolve(manifestPath));
const manifest = JSON.parse(readFileSync(resolve(manifestPath), 'utf8'));
const { breed, parts = {}, shared = {} } = manifest;
if (!/^[a-z][a-z0-9_]*$/.test(breed)) throw new Error('breed должен быть безопасным латинским id');
const partial = args.includes('--partial');
const sharedNames = ['eyes_open', 'eyes_happy', 'mouth_open', 'mouth_closed'];
if (!partial) {
  for (const part of PARTS) if (!parts[part]) throw new Error(`Не хватает части: ${part}`);
  for (const part of sharedNames) if (!shared[part]) throw new Error(`Не хватает общей части: ${part}`);
}
for (const part of Object.keys(parts)) if (!PARTS.includes(part)) throw new Error(`Неизвестная часть: ${part}`);
for (const part of Object.keys(shared)) if (!sharedNames.includes(part)) throw new Error(`Неизвестная общая часть: ${part}`);
const read = file => decodePNG(readFileSync(resolve(base, file)));
const sources = Object.entries(parts).map(([part, entry]) => {
  const spec = typeof entry === 'string' ? { source: entry } : entry;
  const image = read(spec.source);
  const mask = spec.mask ? read(spec.mask) : null;
  if (mask && (mask.w !== image.w || mask.h !== image.h)) throw new Error(`Маска ${part} имеет неверный размер`);
  return { part, image, mask, sourceHSV: spec.normalize ? blueFurColor(image, mask) : null };
});
if (!sources.length) throw new Error('Нет частей для перекраски');
const parseFill = value => {
  const fill = typeof value === 'string' ? Number(`0x${value.replace(/^#|^0x/, '')}`) : value;
  if (!Number.isInteger(fill) || fill < 0 || fill > 0xffffff) throw new Error(`Неверный RGB: ${value}`);
  return fill;
};
const sourceFill = manifest.sourceFill === undefined ? null : parseFill(manifest.sourceFill);
const sourceHSV = sourceFill === null
  ? blueFurColor(manifest.reference ? read(manifest.reference) : sources[0].image)
  : rgb2hsv(sourceFill >> 16 & 255, sourceFill >> 8 & 255, sourceFill & 255);
// Для мастера не голубого цвета явная маска обязательна — иначе могут пострадать нос/уши.
if (sourceFill !== null && sources.some(s => !s.mask)) throw new Error('При sourceFill нужна маска шерсти для каждой части');
const wanted = arg('colors')?.split(',');
const palette = CONFIG.skins.map(skin => ({
  id: skin.id,
  fill: skin.recolor ?? CONFIG.colors.find(c => c.name === skin.file)?.fill,
})).filter(skin => !wanted || wanted.includes(skin.id));
if (wanted?.some(id => !palette.some(skin => skin.id === id))) throw new Error('В --colors есть неизвестный окрас');
if (!palette.length) throw new Error('Пустая палитра');
const out = resolve(arg('out'));
const planned = [];
for (const { id, fill } of palette) for (const { part, image, mask, sourceHSV } of sources) {
  planned.push({ name: `cat_${breed}_${id}_${part}.png`, image, mask, fill, sourceHSV });
}
for (const [part, file] of Object.entries(shared)) planned.push({ name: `cat_${breed}_${part}.png`, image: read(file) });
// Сначала проверяем все входы и коллизии, затем пишем. Мастера никогда не перезаписываем.
const sourcePaths = new Set(Object.values(parts).flatMap(entry => typeof entry === 'string'
  ? [resolve(base, entry)] : [resolve(base, entry.source), ...(entry.mask ? [resolve(base, entry.mask)] : [])]));
for (const file of Object.values(shared)) sourcePaths.add(resolve(base, file));
if (manifest.reference) sourcePaths.add(resolve(base, manifest.reference));
const pathKey = path => process.platform === 'win32' ? path.toLowerCase() : path;
const sourceKeys = new Set([...sourcePaths].map(pathKey));
for (const item of planned) {
  const target = join(out, item.name);
  if (sourceKeys.has(pathKey(target))) throw new Error('Выходной путь совпал с исходником');
  if (existsSync(target) && !args.includes('--overwrite')) throw new Error(`Файл уже существует: ${target}`);
}
mkdirSync(out, { recursive: true });
for (const item of planned) writeFileSync(join(out, item.name), encodePNG(item.fill === undefined
  ? item.image : recolorPart(item.image, item.sourceHSV ?? sourceHSV, item.fill, item.mask)));
console.log(`${breed}: ${sources.length} частей × ${palette.length} окрасов + ${Object.keys(shared).length} общих; ${partial ? 'ЧАСТИЧНЫЙ предпросмотр' : 'полный набор'} → ${out}`);
