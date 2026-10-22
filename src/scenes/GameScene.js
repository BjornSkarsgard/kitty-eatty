import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { Board } from '../core/Board.js';
import { makePortion, makeCat, setCatMood } from '../view/draw.js';
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

  // Подбираем число рядов так, чтобы миски были как можно крупнее, и масштабируем размеры под экран.
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
    const g = this.bowlGfx[i];
    const r = this.bowlRects[i];
    const done = this.board.isComplete(i);
    const bw = this.dim.bw;
    g.clear();
    g.fillStyle(CONFIG.bowlFill, 1);
    g.fillRoundedRect(-bw / 2, r.top, bw, r.bottom - r.top, 18 * this.dim.scale);
    g.lineStyle(CONFIG.outlineWidth, done ? CONFIG.bowlDoneStroke : CONFIG.outline, 1);
    g.strokeRoundedRect(-bw / 2, r.top, bw, r.bottom - r.top, 18 * this.dim.scale);
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
      const cat = makeCat(this, c).setDepth(10).setScale(Math.min(1, spacing / L.catSpacing));
      cat.home = { x: x0 + c * spacing, y: L.catsY };
      cat.setPosition(cat.home.x, cat.home.y);
      cat.fedBowl = null;
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

  // Плавно ставит все порции миски на свои места.
  settleBowl(i) {
    this.portions[i].forEach((p, slot) => {
      const pos = this.slotPos(i, slot);
      this.tweens.killTweensOf(p);
      p.setScale(1).setAlpha(1);
      this.tweens.add({ targets: p, x: pos.x, y: pos.y, duration: A.liftDuration, ease: 'Quad.easeOut' });
    });
  }

  shake(i) {
    const g = this.bowlGfx[i];
    const x = this.bowlRects[i].x;
    this.tweens.killTweensOf(g);
    g.x = x;
    this.tweens.add({
      targets: g, x: x + A.shakeDistance, duration: A.shakeDuration, yoyo: true, repeat: 1,
      onComplete: () => { g.x = x; },
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
    if (this.board.isComplete(last.to)) this.unfeed(this.board.bowls[last.to][0]);

    const startSlot = this.portions[last.from].length;
    const rec = this.board.undo();
    const moved = this.portions[rec.to].splice(-rec.n);
    this.portions[rec.from].push(...moved);
    this.fly(moved, rec.to, rec.from, startSlot);
    this.settleBowl(rec.to);
    this.drawBowl(rec.to);
  }

  // Полёт порций дугой: вверх → над целевой миской → вниз на место.
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
        onComplete: () => p.setDepth(0),
      });
    });
  }

  // ---------- коты ----------

  // Кот идёт к собранной миске и съедает порции. Ввод не блокируется.
  feed(color, bowl) {
    const cat = this.cats[color];
    const r = this.bowlRects[bowl];
    cat.fedBowl = bowl;
    this.tweens.killTweensOf(cat);
    setCatMood(cat, 'open');

    this.tweens.add({
      targets: cat, x: r.x, y: r.top - A.catEatOffsetY,
      duration: A.catWalkDuration, ease: 'Sine.easeInOut',
      onComplete: () => {
        setCatMood(cat, 'happy');
        const food = this.portions[bowl].slice().reverse();
        food.forEach((p, k) => {
          this.tweens.add({
            targets: p, scale: 0, alpha: 0,
            delay: k * A.eatPerPortion, duration: A.eatPerPortion * 0.8, ease: 'Back.easeIn',
          });
        });
        const base = cat.scaleY;
        this.tweens.add({
          targets: cat, scaleY: base * 0.9, duration: A.eatPerPortion / 2,
          yoyo: true, repeat: food.length - 1,
        });
        this.tweens.add({
          targets: cat, x: cat.home.x, y: cat.home.y,
          delay: food.length * A.eatPerPortion + A.catReturnDelay,
          duration: A.catWalkDuration, ease: 'Sine.easeInOut',
        });
      },
    });
  }

  // Отмена хода «разобрала» миску: кот возвращается голодным, корм на место.
  unfeed(color) {
    const cat = this.cats[color];
    if (cat.fedBowl === null) return;
    this.tweens.killTweensOf(cat);
    cat.setScale(cat.scaleX); // сброс «жевания»
    cat.fedBowl = null;
    setCatMood(cat, 'open');
    this.tweens.add({ targets: cat, x: cat.home.x, y: cat.home.y, duration: A.catWalkDuration, ease: 'Sine.easeInOut' });
  }

  // ---------- победа ----------

  showWin() {
    const W = CONFIG.width;
    const H = CONFIG.height;
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
