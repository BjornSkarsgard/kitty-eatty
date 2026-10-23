import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { Board } from '../core/Board.js';
import { makePortion, makeFxTextures, makeJuteWrap, makePortionHalo, makeSoftTexture } from '../view/draw.js';
import { beatPulse, beatPhase } from '../beat.js';
import { CatView } from '../view/CatView.js';
import { sfx, sfxRandom, music } from '../audio.js';
import LEVELS from '../levels/levels.json';
import PAWS from '../../tools/bg-paws.json';

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
    this.pulsing = new Set(); // порции, которые пульсируют в такт музыке
    this.glass = null;
    this.lastFeedMeow = -Infinity;
    // Порядок хрустов на уровень, например 2 1 3: каждый кот берёт следующий, по кругу (2 1 3 2 1 …)
    this.chewOrder = Phaser.Utils.Array.Shuffle([1, 2, 3]);
    this.chewNext = 0;

    if (this.textures.exists('bg_game')) {
      const bg = this.add.image(CONFIG.width / 2, CONFIG.height / 2, 'bg_game');
      bg.setScale(Math.max(CONFIG.width / bg.width, CONFIG.height / bg.height));
      this.createWallGlow(bg);
    }
    makeFxTextures(this);
    this.createEffects();
    music(this, 'music_game');

    const title = `Уровень ${level.id}` + (level.puzzle ? ' · головоломка' : '');
    this.add.text(CONFIG.width / 2, L.titleY, title, {
      fontFamily: 'sans-serif', fontSize: '44px', color: '#ffffff',
      stroke: '#1b1426', strokeThickness: 8,
    }).setOrigin(0.5).setDepth(15);

    this.layoutBowls();
    this.createBowls();
    this.createPortions();
    this.createCats();
    this.createButtons();
  }

  // Лапки на обоях по очереди в разнобой мягко разгораются и гаснут. Где лапки — tools/bg-paws.json.
  createWallGlow(bg) {
    const G = CONFIG.fx.wallGlow;
    if (!CONFIG.fx.enabled || !this.textures.exists('paw_glow')) return;
    const s = bg.scaleX;
    const [bw, bh] = PAWS.bg;
    for (const [x, y, w] of PAWS.paws) {
      const img = this.add.image(bg.x + (x - bw / 2) * s, bg.y + (y - bh / 2) * s, 'paw_glow')
        .setScale((s * w) / PAWS.glow).setTint(G.color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      const glow = (first) => {
        this.tweens.add({
          targets: img, alpha: Phaser.Math.FloatBetween(...G.alpha),
          delay: Phaser.Math.Between(first ? 0 : G.gap[0], G.gap[1]),
          duration: G.fade, hold: G.hold, yoyo: true, ease: 'Sine.easeInOut',
          onComplete: () => glow(false),
        });
      };
      glow(true);
    }
  }

  // ---------- раскладка ----------

  // Подбираем число рядов так, чтобы банки были как можно крупнее, и масштабируем размеры под экран.
  // Банка — картинка jar_back: сверху горлышко, снизу донышко, стенки между ними растягиваются по высоте.
  // bowlRects: top — верх стенок (горлышко выше него), bottom — низ донышка (стоит на столе).
  layoutBowls() {
    const n = this.board.bowls.length;
    const tex = this.textures.get('jar_back').getSourceImage();
    const art = CONFIG.jar.art;
    const neck = (bw) => (art.top * bw) / tex.width;
    const base = (bw) => ((tex.height - art.bottom) * bw) / tex.width;
    const floor = (bw) => ((tex.height - art.floor) * bw) / tex.width;
    const bh0 = this.board.capacity * L.portionHeight + L.bowlPadding + floor(L.bowlWidth);
    const availW = CONFIG.width - L.sideMargin * 2;
    const availH = L.bowlsBottom - L.bowlsTop - neck(L.bowlWidth);
    let best = null;
    for (let rows = 1; rows <= 4; rows++) {
      const perRow = Math.ceil(n / rows);
      const w = perRow * L.bowlWidth + (perRow - 1) * L.bowlGapX;
      const h = rows * bh0 + (rows - 1) * L.bowlGapY;
      const scale = Math.min(1, availW / w, availH / h);
      if (perRow <= L.maxPerRow && (!best || scale > best.scale + 0.001)) best = { rows, perRow, scale };
    }
    const { rows, perRow, scale } = best;
    const bw = L.bowlWidth * scale;
    const d = (this.dim = {
      bw,
      ph: L.portionHeight * scale,
      pad: L.bowlPadding * scale,
      gx: L.bowlGapX * scale,
      gy: L.bowlGapY * scale,
      neck: neck(bw),   // высота горлышка над верхом стенок
      base: base(bw),   // высота донышка (от него вверх растягиваются стенки)
      floor: floor(bw), // от низа банки до пола, на котором лежит корм
      k: bw / tex.width, // пикселей экрана на пиксель картинки банки
      scale,
    });
    const bh = this.board.capacity * d.ph + d.pad + d.floor;
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

  slotPos(bowl, slot) {
    const r = this.bowlRects[bowl];
    const d = this.dim;
    return { x: r.x, y: r.bottom - d.floor - d.ph / 2 - slot * d.ph };
  }

  // Верх горлышка банки — сюда кот наклоняется есть.
  mouthY(bowl) {
    return this.bowlRects[bowl].top - this.dim.neck;
  }

  // ---------- создание объектов ----------

  createBowls() {
    // Банка из двух картинок: jar_back (стекло, тёмное нутро) под кормом, jar_front (горлышко, донышко, блики) над ним.
    for (const key of ['jar_back', 'jar_front']) {
      const tex = this.textures.get(key);
      if (tex.has('top')) continue;
      const { width: W, height: H } = tex.getSourceImage();
      const { top, bottom } = CONFIG.jar.art;
      tex.add('top', 0, 0, 0, W, top);
      tex.add('mid', 0, 0, top, W, bottom - top);
      tex.add('bot', 0, 0, bottom, W, H - bottom);
    }
    this.jarBack = this.bowlRects.map((r) => this.makeJar('jar_back', r).setDepth(0));
    this.jarFront = this.bowlRects.map((r) => this.makeJar('jar_front', r).setDepth(1));
    this.wraps = this.bowlRects.map(() => null); // обмотка-когтеточка съеденной банки
    this.bowlRects.forEach((r, i) => {
      const zone = this.add.zone(r.x, (r.top - this.dim.neck + r.bottom) / 2, this.dim.bw + this.dim.gx * 0.9,
        r.bottom - r.top + this.dim.neck + this.dim.gy * 0.9).setInteractive();
      zone.on('pointerdown', () => this.onBowlTap(i));
    });
  }

  // Банка из трёх кусков картинки: горлышко и донышко как есть, стенки растянуты по высоте.
  makeJar(key, r) {
    const { k, neck, base } = this.dim;
    const top = this.add.image(0, r.top - neck, key, 'top').setOrigin(0.5, 0).setScale(k);
    const mid = this.add.image(0, r.top, key, 'mid').setOrigin(0.5, 0).setScale(k);
    mid.setDisplaySize(mid.displayWidth, r.bottom - base - r.top);
    const bot = this.add.image(0, r.bottom - base, key, 'bot').setOrigin(0.5, 0).setScale(k);
    return this.add.container(r.x, 0, [top, mid, bot]);
  }

  createPortions() {
    const w = this.dim.bw - CONFIG.jar.art.edge * 2 * this.dim.k - 2;
    const h = this.dim.ph - 4 * this.dim.scale;
    this.portions = this.board.bowls.map((bowl, i) => bowl.map((color, slot) => {
      const p = makePortion(this, color, w, h);
      const pos = this.slotPos(i, slot);
      p.setPosition(pos.x, pos.y);
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
      const cat = new CatView(this, x0 + c * spacing, L.catsFloorY - CONFIG.cat.origin[2] * scale, c);
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

  // ---------- ввод ----------

  onBowlTap(i) {
    if (this.won) return;
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

  // Выбранная банка приподнимается целиком (с кормом), а серия, которая полетит, пульсирует и светится.
  select(i) {
    sfx(this, 'sfx_pick');
    this.selected = i;
    this.liftJar(i, -A.liftY * this.dim.scale, 'Back.easeOut');
    this.portions[i].slice(-this.board.topRun(i)).forEach((p) => this.pulse(p));
    this.glassGlow(i);
  }

  // Сдвинуть банку по вертикали вместе с кормом и обмоткой (dy = 0 — на место).
  liftJar(i, dy, ease = 'Quad.easeOut') {
    const layers = [this.jarBack[i], this.jarFront[i], this.wraps[i]].filter(Boolean);
    this.tweens.killTweensOf(layers);
    this.tweens.add({ targets: layers, y: dy, duration: A.liftDuration, ease });
    this.portions[i].forEach((p, slot) => {
      const pos = this.slotPos(i, slot);
      this.tweens.killTweensOf(p);
      this.stopPulse(p);
      this.tweens.add({ targets: p, x: pos.x, y: pos.y + dy, duration: A.liftDuration, ease });
    });
  }

  // Порция из выбранной серии пульсирует в такт музыке (update): чуть увеличивается, вокруг — золотой ореол.
  pulse(p) {
    this.pulsing.add(p);
    if (CONFIG.fx.enabled && !p.halo) p.halo = makePortionHalo(this, p, CONFIG.fx.selectGlow, this.dim.bw - 2);
  }

  stopPulse(p) {
    this.pulsing.delete(p);
    p.setScale(1);
    if (p.halo) {
      p.halo.destroy();
      p.halo = null;
    }
  }

  // Свет, рассеянный стеклом напротив выбранной серии: мягкое пятно внутри банки, к стенкам гаснет.
  glassGlow(i) {
    this.clearGlassGlow();
    if (!CONFIG.fx.enabled) return;
    makeSoftTexture(this);
    const run = this.portions[i].slice(-this.board.topRun(i));
    const ys = run.map((p) => p.y);
    const d = this.dim;
    const w = d.bw - CONFIG.jar.art.edge * 2 * d.k;
    const h = Math.max(...ys) - Math.min(...ys) + d.ph * 1.6;
    const y = (Math.max(...ys) + Math.min(...ys)) / 2 - A.liftY * d.scale;
    this.glass = this.add.image(this.bowlRects[i].x, y, 'fx_soft').setDisplaySize(w, h).setDepth(2)
      .setTint(CONFIG.fx.selectGlow).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
  }

  clearGlassGlow() {
    if (this.glass) this.glass.destroy();
    this.glass = null;
  }

  // Каждый кадр: всё, что пульсирует, — в такт музыке (beat.js).
  update() {
    if (this.pulsing.size || this.glass) {
      const env = beatPulse(this);
      for (const p of this.pulsing) {
        p.setScale(1 + (A.selectPulse - 1) * env);
        if (p.halo) p.halo.setAlpha(env * CONFIG.fx.haloAlpha);
      }
      if (this.glass) this.glass.setAlpha(env * CONFIG.fx.glassAlpha);
    }
    const breath = beatPhase(this, A.idleBreathBeats);
    this.cats.forEach((cat, k) => cat.breathe(breath + (k % 2) * 0.5));
  }

  deselect() {
    if (this.selected === null) return;
    const i = this.selected;
    this.selected = null;
    this.settleBowl(i);
  }

  // Плавно ставит банку и все её порции на свои места.
  settleBowl(i) {
    this.clearGlassGlow();
    this.portions[i].forEach((p) => p.setAlpha(1));
    this.liftJar(i, 0);
  }

  shake(i) {
    sfx(this, 'sfx_invalid');
    const layers = [this.jarBack[i], this.jarFront[i], this.wraps[i]].filter(Boolean);
    const x = this.bowlRects[i].x;
    this.tweens.killTweensOf(layers);
    layers.forEach((l) => { l.x = x; });
    this.tweens.add({
      targets: layers, x: x + A.shakeDistance, duration: A.shakeDuration, yoyo: true, repeat: 1,
      onComplete: () => layers.forEach((l) => { l.x = x; }),
    });
  }

  // ---------- ходы ----------

  doMove(from, to) {
    const startSlot = this.portions[to].length;
    const n = this.board.move(from, to);
    const moved = this.portions[from].splice(-n);
    this.portions[to].push(...moved);
    this.selected = null;

    this.fly(moved, to, startSlot);
    this.settleBowl(from); // если серия влезла не вся — остаток опускается обратно

    if (this.board.isComplete(to)) {
      this.feed(this.board.bowls[to][0], to);
    }
    if (this.board.isSolved()) {
      this.won = true;
      this.time.delayedCall(A.winDelay, () => this.showWin());
    }
  }

  undo() {
    if (this.won) return;
    this.deselect();
    const last = this.board.history[this.board.history.length - 1];
    if (!last) return;
    sfx(this, 'sfx_undo', CONFIG.audio.undo);
    if (this.board.isComplete(last.to)) this.unfeed(this.board.bowls[last.to][0]);

    const startSlot = this.portions[last.from].length;
    const rec = this.board.undo();
    const moved = this.portions[rec.to].splice(-rec.n);
    this.portions[rec.from].push(...moved);
    this.fly(moved, rec.from, startSlot);
    this.settleBowl(rec.to);
  }

  // Полёт порций из банки в банку почти по прямой, с лёгким выгибом вверх (moveArc).
  // Твинится свойство самой порции flyT, чтобы killTweensOf(p) останавливал и полёт.
  fly(sprites, to, startSlot) {
    // верхняя порция летит первой
    sprites.slice().reverse().forEach((p, k) => {
      const slot = startSlot + sprites.length - 1 - k;
      const dst = this.slotPos(to, slot);
      this.tweens.killTweensOf(p);
      this.stopPulse(p);
      p.setAlpha(1).setDepth(5);
      const x0 = p.x;
      const y0 = p.y;
      const arc = A.moveArc * this.dim.scale;
      p.flyT = 0;
      this.tweens.add({
        targets: p, flyT: 1, delay: k * A.moveStagger, duration: A.moveDuration, ease: 'Sine.easeInOut',
        onUpdate: () => {
          const t = p.flyT;
          p.setPosition(x0 + (dst.x - x0) * t, y0 + (dst.y - y0) * t - arc * 4 * t * (1 - t));
        },
        onComplete: () => {
          p.setDepth(0);
          if (k === sprites.length - 1) sfx(this, 'sfx_drop');
        },
      });
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

  // Банка собрана: кот мяукает, прыгает к банке, ест (голова ныряет, крошки, хруст),
  // радуется (сердечки) и прыгает обратно. Ввод всё это время не блокируется.
  feed(color, bowl) {
    const cat = this.cats[color];
    const r = this.bowlRects[bowl];
    cat.fedBowl = bowl;
    cat.stopActions().setMood('open');

    sfx(this, 'sfx_complete');
    const mouthY = this.mouthY(bowl);
    this.fxStars.explode(10, r.x, mouthY);
    // в конце уровня банки собираются одна за другой — мяукает только первый кот, остальные молча
    if (this.time.now - this.lastFeedMeow >= CONFIG.audio.feedMeowCooldown) {
      this.lastFeedMeow = this.time.now;
      cat.meow();
    }
    cat.disableInteractive(); // пока кот у банки, он не перехватывает тапы по соседним банкам

    const eatY = mouthY - A.catEatOffsetY * cat.baseScale;
    cat.walkTo(r.x, eatY, () => {
      cat.setMood('happy');
      const food = this.portions[bowl].slice().reverse(); // сверху вниз
      cat.eat(food.length, (k) => {
        if (k === 0) sfx(this, `sfx_chew_${this.chewOrder[this.chewNext++ % this.chewOrder.length]}`, 0.8);
        // порция подлетает ко рту и исчезает
        cat.track(this.tweens.add({
          targets: food[k], y: mouthY, scale: 0, alpha: 0, duration: A.eatPerPortion * 0.5, ease: 'Back.easeIn',
        }));
        this.fxCrumbs.setParticleTint(CONFIG.colors[color].fill);
        this.fxCrumbs.explode(A.crumbs, r.x, mouthY);
      }, () => {
        sfxRandom(this, 'sfx_purr', 3);
        this.wrapJar(bowl, color);
        this.fxHearts.explode(A.hearts, cat.x, cat.y - 60 * cat.baseScale);
        cat.track(this.time.delayedCall(A.catReturnDelay, () => cat.walkTo(cat.home.x, cat.home.y, () => cat.setInteractive())));
      });
    });
  }

  // Отмена хода «разобрала» банку: кот бросает есть и, ворча, возвращается. Корм на место.
  unfeed(color) {
    const cat = this.cats[color];
    if (cat.fedBowl === null) return;
    const bowl = cat.fedBowl;
    cat.fedBowl = null;
    cat.stopActions().setMood('grumpy');
    this.portions[bowl].forEach((p) => {
      this.tweens.killTweensOf(p);
      p.setScale(1).setAlpha(1);
    });
    this.unwrapJar(bowl);
    cat.walkTo(cat.home.x, cat.home.y, () => cat.setMood('open').setInteractive());
  }

  // Банку снизу вверх обматывает джутовая верёвка цвета корма, затем выскакивает картинка корма.
  wrapJar(bowl, color) {
    this.unwrapJar(bowl, true);
    const J = CONFIG.jute;
    const r = this.bowlRects[bowl];
    const top = r.top;
    const bottom = r.bottom - this.dim.base;
    const wrap = makeJuteWrap(this, color, this.dim.bw, top, bottom, `jute_anim_${bowl}`).setPosition(r.x, 0).setDepth(2);
    this.wraps[bowl] = wrap;
    wrap.reveal(0);
    wrap.t = 0;
    const wrapTime = J.coilDuration * wrap.coils;
    this.tweens.add({ targets: wrap, t: 1, duration: wrapTime, onUpdate: () => wrap.reveal(wrap.t) });
    wrap.icon.setScale(0);
    this.tweens.add({ targets: wrap.icon, scale: wrap.iconScale, delay: wrapTime, duration: J.iconDuration, ease: 'Back.easeOut' });
  }

  unwrapJar(bowl, instant = false) {
    const wrap = this.wraps[bowl];
    if (!wrap) return;
    this.wraps[bowl] = null;
    const parts = [wrap.rope, wrap.icon];
    this.tweens.killTweensOf(parts);
    this.tweens.killTweensOf(wrap);
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
