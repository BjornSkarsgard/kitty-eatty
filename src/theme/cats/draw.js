// Отрисовка корма, когтеточки, света и частиц: где есть картинки из src/assets — спрайты, где нет — фигуры Phaser.Graphics.
import * as Phaser from 'phaser';
import { CONFIG } from '../../config.js';

// Значок формы корма с центром в (0, 0), s — «радиус».
function drawShape(g, shape, s) {
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
  p.layerW = w;
  p.layerH = h;
  return p;
}

// Скрытый корм «?»: серая подложка той же формы поверх порции и значок food_hidden.png (нет картинки — знак вопроса текстом)
// подложка — слой порции, подкрашенный (для слоя порции tint можно, CLAUDE.md). Кладётся в контейнер порции (p.cover).
export function makePortionCover(scene, p) {
  const B = CONFIG.blockers;
  const g = scene.add.graphics();
  const parts = [...makeLayer(scene, p.layerW, p.layerH, B.hiddenFill, g), g];
  if (scene.textures.exists('food_hidden')) { // значок «?» — как корм на подложке
    const img = scene.add.image(0, 0, 'food_hidden');
    img.setScale(Math.min((p.layerH * CONFIG.portion.iconHeight) / img.height, (p.layerW * CONFIG.portion.iconWidth) / img.width));
    const c = scene.add.container(0, 0, [...parts, img]);
    p.add(c);
    p.cover = c;
    return c;
  }
  parts.push(scene.add.text(0, 1, '?', {
    fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: `${Math.round(p.layerH * 0.7)}px`,
    color: '#ffffff', stroke: B.hiddenStroke, strokeThickness: Math.max(3, Math.round(p.layerH * 0.08)),
  }).setOrigin(0.5));
  const c = scene.add.container(0, 0, parts);
  p.add(c);
  p.cover = c;
  return c;
}

// Лёд поверх банки (стекло сзади и спереди уже есть): голубая полупрозрачная корка от горлышка до дна, блики-иней,
// снежинка и число — сколько ещё собрать банок. Пока без арта. r, dim — как у createJar. setCount(n) — число.
export function makeIceCover(scene, r, dim) {
  const B = CONFIG.blockers;
  if (scene.textures.exists('ice_cover')) return makeIceArt(scene, r, dim);
  const top = r.top - dim.neck * 0.6;
  const h = r.bottom - top;
  const w = dim.bw * 0.96;
  const g = scene.add.graphics();
  g.fillStyle(B.iceColor, B.iceAlpha).fillRoundedRect(-w / 2, top, w, h, w * 0.22);
  g.lineStyle(Math.max(3, w * 0.04), 0xffffff, 0.8).strokeRoundedRect(-w / 2, top, w, h, w * 0.22);
  g.fillStyle(0xffffff, 0.45);
  for (let k = 0; k < 4; k++) { // иней: косые блики
    const y = top + h * (0.15 + k * 0.22);
    g.fillTriangle(-w * 0.38, y, -w * 0.1, y - h * 0.05, -w * 0.32, y + h * 0.04);
  }
  const font = `"${CONFIG.font}", sans-serif`;
  const cy = top + h * 0.5;
  const flake = scene.add.text(0, cy - w * 0.32, '❄', { fontFamily: font, fontSize: `${Math.round(w * 0.5)}px`, color: '#ffffff' }).setOrigin(0.5);
  const num = scene.add.text(0, cy + w * 0.22, '', {
    fontFamily: font, fontStyle: 'bold', fontSize: `${Math.round(w * 0.42)}px`, color: '#ffffff', stroke: B.iceStroke, strokeThickness: Math.max(4, w * 0.07),
  }).setOrigin(0.5);
  const c = scene.add.container(r.x, 0, [g, flake, num]);
  c.setCount = (n) => { num.setText(String(n)); return c; };
  c.centerY = cy;
  return c;
}

// Лёд картинкой ice_cover.png: три куска, как у банки — горлышко над верхом стенок, стенки растянуты, донышко.
// Сверху — число, сколько ещё собрать банок.
function makeIceArt(scene, r, dim) {
  const B = CONFIG.blockers;
  const A = B.iceArt;
  const tex = scene.textures.get('ice_cover');
  const src = tex.getSourceImage();
  if (!tex.has('ice_top')) {
    tex.add('ice_top', 0, 0, 0, src.width, A.top);
    tex.add('ice_mid', 0, 0, A.top, src.width, A.bottom - A.top);
    tex.add('ice_bot', 0, 0, A.bottom, src.width, src.height - A.bottom);
  }
  const w = dim.bw * A.widen;
  const top = r.top - dim.neck;
  const midTop = r.top;
  const midBottom = r.bottom - dim.base;
  const parts = [
    scene.add.image(0, top, 'ice_cover', 'ice_top').setOrigin(0.5, 0).setDisplaySize(w, dim.neck),
    scene.add.image(0, midTop, 'ice_cover', 'ice_mid').setOrigin(0.5, 0).setDisplaySize(w, midBottom - midTop),
    scene.add.image(0, midBottom, 'ice_cover', 'ice_bot').setOrigin(0.5, 0).setDisplaySize(w, dim.base),
  ];
  parts.forEach((p) => p.setAlpha(A.alpha));
  const cy = (top + r.bottom) / 2;
  const num = scene.add.text(0, cy, '', {
    fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: `${Math.round(w * 0.5)}px`, color: '#ffffff',
    stroke: B.iceStroke, strokeThickness: Math.max(5, w * 0.08),
  }).setOrigin(0.5);
  const c = scene.add.container(r.x, 0, [...parts, num]);
  c.setCount = (n) => { num.setText(String(n)); return c; };
  c.centerY = cy;
  return c;
}

