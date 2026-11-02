import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import { CONFIG } from '../src/config.js';
import { STR } from '../src/theme/cats/strings.ru.js';
import { shakeObjects } from '../src/view/shake.js';

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
  return vm.runInNewContext(source + '\n;({RoomScene: typeof RoomScene === "undefined" ? null : RoomScene, adHomeButton: typeof adHomeButton === "undefined" ? null : adHomeButton})',
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
