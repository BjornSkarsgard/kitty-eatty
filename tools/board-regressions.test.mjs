import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Board } from '../src/core/Board.js';

test('Перекус убирает весь выбранный цвет, включая лёд, и уровень остаётся проходимым (#7)', () => {
  const b = new Board({ capacity: 2, bowls: [[0, 1], [1, 2], [2, 0], []], ice: [[0, 1]] });
  assert.equal(b.isFrozen(0), true);
  assert.equal(b.snack(0), true);
  assert.equal(b.bowls.flat().includes(0), false);
  assert.deepEqual(b.bowls, [[1], [1, 2], [2], []]);
  assert.equal(b.isFrozen(0), true); // Перекус сам по себе не размораживает лёд.
  assert.equal(b.move(1, 2), 1);
  assert.equal(b.isFrozen(0), false);
  assert.equal(b.move(1, 0), 1);
  assert.equal(b.isSolved(), true);
});

test('Отмена Перекуса возвращает корм и флаги скрытых порций, лёд остаётся (#7)', () => {
  const b = new Board({ capacity: 3, bowls: [[0, 1, 2], [1, 0, 2], [2, 0, 1], []],
    hidden: [[true, true, false], [true, true, false], [true, true, false]], ice: [[0, 2]] });
  const before = b.snapshot();
  assert.equal(b.snack(0), true);
  b.bowls.forEach((s, i) => assert.equal(s.length, b.hid[i].length));
  b.undo();
  assert.deepEqual(b.snapshot(), before);
  assert.equal(b.isFrozen(0), true);
});

test('Перекус не трогает собранные банки и не записывает пустое действие', () => {
  const b = new Board({ capacity: 2, bowls: [[0, 0], [1, 2], [2, 1], []] });
  assert.equal(b.snack(0), false);
  assert.equal(b.history.length, 0);
  assert.deepEqual(b.bowls[0], [0, 0]);
});
