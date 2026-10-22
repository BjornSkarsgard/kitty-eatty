import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { sfx, sfxRandom } from '../audio.js';

const C = CONFIG.cat;

// Кот из частей: хвост, тело, голова (с глазами, ртом, пятном). Если в src/assets есть картинки частей —
// используются они (тело/голова/хвост перекрашиваются tint'ом), иначе — временные фигуры.
export class CatView extends Phaser.GameObjects.Container {
  constructor(scene, x, y, colorIndex, { headOnly = false } = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    this.fill = CONFIG.colors[colorIndex].fill;
    this.baseScale = 1;
    this.mood = 'open';
    this.actions = [];
    this.idle = [];
    this.useArt = scene.textures.exists('cat_head');

    if (!headOnly) {
      this.tail = this.part('tail', C.tail);
      this.body = this.part('body', C.body);
      this.bodySpots = this.useArt ? this.image('cat_spots_body', C.body, false) : null;
    }
    this.head = scene.add.container(C.head.x, C.head.y);
    this.add(this.head);
    this.headY = C.head.y;
    this.buildHead();
    this.setMood('open');
    this.setMouth(false);
  }

  // ---------- сборка ----------

  image(key, cfg, tint, parent = this) {
    if (!this.scene.textures.exists(key)) return null;
    const img = this.scene.add.image(cfg.artX ?? 0, cfg.artY ?? 0, key).setScale(cfg.artScale);
    if (cfg.originX !== undefined) img.setOrigin(cfg.originX, cfg.originY);
    if (tint) img.setTint(this.fill);
    parent.add(img);
    return img;
  }

  // Часть тела в своём контейнере: точка контейнера — ось вращения (основание хвоста и т.п.).
  part(name, cfg) {
    const box = this.scene.add.container(cfg.x, cfg.y);
    this.add(box);
    if (this.useArt && this.image(`cat_${name}`, cfg, true, box)) return box;
    const g = this.scene.add.graphics();
    drawFallback[name](g, this.fill);
    box.add(g);
    return box;
  }

  buildHead() {
    const h = this.head;
    if (this.useArt) {
      this.image('cat_head', C.head, true, h);
      this.image('cat_spots_head', C.head, false, h);
    } else {
      const g = this.scene.add.graphics();
      drawFallback.head(g, this.fill);
      h.add(g);
    }
    this.eyes = this.scene.add.container(C.eyes.x, C.eyes.y);
    this.mouth = this.scene.add.container(C.mouth.x, C.mouth.y);
    h.add([this.eyes, this.mouth]);
  }

  // Слой с вариантами (глаза, рот): картинка, если есть, иначе фигура.
  swapLayer(layer, key, cfg, fallback) {
    layer.removeAll(true);
    if (this.useArt && this.scene.textures.exists(key)) {
      layer.add(this.scene.add.image(0, 0, key).setScale(cfg.artScale));
    } else {
      const g = this.scene.add.graphics();
      fallback(g);
      layer.add(g);
    }
  }

  // mood: 'open' — ждёт, 'happy' — ест/сыт, 'grumpy' — ворчит, 'closed' — моргает/спит.
  setMood(mood) {
    this.mood = mood;
    this.showEyes(mood);
    return this;
  }

  showEyes(kind) {
    this.swapLayer(this.eyes, `cat_eyes_${kind}`, C.eyes, (g) => drawEyes(g, kind));
  }

  setMouth(open) {
    this.swapLayer(this.mouth, open ? 'cat_mouth_open' : 'cat_mouth_closed', C.mouth, (g) => drawMouth(g, open));
    return this;
  }

  setBaseScale(s) {
    this.baseScale = s;
    return this.setScale(s);
  }

  // ---------- анимации ----------

  // Фон: дыхание, хвост, моргание. Не мешает действиям.
  startIdle() {
    this.stopIdle();
    const A = CONFIG.anim;
    if (this.body) {
      this.idle.push(this.scene.tweens.add({
        targets: this.body, scaleY: 1 + A.idleBreath, duration: A.idleBreathDuration,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      }));
    }
    if (this.tail) {
      this.tail.angle = -A.idleTailAngle;
      this.idle.push(this.scene.tweens.add({
        targets: this.tail, angle: A.idleTailAngle, duration: A.idleTailDuration,
        yoyo: true, repeat: -1, ease: 'Sine.easeInOut', delay: Math.random() * 400,
      }));
    }
    const blink = () => {
      const ev = this.scene.time.delayedCall(Phaser.Math.Between(A.blinkMin, A.blinkMax), () => {
        if (this.mood === 'open') {
          this.showEyes('closed');
          this.blinkBack = this.scene.time.delayedCall(A.blinkDuration, () => this.showEyes(this.mood));
        }
        blink();
      });
      this.blinkTimer = ev;
    };
    blink();
    return this;
  }

  stopIdle() {
    this.idle.forEach(safeRemove);
    this.idle = [];
    [this.blinkTimer, this.blinkBack].forEach((t) => t && safeRemove(t));
    this.blinkTimer = this.blinkBack = null;
    if (this.body) this.body.scaleY = 1;
  }

  track(t) {
    if (this.actions.length > 32) this.actions = this.actions.filter((a) => a.isPlaying?.() || a.getProgress?.() < 1);
    this.actions.push(t);
    return t;
  }

