// Коты всех цветов из синего: node tools/recolor-cats.mjs [--skins]
// - берёт src/assets/cat_blue_*.png и пишет cat_<цвет>_*.png для остальных цветов из CONFIG.colors;
// - и для рескинов из CONFIG.skins, у которых есть recolor (цвет шерсти); --skins — только их;
// - перекрашивается только голубая шерсть (и веки): оттенок сдвигается к цвету кота, насыщенность и яркость
//   масштабируются, поэтому свет, блики и тени сохраняются; белые пятна, розовые уши и нос не трогаются;
// - на границе шерсти с белым пятном перекраска плавно ослабевает — без каймы.
// Глаза (кроме ворчливых и закрытых, у них веко в цвет шерсти) и рот общие, их не перекрашиваем.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG, encodePNG } from './png.mjs';
import { CONFIG } from '../src/config.js';
import { PARTS, rgb2hsv, blueFurColor, recolorPart } from './cat-colors.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'src', 'assets');
const [h0, s0, v0] = blueFurColor(decodePNG(readFileSync(join(ASSETS, 'cat_blue_body.png'))));

console.log(`шерсть синего кота: оттенок ${h0.toFixed(0)}°, насыщенность ${s0.toFixed(2)}, яркость ${v0.toFixed(2)}`);

const ONLY_SKINS = process.argv.includes('--skins');
const targets = [
  ...(ONLY_SKINS ? [] : CONFIG.colors.filter((c) => c.name !== 'blue')),
  ...CONFIG.skins.filter((k) => k.recolor !== undefined).map((k) => ({ fill: k.recolor, name: k.file })),
];
targets.forEach(({ fill, name }) => {
  for (const part of PARTS) {
    const img = decodePNG(readFileSync(join(ASSETS, `cat_blue_${part}.png`)));
    writeFileSync(join(ASSETS, `cat_${name}_${part}.png`), encodePNG(recolorPart(img, [h0, s0, v0], fill)));
  }
  console.log(`cat_${name}_*: ${PARTS.length} файлов`);
});
