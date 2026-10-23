// Временная отрисовка фигурами Phaser.Graphics. На этапе 4 заменится векторным артом.
import { CONFIG } from '../config.js';

// Значок формы корма с центром в (0, 0), s — «радиус».
export function drawShape(g, shape, s) {
  switch (shape) {
    case 'circle':
      g.fillCircle(0, 0, s);
      break;
    case 'triangle':
      g.fillTriangle(0, -s, s, s * 0.8, -s, s * 0.8);
      break;
    case 'square':
      g.fillRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.6);
      break;
    case 'diamond':
      g.fillPoints([{ x: 0, y: -s }, { x: s, y: 0 }, { x: 0, y: s }, { x: -s, y: 0 }], true);
      break;
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? s * 0.45 : s;
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      g.fillPoints(pts, true);
      break;
    }
    case 'cross':
      g.fillRect(-s, -s * 0.3, s * 2, s * 0.6);
      g.fillRect(-s * 0.3, -s, s * 0.6, s * 2);
      break;
    case 'heart':
      g.fillCircle(-s * 0.45, -s * 0.2, s * 0.5);
      g.fillCircle(s * 0.45, -s * 0.2, s * 0.5);
      g.fillTriangle(-s * 0.93, 0, s * 0.93, 0, 0, s * 0.95);
      break;
    case 'drop':
      g.fillCircle(0, s * 0.3, s * 0.65);
      g.fillTriangle(-s * 0.6, s * 0.1, s * 0.6, s * 0.1, 0, -s);
      break;
    case 'hourglass':
      g.fillTriangle(-s * 0.8, -s, s * 0.8, -s, 0, 0);
      g.fillTriangle(-s * 0.8, s, s * 0.8, s, 0, 0);
      break;
    case 'ring':
      g.lineStyle(s * 0.4, g.defaultFillColor, g.defaultFillAlpha);
      g.strokeCircle(0, 0, s * 0.75);
      break;
  }
}

// Порция корма: цветной слой + иконка корма (картинка food_N, если есть, иначе значок формы).
export function makePortion(scene, colorIndex, w, h) {
  const { fill: color, shape } = CONFIG.colors[colorIndex];
  const key = `food_${colorIndex}`;
  const hasArt = scene.textures.exists(key);
  // с картинкой корма слой светлее, чтобы корм того же цвета на нём выделялся;
  // у очень светлых цветов (белый) — наоборот, чуть темнее
  const fill = !hasArt ? color
    : luminance(color) > 0.85 ? darken(color, CONFIG.portion.layerDarken) : lighten(color, CONFIG.portion.layerLighten);
  const g = scene.add.graphics();
  const parts = [...makeLayer(scene, w, h, fill, g), g];
  if (hasArt) {
    const img = scene.add.image(0, 0, key);
    // вписываем в рамку внутри слоя, чтобы корм не упирался в края
    img.setScale(Math.min((h * CONFIG.portion.iconHeight) / img.height, (w * CONFIG.portion.iconWidth) / img.width));
    parts.push(img);
  } else {
    g.fillStyle(CONFIG.outline, 0.6);
    drawShape(g, shape, h * 0.3);
  }
  const p = scene.add.container(0, 0, parts);
  p.color = colorIndex;
  return p;
}

// Слой порции: глянцевая белая плитка portion_layer, покрашенная tint'ом в цвет корма. Плитка режется на три
// куска: закруглённые края сохраняют форму, середина растягивается под ширину банки. Без картинки — фигура в g.
function makeLayer(scene, w, h, fill, g) {
  const key = 'portion_layer';
  if (!scene.textures.exists(key)) {
    const r = Math.min(12, h * 0.25);
    g.fillStyle(fill, 1).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.35).fillRoundedRect(-w / 2 + 6, -h / 2 + 5, w * 0.3, h * 0.16, h * 0.08);
    return [];
  }
  const tex = scene.textures.get(key);
  const { width: W, height: H } = tex.getSourceImage();
  const cap = CONFIG.portion.layerCap;
  if (!tex.has('l')) {
    tex.add('l', 0, 0, 0, cap, H);
    tex.add('m', 0, cap, 0, W - cap * 2, H);
    tex.add('r', 0, W - cap, 0, cap, H);
  }
  const k = h / H;
  const cw = Math.min(cap * k, w / 2);
  const left = scene.add.image(-w / 2, 0, key, 'l').setOrigin(0, 0.5).setDisplaySize(cw, h);
  const mid = scene.add.image(-w / 2 + cw, 0, key, 'm').setOrigin(0, 0.5).setDisplaySize(Math.max(0, w - cw * 2), h);
  const right = scene.add.image(w / 2 - cw, 0, key, 'r').setOrigin(0, 0.5).setDisplaySize(cw, h);
  return [left, mid, right].map((img) => img.setTint(fill));
}

