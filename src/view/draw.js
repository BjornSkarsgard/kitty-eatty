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
  const r = Math.min(12, h * 0.25);
  const g = scene.add.graphics();
  g.fillStyle(fill, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
  g.fillStyle(0x000000, 0.12); // один тон тени снизу
  g.fillRoundedRect(-w / 2, h * 0.15, w, h * 0.35, { tl: 0, tr: 0, bl: r, br: r });
  g.fillStyle(0xffffff, 0.35); // белый блик
  g.fillRoundedRect(-w / 2 + 6, -h / 2 + 5, w * 0.3, h * 0.16, h * 0.08);
  g.lineStyle(4, CONFIG.outline, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, r);
  const parts = [g];
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