  // Прервать всё, что кот делает (например, отменили ход, который собрал банку).
  stopActions() {
    this.actions.forEach(safeRemove);
    this.actions = [];
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.killTweensOf(this.head);
    this.head.y = this.headY;
    this.head.angle = 0;
    this.setScale(this.baseScale);
    this.setMouth(false);
    return this;
  }

  meow() {
    sfxRandom(this.scene, 'sfx_meow', 3);
    this.setMouth(true);
    this.track(this.scene.time.delayedCall(CONFIG.anim.meowDuration, () => this.setMouth(false)));
  }

  // Прыжок дугой в точку.
  hopTo(x, y, onDone) {
    const A = CONFIG.anim;
    const x0 = this.x;
    const y0 = this.y;
    const height = A.hopHeight * this.baseScale;
    const dist = Phaser.Math.Distance.Between(x0, y0, x, y);
    const duration = Math.max(A.hopMinDuration, dist / A.hopSpeed * 1000);
    this.track(this.scene.tweens.add({
      targets: this, x, duration, ease: 'Sine.easeInOut',
      onUpdate: (tw) => {
        const p = tw.progress;
        this.y = y0 + (y - y0) * p - Math.sin(Math.PI * p) * height;
      },
      onComplete: () => {
        this.y = y;
        this.squash();
        if (onDone) onDone();
      },
    }));
  }

  squash() {
    const s = this.baseScale;
    const A = CONFIG.anim;
    this.track(this.scene.tweens.add({
      targets: this, scaleX: s * (1 + A.squash), scaleY: s * (1 - A.squash),
      duration: A.squashDuration, yoyo: true, ease: 'Quad.easeOut',
    }));
  }

  // n укусов: голова ныряет в банку, на дне каждого нырка — onBite(k).
  eat(n, onBite, onDone) {
    const A = CONFIG.anim;
    let k = 0;
    const bite = () => {
      this.track(this.scene.tweens.add({
        targets: this.head,
        y: this.headY + A.eatDip,
        angle: (k % 2 ? 1 : -1) * A.eatTilt,
        duration: A.eatPerPortion * 0.35,
        hold: A.eatPerPortion * 0.15,
        yoyo: true,
        ease: 'Sine.easeInOut',
        onYoyo: () => {
          this.setMouth(true);
          sfx(this.scene, 'sfx_chew', 0.8);
          onBite(k);
        },
        onComplete: () => {
          this.setMouth(false);
          k++;
          if (k < n) bite();
          else if (onDone) onDone();
        },
      }));
    };
    bite();
  }
}

// Твин или таймер мог уже завершиться и уничтожиться — это не ошибка.
function safeRemove(t) {
  try {
    t.remove();
  } catch (e) {
    // уже удалён
  }
}

// ---------- временная графика (пока нет арта) ----------
// Координаты — относительно контейнера части (см. CONFIG.cat).

const O = () => CONFIG.outline;

const drawFallback = {
  tail(g, fill) {
    g.lineStyle(5, O(), 1).fillStyle(fill, 1);
    g.fillRoundedRect(-8, -46, 16, 46, 8);
    g.strokeRoundedRect(-8, -46, 16, 46, 8);
  },
  body(g, fill) {
    g.lineStyle(5, O(), 1).fillStyle(fill, 1);
    g.fillEllipse(0, 0, 76, 56);
    g.strokeEllipse(0, 0, 76, 56);
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(0, 6, 30, 22);
  },
  head(g, fill) {
    g.lineStyle(5, O(), 1).fillStyle(fill, 1);
    g.fillTriangle(-30, -10, -24, -44, -6, -20);
    g.strokeTriangle(-30, -10, -24, -44, -6, -20);
    g.fillTriangle(30, -10, 24, -44, 6, -20);
    g.strokeTriangle(30, -10, 24, -44, 6, -20);
    g.fillCircle(0, 0, 34);
    g.strokeCircle(0, 0, 34);
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(0, 14, 34, 20);
  },
};

function drawEyes(g, kind) {
  const o = O();
  g.lineStyle(5, o, 1);
  for (const x of [-13, 13]) {
    if (kind === 'happy') {
      g.beginPath();
      g.moveTo(x - 8, 4);
      g.lineTo(x, -4);
      g.lineTo(x + 8, 4);
      g.strokePath();
    } else if (kind === 'closed') {
      g.lineBetween(x - 8, 0, x + 8, 0);
    } else {
      g.fillStyle(0xffffff, 1).fillCircle(x, 0, 8);
      g.fillStyle(o, 1).fillCircle(x, 1, 4);
      if (kind === 'grumpy') g.lineBetween(x - 9, -6, x + 9, x < 0 ? -2 : -10);
    }
  }
}

function drawMouth(g, open) {
  const o = O();
  g.fillStyle(o, 1).fillTriangle(-4, -4, 4, -4, 0, 1);
  if (open) {
    g.fillStyle(0x8a2a3a, 1).fillEllipse(0, 7, 12, 10);
    g.lineStyle(3, o, 1).strokeEllipse(0, 7, 12, 10);
  } else {
    g.lineStyle(3, o, 1);
    g.beginPath();
    g.arc(-4, 2, 4, 0, Math.PI, false);
    g.strokePath();
    g.beginPath();
    g.arc(4, 2, 4, 0, Math.PI, false);
    g.strokePath();
  }
}
