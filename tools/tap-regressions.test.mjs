import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { onTap } from '../src/view/tap.js';

test('Закрытие окна и отпускание над товаром не открывает магазин повторно (#16)', () => {
  const item = new EventEmitter();
  let opened = 0;
  onTap(item, () => opened++);
  const finger = {};
  // pointerdown получил крестик/«Нет»/затемнение; товар видит только pointerup.
  item.emit('pointerup', finger);
  assert.equal(opened, 0);
  item.emit('pointerdown', finger);
  item.emit('pointerup', finger);
  assert.equal(opened, 1);
  item.emit('pointerup', finger);
  assert.equal(opened, 1);
});

test('Увод пальца и второй палец не активируют товар', () => {
  const item = new EventEmitter();
  let opened = 0;
  onTap(item, () => opened++);
  const first = {}, second = {};
  item.emit('pointerdown', first);
  item.emit('pointerup', second);
  assert.equal(opened, 0);
  item.emit('pointerout', first);
  item.emit('pointerup', first);
  assert.equal(opened, 0);
  item.emit('pointerdown', second);
  item.emit('pointerup', second);
  assert.equal(opened, 1);
});
