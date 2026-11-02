import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { CONFIG } from '../src/config.js';
import { STR } from '../src/theme/cats/strings.ru.js';
import { shakeObjects } from '../src/view/shake.js';
import { onTap } from '../src/view/tap.js';

test('Тряска сдвигает все части одинаково, сохраняет положение порций и не отменяет наматывание (#5/#6/#8)', () => {
  const objects = [{ x: 50, t: 0.3 }, { x: 50 }, { x: 43 }, { x: 57 }];
  let animation;
  const stop = shakeObjects({ add: spec => { animation = spec; return { stop() {} }; } }, objects, 10, 50);
  animation.targets.x = 10;
  animation.onUpdate();
  assert.deepEqual(objects.map(o => o.x), [60, 60, 53, 67]);
  assert.equal(objects[0].t, 0.3);
  objects[0].t = 0.6; // существующий твин обмотки продолжает работать
  stop();
  assert.deepEqual(objects.map(o => o.x), [50, 50, 43, 57]);
  assert.equal(objects[0].t, 0.6);
});

function load(relative, extras) {
  const source = readFileSync(new URL(relative, import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(source + '\n;({RoomScene: typeof RoomScene === "undefined" ? null : RoomScene, adHomeButton: typeof adHomeButton === "undefined" ? null : adHomeButton, stockShelves: typeof stockShelves === "undefined" ? null : stockShelves})',
    { CONFIG, STR, ...extras });
}

test('Зум магазина получает актуальную раскладку после последнего кадра поворота (#14)', () => {
  const { RoomScene } = load('../src/scenes/RoomScene.js', { Phaser: { Scene: class {} } });
  let tween;
  const order = [];
  RoomScene.prototype.goTo.call({ mapOpen: false, shopOpen: false, pan: { p: 0 },
    layout: () => order.push('layout'), tweens: { killTweensOf() {}, add: t => { tween = t; } } },
    1, { onDone: () => order.push('zoom') });
  tween.onComplete();
  assert.deepEqual(order, ['layout', 'zoom']);
});

test('Создание и обновление полок не открывает магазин; товар активируется только полным тапом', () => {
  const made = [];
  const node = () => {
    const o = Object.assign(new EventEmitter(), { list: [], width: 100, height: 100, scaleX: 1,
      add(items) { this.list.push(...(Array.isArray(items) ? items : [items])); return this; },
      getBounds() { return { x: 0, y: 0, width: 100, height: 100 }; },
      setPosition(x, y) { this.x = x; this.y = y; return this; },
      setScale(k) { this.scaleX = k; return this; },
      destroy() { this.emit('destroy'); },
    });
    for (const method of ['setSize', 'setInteractive', 'setOrigin', 'setResolution', 'setY', 'setBaseScale', 'startIdle',
      'fillStyle', 'fillEllipse', 'fillCircle', 'fillRoundedRect', 'lineStyle', 'strokeRoundedRect']) o[method] = () => o;
    made.push(o);
    return o;
  };
  const { stockShelves } = load('../src/view/ShopView.js', { PAL: {}, sfx() {}, onTap,
    ultrasOwned: () => [], ultraPrice: () => 100, breedSkin: () => 'blue', ULTRAS: CONFIG.ultras,
    CatView: class { constructor() { return node(); } }, makeIcon: node, plate: node });
  const scene = { textures: { exists: () => true }, add: { container: node, text: node, image: node, graphics: node, zone: node } };
  const chosen = [];
  const room = node();
  const shelves = stockShelves(scene, room, (x, y) => ({ x, y }), 1, (...args) => chosen.push(args));
  assert.equal(chosen.length, 0);
  const starter = made.find(o => o.listenerCount('pointerdown') > 0);
  const finger = {};
  starter.emit('pointerup', finger); // отпускание над товаром после другого окна
  assert.equal(chosen.length, 0);
  starter.emit('pointerdown', finger);
  starter.emit('pointerup', finger);
  assert.equal(chosen.length, 1);
  assert.equal(chosen[0][0], 'starter');
  shelves.refresh();
  assert.equal(chosen.length, 1);
});

test('Подарочный кот создаётся в комнате даже поверх окна; вложенные обновления сохраняют камеру', () => {
  let room;
  const visible = [];
  class Cat {
    constructor() { visible.push(room.toMain); }
    setBaseScale() { return this; } startIdle() { return this; } setInteractive() { return this; } on() { return this; }
  }
  const { RoomScene } = load('../src/scenes/RoomScene.js', { Phaser: { Scene: class {}, Geom: { Rectangle: class {} } },
    CatView: Cat, catLook: () => 'brown', selectedUltra: () => ({ id: 'mainecoon' }) });
  let destroyed = false, inserted = null;
  const old = { destroy() { destroyed = true; } };
  room = { cat: old, windows: new Set([{}]), shopOpen: true, toMain: false,
    homeRoom: { getIndex: () => 2, addAt(cat, index) { inserted = [cat, index]; } },
    onMain: RoomScene.prototype.onMain };
  RoomScene.prototype.makeHomeCat.call(room);
  assert.deepEqual(visible, [true]);
  assert.equal(destroyed, true);
  assert.equal(inserted[0], room.cat);
  assert.equal(inserted[1], 2);
  assert.equal(room.toMain, false);
  room.onMain(() => {
    room.onMain(() => assert.equal(room.toMain, true));
    assert.equal(room.toMain, true);
  });
  assert.equal(room.toMain, false);
  assert.throws(() => room.onMain(() => { throw Error('прерывание обновления'); }));
  assert.equal(room.toMain, false);
});

test('Кнопка рекламы перестаёт пульсировать при исчерпании/неготовности ролика (#9)', () => {
  let ready = true, watched = 0, stops = 0, starts = 0;
  const node = () => Object.assign(new EventEmitter(), { scale: 1, add() {}, setSize() { return this; },
    setInteractive() { return this; }, setPosition() { return this; }, setOrigin() { return this; },
    setScale(n) { this.scale = n; return this; }, setAlpha(n) { this.alpha = n; return this; } });
  const { adHomeButton } = load('../src/view/RewardView.js', { PAL: {}, sfx() {}, rewardedReady: () => ready,
    adsState: () => ({ watched }), makeIcon: node });
  const events = new EventEmitter();
  const scene = { events, add: { container: node, text: node }, tweens: { add() { starts++; return { stop() { stops++; } }; } } };
  const button = adHomeButton(scene, 0, 0, () => {});
  assert.equal(starts, 1);
  watched = CONFIG.ads.ladder.at(-1).at;
  events.emit('update');
  assert.equal(stops, 1);
  assert.equal(button.alpha, 0.5);
  watched = 0; ready = false;
  events.emit('update');
  assert.equal(starts, 1);
  ready = true; events.emit('update');
  assert.equal(starts, 2);
  button.emit('destroy');
  assert.equal(events.listenerCount('update'), 0);
});