// Золотой ореол вокруг плитки: размытый силуэт portion_glow (tools/portion-glow.mjs) под плиткой, сложение цветов,
// прозрачность ведёт сцена. По ширине — не больше maxW (стекло банки), так что за банку свечение не выходит.
export function makePortionHalo(scene, p, color, maxW) {
  const key = 'portion_glow';
  if (!scene.textures.exists(key)) return null;
  const tex = scene.textures.get(key);
  const { width: W, height: H } = tex.getSourceImage();
  const pad = CONFIG.portion.glowPad;
  const cap = CONFIG.portion.layerCap + pad;
  if (!tex.has('l')) {
    tex.add('l', 0, 0, 0, cap, H);
    tex.add('m', 0, cap, 0, W - cap * 2, H);
    tex.add('r', 0, W - cap, 0, cap, H);
  }
  const k = p.layerH / (H - pad * 2);
  const h = H * k;
  const w = Math.min(p.layerW + pad * 2 * k, maxW);
  const cw = Math.min(cap * k, w / 2);
  const parts = [
    scene.add.image(-w / 2, 0, key, 'l').setOrigin(0, 0.5).setDisplaySize(cw, h),
    scene.add.image(-w / 2 + cw, 0, key, 'm').setOrigin(0, 0.5).setDisplaySize(Math.max(0, w - cw * 2), h),
    scene.add.image(w / 2 - cw, 0, key, 'r').setOrigin(0, 0.5).setDisplaySize(cw, h),
  ];
  parts.forEach((o) => o.setTint(color).setBlendMode(Phaser.BlendModes.ADD));
  const halo = scene.add.container(0, 0, parts).setAlpha(0);
  p.addAt(halo, 0); // под плиткой
  return halo;
}

// Мягкое белое пятно (к краям прозрачное) — свет, рассеянный стеклом. Делается один раз.
export function makeSoftTexture(scene) {
  if (scene.textures.exists('fx_soft')) return;
  const S = 128;
  const canvas = scene.textures.createCanvas('fx_soft', S, S);
  const ctx = canvas.getContext();
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  canvas.refresh();
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
// coilPitch), чуть растянутых по высоте, чтобы ровно закрыть стенку. Полная обмотка из n витков рисуется в текстуру
// один раз (jute_coils_<n>, общая для всех банок). container.reveal(t), t = 0…1 — витки по очереди снизу вверх,
// каждый идёт слева направо со скруглённым концом: открывается маской (фигуры, без перерисовки текстуры);
// при t = 1 маска снимается.
export function makeJuteWrap(scene, colorIndex, w, top, bottom) {
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
  const key = `jute_coils_${n}`;
  if (!scene.textures.exists(key)) {
    const canvas = scene.textures.createCanvas(key, W, H);
    const ctx = canvas.getContext();
    for (let i = 0; i < n; i++) ctx.drawImage(src, 0, lastSeam - i * p, W, p, 0, H - (i + 1) * p, W, p); // виток i снизу
    canvas.refresh();
  }
  const sy = (bottom - top) / H;
  const r = p / 2;
  // маска в координатах текстуры: та же фигура, что раньше вырезалась на холсте
  const mask = scene.make.graphics({ add: false }).setScale(k, sy);
  const reveal = (t) => {
    if (t >= 1) {
      if (rope.mask) rope.clearMask();
      return;
    }
    if (!rope.mask) rope.setMask(mask.createGeometryMask());
    mask.setPosition(c.x - (W * k) / 2, c.y + bottom - H * sy);
    mask.clear().fillStyle(0xffffff, 1);
    const done = t * n;
    for (let i = 0; i < n && i < done; i++) {
      const dy = H - (i + 1) * p;
      const end = W * Math.min(1, done - i);
      if (end >= W) {
        mask.fillRect(0, dy, W, p);
        continue;
      }
      const cx = Math.max(0, end - r);
      const rx = Math.min(r, end);
      mask.fillRect(0, dy, cx, p);
      mask.beginPath();
      mask.moveTo(cx, dy);
      for (let a = 0; a <= 16; a++) {
        const ang = -Math.PI / 2 + (Math.PI * a) / 16;
        mask.lineTo(cx + Math.cos(ang) * rx, dy + r + Math.sin(ang) * r);
      }
      mask.closePath();
      mask.fillPath();
    }
  };
  const rope = scene.add.image(0, bottom, key).setOrigin(0.5, 1).setScale(k, sy).setTint(color);
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
  c.once('destroy', () => mask.destroy());
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