// Когтеточка: витки джута цвета корма вокруг банки от bottom до top (центр по x = 0) и картинка корма поверх.
// Витки — отдельные графики (container.bands, снизу вверх), чтобы их можно было наматывать по одному.
export function makeJuteWrap(scene, colorIndex, w, top, bottom, s) {
  const J = CONFIG.jute;
  const color = mix(CONFIG.colors[colorIndex].fill, J.natural, J.naturalMix);
  const bh = J.band * s;
  const step = bh * J.overlap;
  const bw = w + J.overhang * s * 2;
  const n = Math.max(1, Math.round((bottom - top - bh) / step) + 1);
  const bands = [];
  for (let i = 0; i < n; i++) {
    const y = bottom - bh / 2 - i * ((bottom - top - bh) / Math.max(1, n - 1));
    const g = scene.add.graphics({ x: 0, y });
    g.fillStyle(color, 1).fillRoundedRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    // волокна — короткие косые штрихи, как у скрученной верёвки
    g.lineStyle(Math.max(1.5, 2 * s), darken(color, J.strandDarken), 1);
    const ss = J.strandStep * s;
    for (let x = -bw / 2 + bh * 0.4; x < bw / 2 - bh * 0.9; x += ss) g.lineBetween(x, bh * 0.35, x + bh * 0.5, -bh * 0.35);
    g.fillStyle(0xffffff, 0.25).fillRoundedRect(-bw / 2 + bh * 0.4, -bh * 0.38, bw - bh * 0.8, bh * 0.2, bh * 0.1);
    g.lineStyle(Math.max(2, 3 * s), CONFIG.outline, 1).strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, bh / 2);
    bands.push(g);
  }
  // картинка корма поверх джута
  const cy = (top + bottom) / 2;
  const size = Math.min(w * J.iconSize, (bottom - top) * 0.6);
  let icon;
  let iconScale = 1;
  if (scene.textures.exists(`food_${colorIndex}`)) {
    icon = scene.add.image(0, cy, `food_${colorIndex}`);
    iconScale = Math.min(size / icon.width, size / icon.height);
    icon.setScale(iconScale);
  } else {
    icon = scene.add.graphics({ x: 0, y: cy });
    icon.fillStyle(CONFIG.outline, 1);
    drawShape(icon, CONFIG.colors[colorIndex].shape, size * 0.55);
    icon.fillStyle(lighten(color, 0.6), 1);
    drawShape(icon, CONFIG.colors[colorIndex].shape, size * 0.42);
  }
  const c = scene.add.container(0, 0, [...bands, icon]);
  c.bands = bands;
  c.icon = icon;
  c.iconScale = iconScale;
  return c;
}

// Смешать два цвета: k = 0 — a, 1 — b.
function mix(a, b, k) {
  const ch = (sh) => Math.round(((a >> sh) & 255) * (1 - k) + ((b >> sh) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

function luminance(c) {
  return (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255;
}

function darken(c, k) {
  const mix = (v) => Math.round(v * (1 - k));
  return (mix((c >> 16) & 255) << 16) | (mix((c >> 8) & 255) << 8) | mix(c & 255);
}

// Смешать цвет с белым: k = 0 — как есть, 1 — белый.
function lighten(c, k) {
  const mix = (v) => Math.round(v + (255 - v) * k);
  return (mix((c >> 16) & 255) << 16) | (mix((c >> 8) & 255) << 8) | mix(c & 255);
}

// Текстуры для частиц: крошка, сердечко, звёздочка, конфетти.
export function makeFxTextures(scene) {
  if (scene.textures.exists('fx_dot')) return;
  const g = scene.make.graphics({ add: false });
  const centered = (size, draw) => {
    g.clear();
    g.save();
    g.translateCanvas(size / 2, size / 2);
    draw();
    g.restore();
  };

  centered(16, () => g.fillStyle(0xffffff, 1).fillCircle(0, 0, 8));
  g.generateTexture('fx_dot', 16, 16);

  centered(40, () => {
    g.fillStyle(CONFIG.outline, 1);
    drawShape(g, 'heart', 19);
    g.fillStyle(0xff6b9a, 1);
    drawShape(g, 'heart', 14);
  });
  g.generateTexture('fx_heart', 40, 40);

  centered(32, () => {
    g.fillStyle(0xffffff, 1);
    drawShape(g, 'star', 15);
  });
  g.generateTexture('fx_star', 32, 32);

  g.clear();
  g.fillStyle(0xffffff, 1).fillRect(0, 0, 10, 16);
  g.generateTexture('fx_confetti', 10, 16);
  g.destroy();
}
