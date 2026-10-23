import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CatView } from '../view/CatView.js';
import { sfx, music } from '../audio.js';
import { counterPill, tabBar } from '../view/ui.js';
import { addSettingsMenu } from '../view/settings.js';
import { mainTabs } from './HomeScene.js';
import { unlockedLevel, levelStars, coins } from '../save.js';
import LEVELS from '../levels/levels.json';

const M = CONFIG.map;
const W = CONFIG.width;
const H = CONFIG.height;
const N = LEVELS.length;
const worldH = M.padBottom + M.padTop + (N - 1) * M.spacing;

// Где на карте уровень i (0 — первый, внизу).
function nodePos(i) {
  return { x: W / 2 + Math.sin(i * M.wave) * M.amplitude, y: worldH - M.padBottom - i * M.spacing };
}

// Карта уровней: тропинка из следов лапок снизу вверх, уровни — кружки с номером и звёздами,
// на самом дальнем открытом сидит кот. На экране держим только видимые уровни: 300 штук сразу — тяжело для слабого Android.
export class MapScene extends Phaser.Scene {
  constructor() {
    super('Map');
  }

  create() {
    this.current = unlockedLevel(N); // край прогресса: здесь кот, дальше — закрыто
    this.cameras.main.setBackgroundColor(M.background).setBounds(0, 0, W, worldH);
    this.views = new Map(); // индекс уровня → его объекты на сцене
    this.velocity = 0;
    this.drag = null;

    const cy = nodePos(this.current).y;
    this.cameras.main.scrollY = Phaser.Math.Clamp(cy - H * M.currentAt, 0, worldH - H);
    this.refresh();
    this.setupInput();
    const U = CONFIG.ui;
    counterPill(this, 30 + U.pillWidth / 2, U.topY, 'coin', coins(), { depth: 10 }).setScrollFactor(0);
    addSettingsMenu(this);
    tabBar(this, mainTabs(), 'Map');
    music(this, 'music_game');
  }

  // ---------- прокрутка и тап ----------

  setupInput() {
    const cam = this.cameras.main;
    this.input.on('pointerdown', (p, over) => {
      if (over.length) return; // нажали кнопку поверх карты
      this.drag = { startY: p.y, lastY: p.y, lastT: p.event.timeStamp, moved: false };
      this.velocity = 0;
    });
    this.input.on('pointermove', (p) => {
      const d = this.drag;
      if (!d || !p.isDown) return;
      if (!d.moved && Math.abs(p.y - d.startY) < M.dragThreshold) return;
      d.moved = true;
      const dt = Math.max(1, p.event.timeStamp - d.lastT);
      this.velocity = ((d.lastY - p.y) / dt) * 16.7; // px за кадр
      cam.scrollY += d.lastY - p.y;
      d.lastY = p.y;
      d.lastT = p.event.timeStamp;
    });
    this.input.on('pointerup', (p) => {
      const d = this.drag;
      this.drag = null;
      if (d && !d.moved) this.tapAt(p.worldX, p.worldY);
    });
    this.input.on('wheel', (p, objs, dx, dy) => { cam.scrollY += dy; });
  }

  tapAt(x, y) {
    for (const [i, v] of this.views) {
      if (Phaser.Math.Distance.Between(x, y, v.node.x, v.node.y) > M.nodeSize * 0.6) continue;
      if (i > this.current) {
        sfx(this, 'sfx_invalid');
        this.tweens.add({ targets: v.node, x: v.node.x + 8, duration: 50, yoyo: true, repeat: 2 });
        return;
      }
      sfx(this, 'sfx_button');
      this.tweens.add({ targets: v.node, scale: v.node.scale * 0.9, duration: 70, yoyo: true,
        onComplete: () => this.scene.start('Game', { levelIndex: i }) });
      return;
    }
  }

  update() {
    const cam = this.cameras.main;
    if (!this.drag && Math.abs(this.velocity) > 0.2) {
      cam.scrollY += this.velocity;
      this.velocity *= M.friction;
    }
    cam.scrollY = Phaser.Math.Clamp(cam.scrollY, 0, worldH - H);
    this.refresh();
  }

  // ---------- видимые уровни ----------

