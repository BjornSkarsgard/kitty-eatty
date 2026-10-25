import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { catNeed } from '../core/save.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Полоска опыта кота: слева кружок с уровнем кота, в полоске «опыт / нужно». Контейнер с центром в (x, y);
// set(level, xp) — показать; badge — кружок (подпрыгивает на новом уровне). Окно победы и главный экран.
// w, h — размеры полоски (по умолчанию CONFIG.catXp.barWidth / barHeight).
export function catXpBar(scene, x, y, { w = CONFIG.catXp.barWidth, h = CONFIG.catXp.barHeight } = {}) {
  const font = `"${CONFIG.font}", sans-serif`;
  const c = scene.add.container(x, y);
  const x0 = -w / 2 + 30; // полоска чуть правее — слева кружок уровня
  const track = scene.add.graphics();
  track.fillStyle(PAL.night, 1).fillRoundedRect(x0, -h / 2, w, h, h / 2);
  track.lineStyle(3, PAL.rim, 1).strokeRoundedRect(x0, -h / 2, w, h, h / 2);
  const fill = scene.add.graphics();
  const text = scene.add.text(x0 + w / 2, 0, '', {
    fontFamily: font, fontStyle: 'bold', fontSize: '26px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 5,
  }).setOrigin(0.5);
  const badge = scene.add.container(x0 - 6, 0);
  const bg = scene.add.graphics();
  bg.fillStyle(PAL.goldDark, 1).fillCircle(0, 4, 40);
  bg.fillStyle(PAL.gold, 1).fillCircle(0, 0, 40);
  bg.fillStyle(PAL.white, 0.3).fillEllipse(-10, -16, 34, 16);
  const num = scene.add.text(0, 2, '', {
    fontFamily: font, fontStyle: 'bold', fontSize: '40px', color: PAL.text, stroke: PAL.textGoldStroke, strokeThickness: 7,
  }).setOrigin(0.5);
  badge.add([bg, num]);
  c.add([track, fill, text, badge]);
  c.badge = badge;
  c.barRight = x0 + w; // правый край полоски (для подписи «+N опыта»)
  c.barTop = -h / 2;
  c.set = (level, xp) => {
    const need = catNeed(level);
    const k = Phaser.Math.Clamp(xp / need, 0, 1);
    fill.clear();
    if (k > 0) fill.fillStyle(PAL.goldLight, 1).fillRoundedRect(x0 + 4, -h / 2 + 4, Math.max(h - 8, (w - 8) * k), h - 8, (h - 8) / 2);
    if (k > 0) fill.fillStyle(PAL.white, 0.35).fillRoundedRect(x0 + 10, -h / 2 + 7, Math.max(0, (w - 8) * k - 12), 6, 3);
    text.setText(`${Math.floor(xp)} / ${need}`);
    num.setText(String(level));
    return c;
  };
  return c;
}
