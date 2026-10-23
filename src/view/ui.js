import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { sfx } from '../audio.js';

// Общие элементы интерфейса (как в референсах Ивана): кнопки-иконки с бейджами, пилюля-счётчик,
// табличка, лоток. Пока заглушки кодом: «объём» — светлый верх, тёмный низ, блик.
// Есть картинка icon_<name>.png — она вместо иконки кодом; ui_*.png для заготовок — позже.
const U = CONFIG.ui;
const font = () => `"${CONFIG.font}", sans-serif`;

// Глянцевая плашка: тень, тёмный «бок» снизу, лицо, блик сверху. shape: 'square' | 'round'.
function drawBlank(g, w, h, color, shape) {
  const r = shape === 'round' ? Math.min(w, h) / 2 : Math.min(w, h) * 0.26;
  const dark = Phaser.Display.Color.ValueToColor(color).darken(28).color;
  const light = Phaser.Display.Color.ValueToColor(color).lighten(14).color;
  g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 3, -h / 2 + 9, w, h, r);
  g.fillStyle(dark, 1).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, r);
  g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h - 4, r);
  const hh = (h - 4) * 0.5;
  const rr = Math.min(r - 6, hh / 2);
  g.fillStyle(light, 1).fillRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, hh, { tl: rr, tr: rr, bl: 6, br: 6 });
  g.fillStyle(0xffffff, 0.35).fillEllipse(-w * 0.22, -h * 0.3, w * 0.28, h * 0.12);
}

