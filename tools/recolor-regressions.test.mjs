import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { encodePNG, decodePNG } from './png.mjs';
import { blueFurColor, recolorPart, rgb2hsv } from './cat-colors.mjs';

const source = { w: 6, h: 1, rgba: Buffer.from([
  77, 171, 247, 255, 38, 85, 123, 255, // шерсть и более тёмная полоска
  245, 243, 240, 255, 245, 120, 155, 255, // белая мордочка и нос
  77, 171, 247, 100, 91, 52, 22, 0, // полупрозрачная шерсть и пустота
]) };

test('Перекраска сохраняет прозрачность, белые пятна, нос и контраст полосок', () => {
  const before = Buffer.from(source.rgba);
  const result = recolorPart(source, blueFurColor(source), 0xa47148);
  for (let i = 3; i < before.length; i += 4) assert.equal(result.rgba[i], before[i]);
  assert.deepEqual(result.rgba.subarray(8, 16), before.subarray(8, 16));
  assert.deepEqual(result.rgba.subarray(20), before.subarray(20));
  assert.notDeepEqual(result.rgba.subarray(0, 3), before.subarray(0, 3));
  const value = offset => Math.max(...result.rgba.subarray(offset, offset + 3));
  assert.ok(value(4) < value(0) * 0.6); // полоска осталась темнее шерсти
  assert.deepEqual(source.rgba, before); // один мастер повторно используется для всех цветов
});

test('Явная маска защищает материал даже с тем же исходным цветом', () => {
  const image = { w: 2, h: 1, rgba: Buffer.from([100, 60, 30, 255, 100, 60, 30, 255]) };
  const mask = { w: 2, h: 1, rgba: Buffer.from([255, 255, 255, 255, 0, 0, 0, 255]) };
  const result = recolorPart(image, rgb2hsv(100, 60, 30), 0x8fe3c0, mask);
  assert.notDeepEqual(result.rgba.subarray(0, 4), image.rgba.subarray(0, 4));
  assert.deepEqual(result.rgba.subarray(4), image.rgba.subarray(4));
  assert.throws(() => recolorPart(image, rgb2hsv(100, 60, 30), 0, { ...mask, w: 1 }));
  assert.throws(() => blueFurColor({ rgba: Buffer.from([255, 255, 255, 255]) }));
});

test('Набор породы проверяется до записи и не перезаписывает существующие файлы', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kitty-recolor-'));
  try {
    writeFileSync(join(dir, 'head.png'), encodePNG(source));
    writeFileSync(join(dir, 'kit.json'), JSON.stringify({ breed: 'testcat', parts: { head: 'head.png' } }));
    const out = join(dir, 'out');
    const call = extra => spawnSync(process.execPath, ['tools/recolor-breed.mjs', join(dir, 'kit.json'), `--out=${out}`, ...extra], { encoding: 'utf8' });
    assert.notEqual(call([]).status, 0); // неполный набор без явного режима предпросмотра
    assert.equal(existsSync(out), false);
    assert.notEqual(call(['--partial', '--colors=unknown']).status, 0);
    assert.equal(existsSync(out), false);
    assert.equal(call(['--partial', '--colors=brown,gray']).status, 0);
    assert.ok(existsSync(join(out, 'cat_testcat_brown_head.png')));
    assert.ok(existsSync(join(out, 'cat_testcat_gray_head.png')));
    assert.notEqual(call(['--partial', '--colors=brown']).status, 0);
    assert.deepEqual(decodePNG(encodePNG(source)).rgba, source.rgba);
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('kitty-recolor-'));
    rmSync(dir, { recursive: true, force: true });
  }
});