  // Создаёт уровни, попавшие на экран (с запасом), и убирает ушедшие.
  refresh() {
    const top = this.cameras.main.scrollY - M.spacing;
    const bottom = top + H + 2 * M.spacing;
    const from = Math.max(0, Math.floor((worldH - M.padBottom - bottom) / M.spacing));
    const to = Math.min(N - 1, Math.ceil((worldH - M.padBottom - top) / M.spacing));
    for (const [i, v] of this.views) {
      if (i < from || i > to) {
        v.parts.forEach((o) => o.destroy());
        this.views.delete(i);
      }
    }
    for (let i = from; i <= to; i++) if (!this.views.has(i)) this.views.set(i, this.makeLevel(i));
  }

  makeLevel(i) {
    const parts = [];
    const p = nodePos(i);
    // следы лапок до следующего уровня, носками вперёд по тропинке
    if (i < N - 1 && this.textures.exists('paw')) {
      const q = nodePos(i + 1);
      const angle = Phaser.Math.Angle.Between(p.x, p.y, q.x, q.y) + Math.PI / 2;
      const scale = M.pawSize / this.textures.get('paw').getSourceImage().width;
      // только в просвете между краями кружков, чтобы следы не прятались под ними
      const gap = ((M.nodeSize + M.pawSize) / 2) / Phaser.Math.Distance.Between(p.x, p.y, q.x, q.y);
      for (let k = 1; k <= M.pawsBetween; k++) {
        const t = gap + (1 - 2 * gap) * ((k - 0.5) / M.pawsBetween);
        const side = (k % 2 ? -1 : 1) * 10; // лево-право, как настоящие следы
        const nx = Math.cos(angle) * side;
        const ny = Math.sin(angle) * side;
        parts.push(this.add.image(Phaser.Math.Linear(p.x, q.x, t) + nx, Phaser.Math.Linear(p.y, q.y, t) + ny, 'paw')
          .setScale(scale).setRotation(angle).setTint(M.pawColor).setAlpha(M.pawAlpha).setDepth(1));
      }
    }

    const level = LEVELS[i];
    const stars = levelStars(level);
    const state = i === this.current ? 'current' : i < this.current ? 'done' : 'locked';
    const node = this.add.container(p.x, p.y).setDepth(2);
    node.add(this.makeNodeFace(state, level.puzzle));
    node.add(this.add.text(0, -2, String(level.id), {
      fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '46px',
      color: state === 'locked' ? '#8d7b6a' : '#ffffff', stroke: '#6b3d1f', strokeThickness: state === 'locked' ? 0 : 8,
    }).setOrigin(0.5));
    parts.push(node);

    if (stars > 0) {
      for (let k = 0; k < 3; k++) {
        const key = k < stars ? 'ui_star' : 'ui_star_empty';
        if (!this.textures.exists(key)) continue;
        const img = this.add.image(p.x + (k - 1) * M.starSize * 0.95, p.y + M.nodeSize * 0.52 + (k === 1 ? 4 : 0), key);
        parts.push(img.setScale(M.starSize / img.width).setDepth(3));
      }
    }

    if (state === 'current') {
      node.setScale(M.currentScale);
      parts.push(this.makeCat(p.x, p.y - M.nodeSize * (0.5 - M.catOverlap) * M.currentScale - 40 * M.catScale));
      this.tweens.add({ targets: node, scale: M.currentScale * M.currentPulse, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return { node, parts };
  }

  // Кружок-заглушка: печенька с тёмным краем и бликом сверху слева. Картинки map_node*.png — позже.
  makeNodeFace(state, puzzle) {
    const key = state === 'locked' ? 'map_node_locked' : state === 'current' ? 'map_node_current' : puzzle ? 'map_node_puzzle' : 'map_node';
    if (this.textures.exists(key)) {
      const img = this.add.image(0, 0, key);
      return img.setScale(M.nodeSize / Math.max(img.width, img.height));
    }
    const C = M.colors;
    const fill = state === 'locked' ? C.locked : state === 'current' ? C.current : puzzle ? C.puzzle : C.done;
    const r = M.nodeSize / 2;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18).fillCircle(4, 8, r);         // тень
    g.fillStyle(C.edge, 1).fillCircle(0, 0, r);
    g.fillStyle(fill, 1).fillCircle(0, -3, r - 8);
    g.fillStyle(0xffffff, 0.35).fillEllipse(-r * 0.3, -r * 0.42, r * 0.7, r * 0.35); // блик
    return g;
  }

  // Кот на текущем уровне — голова выглядывает из-за кружка и качается.
  makeCat(x, y) {
    const cat = new CatView(this, x, y, M.catColor, { headOnly: true }).setMood('happy').setDepth(4);
    cat.setScale(M.catScale);
    this.tweens.add({ targets: cat, angle: { from: -6, to: 6 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return cat;
  }
}