// Иконки кодом: белые фигуры в квадрате size×size вокруг (0, 0).
const ICONS = {
  undo(g, s) {
    g.lineStyle(s * 0.13, 0xffffff, 1).beginPath();
    g.arc(0, s * 0.05, s * 0.28, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(150), false).strokePath();
    g.fillStyle(0xffffff, 1).fillTriangle(-s * 0.42, -s * 0.12, -s * 0.12, -s * 0.12, -s * 0.3, s * 0.14);
  },
  restart(g, s) {
    g.lineStyle(s * 0.13, 0xffffff, 1).beginPath();
    g.arc(0, 0, s * 0.28, Phaser.Math.DegToRad(-60), Phaser.Math.DegToRad(250), false).strokePath();
    g.fillStyle(0xffffff, 1).fillTriangle(s * 0.06, -s * 0.42, s * 0.06, -s * 0.06, s * 0.32, -s * 0.24);
  },
  home(g, s) {
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(-s * 0.36, -s * 0.02, s * 0.36, -s * 0.02, 0, -s * 0.36);
    g.fillRect(-s * 0.25, -s * 0.04, s * 0.5, s * 0.36);
  },
  map(g, s) {
    g.fillStyle(0xffffff, 1).fillCircle(0, -s * 0.1, s * 0.22);
    g.fillTriangle(-s * 0.19, -s * 0.0, s * 0.19, -s * 0.0, 0, s * 0.36);
    g.fillStyle(0x000000, 0.35).fillCircle(0, -s * 0.1, s * 0.09);
  },
  gear(g, s) {
    g.fillStyle(0xffffff, 1);
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      g.fillCircle(Math.cos(a) * s * 0.3, Math.sin(a) * s * 0.3, s * 0.09);
    }
    g.fillCircle(0, 0, s * 0.3);
    g.fillStyle(0x000000, 0.35).fillCircle(0, 0, s * 0.12);
  },
  collection(g, s) { // лапка
    g.fillStyle(0xffffff, 1).fillEllipse(0, s * 0.12, s * 0.42, s * 0.34);
    [[-0.24, -0.12], [-0.09, -0.26], [0.09, -0.26], [0.24, -0.12]].forEach(([x, y]) => g.fillCircle(x * s, y * s, s * 0.09));
  },
  sound(g, s) {
    g.fillStyle(0xffffff, 1).fillRect(-s * 0.36, -s * 0.12, s * 0.16, s * 0.24);
    g.fillTriangle(-s * 0.22, -s * 0.12, -s * 0.22, s * 0.12, s * 0.02, 0).fillTriangle(-s * 0.22, -s * 0.12, s * 0.02, -s * 0.3, s * 0.02, 0);
    g.fillTriangle(-s * 0.22, s * 0.12, s * 0.02, s * 0.3, s * 0.02, 0);
    g.lineStyle(s * 0.07, 0xffffff, 1);
    g.beginPath().arc(s * 0.06, 0, s * 0.16, -0.8, 0.8).strokePath();
    g.beginPath().arc(s * 0.06, 0, s * 0.3, -0.8, 0.8).strokePath();
  },
  music(g, s) {
    g.fillStyle(0xffffff, 1).fillEllipse(-s * 0.16, s * 0.24, s * 0.22, s * 0.17).fillEllipse(s * 0.2, s * 0.16, s * 0.22, s * 0.17);
    g.fillRect(-s * 0.08, -s * 0.3, s * 0.07, s * 0.55).fillRect(s * 0.28, -s * 0.38, s * 0.07, s * 0.55);
    g.fillTriangle(-s * 0.08, -s * 0.3, s * 0.35, -s * 0.38, s * 0.35, -s * 0.24).fillTriangle(-s * 0.08, -s * 0.3, -s * 0.08, -s * 0.16, s * 0.35, -s * 0.24);
  },
  vibro(g, s) {
    g.lineStyle(s * 0.08, 0xffffff, 1).strokeRoundedRect(-s * 0.15, -s * 0.3, s * 0.3, s * 0.6, s * 0.06);
    g.lineStyle(s * 0.06, 0xffffff, 1);
    [-1, 1].forEach((d) => {
      g.lineBetween(d * s * 0.26, -s * 0.18, d * s * 0.34, -s * 0.06).lineBetween(d * s * 0.34, -s * 0.06, d * s * 0.26, s * 0.06);
      g.lineBetween(d * s * 0.26, s * 0.06, d * s * 0.34, s * 0.18);
    });
  },
  fx(g, s) { // искра
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(0, -s * 0.38, -s * 0.09, 0, s * 0.09, 0).fillTriangle(0, s * 0.38, -s * 0.09, 0, s * 0.09, 0);
    g.fillTriangle(-s * 0.38, 0, 0, -s * 0.09, 0, s * 0.09).fillTriangle(s * 0.38, 0, 0, -s * 0.09, 0, s * 0.09);
    g.fillCircle(s * 0.26, -s * 0.26, s * 0.06).fillCircle(-s * 0.24, s * 0.26, s * 0.05);
  },
  exit(g, s) {
    g.lineStyle(s * 0.08, 0xffffff, 1).strokeRect(s * 0.02, -s * 0.3, s * 0.28, s * 0.6);
    g.fillStyle(0xffffff, 1).fillRect(-s * 0.26, -s * 0.05, s * 0.26, s * 0.1);
    g.fillTriangle(-s * 0.38, 0, -s * 0.2, -s * 0.16, -s * 0.2, s * 0.16);
  },
  shop(g, s) {
    g.fillStyle(0xffffff, 1).fillRect(-s * 0.3, -s * 0.05, s * 0.6, s * 0.36);
    for (let k = 0; k < 4; k++) g.fillStyle(k % 2 ? 0xffffff : 0xff8fa3, 1).fillRect(-s * 0.36 + k * s * 0.18, -s * 0.32, s * 0.18, s * 0.22);
    g.fillStyle(0x000000, 0.3).fillRect(-s * 0.1, s * 0.08, s * 0.2, s * 0.23);
  },
  profile(g, s) {
    g.fillStyle(0xffffff, 1).fillCircle(0, -s * 0.12, s * 0.17);
    g.fillTriangle(-s * 0.2, -s * 0.22, -s * 0.12, -s * 0.38, -s * 0.03, -s * 0.27).fillTriangle(s * 0.2, -s * 0.22, s * 0.12, -s * 0.38, s * 0.03, -s * 0.27);
    g.fillEllipse(0, s * 0.27, s * 0.56, s * 0.3);
  },
  coin(g, s) {
    g.fillStyle(0xc77d0a, 1).fillCircle(0, s * 0.03, s * 0.46);
    g.fillStyle(0xffc531, 1).fillCircle(0, 0, s * 0.44);
    g.fillStyle(0xe8a317, 1).fillCircle(0, 0, s * 0.3);
    g.fillStyle(0xffffff, 0.5).fillEllipse(-s * 0.15, -s * 0.2, s * 0.22, s * 0.1);
  },
};

export function makeIcon(scene, name, size) {
  if (scene.textures.exists(`icon_${name}`)) {
    const img = scene.add.image(0, 0, `icon_${name}`);
    return img.setScale(size / Math.max(img.width, img.height));
  }
  const g = scene.add.graphics();
  ICONS[name]?.(g, size);
  return g;
}

