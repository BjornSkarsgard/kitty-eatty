import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { panel } from './ui.js';
import { sfx } from '../audio.js';

// Окно поверх экрана: затемнение (тап по нему закрывает), панель, заголовок, текст и кнопки столбиком.
// buttons: [{ label, onTap, color, disabled, keep }] — после onTap окно закрывается, если не keep
// (keep — переключатели: onTap(btn) сам меняет надпись кнопки через btn.setLabel).
// Возвращает close(); у него close.setText(s) — поменять текст (таймеры) и close.isOpen().
// Панель — заготовка ui_panel (src/view/ui.js).
export function showPopup(scene, { title, text = '', buttons = [], depth = 50 }) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const parts = [];
  const close = () => parts.forEach((o) => o.destroy());
  sfx(scene, 'sfx_popup', CONFIG.audio.popup);

  const shade = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setDepth(depth).setScrollFactor(0).setInteractive();
  shade.on('pointerdown', close);
  parts.push(shade);

  const pw = 560;
  const font = `"${CONFIG.font}", sans-serif`;
  // текст меряем заранее: окно растёт под него, чтобы длинный текст не наезжал на кнопки
  const body = scene.add.text(W / 2, 0, text, {
    fontFamily: font, fontStyle: 'bold', fontSize: '32px', color: '#ffffff', stroke: '#2b1a66', strokeThickness: 6, align: 'center', wordWrap: { width: pw - 80 },
  }).setOrigin(0.5).setDepth(depth).setScrollFactor(0);
  const textH = text ? Math.max(110, body.height + 30) : 0;
  const ph = 135 + textH + buttons.length * 110;
  const top = H / 2 - ph / 2;
  body.y = top + 115 + textH / 2;
  parts.push(panel(scene, pw, ph, { corner: 44 }).setPosition(W / 2, top + ph / 2).setDepth(depth).setScrollFactor(0));
  // панель ловит тапы, чтобы они не закрывали окно
  parts.push(scene.add.zone(W / 2, top + ph / 2, pw, ph).setDepth(depth).setScrollFactor(0).setInteractive());
  parts.push(scene.add.text(W / 2, top + 70, title, {
    fontFamily: font, fontStyle: 'bold', fontSize: '50px', color: '#ffffff', stroke: '#2b1a66', strokeThickness: 10,
  }).setOrigin(0.5).setDepth(depth).setScrollFactor(0));
  parts.push(body);
  scene.children.bringToTop(body); // создан раньше панели — поднимаем над ней
  close.setText = (s) => body.setText(s);
  close.isOpen = () => body.active;

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
