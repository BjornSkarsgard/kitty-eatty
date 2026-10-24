import { CONFIG } from '../config.js';
import { sfx } from '../audio.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Кнопка с надписью. skin ('yellow', 'green') — объёмная из арта: btn_<skin>.png поднятая и btn_<skin>_pressed.png
// прожатая (нижний край у обеих на одной высоте). Палец прижал — картинка прожатой, надпись опускается вместе
// с лицевой стороной; отпустил на кнопке — она выпрямляется, чуть подпрыгивает, и срабатывает onTap;
// увёл палец — просто выпрямляется. Без skin (или без картинок) — заглушка: скруглённый прямоугольник,
// пружинит и срабатывает сразу при нажатии. scrollFactor 0 — если кнопка не должна уезжать с прокруткой.
export function makeButton(scene, x, y, label, onTap, { depth = 0, w = 220, h, size = 34, color = PAL.buttonPlain, skin } = {}) {
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
  const t = scene.add.text(0, 0, label, { fontFamily: font, fontStyle: 'bold', fontSize: `${size}px`, color: PAL.text }).setOrigin(0.5);
  const btn = scene.add.container(x, y, [g, t]).setDepth(depth).setSize(w, h).setInteractive();
  btn.setLabel = (s) => { t.setText(s); return btn; };
  btn.on('pointerdown', () => {
    sfx(scene, 'sfx_button');
    scene.tweens.add({ targets: btn, scale: 0.92, duration: 60, yoyo: true });
    onTap();
  });
  return btn;
}

// Картинка режется на три кусочка: левый и правый край (круглые) и середина. Вся кнопка уменьшается до высоты h,
// а по ширине w тянется только середина — края не сплющиваются. Без h — по пропорциям картинки.
// Кусочки — кадры той же текстуры (<key>_l / _m / _r); саму картинку целиком кнопка не берёт.
function slices(scene, key) {
  const tex = scene.textures.get(key);
  if (!tex.has(`${key}_l`)) {
    const src = tex.get('__BASE');
    const cap = Math.round(src.width * CONFIG.ui.skinCap);
    tex.add(`${key}_l`, 0, 0, 0, cap, src.height);
    tex.add(`${key}_m`, 0, cap, 0, src.width - 2 * cap, src.height);
    tex.add(`${key}_r`, 0, src.width - cap, 0, cap, src.height);
  }
  return tex;
}

function skinButton(scene, x, y, label, onTap, { depth, w, h, size, skin, S, font }) {
  const up = `btn_${skin}`;
  const down = `btn_${skin}_pressed`;
  const base = slices(scene, up).get('__BASE');
  slices(scene, down);
  h ??= (base.height * w) / base.width;
  const k = h / base.height; // вся картинка — в этом масштабе (прожатая ниже — так нарисована)
  const parts = ['l', 'm', 'r'].map((s, i) => scene.add.image(0, h / 2, up, `${up}_${s}`).setOrigin(i === 2 ? 1 : 0, 1));
  const t = scene.add.text(0, 0, label, {
    fontFamily: font, fontStyle: 'bold', fontSize: `${size}px`, color: PAL.text, stroke: S.stroke, strokeThickness: Math.round(size / 6),
  }).setOrigin(0.5);
  const btn = scene.add.container(x, y, [...parts, t]).setDepth(depth).setSize(w, h).setInteractive();
  const press = (pressed) => {
    const key = pressed ? down : up;
    const [l, m, r] = parts;
    ['l', 'm', 'r'].forEach((s, i) => parts[i].setTexture(key, `${key}_${s}`).setScale(k));
    const cap = l.width * k;
    l.x = -w / 2;
    r.x = w / 2;
    m.x = -w / 2 + cap;
    m.scaleX = Math.max(0, w - 2 * cap) / m.width;
    t.y = h / 2 - (pressed ? S.faceDown : S.faceUp) * k;
    btn.pressed = pressed;
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
