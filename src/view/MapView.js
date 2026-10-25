import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CatView } from '../theme/cats/CatView.js';
import { sfx } from '../audio.js';
import { unlockedLevel, selectedSkin, milestonesDone } from '../core/save.js';
import { milestoneAt } from '../core/milestones.js';
import { closedBox } from './ChestView.js';
import { LEVELS } from '../core/levels.js';
import { kindBadge } from './ui.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

const M = CONFIG.map;
const W = CONFIG.width;
const H = CONFIG.height;
const N = LEVELS.length;
const mapH = M.padBottom + M.padTop + (N - 1) * M.spacing;

// Где на карте уровень i (0 — первый, внизу), в координатах карты.
function nodePos(i) {
  return { x: W / 2 + Math.sin(i * M.wave) * M.amplitude, y: mapH - M.padBottom - i * M.spacing };
}

// Карта уровней внутри контейнера: окно шириной с экран, высотой viewH, которое можно уменьшить (рамка на стене)
// и плавно развернуть на весь экран — это одна и та же карта, меняются только масштаб и высота окна, без скачков.
// Текущий уровень — в середине окна.
// Тропинка из следов лапок снизу вверх, кружки с номером (под сложными — табличка), у рубежей — подарок
// (в конце главы — сундук), пока награда не забрана; на самом дальнем открытом сидит кот.
// На сцене только видимые уровни: 300 штук сразу — тяжело для слабого Android.
export class MapView {
  constructor(scene, x, y, scale, viewH = H) {
    this.scene = scene;
    this.current = unlockedLevel(N); // край прогресса: здесь кот, дальше — закрыто
    this.root = scene.add.container(x, y).setScale(scale);
    this.viewH = viewH; // высота окна в координатах карты; меняется твином при разворачивании
    this.bg = scene.add.rectangle(0, 0, W, H, M.background); // тянется по высоте окна, если оно выше экрана
    this.root.add(this.bg);
    this.content = scene.add.container(-W / 2, 0);
    // слои, чтобы следы всегда были под кружками, а звёзды и кот — над ними
    this.layers = [0, 1, 2].map(() => scene.add.container(0, 0));
    this.content.add(this.layers);
    this.root.add(this.content);
    this.maskShape = scene.make.graphics({}, false);
    this.root.setMask(this.maskShape.createGeometryMask());
    this.views = new Map();
    this.velocity = 0;
    this.setScroll(nodePos(this.current).y - H / 2);
  }

  // scroll — верх окна высотой с экран в координатах карты (середина окна — scroll + H / 2).
  // Окно выше экрана (карта на весь экран из рамки на стене) не выходит за края карты.
  setScroll(s) {
    const e = Math.max(0, (this.viewH - H) / 2);
    this.scroll = Phaser.Math.Clamp(s, e, Math.max(e, mapH - H - e));
    this.content.y = -this.scroll - H / 2;
    this.refresh();
  }

  // Прямоугольник окна в мире (для маски и попадания пальцем).
  bounds() {
    const r = this.root;
    return new Phaser.Geom.Rectangle(r.x - (W / 2) * r.scale, r.y - (this.viewH / 2) * r.scale, W * r.scale, this.viewH * r.scale);
  }

  // Каждый кадр: инерция прокрутки; маска перерисовывается, только когда окно карты сдвинулось или изменилось.
  update(dragging) {
    if (!dragging && Math.abs(this.velocity) > 0.2) {
      this.setScroll(this.scroll + this.velocity);
      this.velocity *= M.friction;
    }
    const fullH = Math.max(H, this.viewH);
    if (this.bg.scaleY !== fullH / H) {
      this.bg.scaleY = fullH / H;
      this.setScroll(this.scroll);
    }
    const b = this.bounds();
    if (this.maskRect && Phaser.Geom.Rectangle.Equals(b, this.maskRect)) return;
    this.maskRect = b;
    this.maskShape.clear().fillStyle(PAL.white).fillRect(b.x, b.y, b.width, b.height);
  }

  // Тап по точке мира: уровень открыт — запуск, закрыт — покачивание.
  tapAt(wx, wy) {
    const r = this.root;
    const lx = (wx - r.x) / r.scale + W / 2;
    const ly = (wy - r.y) / r.scale + H / 2 + this.scroll;
    for (const [i, v] of this.views) {
      if (Phaser.Math.Distance.Between(lx, ly, v.node.x, v.node.y) > M.nodeSize * 0.6) continue;
      if (i > this.current) {
        sfx(this.scene, 'sfx_invalid');
        this.scene.tweens.add({ targets: v.node, x: v.node.x + 8, duration: 50, yoyo: true, repeat: 2 });
        return;
      }
      sfx(this.scene, 'sfx_button');
      this.scene.tweens.add({ targets: v.node, scale: v.node.scale * 0.9, duration: 70, yoyo: true,
        onComplete: () => this.scene.startLevel(i) });
      return;
    }
  }

  // Пересоздать все видимые уровни (забрали награды рубежей — подарки с карты пропадают).
  redraw() {
    for (const v of this.views.values()) v.parts.forEach((o) => o.destroy());
    this.views.clear();
    this.refresh();
  }

