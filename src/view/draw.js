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
    case 'ring':
      g.lineStyle(s * 0.4, g.defaultFillColor, g.defaultFillAlpha);
      g.strokeCircle(0, 0, s * 0.75);
      break;
  }
}

// Порция корма: цветная плашка со значком формы.
export function makePortion(scene, colorIndex, w, h) {
  const { fill, shape } = CONFIG.colors[colorIndex];
  const g = scene.add.graphics();
  g.fillStyle(fill, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
  g.lineStyle(4, CONFIG.outline, 1);
  g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
  g.fillStyle(CONFIG.outline, 0.6);
  drawShape(g, shape, h * 0.3);
  const p = scene.add.container(0, 0, [g]);
  p.color = colorIndex;
  return p;
}

// Кот: тело, голова, уши, хвост + отдельный слой глаз, который меняется по настроению.
export function makeCat(scene, colorIndex) {
  const { fill } = CONFIG.colors[colorIndex];
  const o = CONFIG.outline;
  const g = scene.add.graphics();
  g.lineStyle(5, o, 1);
  g.fillStyle(fill, 1);
  // хвост
  g.fillRoundedRect(28, 10, 16, 46, 8);
  g.strokeRoundedRect(28, 10, 16, 46, 8);
  // тело
  g.fillEllipse(0, 30, 76, 56);
  g.strokeEllipse(0, 30, 76, 56);
  // уши
  g.fillTriangle(-30, -32, -24, -66, -6, -42);
  g.strokeTriangle(-30, -32, -24, -66, -6, -42);
  g.fillTriangle(30, -32, 24, -66, 6, -42);
  g.strokeTriangle(30, -32, 24, -66, 6, -42);
  // голова
  g.fillCircle(0, -22, 34);
  g.strokeCircle(0, -22, 34);
  // белое пятно на морде
  g.fillStyle(0xffffff, 0.85);
  g.fillEllipse(0, -8, 34, 20);

  const eyes = scene.add.graphics();
  const cat = scene.add.container(0, 0, [g, eyes]);
  cat.eyes = eyes;
  setCatMood(cat, 'open');
  return cat;
}

// mood: 'open' — ждёт, 'happy' — ест / сыт, 'grumpy' — ворчит.
export function setCatMood(cat, mood) {
  const e = cat.eyes;
  const o = CONFIG.outline;
  e.clear();
  e.lineStyle(5, o, 1);
  for (const x of [-13, 13]) {
    if (mood === 'happy') {
      e.beginPath();
      e.moveTo(x - 8, -24);
      e.lineTo(x, -32);
      e.lineTo(x + 8, -24);
      e.strokePath();
    } else {
      e.fillStyle(0xffffff, 1);
      e.fillCircle(x, -28, 8);
      e.fillStyle(o, 1);
      e.fillCircle(x, -27, 4);
      if (mood === 'grumpy') {
        e.lineBetween(x - 9, -34, x + 9, -30 + (x < 0 ? 0 : -4));
      }
    }
  }
}