// Кнопка-иконка: квадратная (или круглая) глянцевая, бейдж с числом справа сверху, подпись снизу.
// Возвращает контейнер с методами setBadge(n | null) и setEnabled(bool).
export function iconButton(scene, x, y, icon, onTap, {
  size = U.iconButton, shape = 'square', color = U.buttonColor, label = null, badge = null, depth = 15,
} = {}) {
  const btn = scene.add.container(x, y).setDepth(depth);
  const g = scene.add.graphics();
  drawBlank(g, size, size, color, shape);
  btn.setColor = (c) => { g.clear(); drawBlank(g, size, size, c, shape); return btn; };
  btn.add([g, makeIcon(scene, icon, size * 0.62).setPosition(0, -3)]);
  if (label) {
    btn.add(scene.add.text(0, size / 2 + 22, label, {
      fontFamily: font(), fontStyle: 'bold', fontSize: '28px', color: '#ffffff', stroke: '#3b2a55', strokeThickness: 7,
    }).setOrigin(0.5));
  }
  const badgeBox = scene.add.container(size * 0.38, -size * 0.38);
  const bg = scene.add.graphics();
  bg.fillStyle(0x7a0f2a, 1).fillCircle(0, 3, 22).fillStyle(U.badgeColor, 1).fillCircle(0, 0, 22);
  bg.lineStyle(4, 0xffffff, 1).strokeCircle(0, 0, 22);
  const badgeText = scene.add.text(0, -1, '', { fontFamily: font(), fontStyle: 'bold', fontSize: '26px', color: '#ffffff' }).setOrigin(0.5);
  badgeBox.add([bg, badgeText]);
  btn.add(badgeBox);

  btn.setBadge = (n) => {
    badgeBox.setVisible(n !== null && n !== undefined);
    badgeText.setText(String(n));
    return btn;
  };
  btn.setBadge(badge);
  btn.enabled = true;
  btn.setEnabled = (on) => { btn.enabled = on; btn.setAlpha(on ? 1 : 0.5); return btn; };

  btn.setSize(size, size).setInteractive();
  btn.on('pointerdown', () => {
    sfx(scene, 'sfx_button');
    scene.tweens.add({ targets: btn, scale: 0.9, duration: 60, yoyo: true });
    if (btn.enabled) onTap();
  });
  return btn;
}

// Пилюля-счётчик: иконка слева (монета), число на светлой плашке. setValue(n).
export function counterPill(scene, x, y, icon, value, { w = U.pillWidth, depth = 15 } = {}) {
  const h = 56;
  const box = scene.add.container(x, y).setDepth(depth);
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.25).fillRoundedRect(-w / 2 + 3, -h / 2 + 6, w, h, h / 2);
  g.fillStyle(0xfff3e0, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.lineStyle(4, 0x9c6a3c, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  const text = scene.add.text(14, 1, '', { fontFamily: font(), fontStyle: 'bold', fontSize: '34px', color: '#6b3d1f' }).setOrigin(0.5);
  box.add([g, makeIcon(scene, icon, 72).setPosition(-w / 2 + 6, 0), text]);
  box.setValue = (n) => { text.setText(String(n)); return box; };
  return box.setValue(value);
}

// Табличка с надписью (номер уровня): тёмная плашка с светлой рамкой.
export function plate(scene, x, y, label, { depth = 15, color = 0x2b2160 } = {}) {
  const text = scene.add.text(0, 0, label, {
    fontFamily: font(), fontStyle: 'bold', fontSize: '38px', color: '#ffffff', stroke: '#1b1426', strokeThickness: 6,
  }).setOrigin(0.5);
  const w = text.width + 56;
  const h = 64;
  const g = scene.add.graphics();
  g.fillStyle(0x000000, 0.3).fillRoundedRect(-w / 2 + 3, -h / 2 + 6, w, h, 22);
  g.fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 22);
  g.lineStyle(5, 0x8f6be8, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 22);
  return scene.add.container(x, y, [g, text]).setDepth(depth);
}

// Лоток под кнопками внизу экрана.
export function tray(scene, x, y, w, h, { depth = 14 } = {}) {
  const g = scene.add.graphics().setDepth(depth);
  g.fillStyle(0x000000, 0.3).fillRoundedRect(x - w / 2 + 4, y - h / 2 + 8, w, h, 40);
  g.fillStyle(0x3a2a78, 1).fillRoundedRect(x - w / 2, y - h / 2, w, h, 40);
  g.lineStyle(5, 0x5b46b0, 1).strokeRoundedRect(x - w / 2, y - h / 2, w, h, 40);
  return g;
}

