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
      // пятно на грудке — внутри контейнера тела, чтобы «дышало» вместе с ним
      if (this.scene.textures.exists('cat_body') && this.useArt && !this.image('cat_spots_body', C.body, false, this.body)) {
        const g = this.scene.add.graphics();
        drawFallback.chest(g);
        this.body.add(g);
      }
      this.legs = [-1, 1].map((side) => this.makeLeg(side));
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
    const img = this.scene.add.image(cfg.artX ?? 0, cfg.artY ?? 0, key).setScale(cfg.artScaleX ?? cfg.artScale, cfg.artScale);
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

  // Передняя лапа: контейнер в «плече» (ось шага), лапа свисает вниз. Правая — зеркальная копия левой.
  makeLeg(side) {
    const box = this.scene.add.container(side * C.leg.x, C.leg.y);
    this.add(box);
    const img = this.useArt ? this.image('cat_leg', C.leg, true, box) : null;
    if (img) {
      if (side > 0) img.setFlipX(true);
    } else {
      const g = this.scene.add.graphics();
      drawFallback.leg(g, this.fill);
      if (side > 0) g.setScale(-1, 1);
      box.add(g);
    }
    return box;
  }

  resetLegs() {
    if (!this.legs) return;
    this.legs.forEach((leg) => {
      leg.y = C.leg.y;
      leg.angle = 0;
    });
  }

  buildHead() {
    const h = this.head;
    if (this.useArt) {
      this.image('cat_head', C.head, true, h);
      // пятно на морде: картинка, если есть, иначе временное белое пятно
      if (!this.image('cat_spots_head', C.head, false, h)) {
        const g = this.scene.add.graphics();
        drawFallback.muzzle(g);
        h.add(g);
      }
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
  // variant — имя варианта (open, grumpy…): у каждого может быть свой множитель в cfg.variantScale
  swapLayer(layer, key, cfg, fallback, variant) {
    layer.removeAll(true);
    if (this.useArt && this.scene.textures.exists(key)) {
      const k = cfg.variantScale?.[variant] ?? 1;
      layer.add(this.scene.add.image(0, 0, key).setScale(cfg.artScale * k));
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
    this.swapLayer(this.eyes, `cat_eyes_${kind}`, C.eyes, (g) => drawEyes(g, kind), kind);
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
    this.scene.tweens.killTweensOf([this, this.head, this.eyes]);
    this.head.y = this.headY;
    this.head.angle = 0;
    this.eyes.setScale(1);
    this.angle = 0;
    this.resetLegs();
    this.setScale(this.baseScale);
    this.setMouth(false);
    if (this.reacting) {
      this.reacting = false;
      this.setMood(this.moodBeforePoke);
      this.startIdle();
    }
    return this;
  }

  // ---------- реакции на тап ----------

  // Реагирует, только если сидит на своём месте и ничем не занят.
  canReact() {
    return !this.reacting && this.home &&
      Math.abs(this.x - this.home.x) < 2 && Math.abs(this.y - this.home.y) < 2;
  }

  poke() {
    if (!this.canReact()) return;
    this.reacting = true;
    this.moodBeforePoke = this.mood;
    this.stopIdle();
    if (this.tail) this.tail.angle = 0;
    const kinds = ['jump', 'nope', 'purr', 'flip', 'scared'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    this[`react_${kind}`](() => {
      this.reacting = false;
      this.angle = 0;
      this.setScale(this.baseScale);
      this.head.y = this.headY;
      this.head.angle = 0;
      this.eyes.setScale(1);
      this.setMouth(false).setMood(this.moodBeforePoke);
      this.startIdle();
    });
  }

  // 1. Прыжок на месте с мяу.
  react_jump(done) {
    const P = CONFIG.anim.poke;
    this.meow();
    this.setMood('happy');
    this.track(this.scene.tweens.add({
      targets: this, y: this.home.y - P.jumpHeight * this.baseScale,
      duration: P.jumpDuration, yoyo: true, ease: 'Quad.easeOut',
      onComplete: () => {
        this.squash();
        this.track(this.scene.time.delayedCall(CONFIG.anim.squashDuration * 2, done));
      },
    }));
  }

  // 2. «Нет-нет»: ворчит и мотает головой.
  react_nope(done) {
    const P = CONFIG.anim.poke;
    this.setMood('grumpy');
    sfx(this.scene, 'sfx_invalid', 0.6);
    this.track(this.scene.tweens.add({
      targets: this.head, angle: { from: -P.nopeAngle, to: P.nopeAngle },
      duration: P.nopeDuration, yoyo: true, repeat: P.nopeRepeat, ease: 'Sine.easeInOut',
      onComplete: () => {
        this.head.angle = 0;
        this.track(this.scene.time.delayedCall(P.hold, done));
      },
    }));
  }

  // 3. Мурлыканье: жмурится, прижимается, сердечки.
  react_purr(done) {
    const P = CONFIG.anim.poke;
    this.setMood('happy');
    sfx(this.scene, 'sfx_purr');
    const s = this.baseScale;
    this.track(this.scene.tweens.add({
      targets: this, scaleX: s * 1.08, scaleY: s * 0.92,
      duration: P.purrDuration, yoyo: true, repeat: 2, ease: 'Sine.easeInOut',
      onComplete: done,
    }));
    this.track(this.scene.tweens.add({ targets: this.head, angle: P.purrTilt, duration: P.purrDuration * 2, yoyo: true, ease: 'Sine.easeInOut' }));
    for (let i = 0; i < P.purrHearts; i++) this.heart(i * 160);
  }

  // 4. Кувырок: подпрыгивает и крутится в воздухе.
  react_flip(done) {
    const P = CONFIG.anim.poke;
    this.meow();
    this.setMood('happy');
    this.track(this.scene.tweens.add({
      targets: this, y: this.home.y - P.flipHeight * this.baseScale,
      duration: P.flipDuration / 2, yoyo: true, ease: 'Quad.easeOut',
    }));
    this.track(this.scene.tweens.add({
      targets: this, angle: 360, duration: P.flipDuration, ease: 'Sine.easeInOut',
      onComplete: () => {
        this.angle = 0;
        this.squash();
        this.track(this.scene.time.delayedCall(CONFIG.anim.squashDuration * 2, done));
      },
    }));
  }

  // 5. Испуг: глаза круглые, подскок, хвост дрожит, потом выдох.
  react_scared(done) {
    const P = CONFIG.anim.poke;
    this.setMood('open');
    sfxRandom(this.scene, 'sfx_meow', 3, 1.2);
    this.setMouth(true);
    this.eyes.setScale(1.35);
    const s = this.baseScale;
    this.track(this.scene.tweens.add({
      targets: this, y: this.home.y - P.scaredHeight * s, scaleX: s * 0.88, scaleY: s * 1.15,
      duration: P.scaredDuration, yoyo: true, hold: P.hold, ease: 'Back.easeOut',
      onComplete: () => {
        this.setScale(s);
        this.setMouth(false);
        this.eyes.setScale(1);
        this.setMood('closed'); // «фух»
        this.track(this.scene.time.delayedCall(P.hold, done));
      },
    }));
    if (this.tail) {
      this.track(this.scene.tweens.add({
        targets: this.tail, angle: { from: -6, to: 6 }, duration: 40, yoyo: true, repeat: 6,
        onComplete: () => { this.tail.angle = 0; },
      }));
    }
  }

  // Сердечко всплывает над котом (текстура fx_heart создаётся в draw.js).
  heart(delay) {
    if (!this.scene.textures.exists('fx_heart')) return;
    const h = this.scene.add.image(this.x + Phaser.Math.Between(-20, 20) * this.baseScale, this.y - 70 * this.baseScale, 'fx_heart')
      .setDepth(13).setScale(0.6 * this.baseScale).setAlpha(0);
    this.scene.tweens.add({
      targets: h, delay, y: h.y - 70 * this.baseScale, alpha: { from: 1, to: 0 }, scale: this.baseScale,
      duration: 900, ease: 'Sine.easeOut', onComplete: () => h.destroy(),
    });
  }

  meow() {
    sfxRandom(this.scene, 'sfx_meow', 3);
    this.setMouth(true);
    this.track(this.scene.time.delayedCall(CONFIG.anim.meowDuration, () => this.setMouth(false)));
  }

  // Идёт в точку: лапы по очереди шагают, тело подпрыгивает на каждом шаге и чуть покачивается.
  walkTo(x, y, onDone) {
    const A = CONFIG.anim;
    const x0 = this.x;
    const y0 = this.y;
    const dist = Phaser.Math.Distance.Between(x0, y0, x, y);
    const duration = Math.max(A.walkMinDuration, (dist / A.walkSpeed) * 1000);
    const steps = Math.max(2, Math.round(duration / A.stepDuration));
    this.track(this.scene.tweens.add({
      targets: this, x, duration, ease: 'Linear',
      onUpdate: (tw) => {
        const ph = tw.progress * steps; // номер шага с дробной частью
        const f = ph % 1;
        const lift = Math.sin(f * Math.PI);
        this.y = y0 + (y - y0) * tw.progress - lift * A.walkBob * this.baseScale;
        this.angle = (Math.floor(ph) % 2 ? 1 : -1) * lift * A.walkSway;
        const k = Math.floor(ph) % 2; // какая лапа сейчас в воздухе
        this.legs?.forEach((leg, i) => {
          const up = i === k ? lift : 0;
          leg.y = C.leg.y - up * A.stepLift;
          leg.angle = (i ? 1 : -1) * up * A.stepAngle;
        });
      },
      onComplete: () => {
        this.y = y;
        this.angle = 0;
        this.resetLegs();
        this.squash();
        if (onDone) onDone();
      },
    }));
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
  // контейнер тела стоит на лапах (низ тела), поэтому всё рисуется выше нуля
  body(g, fill) {
    g.lineStyle(5, O(), 1).fillStyle(fill, 1);
    g.fillEllipse(0, -28, 76, 56);
    g.strokeEllipse(0, -28, 76, 56);
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(0, -22, 30, 22);
  },
  chest(g) {
    g.fillStyle(0xffffff, 0.85);
    g.fillEllipse(0, -36, 26, 22);
  },
  head(g, fill) {
    g.lineStyle(5, O(), 1).fillStyle(fill, 1);
    g.fillTriangle(-30, -10, -24, -44, -6, -20);
    g.strokeTriangle(-30, -10, -24, -44, -6, -20);
    g.fillTriangle(30, -10, 24, -44, 6, -20);
    g.strokeTriangle(30, -10, 24, -44, 6, -20);
    g.fillCircle(0, 0, 34);
    g.strokeCircle(0, 0, 34);
    drawFallback.muzzle(g);
  },
  // лапа свисает вниз от «плеча» (0, 0)
  leg(g, fill) {
    g.lineStyle(4, O(), 1).fillStyle(fill, 1);
    g.fillRoundedRect(-7, -4, 14, 24, 6);
    g.strokeRoundedRect(-7, -4, 14, 24, 6);
    g.fillEllipse(0, 20, 18, 11);
    g.strokeEllipse(0, 20, 18, 11);
    g.lineStyle(2, O(), 1);
    g.lineBetween(-3, 19, -3, 24);
    g.lineBetween(3, 19, 3, 24);
  },
  muzzle(g) {
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