  // Создаёт уровни, попавшие в окно (с запасом), и убирает ушедшие.
  refresh() {
    const half = Math.max(H, this.viewH) / 2;
    const top = this.scroll + H / 2 - half - M.spacing;
    const bottom = this.scroll + H / 2 + half + M.spacing;
    const from = Math.max(0, Math.floor((mapH - M.padBottom - bottom) / M.spacing));
    const to = Math.min(N - 1, Math.ceil((mapH - M.padBottom - top) / M.spacing));
    for (const [i, v] of this.views) {
      if (i < from || i > to) {
        v.parts.forEach((o) => o.destroy());
        this.views.delete(i);
      }
    }
    for (let i = from; i <= to; i++) if (!this.views.has(i)) this.views.set(i, this.makeLevel(i));
  }

  makeLevel(i) {
    const scene = this.scene;
    const [paws, nodes, top] = this.layers;
    const parts = [];
    const p = nodePos(i);
    // следы лапок до следующего уровня, носками вперёд по тропинке
    if (i < N - 1 && scene.textures.exists('paw')) {
      const q = nodePos(i + 1);
      const angle = Phaser.Math.Angle.Between(p.x, p.y, q.x, q.y) + Math.PI / 2;
      const scale = M.pawSize / scene.textures.get('paw').getSourceImage().width;
      // только в просвете между краями кружков, чтобы следы не прятались под ними
      const gap = ((M.nodeSize + M.pawSize) / 2) / Phaser.Math.Distance.Between(p.x, p.y, q.x, q.y);
      for (let k = 1; k <= M.pawsBetween; k++) {
        const t = gap + (1 - 2 * gap) * ((k - 0.5) / M.pawsBetween);
        const side = (k % 2 ? -1 : 1) * 10; // лево-право, как настоящие следы
        const img = scene.add.image(Phaser.Math.Linear(p.x, q.x, t) + Math.cos(angle) * side,
          Phaser.Math.Linear(p.y, q.y, t) + Math.sin(angle) * side, 'paw')
          .setScale(scale).setRotation(angle).setTint(M.pawColor).setAlpha(M.pawAlpha);
        paws.add(img);
        parts.push(img);
      }
    }

    const level = LEVELS[i];
    const state = i === this.current ? 'current' : i < this.current ? 'done' : 'locked';
    const node = scene.add.container(p.x, p.y);
    node.add(this.makeNodeFace(state, level.puzzle));
    node.add(scene.add.text(0, -2, String(level.id), {
      fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '46px',
      color: state === 'locked' ? PAL.textMapLocked : PAL.text, stroke: PAL.textBrown, strokeThickness: state === 'locked' ? 0 : 8,
    }).setOrigin(0.5));
    nodes.add(node);
    parts.push(node);

    if (level.kind) {
      const badge = kindBadge(scene, p.x, p.y + M.nodeSize * M.kindBadgeY, level.kind, STR.kindShort[level.kind], M.kindBadgeSize);
      top.add(badge);
      parts.push(badge);
    }

    const ms = milestoneAt(level.id);
    if (ms && ms.id > milestonesDone()) {
      // сбоку от кружка, к середине карты — там тропинка не мешает
      const side = p.x > W / 2 ? -1 : 1;
      const box = closedBox(scene, ms.chapter ? 'chest' : 'gift', M.milestoneSize)
        .setPosition(p.x + side * M.nodeSize * M.milestoneX, p.y - M.nodeSize * 0.1);
      top.add(box);
      parts.push(box);
      scene.tweens.add({ targets: box, y: box.y - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }

    if (state === 'current') {
      node.setScale(M.currentScale);
      const cat = this.makeCat(p.x, p.y - M.nodeSize * (0.5 - M.catOverlap) * M.currentScale - 40 * M.catScale);
      top.add(cat);
      parts.push(cat);
      scene.tweens.add({ targets: node, scale: M.currentScale * M.currentPulse, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return { node, parts };
  }

  // Кружок уровня: картинка map_node*.png или заглушка-печенька кодом.
  makeNodeFace(state, puzzle) {
    const scene = this.scene;
    const key = state === 'locked' ? 'map_node_locked' : state === 'current' ? 'map_node_current' : puzzle ? 'map_node_puzzle' : 'map_node';
    if (scene.textures.exists(key)) {
      const img = scene.add.image(0, 0, key);
      return img.setScale(M.nodeSize / Math.max(img.width, img.height));
    }
    const C = M.colors;
    const fill = state === 'locked' ? C.locked : state === 'current' ? C.current : puzzle ? C.puzzle : C.done;
    const r = M.nodeSize / 2;
    const g = scene.add.graphics();
    g.fillStyle(PAL.black, 0.18).fillCircle(4, 8, r);
    g.fillStyle(C.edge, 1).fillCircle(0, 0, r);
    g.fillStyle(fill, 1).fillCircle(0, -3, r - 8);
    g.fillStyle(PAL.white, 0.35).fillEllipse(-r * 0.3, -r * 0.42, r * 0.7, r * 0.35);
    return g;
  }

  // Кот на текущем уровне — голова выглядывает из-за кружка и качается.
  makeCat(x, y) {
    const cat = new CatView(this.scene, x, y, selectedSkin(), { headOnly: true }).setMood('happy');
    cat.setScale(M.catScale);
    this.scene.tweens.add({ targets: cat, angle: { from: -6, to: 6 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return cat;
  }
}