// Шестерёнка, раскрывающая столбик круглых переключателей вниз (как в референсе): зелёный — включено.
// items: [{ icon, get(): bool, set(bool) }] — переключатели; actions: [{ icon, color, onTap }] — кнопки (выход).
// Тап мимо столбика — сворачивает.
export function settingsMenu(scene, x, y, items, actions = [], { size = 84, depth = 30 } = {}) {
  const col = [];
  const catcher = scene.add.rectangle(CONFIG.width / 2, CONFIG.height / 2, CONFIG.width, CONFIG.height, 0x000000, 0.001)
    .setDepth(depth - 1).setScrollFactor(0).setInteractive().setVisible(false);
  let open = false;
  const toggle = (on = !open) => {
    open = on;
    catcher.setVisible(open);
    col.forEach((b, i) => {
      scene.tweens.killTweensOf(b);
      if (open) {
        b.setVisible(true).setScale(0.3).setAlpha(0);
        scene.tweens.add({ targets: b, y: y + (i + 1) * (size + 24), scale: 1, alpha: 1, duration: 160, delay: i * 30, ease: 'Back.easeOut' });
      } else {
        scene.tweens.add({ targets: b, y, scale: 0.3, alpha: 0, duration: 120, onComplete: () => b.setVisible(false) });
      }
    });
  };
  catcher.on('pointerdown', () => toggle(false));
  const gear = iconButton(scene, x, y, 'gear', () => toggle(), { size, shape: 'round', depth: depth + 1 }).setScrollFactor(0);
  items.forEach((it) => {
    const on = () => (it.get() ? U.onColor : U.offColor);
    const b = iconButton(scene, x, y, it.icon, () => { it.set(!it.get()); b.setColor(on()); }, { size, shape: 'round', depth, color: on() });
    col.push(b.setScrollFactor(0).setVisible(false));
  });
  actions.forEach((a) => {
    const b = iconButton(scene, x, y, a.icon, () => { toggle(false); a.onTap(); }, { size, shape: 'round', depth, color: a.color });
    col.push(b.setScrollFactor(0).setVisible(false));
  });
  return gear;
}

// Нижняя панель вкладок; активная — приподнята, крупнее и с подписью. tabs: [{ icon, label, scene, enabled }].
export function tabBar(scene, tabs, active, { depth = 20 } = {}) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const h = U.tabBarHeight;
  const g = scene.add.graphics().setDepth(depth).setScrollFactor(0);
  g.fillStyle(0x000000, 0.3).fillRect(0, H - h - 6, W, 6);
  g.fillStyle(0x4b33a8, 1).fillRect(0, H - h, W, h);
  g.fillStyle(0xf5b301, 1).fillRect(0, H - h, W, 6);
  const cell = W / tabs.length;
  tabs.forEach((t, i) => {
    const x = cell * i + cell / 2;
    if (i) g.fillStyle(0x3a2580, 1).fillRect(cell * i - 2, H - h + 6, 4, h - 6);
    const isActive = t.scene === active;
    if (isActive) {
      g.fillStyle(0x000000, 0.25).fillRoundedRect(x - cell / 2 + 4, H - h - 34, cell - 8, h + 40, 26);
      g.fillStyle(0x7b5cf0, 1).fillRoundedRect(x - cell / 2 + 4, H - h - 40, cell - 8, h + 40, 26);
      g.lineStyle(5, 0xf5b301, 1).strokeRoundedRect(x - cell / 2 + 4, H - h - 40, cell - 8, h + 40, 26);
    }
    const iy = H - h / 2 - (isActive ? 34 : 0);
    const icon = makeIcon(scene, t.icon, isActive ? 86 : 70).setPosition(x, iy).setDepth(depth + 1).setScrollFactor(0);
    if (t.enabled === false) icon.setAlpha(0.4);
    if (isActive) {
      scene.add.text(x, H - 30, t.label, {
        fontFamily: font(), fontStyle: 'bold', fontSize: '28px', color: '#ffffff', stroke: '#2b1a66', strokeThickness: 6,
      }).setOrigin(0.5).setDepth(depth + 1).setScrollFactor(0);
    }
    const zone = scene.add.zone(x, H - h / 2, cell, h).setDepth(depth + 2).setScrollFactor(0).setInteractive();
    zone.on('pointerdown', () => {
      if (isActive) return;
      sfx(scene, t.enabled === false ? 'sfx_invalid' : 'sfx_button');
      if (t.enabled === false) return;
      scene.tweens.add({ targets: icon, scale: icon.scale * 0.85, duration: 70, yoyo: true, onComplete: () => scene.scene.start(t.scene) });
    });
  });
}
