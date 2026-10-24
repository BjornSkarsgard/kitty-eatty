import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { Board } from '../core/Board.js';
import { makePortion, makeFxTextures, makeJuteWrap, makePortionHalo, makeSoftTexture } from '../view/draw.js';
import { beatPulse, beatPhase } from '../beat.js';
import { CatView } from '../view/CatView.js';
import { makeButton } from '../view/Button.js';
import { sfx, sfxRandom, music } from '../audio.js';
import { currentLevel, setCurrentLevel, recordWin, undos, coins, spendUndo, buyUndo } from '../save.js';
import { showPopup } from '../view/Popup.js';
import { iconButton, counterPill, plate, tray, makeIcon } from '../view/ui.js';
import { addSettingsMenu } from '../view/settings.js';
import LEVELS from '../levels/levels.json';

const L = CONFIG.layout;

// В режиме разработки можно открыть любой уровень: http://<адрес>:5173/?level=150
function levelFromUrl() {
  if (!import.meta.env.DEV) return null;
  const n = Number(new URLSearchParams(location.search).get('level'));
  return n >= 1 && n <= LEVELS.length ? n - 1 : null;
}

const A = CONFIG.anim;

export class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  init(data) {
    // по кнопке — переданный уровень, при запуске — из ?level= (разработка) или из сохранения
    this.levelIndex = data.levelIndex ?? levelFromUrl() ?? currentLevel(LEVELS.length);
    setCurrentLevel(this.levelIndex);
    this.behindDoor = data.behindDoor; // запущен из холла за дверью кухни — холл сам доведёт камеру и включит ввод
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
      // за краями экрана — зеркальные продолжения кухни: видны, только пока уровень маленький в проёме двери холла
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        this.add.image(bg.x + dx * bg.displayWidth, bg.y + dy * bg.displayHeight, 'bg_game')
          .setScale(bg.scaleX, bg.scaleY).setFlip(dx !== 0, dy !== 0);
      }
      this.createWallPaws(bg);
    }
    makeFxTextures(this);
    this.createEffects();
    music(this, 'music_game');

    // верхняя полоса: монеты, табличка уровня (у головоломки — сиреневая), настройки
    const U = CONFIG.ui;
    this.coinPill = counterPill(this, 30 + U.pillWidth / 2, U.topY, 'coin', coins());
    plate(this, CONFIG.width / 2, U.topY, `Уровень ${level.id}`, { color: level.puzzle ? 0x6b2fa8 : undefined });
    addSettingsMenu(this, { onExit: () => this.leave() });

    this.layoutBowls();
    this.createBowls();
    this.createPortions();
    this.createCats();
    this.createButtons();
    if (this.behindDoor) {
      this.scene.moveBelow('Room'); // виден только в проёме двери, холл — сверху
      this.input.enabled = false;
    }
  }

  // Домой: холл запускается поверх уровня у открытой двери кухни, сам уводит камеру назад, закрывает дверь
  // и выключает уровень (RoomScene.backFromKitchen).
  leave() {
    this.input.enabled = false;
    this.scene.moveBelow('Room');
    this.scene.launch('Room', { fromKitchen: true });
  }

  // Лапки на обоях: штамп paw.png ровной сеткой по стене (ряды через dy, соседние сдвинуты на полшага dx).
  // Каждая — тёмный отпечаток и поверх него светлый слой, который в разнобой плавно проявляется и гаснет
  // (не больше glow.max за раз; это эффект — без fx.enabled только отпечатки).
  createWallPaws(bg) {
    const P = CONFIG.wallPaws;
    if (!this.textures.exists('paw')) return;
    const s = bg.scaleX;
    const src = bg.texture.getSourceImage();
    const toScreen = (x, y) => ({ x: bg.x + (x - src.width / 2) * s, y: bg.y + (y - src.height / 2) * s });
    const scale = (P.size * s) / this.textures.get('paw').getSourceImage().width;
    const half = P.size / 2;
    const lit = [];
    for (let k = Math.ceil((P.top + half - P.y0) / P.dy); P.y0 + k * P.dy <= P.bottom - half; k++) {
      const y = P.y0 + k * P.dy;
      const shift = Math.abs(k) % 2 ? P.dx / 2 : 0;
      // по краям лапки могут уходить за экран наполовину, как обрезанный рисунок обоев
      for (let x = P.x0 + shift - Math.floor((P.x0 + shift + half) / P.dx) * P.dx; x <= src.width + half; x += P.dx) {
        const pos = toScreen(x, y);
        this.add.image(pos.x, pos.y, 'paw').setScale(scale).setTint(P.color).setAlpha(P.alpha);
        lit.push(this.add.image(pos.x, pos.y, 'paw').setScale(scale).setTint(P.glow.color).setAlpha(0));
      }
    }
    if (!CONFIG.fx.enabled) return;
    const G = P.glow;
    let active = 0;
    const next = () => {
      const idle = lit.filter((p) => !p.glowing);
      if (active < G.max && idle.length) {
        const p = Phaser.Utils.Array.GetRandom(idle);
        p.glowing = true;
        active++;
        this.tweens.add({
          targets: p, alpha: Phaser.Math.FloatBetween(...G.alpha), duration: G.fade, hold: G.hold,
          yoyo: true, ease: 'Sine.easeInOut',
          onComplete: () => { p.glowing = false; active--; },
        });
      }
      this.time.delayedCall(Phaser.Math.Between(...G.gap), next);
    };
    next();
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

  // Лоток внизу — игровые действия: отмена (с бейджем — сколько осталось), заново; на этапе 6 — «+1 банка».
  // Выход домой — в столбике под шестерёнкой.
  createButtons() {
    const U = CONFIG.ui;
    const W = CONFIG.width;
    const step = U.iconButton + 48;
    tray(this, W / 2, U.trayY, step * 2 + 30, U.iconButton + 44);
    this.undoBtn = iconButton(this, W / 2 - step / 2, U.trayY, 'undo', () => this.undo());
    iconButton(this, W / 2 + step / 2, U.trayY, 'restart', () => this.scene.restart({ levelIndex: this.levelIndex }));
    this.refreshUndo();
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

  // Бейдж на отмене — сколько осталось (0 — значок «+»: купить); монеты в пилюле.
  refreshUndo() {
    const n = undos();
    this.undoBtn.setBadge(n > 0 ? n : '+');
    this.coinPill.setValue(coins());
  }

  // Отмена тратит общий запас; запас кончился — предлагаем купить за монеты (позже — за рекламу).
  undo() {
    if (this.won) return;
    this.deselect();
    const last = this.board.history[this.board.history.length - 1];
    if (!last) return;
    if (!spendUndo()) return this.offerUndo();
    this.refreshUndo();
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

  offerUndo() {
    const price = CONFIG.economy.undoPrice;
    const buttons = [{
      label: `Купить за ${price} монет`, color: 0x4caf50, disabled: coins() < price,
      onTap: () => { if (buyUndo()) { sfx(this, 'sfx_coins', CONFIG.audio.coins); this.refreshUndo(); this.undo(); } },
    }];
    if (CONFIG.ads.enabled) buttons.push({ label: 'Смотреть рекламу', color: 0xf0a020, onTap: () => {} }); // этап 6
    buttons.push({ label: 'Не надо' });
    showPopup(this, { title: 'Отмены кончились', text: `Монет: ${coins()}`, buttons });
  }

  // ---------- победа ----------

  // Окно победы (как в референсе): панель с табличкой «Уровень N» и крестиком, звёзды, похвала по звёздам,
  // число ходов, «Награды:» на подставке, зелёная «Продолжить». Крестик — домой.
  showWin() {
    const W = CONFIG.width;
    const H = CONFIG.height;
    const WC = CONFIG.win;
    sfx(this, 'music_win');
    const level = LEVELS[this.levelIndex];
    const reward = recordWin(level, this.levelIndex, this.board.history.length, LEVELS.length);
    this.refreshUndo();
    for (let k = 0; k < 5; k++) this.fxConfetti.explode(Math.round(A.confetti / 5), W * (0.1 + k * 0.2), H);
    const isLast = this.levelIndex === LEVELS.length - 1;
    const font = `"${CONFIG.font}", sans-serif`;
    this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setDepth(20).setInteractive();

    // всё, кроме звёзд, — в одном контейнере, он «выпрыгивает»; звёзды появляются следом
    const cy = H / 2 + WC.offsetY;
    const box = this.add.container(W / 2, cy).setDepth(21);
    const pw = WC.width;
    const ph = WC.height;
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-pw / 2 + 6, -ph / 2 + 14, pw, ph, 48);
    g.fillStyle(0xd48a00, 1).fillRoundedRect(-pw / 2 - 10, -ph / 2 - 10, pw + 20, ph + 20, 56);
    g.fillStyle(0xf5b301, 1).fillRoundedRect(-pw / 2 - 10, -ph / 2 - 10, pw + 20, ph + 12, 56);
    g.fillStyle(0x5b3fd6, 1).fillRoundedRect(-pw / 2, -ph / 2, pw, ph, 46);
    g.fillStyle(0x6d52e8, 1).fillRoundedRect(-pw / 2 + 12, -ph / 2 + 12, pw - 24, ph * 0.45, 38);
    // подставка под награды
    g.fillStyle(0x3b27a0, 1).fillEllipse(0, WC.rewardsY + 58, 380, 70);
    g.fillStyle(0x4a33c0, 1).fillEllipse(0, WC.rewardsY + 46, 380, 64);
    box.add(g);
    box.add(plate(this, 0, -ph / 2 + 4, `Уровень ${level.id}`, { depth: 0, color: 0x4b33a8 }).setScale(1.25));

    const praise = this.add.text(0, WC.praiseY, WC.praise[reward.stars - 1], {
      fontFamily: font, fontStyle: 'bold', fontSize: '84px', stroke: '#7a3a00', strokeThickness: 14,
      shadow: { offsetX: 0, offsetY: 6, color: '#4a2000', blur: 0, stroke: true, fill: true },
    }).setOrigin(0.5);
    const grad = praise.context.createLinearGradient(0, 0, 0, praise.height);
    grad.addColorStop(0.25, '#fff3a0');
    grad.addColorStop(0.75, '#ffa800');
    praise.setFill(grad);
    box.add(praise);

    // ходы — на тёмной полоске, в стиле табличек окна
    const moves = this.add.text(0, WC.movesY, `Ходов: ${this.board.history.length}  ·  минимум ${level.minMoves}`, {
      fontFamily: font, fontStyle: 'bold', fontSize: '32px', color: '#ffffff', stroke: '#2b1a66', strokeThickness: 6,
    }).setOrigin(0.5);
    const mw = moves.width + 48;
    const mg = this.add.graphics();
    mg.fillStyle(0x3b27a0, 1).fillRoundedRect(-mw / 2, WC.movesY - 26, mw, 52, 26);
    mg.lineStyle(3, 0x8f6be8, 1).strokeRoundedRect(-mw / 2, WC.movesY - 26, mw, 52, 26);
    box.add([mg, moves]);

    box.add(this.add.text(0, WC.rewardsY - 92, 'Награды:', {
      fontFamily: font, fontStyle: 'bold', fontSize: '36px', color: '#ffffff', stroke: '#2b1a66', strokeThickness: 7,
    }).setOrigin(0.5));
    const items = [['coin', reward.coins], ['undo', reward.undos]].filter(([, n]) => n > 0);
    items.forEach(([icon, n], i) => {
      const x = (i - (items.length - 1) / 2) * 170;
      const ic = makeIcon(this, icon, 104).setPosition(x, WC.rewardsY);
      if (icon !== 'coin') ic.setScale(ic.scale * 0.8);
      box.add(icon === 'coin' ? ic : [this.add.circle(x, WC.rewardsY, 48, 0x7b5cf0), ic]);
      box.add(this.add.text(x + 40, WC.rewardsY + 38, String(n), {
        fontFamily: font, fontStyle: 'bold', fontSize: '50px', color: '#ffffff', stroke: '#2b1a66', strokeThickness: 9,
      }).setOrigin(0.5));
    });
    if (!items.length) {
      box.add(this.add.text(0, WC.rewardsY, 'Уровень уже пройден', {
        fontFamily: font, fontStyle: 'bold', fontSize: '32px', color: '#d9cfff',
      }).setOrigin(0.5));
    }

    const next = () => this.scene.restart({ levelIndex: isLast ? 0 : this.levelIndex + 1 });
    box.add(makeButton(this, 0, WC.buttonY, isLast ? 'С начала' : 'Продолжить', next, { w: 380, h: 150, size: 50, skin: 'green' }));
    box.add(iconButton(this, pw / 2 - 6, -ph / 2 + 4, 'close', () => this.leave(), {
      size: 92, shape: 'round', color: CONFIG.ui.exitColor, depth: 0,
    }));

    box.setScale(0.5).setAlpha(0);
    sfx(this, 'sfx_popup', CONFIG.audio.popup);
    // монеты звенят, когда звёзды отпрыгали
    if (reward.coins) this.time.delayedCall(400 + reward.stars * CONFIG.stars.popDelay + 200, () => sfx(this, 'sfx_coins', CONFIG.audio.coins));
    this.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
    this.showStars(box, WC.starsY, reward.stars);
  }


  // Три звезды в ряд внутри окна победы (box): сначала все пустые — выпрыгивают вместе с окном,
  // потом заработанные по очереди заполняются со вспышкой. Картинки ui_star / ui_star_empty;
  // пока их нет — растянутая искорка fx_star (пустая — бледная).
  showStars(box, y, count) {
    const S = CONFIG.stars;
    const full = this.textures.exists('ui_star') ? 'ui_star' : 'fx_star';
    const hasEmpty = this.textures.exists('ui_star_empty');
    const fit = (img) => img.setScale(S.size / Math.max(img.width, img.height));
    for (let i = 0; i < 3; i++) {
      const sx = (i - 1) * (S.size + S.gap);
      const sy = y + (i === 1 ? 0 : S.size * 0.12); // средняя чуть выше — дугой
      box.add(fit(this.add.image(sx, sy, hasEmpty ? 'ui_star_empty' : full)).setAlpha(hasEmpty ? 1 : S.emptyAlpha));
      if (i >= count) continue;
      const star = fit(this.add.image(sx, sy, full));
      box.add(star);
      const target = star.scale;
      star.setScale(0);
      this.tweens.add({
        targets: star, scale: target, duration: 380, ease: 'Back.easeOut', delay: 400 + i * S.popDelay,
        onStart: () => sfx(this, 'sfx_star', CONFIG.audio.star, CONFIG.audio.starPitch[i]), // до — ми — соль
        onComplete: () => this.fxStars.setDepth(23).explode(10, box.x + sx, box.y + sy),
      });
    }
  }
}
