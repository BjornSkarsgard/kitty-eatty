import { CONFIG } from '../config.js';
import { sfx } from '../audio.js';

// Кнопка с надписью. skin ('yellow', 'green') — объёмная из арта: btn_<skin>.png поднятая и btn_<skin>_pressed.png
// прожатая (нижний край у обеих на одной высоте). Палец прижал — картинка прожатой, надпись опускается вместе
// с лицевой стороной; отпустил на кнопке — она выпрямляется, чуть подпрыгивает, и срабатывает onTap;
// увёл палец — просто выпрямляется. Без skin (или без картинок) — заглушка: скруглённый прямоугольник,
// пружинит и срабатывает сразу при нажатии. scrollFactor 0 — если кнопка не должна уезжать с прокруткой.
export function makeButton(scene, x, y, label, onTap, { depth = 0, w = 220, h, size = 34, color = 0x5f4b8b, skin } = {}) {
  const font = `"${CONFIG.font}", sans-serif`;
  const S = skin && CONFIG.ui.skins[skin];
  if (S && scene.textures.exists(`btn_${skin}`) && scene.textures.exists(`btn_${skin}_pressed`)) {
    return skinButton(scene, x, y, label, onTap, { depth, w, h, size, skin, S, font });
  }
  h ??= 84;
  const g = scene.add.graphics();
  g.fillStyle(color, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 20);
  g.lineStyle(CONFIG.outlineWidth, CONFIG.outline, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 20);
  const t = scene.add.text(0, 0, label, { fontFamily: font, fontStyle: 'bold', fontSize: `${size}px`, color: '#ffffff' }).setOrigin(0.5);
  const btn = scene.add.container(x, y, [g, t]).setDepth(depth).setSize(w, h).setInteractive();
  btn.setLabel = (s) => { t.setText(s); return btn; };
  btn.on('pointerdown', () => {
    sfx(scene, 'sfx_button');
    scene.tweens.add({ targets: btn, scale: 0.92, duration: 60, yoyo: true });
    onTap();
  });
  return btn;
}

// h — высота поднятой кнопки; без неё — по пропорциям картинки (у арта толстая боковина — можно чуть сплющить).
function skinButton(scene, x, y, label, onTap, { depth, w, h, size, skin, S, font }) {
  const img = scene.add.image(0, 0, `btn_${skin}`).setOrigin(0.5, 1);
  h ??= (img.height * w) / img.width;
  const k = h / img.height; // по высоте: где лицевая сторона
  img.setScale(w / img.width, k).setY(h / 2); // (x, y) — середина поднятой кнопки
  const t = scene.add.text(0, 0, label, {
    fontFamily: font, fontStyle: 'bold', fontSize: `${size}px`, color: '#ffffff', stroke: S.stroke, strokeThickness: Math.round(size / 6),
  }).setOrigin(0.5);
  const btn = scene.add.container(x, y, [img, t]).setDepth(depth).setSize(w, h).setInteractive();
  const press = (down) => {
    img.setTexture(`btn_${skin}${down ? '_pressed' : ''}`);
    t.y = h / 2 - (down ? S.faceDown : S.faceUp) * k;
    btn.pressed = down;
  };
  press(false);
  btn.setLabel = (s) => { t.setText(s); return btn; };
  btn.on('pointerdown', () => {
    sfx(scene, 'sfx_button');
    scene.tweens.killTweensOf(btn);
    btn.setScale(1);
    press(true);
  });
  btn.on('pointerout', () => { if (btn.pressed) press(false); });
  btn.on('pointerup', () => {
    if (!btn.pressed) return;
    press(false);
    scene.tweens.add({ targets: btn, scale: CONFIG.ui.pressBounce, duration: 80, yoyo: true, ease: 'Quad.easeOut' });
    onTap();
  });
  return btn;
}
