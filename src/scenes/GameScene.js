import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { Board } from '../core/Board.js';
import { CatsLevel } from '../theme/cats/kitchen.js';
import { beatPulse } from '../beat.js';
import { sfx, music } from '../audio.js';
import { currentLevel, setCurrentLevel, recordWin, undos, coins, spendUndo, buyUndo, lives, loseLife } from '../core/save.js';
import { confirmLife, showNoLives } from '../view/lives.js';
import { showWinPopup } from '../view/WinPopup.js';
import { showPopup } from '../view/Popup.js';
import { iconButton, counterPill, plate, tray } from '../view/ui.js';
import { addSettingsMenu } from '../view/settings.js';
import { LEVELS } from '../core/levels.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

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
    this.moved = false; // был ли ход — тогда «Заново» и выход сжигают жизнь
    this.pulsing = new Set(); // порции, которые пульсируют в такт музыке
    this.glass = null;
    // всё про котиков — фон кухни, банки, корм, коты, кормление — в теме (src/theme/cats/kitchen.js)
    this.theme = new CatsLevel(this);
    this.theme.createBackground();
    this.createEffects();
    music(this, 'music_game');

    // верхняя полоса: монеты, табличка уровня (у головоломки — сиреневая), настройки
    const U = CONFIG.ui;
    this.coinPill = counterPill(this, 30 + U.pillWidth / 2, U.topY, 'coin', coins());
    plate(this, CONFIG.width / 2, U.topY, STR.level(level.id), { color: level.puzzle ? PAL.platePuzzle : undefined });
    addSettingsMenu(this, { onExit: () => this.leave() });

    this.layoutBowls();
    this.createBowls();
    this.createPortions();
    this.theme.createCats(this.board);
    this.createButtons();
    if (this.behindDoor) {
      this.scene.moveBelow('Room'); // виден только в проёме двери, холл — сверху
      this.input.enabled = false;
    }
  }

  // Выход из уровня: если уровень начат и не пройден — сначала предупреждение, что сгорит жизнь.
  leave() {
    if (this.won || !this.moved || lives() <= 0) return this.goHome();
    confirmLife(this, STR.leaveTitle, () => { loseLife(); this.goHome(); });
  }

  // «Заново»: начатый уровень — за жизнь (с предупреждением); жизней нет — окно «Жизни кончились».
  restartLevel() {
    const again = () => this.scene.restart({ levelIndex: this.levelIndex });
    if (!this.moved) return again();
    if (lives() <= 0) return showNoLives(this);
    confirmLife(this, STR.restartTitle, () => { loseLife(); again(); });
  }

  // Домой: холл запускается поверх уровня у открытой двери кухни, сам уводит камеру назад, закрывает дверь
  // и выключает уровень (RoomScene.backFromKitchen).
  goHome() {
    this.input.enabled = false;
    this.scene.moveBelow('Room');
    this.scene.launch('Room', { fromKitchen: true });
  }

  // ---------- раскладка ----------

  // Подбираем число рядов так, чтобы банки были как можно крупнее, и масштабируем размеры под экран.
  // Банка — картинка jar_back: сверху горлышко, снизу донышко, стенки между ними растягиваются по высоте.
  // bowlRects: top — верх стенок (горлышко выше него), bottom — низ донышка (стоит на столе).
  layoutBowls() {
    const n = this.board.bowls.length;
    const art = this.theme.jarArt();
    const tex = art; // width / height картинки банки
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

  // Банка — от темы: стекло сзади (под кормом) и спереди (над ним).
  createBowls() {
    const jars = this.bowlRects.map((r) => this.theme.createJar(r, this.dim));
    this.jarBack = jars.map((j) => j.back.setDepth(0));
    this.jarFront = jars.map((j) => j.front.setDepth(1));
    this.bowlRects.forEach((r, i) => {
      const zone = this.add.zone(r.x, (r.top - this.dim.neck + r.bottom) / 2, this.dim.bw + this.dim.gx * 0.9,
        r.bottom - r.top + this.dim.neck + this.dim.gy * 0.9).setInteractive();
      zone.on('pointerdown', () => this.onBowlTap(i));
    });
  }

  createPortions() {
    const w = this.dim.bw - this.theme.jarArt().edge * 2 * this.dim.k - 2;
    const h = this.dim.ph - 4 * this.dim.scale;
    this.portions = this.board.bowls.map((bowl, i) => bowl.map((color, slot) => {
      const p = this.theme.createPortion(color, w, h);
      const pos = this.slotPos(i, slot);
      p.setPosition(pos.x, pos.y);
      return p;
    }));
  }

  // Лоток внизу — игровые действия: отмена (с бейджем — сколько осталось), заново; на этапе 6 — «+1 банка».
  // Выход домой — в столбике под шестерёнкой.
  createButtons() {
    const U = CONFIG.ui;
    const W = CONFIG.width;
    const step = U.iconButton + 48;
    tray(this, W / 2, U.trayY, step * 2 + 30, U.iconButton + 44);
    this.undoBtn = iconButton(this, W / 2 - step / 2, U.trayY, 'undo', () => this.undo());
    iconButton(this, W / 2 + step / 2, U.trayY, 'restart', () => this.restartLevel());
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
    const layers = [this.jarBack[i], this.jarFront[i], ...this.theme.jarExtras(i)];
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
    if (CONFIG.fx.enabled && !p.halo) p.halo = this.theme.portionHalo(p, CONFIG.fx.selectGlow, this.dim.bw - 2);
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
    const soft = this.theme.softTexture();
    const run = this.portions[i].slice(-this.board.topRun(i));
    const ys = run.map((p) => p.y);
    const d = this.dim;
    const w = d.bw - this.theme.jarArt().edge * 2 * d.k;
    const h = Math.max(...ys) - Math.min(...ys) + d.ph * 1.6;
    const y = (Math.max(...ys) + Math.min(...ys)) / 2 - A.liftY * d.scale;
    this.glass = this.add.image(this.bowlRects[i].x, y, soft).setDisplaySize(w, h).setDepth(2)
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
    this.theme.update();
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
    const layers = [this.jarBack[i], this.jarFront[i], ...this.theme.jarExtras(i)];
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
    this.moved = true;
    const startSlot = this.portions[to].length;
    const n = this.board.move(from, to);
    const moved = this.portions[from].splice(-n);
    this.portions[to].push(...moved);
    this.selected = null;

    this.fly(moved, to, startSlot);
    this.settleBowl(from); // если серия влезла не вся — остаток опускается обратно

    if (this.board.isComplete(to)) {
      this.theme.jarComplete(to, this.board.bowls[to][0]);
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
    if (this.board.isComplete(last.to)) this.theme.jarUndone(this.board.bowls[last.to][0]);

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

  // ---------- эффекты ----------

  // Звёздочки (собранная банка, звёзды победы) и конфетти; текстуры — от темы (createBackground).
  createEffects() {
    const fx = (key, cfg) => this.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(12);
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

  offerUndo() {
    const price = CONFIG.economy.undoPrice;
    const buttons = [{
      label: STR.buyFor(price), color: PAL.buyGreen, disabled: coins() < price,
      onTap: () => { if (buyUndo()) { sfx(this, 'sfx_coins', CONFIG.audio.coins); this.refreshUndo(); this.undo(); } },
    }];
    if (CONFIG.ads.enabled) buttons.push({ label: STR.watchAd, color: PAL.adOrange, onTap: () => {} }); // этап 6
    buttons.push({ label: STR.noThanks });
    showPopup(this, { title: STR.noUndosTitle, text: STR.coinsLeft(coins()), buttons });
  }

  // ---------- победа ----------

  // Записать победу и показать окно победы (src/view/WinPopup.js); новые уровни кота — окнами поверх.
  showWin() {
    const W = CONFIG.width;
    const H = CONFIG.height;
    sfx(this, 'music_win');
    const level = LEVELS[this.levelIndex];
    const reward = recordWin(level, this.levelIndex, this.board.history.length, LEVELS.length);
    this.refreshUndo();
    for (let k = 0; k < 5; k++) this.fxConfetti.explode(Math.round(A.confetti / 5), W * (0.1 + k * 0.2), H);
    const isLast = this.levelIndex === LEVELS.length - 1;
    // следующий уровень — только если есть жизни (иначе окно «Жизни кончились»; купил — сразу дальше)
    const go = () => this.scene.restart({ levelIndex: isLast ? 0 : this.levelIndex + 1 });
    showWinPopup(this, {
      level, moves: this.board.history.length, reward, isLast, fxStars: this.fxStars,
      onNext: () => (lives() > 0 ? go() : showNoLives(this, go)),
      onHome: () => this.leave(),
      onTake: () => { this.coinPill.setValue(coins()); this.refreshUndo(); },
    });
  }
}
