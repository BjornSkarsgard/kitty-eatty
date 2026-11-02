import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Первая своя кличка требует табличку, повторные изменения бесплатны (#13)', async () => {
  let raw = null;
  globalThis.window = { localStorage: { getItem: () => raw, setItem: (_, value) => { raw = value; } } };
  const save = await import('../src/core/save.js');
  assert.equal(save.setCustomName('Мурчик'), false);
  save.addWinBoost(0);
  const data = JSON.parse(raw);
  data.nameTokens = 1;
  raw = JSON.stringify(data);
  // Новый модуль — перезапуск игры с сохранённой табличкой.
  const reload = await import('../src/core/save.js?rename-test');
  assert.equal(reload.setCustomName('Мурчик'), true);
  assert.equal(reload.nameTokens(), 0);
  assert.equal(reload.setCustomName('Рыжик'), true);
  assert.equal(reload.customName(), 'Рыжик');
  assert.equal(reload.nameTokens(), 0);
});
