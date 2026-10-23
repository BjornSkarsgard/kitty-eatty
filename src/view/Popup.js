import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';

// Окно поверх экрана: затемнение (тап по нему закрывает), панель, заголовок, текст и кнопки столбиком.
// buttons: [{ label, onTap, color, disabled, keep }] — после onTap окно закрывается, если не keep
// (keep — переключатели: onTap(btn) сам меняет надпись кнопки через btn.setLabel).
// Картинка panel.png (этап 5) — позже, пока панель кодом.
export function showPopup(scene, { title, text = '', buttons = [], depth = 50 }) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const parts = [];
  const close = () => parts.forEach((o) => o.destroy());

  const shade = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setDepth(depth).setScrollFactor(0).setInteractive();
  shade.on('pointerdown', close);
  parts.push(shade);

  const pw = 560;
  const textH = text ? 110 : 0;
  const ph = 135 + textH + buttons.length * 110;
  const top = H / 2 - ph / 2;
  const g = scene.add.graphics().setDepth(depth).setScrollFactor(0);
  g.fillStyle(0x000000, 0.25).fillRoundedRect(W / 2 - pw / 2 + 6, top + 10, pw, ph, 36);
  g.fillStyle(0xfff3e0, 1).fillRoundedRect(W / 2 - pw / 2, top, pw, ph, 36);
  g.lineStyle(8, 0x9c3f1c, 1).strokeRoundedRect(W / 2 - pw / 2, top, pw, ph, 36);
  // панель ловит тапы, чтобы они не закрывали окно
  g.setInteractive(new Phaser.Geom.Rectangle(W / 2 - pw / 2, top, pw, ph), Phaser.Geom.Rectangle.Contains);
  parts.push(g);

  const font = `"${CONFIG.font}", sans-serif`;
  parts.push(scene.add.text(W / 2, top + 70, title, {
    fontFamily: font, fontStyle: 'bold', fontSize: '50px', color: '#ffffff', stroke: '#9c3f1c', strokeThickness: 10,
  }).setOrigin(0.5).setDepth(depth).setScrollFactor(0));
  parts.push(scene.add.text(W / 2, top + 160, text, {
    fontFamily: font, fontStyle: 'bold', fontSize: '32px', color: '#6b3d1f', align: 'center', wordWrap: { width: pw - 80 },
  }).setOrigin(0.5).setDepth(depth).setScrollFactor(0));

  buttons.forEach((b, i) => {
    const btn = makeButton(scene, W / 2, top + 160 + textH + i * 110, b.label, () => {
      if (b.disabled) return;
      if (b.keep) return b.onTap?.(btn);
      close();
      b.onTap?.();
    }, { depth, w: 420, h: 90, color: b.disabled ? 0xa89a8c : b.color ?? 0x5f4b8b }).setScrollFactor(0);
    parts.push(btn);
  });
  return close;
}
