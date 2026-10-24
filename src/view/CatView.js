import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { sfx, sfxRandom } from '../audio.js';
import LAYOUT from '../theme/cats/cat-layout.json';

const C = CONFIG.cat;
const P = C.pivots;
const U = C.unit;

// Точка референса → координаты кота (0, 0 — центр кота, y = origin[2] — низ лап).
const loc = ([x, y]) => ({ x: (x - C.origin[0]) * U, y: (y - C.origin[1]) * U + C.origin[2] });

// Кот из частей: хвост, туловище, две передние лапы, голова (с глазами и ртом). У каждого цвета свои
// картинки cat_<name>_*.png, без перекраски tint'ом. Глаза open/happy и рот — общие для всех котов.
// Каждая часть — в своём контейнере, точка контейнера — ось вращения (основание хвоста, плечо лапы…).
// Если картинок нет — временные фигуры.
export class CatView extends Phaser.GameObjects.Container {
  // colorIndex — цвет кота на уровне (индекс в CONFIG.colors) или id рескина обычного кота (строка, CONFIG.skins).
  constructor(scene, x, y, colorIndex, { headOnly = false } = {}) {
    super(scene, x, y);
    scene.add.existing(this);
    const skin = typeof colorIndex === 'string' ? CONFIG.skins.find((k) => k.id === colorIndex) : null;
    const color = skin ? CONFIG.colors.find((c) => c.name === skin.file) : CONFIG.colors[colorIndex];
    this.fill = skin?.recolor ?? color?.fill ?? 0xffd43b;
    this.name = skin ? skin.file : color.name;
    this.baseScale = 1;
    this.mood = 'open';
    this.actions = [];
    this.idle = [];
    this.useArt = scene.textures.exists(`cat_${this.name}_head`);

    if (!headOnly) {
      this.tail = this.part('tail');
      this.body = this.part('body');
      this.legs = ['leg_l', 'leg_r'].map((name) => this.part(name));
      this.legY = this.legs[0].y;
    }
    this.head = this.part('head');
    this.headY = this.head.y;
    this.eyes = this.part('eyes', this.head, 'head');
    this.mouth = this.part('mouth', this.head, 'head');
    this.setMood('open');
    this.setMouth(false);
  }

  // ---------- сборка ----------

  // Контейнер части в её оси вращения; parentPivot — если часть внутри другой (глаза в голове).
  part(name, parent = this, parentPivot = null) {
    const p = loc(P[name]);
    const o = parentPivot ? loc(P[parentPivot]) : { x: 0, y: 0 };
    const box = this.scene.add.container(p.x - o.x, p.y - o.y);
    parent.add(box);
    if (name === 'eyes' || name === 'mouth') return box; // заполняются в setMood / setMouth
    if (!this.useArt || !this.image(box, name, `cat_${this.name}_${name}`)) {
      const g = this.scene.add.graphics();
      drawFallback[name.startsWith('leg') ? 'leg' : name](g, this.fill);
      if (name === 'leg_r') g.setScale(-1, 1);
      box.add(g);
    }
    return box;
  }

  // Картинка в контейнере части: левый верхний угол — из src/theme/cats/cat-layout.json (layoutKey).
  image(box, layoutKey, key, pivot = layoutKey) {
    if (!this.scene.textures.exists(key)) return null;
    const [x0, y0] = LAYOUT[layoutKey];
    const [px, py] = P[pivot];
    const img = this.scene.add.image((x0 - px) * U, (y0 - py) * U, key).setOrigin(0, 0).setScale(U / LAYOUT.scale);
    box.add(img);
    return img;
  }

  resetLegs() {
    if (!this.legs) return;
    this.legs.forEach((leg) => {
      leg.y = this.legY;
      leg.angle = 0;
    });
  }

  // Слой с вариантами (глаза, рот): картинка, если есть, иначе фигура.
  swapLayer(box, layoutKey, key, pivot, fallback) {
    box.removeAll(true);
    if (this.useArt && this.image(box, layoutKey, key, pivot)) return;
    const g = this.scene.add.graphics();
    fallback(g);
    box.add(g);
  }

  // mood: 'open' — ждёт, 'happy' — ест/сыт, 'grumpy' — ворчит, 'closed' — моргает/спит.
  setMood(mood) {
    this.mood = mood;
    this.showEyes(mood);
    return this;
  }

  // Открытые и довольные глаза общие; у ворчливых и закрытых веко в цвет шерсти — свои у каждого кота.
  showEyes(kind) {
    const key = kind === 'open' || kind === 'happy' ? `eyes_${kind}` : `cat_${this.name}_eyes_${kind}`;
    this.swapLayer(this.eyes, 'eyes', key, 'eyes', (g) => drawEyes(g, kind));
  }

  setMouth(open) {
    this.swapLayer(this.mouth, open ? 'mouth_open' : 'mouth', open ? 'mouth_open' : 'mouth_closed', 'mouth', (g) => drawMouth(g, open));
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
    this.breathing = !!this.body; // дыхание ведёт сцена в такт музыке — breathe()
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

  // Вдох-выдох в такт: phase 0…1 — фаза цикла дыхания (из часов такта, beat.js).
  breathe(phase) {
    if (!this.breathing) return;
    this.body.scaleY = 1 + CONFIG.anim.idleBreath * (1 - Math.cos(phase * Math.PI * 2)) / 2;
  }

  stopIdle() {
    this.breathing = false;
    this.idle.forEach(safeRemove);
    this.idle = [];
    [this.blinkTimer, this.blinkBack].forEach((t) => t && safeRemove(t));
    this.blinkTimer = this.blinkBack = null;
    if (this.body) this.body.scaleY = 1;
  }

  // Кота удаляют (сменили окрас) — гасим его таймеры и твины, иначе моргание сработает на удалённом коте.
  preDestroy() {
    this.stopIdle();
    this.actions.forEach(safeRemove);
    this.actions = [];
    this.scene?.tweens.killTweensOf([this, this.head, this.eyes].filter(Boolean));
    super.preDestroy();
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
    sfxRandom(this.scene, 'sfx_purr', 3);
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
    sfxRandom(this.scene, 'sfx_meow', 3, 1.2 * CONFIG.audio.meow);
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
    this.parentContainer?.add(h); // кот внутри комнаты холла — сердечко там же, в её координатах
    this.scene.tweens.add({
      targets: h, delay, y: h.y - 70 * this.baseScale, alpha: { from: 1, to: 0 }, scale: this.baseScale,
      duration: 900, ease: 'Sine.easeOut', onComplete: () => h.destroy(),
    });
  }

  meow() {
    sfxRandom(this.scene, 'sfx_meow', 3, CONFIG.audio.meow);
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
          leg.y = this.legY - up * A.stepLift;
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
