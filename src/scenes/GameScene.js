import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { Board } from '../core/Board.js';
import {
  makePortion, makeFxTextures, makeJuteWrap, makeFoodTextures, makeFoodBowl, setPileCut, resetPile, grainKey, grainScale,
} from '../view/draw.js';
import { CatView } from '../view/CatView.js';
import { sfx, sfxRandom, music } from '../audio.js';
import LEVELS from '../levels/levels.json';

const L = CONFIG.layout;

// В режиме разработки можно открыть любой уровень: http://<адрес>:5173/?level=150
function levelFromUrl() {
  if (!import.meta.env.DEV) return 0;
  const n = Number(new URLSearchParams(location.search).get('level'));
  return n >= 1 && n <= LEVELS.length ? n - 1 : 0;
}

const A = CONFIG.anim;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    this.levelIndex = data.levelIndex ?? levelFromUrl();
  }

  create() {
    const level = LEVELS[this.levelIndex];
    this.board = new Board(level);
    this.selected = null;
    this.won = false;
    this.lastFeedMeow = -Infinity;
    // Порядок хрустов на уровень, например 2 1 3: каждый кот берёт следующий, по кругу (2 1 3 2 1 …)
    this.chewOrder = Phaser.Utils.Array.Shuffle([1, 2, 3]);
    this.chewNext = 0;

    if (this.textures.exists('bg_game')) {
      const bg = this.add.image(CONFIG.width / 2, CONFIG.height / 2, 'bg_game');
      bg.setScale(Math.max(CONFIG.width / bg.width, CONFIG.height / bg.height));
    }
    makeFxTextures(this);
    this.createEffects();
    music(this, 'music_game');

    const title = `Уровень ${level.id}` + (level.puzzle ? ' · головоломка' : '');
    this.add.text(CONFIG.width / 2, L.titleY, title, {
      fontFamily: 'sans-serif', fontSize: '44px', color: '#ffffff',
      stroke: '#1b1426', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(15);

    this.locked = new Set(); // банки, которые сейчас летят или наполняются — их не трогаем
    this.feeding = {};       // банка → миска, пока кот ест
    this.dimBackground();
    this.layoutBowls();
    this.createBowls();
    this.createPortions();
    this.createCats();
    this.createButtons();
    this.scheduleGlint();
  }

  // Затемнение стены за банками: цвета корма ярче.
  dimBackground() {
    const D = CONFIG.bgDim;
    const top = L.bowlsTop - 40;
    this.add.graphics()
      .fillGradientStyle(D.color, D.color, D.color, D.color, D.top, D.top, D.bottom, D.bottom)
      .fillRect(0, top, CONFIG.width, L.bowlsBottom - top);
  }

  // ---------- раскладка ----------

  // Подбираем число рядов так, чтобы банки были как можно крупнее, и масштабируем размеры под экран.
  layoutBowls() {
    const n = this.board.bowls.length;
    const bh0 = this.board.capacity * L.portionHeight + L.bowlPadding * 2;
    const availW = CONFIG.width - L.sideMargin * 2;
    const availH = L.bowlsBottom - L.bowlsTop;
    let best = null;
    for (let rows = 1; rows <= 4; rows++) {
      const perRow = Math.ceil(n / rows);
      const w = perRow * L.bowlWidth + (perRow - 1) * L.bowlGapX;
      const h = rows * bh0 + (rows - 1) * L.bowlGapY;
      const scale = Math.min(1, availW / w, availH / h);
      if (perRow <= L.maxPerRow && (!best || scale > best.scale + 0.001)) best = { rows, perRow, scale };
    }
    const { rows, perRow, scale } = best;
    const d = (this.dim = {
      bw: L.bowlWidth * scale,
      ph: L.portionHeight * scale,
      pad: L.bowlPadding * scale,
      gx: L.bowlGapX * scale,
      gy: L.bowlGapY * scale,
      lw: CONFIG.outlineWidth * Math.max(0.6, scale),
      scale,
    });
    const bh = this.board.capacity * d.ph + d.pad * 2;
    const totalH = rows * bh + (rows - 1) * d.gy;
    const top0 = L.bowlsBottom - totalH; // нижний ряд стоит на столе

    this.bowlRects = [];
    for (let r = 0; r < rows; r++) {
      const count = Math.min(perRow, n - r * perRow);
      const rowW = count * d.bw + (count - 1) * d.gx;
      const x0 = (CONFIG.width - rowW) / 2 + d.bw / 2;
      const top = top0 + r * (bh + d.gy);
      for (let c = 0; c < count; c++) {
        this.bowlRects.push({ x: x0 + c * (d.bw + d.gx), top, bottom: top + bh });
      }
    }
  }

  // Центр порции в координатах банки (0, 0 — центр банки). Нижняя порция стоит на подставке.
  slotY(jar, slot) {
    const d = this.dim;
    return jar.h / 2 - CONFIG.jar.baseHeight * d.scale * 0.4 - d.ph / 2 - slot * d.ph;
  }

  // ---------- создание объектов ----------

  // Банка — контейнер: свечение (выбрана), стекло, корм, передний слой (тень, блики, контур, подставка, горлышко).
  // Контур и подставка рисуются поверх корма, поэтому горка уходит под стекло без просветов у стенок.
  createBowls() {
    this.jars = this.bowlRects.map((r, i) => {
      const h = r.bottom - r.top;
      const home = { x: r.x, y: r.top + h / 2 };
      const glow = this.add.graphics().setAlpha(0);
      const back = this.add.graphics();
      const content = this.add.container(0, 0);
      const front = this.add.graphics();
      const jar = this.add.container(home.x, home.y, [glow, back, content, front]).setDepth(1);
      Object.assign(jar, { glow, back, content, front, home, h, wrap: null });
      const zone = this.add.zone(r.x, home.y, this.dim.bw + this.dim.gx * 0.9, h + this.dim.gy * 0.9).setInteractive();
      zone.on('pointerdown', () => this.onBowlTap(i));
      return jar;
    });
    this.jars.forEach((_, i) => this.drawJar(i));
  }

  drawJar(i) {
    const J = CONFIG.jar;
    const jar = this.jars[i];
    const { bw, lw, scale: s } = this.dim;
    const h = jar.h;
    const top = -h / 2;
    const rad = J.radius * s;
    const rh = J.rimHeight * s;
    const done = this.board.isComplete(i);

    const glowPad = 8 * s;
    jar.glow.clear().fillStyle(J.glow, 1).fillRoundedRect(-bw / 2 - glowPad, top - glowPad, bw + glowPad * 2, h + glowPad * 2, rad + glowPad);

    jar.back.clear().fillStyle(J.glass, J.glassAlpha).fillRoundedRect(-bw / 2, top, bw, h, rad);

    const f = jar.front.clear();
    // объём цилиндра: справа тень, слева светлее
    const k = 0x000000;
    f.fillGradientStyle(k, k, k, k, 0, J.shadeAlpha, 0, J.shadeAlpha).fillRect(0, top + rad * 0.5, bw / 2 - lw / 2, h - rad);
    const w = 0xffffff;
    f.fillGradientStyle(w, w, w, w, 0.14, 0, 0.14, 0).fillRect(-bw / 2 + lw / 2, top + rad * 0.5, bw * 0.3, h - rad);
    // блики: широкий и тонкий слева, тонкий справа, искорка внизу
    f.fillStyle(0xffffff, J.highlightAlpha).fillRoundedRect(-bw / 2 + 7 * s, top + rh, 9 * s, h - rh * 2, 4 * s);
    f.fillStyle(0xffffff, J.highlightAlpha * 0.5).fillRoundedRect(-bw / 2 + 20 * s, top + rh * 1.5, 3 * s, h * 0.45, 1.5 * s);
    f.fillStyle(0xffffff, J.highlightAlpha * 0.4).fillRoundedRect(bw / 2 - 9 * s, top + rh * 1.5, 3 * s, h - rh * 3, 1.5 * s);
    f.fillStyle(0xffffff, J.highlightAlpha).fillCircle(-bw / 2 + 11.5 * s, h / 2 - rh * 1.2, 4.5 * s);
    // стекло
    f.lineStyle(lw, CONFIG.outline, 1).strokeRoundedRect(-bw / 2, top, bw, h, rad);
    // подставка
    const bo = J.baseOverhang * s;
    const by = h / 2 - J.baseHeight * s * 0.4;
    f.fillStyle(J.base, 1).fillRoundedRect(-bw / 2 - bo, by, bw + bo * 2, J.baseHeight * s, rad * 0.6);
    f.fillStyle(0xffffff, 0.25).fillRoundedRect(-bw / 2 - bo + 4 * s, by + 3 * s, bw * 0.5, 4 * s, 2 * s);
    f.lineStyle(lw, CONFIG.outline, 1).strokeRoundedRect(-bw / 2 - bo, by, bw + bo * 2, J.baseHeight * s, rad * 0.6);
    // горлышко
    const ro = J.rimOverhang * s;
    f.fillStyle(done ? CONFIG.bowlDoneStroke : J.rim, 1).fillRoundedRect(-bw / 2 - ro, top - rh / 2, bw + ro * 2, rh, rh / 2);
    f.fillStyle(0xffffff, 0.4).fillRoundedRect(-bw / 2 - ro + rh * 0.4, top - rh / 2 + rh * 0.2, bw * 0.45, rh * 0.25, rh * 0.12);
    f.lineStyle(lw, CONFIG.outline, 1).strokeRoundedRect(-bw / 2 - ro, top - rh / 2, bw + ro * 2, rh, rh / 2);
  }

  createPortions() {
    const d = this.dim;
    const fb = CONFIG.foodBowl;
    makeFoodTextures(this, d.bw - d.lw * 0.5, d.ph, d.scale, d.bw * fb.width * 0.86, d.bw * fb.width * 0.3);
    this.portions = this.board.bowls.map((bowl, i) => bowl.map((color, slot) => {
      const p = makePortion(this, color, d.ph);
      p.setPosition(0, this.slotY(this.jars[i], slot));
      this.jars[i].content.add(p);
      return p;
    }));
  }

  createCats() {
    const colors = new Set(this.board.bowls.flat());
    const n = Math.max(...colors) + 1;
    const spacing = Math.min(L.catSpacing, (CONFIG.width - 60) / n);
    const x0 = CONFIG.width / 2 - ((n - 1) * spacing) / 2;
    this.cats = [];
    for (let c = 0; c < n; c++) {
      const scale = Math.min(1, spacing / L.catSpacing);
      const cat = new CatView(this, x0 + c * spacing, L.catsFloorY - CONFIG.cat.body.y * scale, c);
      cat.setDepth(10).setBaseScale(scale).startIdle();
      cat.home = { x: cat.x, y: cat.y };
      cat.fedBowl = null;
      // тап по коту — случайная реакция (только если сидит на месте)
      cat.setInteractive(new Phaser.Geom.Rectangle(-55, -75, 110, 145), Phaser.Geom.Rectangle.Contains);
      cat.on('pointerdown', () => cat.poke());
      this.cats.push(cat);
    }
  }

  createButtons() {
    this.makeButton(CONFIG.width * 0.3, L.buttonsY, 'Отмена', () => this.undo());
    this.makeButton(CONFIG.width * 0.7, L.buttonsY, 'Заново', () => this.scene.restart({ levelIndex: this.levelIndex }));
  }

  makeButton(x, y, label, onTap, depth = 0) {
    const w = 220;
    const h = 84;
    const g = this.add.graphics();
    g.fillStyle(0x5f4b8b, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 20);
    g.lineStyle(CONFIG.outlineWidth, CONFIG.outline, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 20);
    const t = this.add.text(0, 0, label, { fontFamily: 'sans-serif', fontSize: '34px', color: '#ffffff' }).setOrigin(0.5);
    const btn = this.add.container(x, y, [g, t]).setDepth(depth).setSize(w, h).setInteractive();
    btn.on('pointerdown', () => {
      sfx(this, 'sfx_button');
      this.tweens.add({ targets: btn, scale: 0.92, duration: 60, yoyo: true });
      onTap();
    });
    return btn;
  }

  // Время от времени по стеклу случайной банки пробегает блик.
  scheduleGlint() {
    const G = CONFIG.glint;
    this.time.delayedCall(Phaser.Math.Between(G.minDelay, G.maxDelay), () => {
      const free = this.jars.filter((j, i) => !this.locked.has(i) && !j.wrap);
      if (free.length) this.glint(Phaser.Utils.Array.GetRandom(free));
      this.scheduleGlint();
    });
  }

  glint(jar) {
    const G = CONFIG.glint;
    const { bw, scale: s } = this.dim;
    const rh = CONFIG.jar.rimHeight * s;
    const w = G.width * s;
    const g = this.add.graphics().fillStyle(0xffffff, 1).fillRoundedRect(-w / 2, -jar.h / 2 + rh, w, jar.h - rh * 2, w / 2);
    g.setAlpha(0).setX(-bw / 2 + w);
    jar.add(g);
    this.tweens.add({ targets: g, x: bw / 2 - w, duration: G.duration, ease: 'Sine.easeInOut', onComplete: () => g.destroy() });
    this.tweens.add({ targets: g, alpha: G.alpha, duration: G.duration / 2, yoyo: true, ease: 'Sine.easeInOut' });
  }

  // ---------- ввод ----------

  onBowlTap(i) {
    if (this.won || this.locked.has(i)) return;
    if (this.selected === null) {
      if (this.board.canPick(i)) this.select(i);
      else this.shake(i);
      return;
    }
    if (this.selected === i) {
      this.deselect();
      return;
    }
    const from = this.selected;
    if (this.board.canMove(from, i)) {
      this.doMove(from, i);
    } else {
      this.deselect();
      if (this.board.canPick(i)) this.select(i);
      else this.shake(i);
    }
  }

  // Выбранная банка приподнимается и светится.
  select(i) {
    sfx(this, 'sfx_pick');
    this.selected = i;
    const jar = this.jars[i];
    this.tweens.killTweensOf(jar);
    this.tweens.add({ targets: jar, y: jar.home.y - A.liftY * this.dim.scale, duration: A.liftDuration, ease: 'Quad.easeOut' });
    this.tweens.killTweensOf(jar.glow);
    jar.glow.setAlpha(CONFIG.jar.glowAlpha);
    this.tweens.add({ targets: jar.glow, alpha: CONFIG.jar.glowAlpha * 0.4, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  deselect() {
    if (this.selected === null) return;
    const jar = this.jars[this.selected];
    this.selected = null;
    this.glowOff(jar);
    this.tweens.killTweensOf(jar);
    this.tweens.add({ targets: jar, x: jar.home.x, y: jar.home.y, angle: 0, duration: A.liftDuration, ease: 'Quad.easeOut' });
  }

  glowOff(jar) {
    this.tweens.killTweensOf(jar.glow);
    jar.glow.setAlpha(0);
  }

  shake(i) {
    sfx(this, 'sfx_invalid');
    const jar = this.jars[i];
    this.tweens.killTweensOf(jar);
    jar.setPosition(jar.home.x, jar.home.y);
    this.tweens.add({
      targets: jar, x: jar.home.x + A.shakeDistance, duration: A.shakeDuration, yoyo: true, repeat: 1,
      onComplete: () => jar.setX(jar.home.x),
    });
  }

  // ---------- ходы ----------

  doMove(from, to) {
    const startSlot = this.portions[to].length;
    const n = this.board.move(from, to);
    const moved = this.portions[from].splice(-n);
    this.portions[to].push(...moved);
    this.selected = null;
    this.glowOff(this.jars[from]);

    const complete = this.board.isComplete(to);
    if (complete) this.drawJar(to);
    this.pourJar(from, to, moved, startSlot, () => {
      if (complete && this.board.isComplete(to)) this.feed(this.board.bowls[to][0], to);
    });
    if (this.board.isSolved()) {
      this.won = true;
      this.time.delayedCall(A.winDelay, () => this.showWin());
    }
  }

  undo() {
    if (this.won || this.locked.size) return;
    this.deselect();
    const last = this.board.history[this.board.history.length - 1];
    if (!last) return;
    sfx(this, 'sfx_undo', CONFIG.audio.undo);
    if (this.board.isComplete(last.to)) this.unfeed(this.board.bowls[last.to][0]);

    const startSlot = this.portions[last.from].length;
    const rec = this.board.undo();
    const moved = this.portions[rec.to].splice(-rec.n);
    this.portions[rec.from].push(...moved);
    this.drawJar(rec.to);
    this.pourJar(rec.to, rec.from, moved, startSlot);
  }

  // Поза наклонённой банки: горлышко в точке (mx, my), наклон angle (градусы, + — горлышком вправо).
  pourPose(jar, mx, my, angle) {
    const a = Phaser.Math.DegToRad(angle);
    const m = jar.h / 2 + CONFIG.jar.rimHeight * this.dim.scale * 0.3; // от центра до горлышка
    return { x: mx - m * Math.sin(a), y: my + m * Math.cos(a), angle };
  }

  // Банка A поднимается, летит к банке B, наклоняется и пересыпает: горка в A стаивает сверху,
  // струйка крупинок падает в B, там горка насыпается снизу вверх. Потом A возвращается на место.
  // Обе банки на это время заблокированы; onDone — когда B наполнилась.
  pourJar(from, to, moved, startSlot, onDone) {
    const P = CONFIG.pour;
    const s = this.dim.scale;
    const S = this.jars[from];
    const T = this.jars[to];
    this.locked.add(from).add(to);
    const dir = S.home.x < T.home.x ? 1 : S.home.x > T.home.x ? -1 : T.home.x < CONFIG.width / 2 ? -1 : 1;
    const mouth = { x: T.home.x, y: T.home.y - T.h / 2 - P.gap * s };
    const pose = this.pourPose(S, mouth.x, mouth.y, dir * P.tilt);
    this.tweens.killTweensOf(S);
    S.setDepth(8);
    this.tweens.add({ targets: S, ...pose, duration: P.flyDuration, ease: 'Sine.easeInOut' });

    // серия всегда одного цвета, поэтому первая высыпанная порция может лечь в нижний слот
    const order = moved.slice().reverse();
    this.portions[to].splice(startSlot, order.length, ...order);
    const pd = P.portionDuration;
    order.forEach((p, k) => {
      const img = p.pile;
      const t0 = P.flyDuration + k * pd;
      this.tweens.killTweensOf(img);
      // в A остаётся копия горки, она стаивает сверху (со стороны горлышка)
      const ghost = this.add.image(p.x, p.y, img.texture.key).setOrigin(img.originX, img.originY).setFlipX(img.flipX);
      setPileCut(ghost, img.cut);
      S.content.add(ghost);
      this.tweens.add({
        targets: ghost, cut: img.height, delay: t0, duration: pd,
        onUpdate: () => setPileCut(ghost, ghost.cut), onComplete: () => ghost.destroy(),
      });
      // сама порция переезжает в B и насыпается снизу вверх
      S.content.remove(p);
      T.content.add(p);
      const y = this.slotY(T, startSlot + k);
      p.setPosition(0, y);
      setPileCut(img, img.height);
      const last = k === order.length - 1;
      this.tweens.add({
        targets: img, cut: 0, delay: t0 + P.fallDuration, duration: pd,
        onUpdate: () => setPileCut(img, img.cut),
        onComplete: () => {
          if (!last) return;
          sfx(this, 'sfx_drop');
          this.locked.delete(to);
          if (onDone) onDone();
        },
      });
      // струйка: из горлышка на растущую горку
      for (let i = 0; i < P.streamGrains; i++) {
        const f = i / P.streamGrains;
        const y1 = T.home.y + y + this.dim.ph / 2 - this.dim.ph * f;
        this.flyGrain(p.color, mouth.x + (Math.random() - 0.5) * 6 * s, mouth.y,
          T.home.x + (Math.random() - 0.5) * this.dim.bw * 0.5, y1, t0 + f * pd, P.fallDuration);
      }
    });

    // банка A возвращается
    const back = P.flyDuration + order.length * pd;
    this.tweens.add({
      targets: S, x: S.home.x, y: S.home.y, angle: 0, delay: back, duration: P.returnDuration, ease: 'Sine.easeInOut',
      onComplete: () => {
        S.setDepth(1);
        this.locked.delete(from);
      },
    });
  }

  // Одна летящая крупинка (объект живёт только на время полёта). Падает с ускорением.
  flyGrain(color, x0, y0, x1, y1, delay, duration, shrink = false) {
    const g = this.add.image(x0, y0, grainKey(color)).setDepth(9).setVisible(false)
      .setScale(grainScale(this.dim.scale)).setAngle(Phaser.Math.Between(0, 359));
    g.t = 0;
    const s0 = g.scale;
    const spin = Phaser.Math.Between(-240, 240);
    return this.tweens.add({
      targets: g, t: 1, delay, duration, ease: 'Quad.easeIn',
      onStart: () => g.setVisible(true),
      onUpdate: () => {
        const t = g.t;
        g.setPosition(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
        g.angle += spin / 60;
        if (shrink) g.setScale(s0 * (1 - t));
      },
      onComplete: () => g.destroy(),
    });
  }

  // ---------- коты ----------

  createEffects() {
    const fx = (key, cfg) => this.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(12);
    this.fxCrumbs = fx('fx_dot', {
      speed: { min: 90, max: 240 }, angle: { min: 200, max: 340 }, gravityY: 900,
      lifespan: 650, scale: { start: 0.8, end: 0.25 }, alpha: { start: 1, end: 0 },
    });
    this.fxHearts = fx('fx_heart', {
      speedX: { min: -60, max: 60 }, speedY: { min: -170, max: -90 }, gravityY: -30,
      lifespan: 1200, scale: { start: 0.7, end: 1.2 }, alpha: { start: 1, end: 0 },
    });
    this.fxStars = fx('fx_star', {
      speed: { min: 120, max: 280 }, lifespan: 500, scale: { start: 0.8, end: 0 },
      rotate: { min: 0, max: 360 }, tint: CONFIG.bowlDoneStroke,
    });
    this.fxConfetti = fx('fx_confetti', {
      speedX: { min: -220, max: 220 }, speedY: { min: -900, max: -500 }, gravityY: 900,
      lifespan: 2200, rotate: { start: 0, end: 720 }, scale: { min: 0.8, max: 1.4 },
      tint: CONFIG.colors.map((c) => c.fill),
    }).setDepth(22);
  }

  // Банка собрана: перед ней появляется миска, банка поднимается и высыпает в неё весь корм, возвращается.
  // Кот тем временем мяукает и идёт к миске; когда и корм насыпан, и кот пришёл — ест (горка в миске
  // уменьшается, хруст, крошки), радуется, миска исчезает, банку обматывает джут. Ввод не блокируется.
  feed(color, j) {
    const cat = this.cats[color];
    const jar = this.jars[j];
    const P = CONFIG.pour;
    const FB = CONFIG.foodBowl;
    const { bw, scale: s } = this.dim;
    const r = this.bowlRects[j];
    const track = (t) => cat.track(t);
    cat.fedBowl = j;
    cat.stopActions().setMood('open');

    sfx(this, 'sfx_complete');
    this.fxStars.explode(10, jar.home.x, jar.home.y - jar.h / 2);
    // в конце уровня банки собираются одна за другой — мяукает только первый кот, остальные молча
    if (this.time.now - this.lastFeedMeow >= CONFIG.audio.feedMeowCooldown) {
      this.lastFeedMeow = this.time.now;
      cat.meow();
    }
    cat.disableInteractive(); // пока кот у миски, он не перехватывает тапы по банкам

    // миска стоит на столе перед банкой
    const bowl = makeFoodBowl(this, color, bw, s);
    const rimY = r.bottom - bw * FB.height + 6 * s;
    bowl.setPosition(r.x, rimY).setDepth(11).setScale(0);
    this.feeding[j] = bowl;
    track(this.tweens.add({ targets: bowl, scale: 1, duration: FB.popDuration, ease: 'Back.easeOut' }));

    let ready = 0;
    const go = () => { if (++ready === 2) this.eatFromBowl(cat, color, j, bowl); };

    // банка высыпает корм в миску
    this.locked.add(j);
    const heap = bowl.heap;
    const dir = r.x < CONFIG.width / 2 ? -1 : 1; // банка уходит к середине экрана, а не за край
    const mouth = { x: r.x, y: rimY - heap.height - P.gap * s };
    jar.setDepth(8);
    track(this.tweens.add({ targets: jar, ...this.pourPose(jar, mouth.x, mouth.y, dir * P.bowlTilt), duration: P.flyDuration, ease: 'Sine.easeInOut' }));
    const food = this.portions[j].slice().reverse(); // сверху вниз
    const pd = P.portionDuration;
    food.forEach((p, k) => {
      const t0 = P.flyDuration + k * pd;
      track(this.tweens.add({ targets: p.pile, cut: p.pile.height, delay: t0, duration: pd, onUpdate: () => setPileCut(p.pile, p.pile.cut) }));
      for (let i = 0; i < P.streamGrains; i++) {
        const f = (k + i / P.streamGrains) / food.length;
        this.flyGrain(color, mouth.x + (Math.random() - 0.5) * 6 * s, mouth.y,
          r.x + (Math.random() - 0.5) * heap.width * 0.6, rimY - heap.height * f, t0 + (i / P.streamGrains) * pd, P.fallDuration);
      }
    });
    track(this.tweens.add({
      targets: heap, cut: 0, delay: P.flyDuration + P.fallDuration, duration: food.length * pd,
      onUpdate: () => setPileCut(heap, heap.cut),
    }));
    track(this.tweens.add({
      targets: jar, x: jar.home.x, y: jar.home.y, angle: 0, delay: P.flyDuration + food.length * pd, duration: P.returnDuration, ease: 'Sine.easeInOut',
      onComplete: () => {
        jar.setDepth(1);
        this.locked.delete(j);
        go();
      },
    }));

    // кот идёт к миске
    cat.walkTo(r.x, rimY - A.catEatOffsetY * cat.baseScale, go);
  }

  eatFromBowl(cat, color, j, bowl) {
    const heap = bowl.heap;
    const n = this.board.capacity;
    const mx = bowl.x;
    const my = bowl.y - heap.height * 0.4;
    cat.setMood('happy');
    cat.eat(n, (k) => {
      if (k === 0) sfx(this, `sfx_chew_${this.chewOrder[this.chewNext++ % this.chewOrder.length]}`, 0.8);
      cat.track(this.tweens.add({
        targets: heap, cut: (heap.height * (k + 1)) / n, duration: A.eatPerPortion * 0.6,
        onUpdate: () => setPileCut(heap, heap.cut),
      }));
      for (let i = 0; i < CONFIG.pile.eatGrains; i++) {
        this.flyGrain(color, mx + (Math.random() - 0.5) * heap.width * 0.4, my, mx, bowl.y - 20 * this.dim.scale,
          (i / CONFIG.pile.eatGrains) * A.eatPerPortion * 0.5, A.eatPerPortion * 0.4, true);
      }
      this.fxCrumbs.setParticleTint(CONFIG.colors[color].fill);
      this.fxCrumbs.explode(A.crumbs, mx, my);
    }, () => {
      sfxRandom(this, 'sfx_purr', 3);
      this.wrapJar(j, color);
      this.fxHearts.explode(A.hearts, cat.x, cat.y - 60 * cat.baseScale);
      cat.track(this.tweens.add({
        targets: bowl, scale: 0, delay: A.catReturnDelay, duration: CONFIG.foodBowl.hideDuration, ease: 'Back.easeIn',
        onComplete: () => {
          bowl.destroy();
          if (this.feeding[j] === bowl) delete this.feeding[j];
        },
      }));
      cat.track(this.time.delayedCall(A.catReturnDelay, () => cat.walkTo(cat.home.x, cat.home.y, () => cat.setInteractive())));
    });
  }

  // Отмена хода «разобрала» банку: кот бросает есть и, ворча, возвращается. Миска исчезает, корм — в банку.
  unfeed(color) {
    const cat = this.cats[color];
    if (cat.fedBowl === null) return;
    const j = cat.fedBowl;
    const jar = this.jars[j];
    cat.fedBowl = null;
    cat.stopActions().setMood('grumpy');
    if (this.feeding[j]) {
      this.feeding[j].destroy();
      delete this.feeding[j];
    }
    this.tweens.killTweensOf(jar);
    jar.setPosition(jar.home.x, jar.home.y).setAngle(0).setDepth(1);
    this.locked.delete(j);
    this.portions[j].forEach((p) => resetPile(this, p));
    this.unwrapJar(j);
    cat.walkTo(cat.home.x, cat.home.y, () => cat.setMood('open').setInteractive());
  }

  // Банку снизу вверх обматывает джут: каждый виток натягивается от центра к краям, затем выскакивает картинка корма.
  wrapJar(j, color) {
    this.unwrapJar(j, true);
    const J = CONFIG.jute;
    const jar = this.jars[j];
    const s = this.dim.scale;
    const top = -jar.h / 2 + CONFIG.jar.rimHeight * s / 2;
    const bottom = jar.h / 2 - CONFIG.jar.baseHeight * s * 0.4;
    const wrap = makeJuteWrap(this, color, this.dim.bw, top, bottom, s);
    jar.add(wrap);
    jar.wrap = wrap;
    wrap.bands.forEach((b, k) => {
      b.setScale(0, 1);
      this.tweens.add({ targets: b, scaleX: 1, delay: k * J.bandStagger, duration: J.bandDuration, ease: 'Quad.easeOut' });
    });
    wrap.icon.setScale(0);
    this.tweens.add({
      targets: wrap.icon, scale: wrap.iconScale, delay: wrap.bands.length * J.bandStagger + J.bandDuration,
      duration: J.iconDuration, ease: 'Back.easeOut',
    });
  }

  unwrapJar(j, instant = false) {
    const jar = this.jars[j];
    const wrap = jar.wrap;
    if (!wrap) return;
    jar.wrap = null;
    this.tweens.killTweensOf([...wrap.bands, wrap.icon, wrap]);
    if (instant) return wrap.destroy();
    this.tweens.add({ targets: wrap, alpha: 0, duration: CONFIG.jute.unwrapDuration, onComplete: () => wrap.destroy() });
  }

  // ---------- победа ----------

  showWin() {
    const W = CONFIG.width;
    const H = CONFIG.height;
    sfx(this, 'music_win');
    for (let k = 0; k < 5; k++) this.fxConfetti.explode(Math.round(A.confetti / 5), W * (0.1 + k * 0.2), H);
    const isLast = this.levelIndex === LEVELS.length - 1;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.55).setDepth(20).setInteractive();
    this.add.text(W / 2, H * 0.4, 'Все котики сыты!', {
      fontFamily: 'sans-serif', fontSize: '56px', color: '#ffffff',
    }).setOrigin(0.5).setDepth(21);
    this.add.text(W / 2, H * 0.47, `Ходов: ${this.board.history.length} (минимум ${LEVELS[this.levelIndex].minMoves})`, {
      fontFamily: 'sans-serif', fontSize: '34px', color: '#cfc6e0',
    }).setOrigin(0.5).setDepth(21);
    this.makeButton(W / 2, H * 0.58, isLast ? 'С начала' : 'Дальше', () => {
      this.scene.restart({ levelIndex: isLast ? 0 : this.levelIndex + 1 });
    }, 21);
  }
}
