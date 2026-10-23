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

// Когтеточка: джутовая верёвка jute_wrap вокруг банки от bottom до top (центр по x = 0), покрашенная tint'ом
// в цвет корма, и картинка корма поверх. Берётся целое число витков (по стыкам картинки, CONFIG.jute.coilFirst/
// coilPitch), чуть растянутых по высоте, чтобы ровно закрыть стенку. Верёвка рисуется в свою текстуру key:
// container.reveal(t), t = 0…1 — витки по очереди снизу вверх, каждый идёт слева направо со скруглённым концом.
export function makeJuteWrap(scene, colorIndex, w, top, bottom, key) {
  const J = CONFIG.jute;
  const color = lighten(CONFIG.colors[colorIndex].fill, J.tintLighten);
  const src = scene.textures.get('jute_wrap').getSourceImage();
  const W = src.width;
  const p = J.coilPitch;
  const k = (w * J.width) / W;
  const lastSeam = J.coilFirst + Math.floor((src.height - J.coilFirst - p * 0.5) / p) * p; // верх нижнего витка
  const maxCoils = Math.floor((lastSeam - J.coilFirst) / p) + 1;
  const n = Math.max(1, Math.min(maxCoils, Math.round((bottom - top) / (p * k))));
  const H = Math.ceil(n * p);
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const canvas = scene.textures.createCanvas(key, W, H);
  const ctx = canvas.getContext();
  const r = p / 2;
  const reveal = (t) => {
    ctx.clearRect(0, 0, W, H);
    const done = t * n;
    for (let i = 0; i < n && i < done; i++) {
      const sy = lastSeam - i * p; // виток i снизу в картинке
      const dy = H - (i + 1) * p;  // и на холсте
      const end = W * Math.min(1, done - i);
      ctx.save();
      if (end < W) {
        ctx.beginPath();
        ctx.rect(0, dy, Math.max(0, end - r), p);
        ctx.ellipse(Math.max(0, end - r), dy + r, Math.min(r, end), r, 0, -Math.PI / 2, Math.PI / 2);
        ctx.clip();
      }
      ctx.drawImage(src, 0, sy, W, p, 0, dy, W, p);
      ctx.restore();
    }
    canvas.refresh();
  };
  reveal(1);
  const rope = scene.add.image(0, bottom, key).setOrigin(0.5, 1).setScale(k, (bottom - top) / H).setTint(color);
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
  const c = scene.add.container(0, 0, [rope, icon]);
  c.rope = rope;
  c.coils = n;
  c.reveal = reveal;
  c.icon = icon;
  c.iconScale = iconScale;
  return c;
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

// Текстуры для частиц: крошка, сердечко, звёздочка, конфетти. Если в src/assets есть картинка (fx_*.png) —
// берётся она, фигура кодом рисуется только для недостающих.
export function makeFxTextures(scene) {
  const g = scene.make.graphics({ add: false });
  const make = (key, size, draw) => {
    if (scene.textures.exists(key)) return;
    g.clear();
    g.save();
    g.translateCanvas(size[0] / 2, size[1] / 2);
    draw();
    g.restore();
    g.generateTexture(key, size[0], size[1]);
  };
  make('fx_dot', [16, 16], () => g.fillStyle(0xffffff, 1).fillCircle(0, 0, 8));
  make('fx_heart', [40, 40], () => {
    g.fillStyle(CONFIG.outline, 1);
    drawShape(g, 'heart', 19);
    g.fillStyle(0xff6b9a, 1);
    drawShape(g, 'heart', 14);
  });
  make('fx_star', [32, 32], () => {
    g.fillStyle(0xffffff, 1);
    drawShape(g, 'star', 15);
  });
  make('fx_confetti', [10, 16], () => g.fillStyle(0xffffff, 1).fillRect(-5, -8, 10, 16));
  g.destroy();
}
