import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import { catArt, catHeadKey } from '../src/theme/cats/art.js';
import { CONFIG } from '../src/config.js';
import { decodePNG } from './png.mjs';

const files = new Set(readdirSync(new URL('../src/assets/', import.meta.url)).map(f => f.replace(/\.png$/, '')));
const textures = { exists: key => files.has(key) };
const parts = ['head', 'body', 'tail', 'leg_l', 'leg_r', 'paw', 'eyes_grumpy', 'eyes_closed'];

test('Мейн-кун и сфинкс имеют совместимые комплекты всех 20 окрасов, остальные коты сохраняют свой вид', () => {
  for (const breed of ['mainecoon', 'sphynx']) for (const skin of CONFIG.skins) {
    const art = catArt(textures, skin.file, breed);
    assert.equal(art.prefix, `cat_${breed}_${skin.file}`);
    assert.equal(catHeadKey(textures, skin.file), `cat_${skin.file}_head`);
    assert.equal(catHeadKey(textures, skin.file, 'abyssinian'), `cat_${skin.file}_head`);
    for (const part of parts) {
      const size = name => { const { w, h } = decodePNG(readFileSync(new URL(`../src/assets/${name}.png`, import.meta.url))); return [w, h]; };
      assert.deepEqual(size(`${art.prefix}_${part}`), size(`cat_blue_${part}`));
    }
  }
  const missing = { exists: key => key !== 'cat_mainecoon_brown_body' && textures.exists(key) };
  assert.equal(catArt(missing, 'brown', 'mainecoon').prefix, 'cat_brown'); // ни одной смешанной части
});

function loadCat() {
  class Container {
    constructor(scene, x, y) { Object.assign(this, { scene, x, y, list: [] }); }
    add(object) { this.list.push(object); return this; }
  }
  const image = (x, y, key) => ({ x, y, key, setOrigin() { return this; }, setScale() { return this; }, setVisible(value) { this.visible = value; return this; } });
  const scene = { textures, add: { existing() {}, container: (x, y) => new Container(scene, x, y), image,
    graphics() { throw new Error('Вместо готовой части использована временная фигура'); } } };
  const source = readFileSync(new URL('../src/theme/cats/CatView.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export class CatView', 'class CatView');
  const CatView = vm.runInNewContext(source + '\n;CatView;', { Phaser: { GameObjects: { Container } }, CONFIG, catArt,
    LAYOUT: JSON.parse(readFileSync(new URL('../src/theme/cats/cat-layout.json', import.meta.url), 'utf8')) });
  return { CatView, scene };
}

test('CatView собирает породные слои, переключает четыре эмоции и оба рта без пересоздания', () => {
  const { CatView, scene } = loadCat();
  const cat = new CatView(scene, 0, 0, 'brown', { breed: 'mainecoon' });
  for (const part of ['head', 'body', 'tail']) assert.equal(cat[part].list[0].key, `cat_mainecoon_brown_${part}`);
  for (const mood of ['open', 'happy', 'grumpy', 'closed']) {
    cat.setMood(mood);
    const prefix = ['open', 'happy'].includes(mood) ? 'cat_mainecoon' : 'cat_mainecoon_brown';
    assert.equal(cat.eyes.variants[mood].key, `${prefix}_eyes_${mood}`);
    assert.equal(cat.eyes.variants[mood].visible, true);
  }
  const openEyes = cat.eyes.variants.open;
  cat.setMood('open');
  assert.equal(cat.eyes.variants.open, openEyes);
  cat.setMouth(true);
  assert.equal(cat.mouth.variants.open.key, 'cat_mainecoon_mouth_open');
  cat.setMouth(false);
  assert.equal(cat.mouth.variants.closed.key, 'cat_mainecoon_mouth_closed');
  const head = new CatView(scene, 0, 0, 'gray', { breed: 'mainecoon', headOnly: true });
  assert.equal(head.body, undefined);
  assert.equal(head.head.list[0].key, 'cat_mainecoon_gray_head');
  const regular = new CatView(scene, 0, 0, 'gray');
  assert.equal(regular.head.list[0].key, 'cat_gray_head');
  assert.equal(regular.eyes.variants.open.key, 'eyes_open');
  const sphynx = new CatView(scene, 0, 0, 'peach', { breed: 'sphynx' });
  assert.equal(sphynx.head.list[0].key, 'cat_sphynx_peach_head');
  assert.equal(sphynx.eyes.variants.open.y, (384 - CONFIG.cat.pivots.eyes[1]) * CONFIG.cat.unit);
  assert.equal(sphynx.mouth.variants.closed.y, (621 - CONFIG.cat.pivots.mouth[1]) * CONFIG.cat.unit);
  const missing = { ...scene, textures: { exists: key => key !== 'cat_sphynx_peach_body' && textures.exists(key) } };
  const fallback = new CatView(missing, 0, 0, 'peach', { breed: 'sphynx' });
  assert.equal(fallback.head.list[0].key, 'cat_peach_head');
  assert.equal(fallback.eyes.variants.open.y, (330 - CONFIG.cat.pivots.eyes[1]) * CONFIG.cat.unit);
});
