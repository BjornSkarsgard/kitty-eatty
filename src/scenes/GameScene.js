import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { Board } from '../core/Board.js';
import { makePortion, makeFxTextures } from '../view/draw.js';
import { CatView } from '../view/CatView.js';
import { sfx, music } from '../audio.js';
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
    }).setOrigin(0.5);

    this.layoutBowls();
    this.createBowls();
    this.createPortions();
    this.createCats();
    this.createButtons();
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
      scale,
    });
    const bh = this.board.capacity * d.ph + d.pad * 2;
    const totalH = rows * bh + (rows - 1) * d.gy;
    const top0 = L.bowlsTop + (availH - totalH) / 2;

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
    return { x: r.x, y: r.bottom - d.pad - d.ph / 2 - slot * d.ph };
  }

  // ---------- создание объектов ----------

  createBowls() {
    // Банка из двух слоёв: задний (стекло, горлышко, подставка) под кормом, передний (блик) над ним.
    this.jarFront = this.bowlRects.map((r) => this.add.graphics({ x: r.x, y: 0 }).setDepth(1));
    this.bowlGfx = this.bowlRects.map((r, i) => {
      const g = this.add.graphics({ x: r.x, y: 0 });
      const zone = this.add.zone(r.x, (r.top + r.bottom) / 2, this.dim.bw + this.dim.gx * 0.9, r.bottom - r.top + this.dim.gy * 0.9)
        .setInteractive();
      zone.on('pointerdown', () => this.onBowlTap(i));
      return g;
    });
    this.bowlGfx.forEach((_, i) => this.drawBowl(i));
  }

  drawBowl(i) {
    const J = CONFIG.jar;
    const g = this.bowlGfx[i];
    const front = this.jarFront[i];
    const r = this.bowlRects[i];
    const s = this.dim.scale;
    const done = this.board.isComplete(i);
    const bw = this.dim.bw;
    const h = r.bottom - r.top;
    const rad = J.radius * s;
    const lw = CONFIG.outlineWidth * Math.max(0.6, s);

    g.clear();
    // подставка-миска
    const bo = J.baseOverhang * s;
    const by = r.bottom - J.baseHeight * s * 0.4;
    g.fillStyle(J.base, 1).fillRoundedRect(-bw / 2 - bo, by, bw + bo * 2, J.baseHeight * s, rad * 0.6);
    g.lineStyle(lw, CONFIG.outline, 1).strokeRoundedRect(-bw / 2 - bo, by, bw + bo * 2, J.baseHeight * s, rad * 0.6);
    // стекло
    g.fillStyle(J.glass, J.glassAlpha).fillRoundedRect(-bw / 2, r.top, bw, h, rad);
    g.lineStyle(lw, CONFIG.outline, 1).strokeRoundedRect(-bw / 2, r.top, bw, h, rad);
    // горлышко
    const ro = J.rimOverhang * s;
    const rh = J.rimHeight * s;
    g.fillStyle(done ? CONFIG.bowlDoneStroke : J.rim, 1).fillRoundedRect(-bw / 2 - ro, r.top - rh / 2, bw + ro * 2, rh, rh / 2);
    g.lineStyle(lw, CONFIG.outline, 1).strokeRoundedRect(-bw / 2 - ro, r.top - rh / 2, bw + ro * 2, rh, rh / 2);

    // блик поверх корма
    front.clear();
    front.fillStyle(0xffffff, J.highlightAlpha);
    front.fillRoundedRect(-bw / 2 + 7 * s, r.top + rh, 9 * s, h - rh * 2, 4 * s);
    front.fillCircle(-bw / 2 + 11.5 * s, r.bottom - rh * 0.6, 4.5 * s);
  }

  createPortions() {
    const w = this.dim.bw - this.dim.pad * 2 - 4;
    const h = this.dim.ph - 6 * this.dim.scale;
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
      const cat = new CatView(this, x0 + c * spacing, L.catsY, c);
      cat.setDepth(10).setBaseScale(Math.min(1, spacing / L.catSpacing)).startIdle();
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

  select(i) {
    sfx(this, 'sfx_pick');
    this.selected = i;
    const run = this.board.topRun(i);
    this.portions[i].slice(-run).forEach((p, k, arr) => {
      const slot = this.portions[i].length - arr.length + k;
      this.tweens.killTweensOf(p);
      this.tweens.add({ targets: p, y: this.slotPos(i, slot).y - A.liftY * this.dim.scale, duration: A.liftDuration, ease: 'Quad.easeOut' });
    });
  }

  deselect() {
    if (this.selected === null) return;
    const i = this.selected;
    this.selected = null;
    this.settleBowl(i);
  }

  // Плавно ставит все порции банки на свои места.
  settleBowl(i) {
    this.portions[i].forEach((p, slot) => {
      const pos = this.slotPos(i, slot);
      this.tweens.killTweensOf(p);
      p.setScale(1).setAlpha(1);
      this.tweens.add({ targets: p, x: pos.x, y: pos.y, duration: A.liftDuration, ease: 'Quad.easeOut' });
    });
  }

  shake(i) {
    sfx(this, 'sfx_invalid');
    const layers = [this.bowlGfx[i], this.jarFront[i]];
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

    this.fly(moved, from, to, startSlot);
    this.settleBowl(from); // если серия влезла не вся — остаток опускается обратно

    if (this.board.isComplete(to)) {
      this.drawBowl(to);
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
    sfx(this, 'sfx_undo');
    if (this.board.isComplete(last.to)) this.unfeed(this.board.bowls[last.to][0]);

    const startSlot = this.portions[last.from].length;
    const rec = this.board.undo();
    const moved = this.portions[rec.to].splice(-rec.n);
    this.portions[rec.from].push(...moved);
    this.fly(moved, rec.to, rec.from, startSlot);
    this.settleBowl(rec.to);
    this.drawBowl(rec.to);
  }

  // Полёт порций дугой: вверх → над целевой банкой → вниз на место.
  fly(sprites, from, to, startSlot) {
    const arcY = Math.min(this.bowlRects[from].top, this.bowlRects[to].top) - A.moveUp;
    const dstX = this.bowlRects[to].x;
    // верхняя порция летит первой
    sprites.slice().reverse().forEach((p, k) => {
      const slot = startSlot + sprites.length - 1 - k;
      this.tweens.killTweensOf(p);
      p.setScale(1).setAlpha(1).setDepth(5);
      this.tweens.chain({
        targets: p,
        tweens: [
          { y: arcY, delay: k * A.moveStagger, duration: A.moveDuration, ease: 'Quad.easeOut' },
          { x: dstX, duration: A.moveDuration, ease: 'Sine.easeInOut' },
          { y: this.slotPos(to, slot).y, duration: A.moveDuration, ease: 'Quad.easeIn' },
        ],
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
    this.fxStars.explode(10, r.x, r.top);
    cat.meow();

    const eatY = r.top - CONFIG.jar.rimHeight * this.dim.scale - A.catEatOffsetY * cat.baseScale;
    cat.hopTo(r.x, eatY, () => {
      cat.setMood('happy');
      const food = this.portions[bowl].slice().reverse(); // сверху вниз
      cat.eat(food.length, (k) => {
        // порция подлетает ко рту и исчезает
        cat.track(this.tweens.add({
          targets: food[k], y: r.top, scale: 0, alpha: 0, duration: A.eatPerPortion * 0.5, ease: 'Back.easeIn',
        }));
        this.fxCrumbs.setParticleTint(CONFIG.colors[color].fill);
        this.fxCrumbs.explode(A.crumbs, r.x, r.top);
      }, () => {
        sfx(this, 'sfx_purr');
        this.fxHearts.explode(A.hearts, cat.x, cat.y - 60 * cat.baseScale);
        cat.track(this.time.delayedCall(A.catReturnDelay, () => cat.hopTo(cat.home.x, cat.home.y)));
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
    cat.hopTo(cat.home.x, cat.home.y, () => cat.setMood('open'));
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
