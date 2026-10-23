import { CONFIG } from '../config.js';
import { sfx } from '../audio.js';

// Кнопка-заглушка: скруглённый прямоугольник с надписью, пружинит при нажатии.
// Картинка button.png (этап 5) — позже. scrollFactor 0 — если кнопка не должна уезжать с прокруткой.
export function makeButton(scene, x, y, label, onTap, { depth = 0, w = 220, h = 84, size = 34, color = 0x5f4b8b } = {}) {
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 20);
  g.lineStyle(CONFIG.outlineWidth, CONFIG.outline, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 20);
  const t = scene.add.text(0, 0, label, {
    fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: `${size}px`, color: '#ffffff',
  }).setOrigin(0.5);
  const btn = scene.add.container(x, y, [g, t]).setDepth(depth).setSize(w, h).setInteractive();
  btn.on('pointerdown', () => {
    sfx(scene, 'sfx_button');
    scene.tweens.add({ targets: btn, scale: 0.92, duration: 60, yoyo: true });
    onTap();
  });
  return btn;
}
