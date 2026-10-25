import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { Board } from '../core/Board.js';
import { CatsLevel } from '../theme/cats/kitchen.js';
import { beatPulse } from '../beat.js';
import { sfx, music } from '../audio.js';
import {
  currentLevel, setCurrentLevel, recordWin, undos, coins, spendUndo, buyUndo, lives, loseLife, infiniteLeft,
  boosters, boosterUnlocked, spendBooster, buyBooster,
} from '../core/save.js';
import { hintFor } from '../core/hint.js';
import { confirmLife, showNoLives } from '../view/lives.js';
import { showWinPopup } from '../view/WinPopup.js';
import { showPopup } from '../view/Popup.js';
import { iconButton, counterPill, plate, tray, kindBadge } from '../view/ui.js';
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
    this.again = data.again; // «Заново» — табличку сложного уровня второй раз не показываем
  }

  create() {
    const level = LEVELS[this.levelIndex];
    this.board = new Board(level);
    this.selected = null;
    this.won = false;
    this.moved = false; // был ли ход — тогда «Заново» и выход сжигают жизнь
    this.extraJars = 0; // сколько банок добавлено умением «+1 банка»
    this.scaleCap = undefined; // масштаб банок с запасом под «+1 банка» — считается заново на каждом уровне
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
    if (level.kind) kindBadge(this, CONFIG.width / 2, U.topY + U.kindBadgeY, level.kind, STR.kindShort[level.kind]).setDepth(15);
    addSettingsMenu(this, { onExit: () => this.leave() });

    this.layoutBowls();
    this.createBowls();
    this.createPortions();
    this.theme.createCats(this.board);
    this.createButtons();
    if (this.behindDoor) {
      this.scene.moveBelow('Room'); // виден только в проёме двери, холл — сверху
      this.input.enabled = false;
    } else {
      this.theme.setMirrors(false); // не из холла — продолжения кухни за краями не видны
      this.showKind();
    }
  }

  // Холл довёл влёт через дверь: уровень во весь экран, можно играть; продолжения кухни за краями больше не нужны.
  enteredFromHall() {
    this.cameras.main.setZoom(1).setScroll(0, 0);
    this.input.enabled = true;
    this.theme.setMirrors(false);
    this.showKind();
  }

  // Сложный или кошмарный уровень — табличка до первого хода (не после «Заново»).
  showKind() {
    const kind = LEVELS[this.levelIndex].kind;
    if (!kind || this.again) return;
    showPopup(this, {
      title: STR.kind[kind],
      text: STR.kindText[kind](CONFIG.economy.kindCoins[kind]),
      buttons: [{ label: STR.letsGo, color: kind === 'nightmare' ? PAL.plateNightmare : PAL.plateHard }],
    });
  }

  // Выход из уровня: если уровень начат и не пройден — сначала предупреждение, что сгорит жизнь.
  leave() {
    if (this.won || !this.moved || lives() <= 0 || infiniteLeft() > 0) return this.goHome();
    confirmLife(this, STR.leaveTitle, () => { loseLife(); this.goHome(); });
  }

  // «Заново»: начатый уровень — за жизнь (с предупреждением); жизней нет — окно «Жизни кончились».
  restartLevel() {
    const again = () => this.scene.restart({ levelIndex: this.levelIndex, again: true });
    if (!this.moved || infiniteLeft() > 0) return again(); // бесконечные жизни — ничего не сгорает
    if (lives() <= 0) return showNoLives(this);
    confirmLife(this, STR.restartTitle, () => { loseLife(); again(); });
  }

  // Домой: холл запускается поверх уровня у открытой двери кухни, сам уводит камеру назад, закрывает дверь
  // и выключает уровень (RoomScene.backFromKitchen).
  goHome() {
    this.input.enabled = false;
    this.theme.setMirrors(true); // уровень сейчас уменьшится в проём двери — за краями видна кухня
    this.scene.moveBelow('Room');
    this.scene.launch('Room', { fromKitchen: true });
  }

  // ---------- раскладка ----------

  // Подбираем число рядов так, чтобы банки были как можно крупнее, и масштабируем размеры под экран.
  // Банка — картинка jar_back: сверху горлышко, снизу донышко, стенки между ними растягиваются по высоте.
  // bowlRects: top — верх стенок (горлышко выше него), bottom — низ донышка (стоит на столе).
  // Если «+1 банка» открыта, масштаб с самого начала такой, чтобы влезла и лишняя банка: при её появлении
  // банки только расступаются, а не уменьшаются.
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
    const fit = (count) => {
      let best = null;
      for (let rows = 1; rows <= 4; rows++) {
        const perRow = Math.ceil(count / rows);
        const w = perRow * L.bowlWidth + (perRow - 1) * L.bowlGapX;
        const h = rows * bh0 + (rows - 1) * L.bowlGapY;
        const scale = Math.min(1, availW / w, availH / h);
        if (perRow <= L.maxPerRow && (!best || scale > best.scale + 0.001)) best = { rows, perRow, scale };
      }
      return best;
    };
    if (this.scaleCap === undefined) {
      const extra = boosterUnlocked('jar') ? CONFIG.boosters.jar.perLevel : 0;
      this.scaleCap = fit(n + extra).scale;
    }
    const { rows, perRow } = fit(n);
    const scale = Math.min(fit(n).scale, this.scaleCap);
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
    this.zones = this.bowlRects.map((r, i) => {
      const zone = this.add.zone(r.x, (r.top - this.dim.neck + r.bottom) / 2, this.dim.bw + this.dim.gx * 0.9,
        r.bottom - r.top + this.dim.neck + this.dim.gy * 0.9).setInteractive();
      zone.on('pointerdown', () => this.onBowlTap(i));
      return zone;
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
    // подсказка — только когда есть её иконка icon_hint (арт ещё не готов)
    const items = [
      ['undo', () => this.undo()],
      this.textures.exists('icon_hint') && ['hint', () => this.hint()],
      ['addjar', () => this.addJar()],
      ['restart', () => this.restartLevel()],
    ].filter(Boolean);
    tray(this, W / 2, U.trayY, step * items.length + 30, U.iconButton + 44);
    this.trayBtns = {};
    items.forEach(([icon, onTap], k) => {
      this.trayBtns[icon] = iconButton(this, W / 2 + (k - (items.length - 1) / 2) * step, U.trayY, icon, onTap);
    });
    this.undoBtn = this.trayBtns.undo;
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

  // Бейджи на отмене и умениях — сколько осталось; 0 — вместо бейджа цена (тап — покупка); не открытое умение — бледное;
  // монеты в пилюле.
  refreshUndo() {
    const n = undos();
    this.undoBtn.setBadge(n > 0 ? n : null).setPrice(n > 0 ? null : CONFIG.economy.undoPrice);
    for (const [kind, icon] of [['hint', 'hint'], ['jar', 'addjar']]) {
      const btn = this.trayBtns[icon];
      if (!btn) continue;
      const open = boosterUnlocked(kind);
      const left = boosters(kind);
      btn.setAlpha(open ? 1 : 0.5).setBadge(open && left > 0 ? left : null).setPrice(open && left <= 0 ? CONFIG.boosters[kind].price : null);
    }
    this.coinPill.setValue(coins());
  }

  // Умение не открыто — окно «откроется на N уровне кота»; true — можно пользоваться.
  boosterReady(kind) {
    if (boosterUnlocked(kind)) return true;
    showPopup(this, { title: STR.booster[kind], text: STR.unlocksAtCatLevel(CONFIG.boosters[kind].from), buttons: [{ label: STR.ok }] });
    return false;
  }

  // Потратить заряд умения и сделать use(). Запаса нет — как в Magic Sort: покупка за монеты в один тап, без окна
  // (цена видна на кнопке); окно — только если монет не хватает.
  useBooster(kind, use) {
    if (!spendBooster(kind)) {
      if (!buyBooster(kind)) return this.notEnoughCoins();
      sfx(this, 'sfx_coins', CONFIG.audio.coins);
      spendBooster(kind);
    }
    this.refreshUndo();
    use();
  }

  // Монет не хватает на заряд: окно (на этапе 6 — ещё «посмотреть ролик»).
  notEnoughCoins() {
    const buttons = [];
    if (CONFIG.ads.enabled) buttons.push({ label: STR.watchAd, color: PAL.adOrange, onTap: () => {} }); // этап 6
    buttons.push({ label: STR.ok });
    showPopup(this, { title: STR.noCoinsTitle, text: STR.coinsLeft(coins()), buttons });
  }

  // «+1 банка»: пустая банка до конца уровня; банки расступаются (масштаб не меняется — см. layoutBowls).
  addJar() {
    if (this.won || !this.boosterReady('jar')) return;
    if (this.extraJars >= CONFIG.boosters.jar.perLevel) return this.shakeButton(this.trayBtns.addjar);
    this.useBooster('jar', () => {
      this.deselect();
      this.extraJars += 1;
      this.board.bowls.push([]);
      this.portions.push([]);
      // старые банки, зоны тапа и обмотки — заново на новых местах
      const wrapped = this.board.bowls.map((_, i) => this.theme.jarExtras(i).length > 0);
      this.jarBack.forEach((j) => j.destroy());
      this.jarFront.forEach((j) => j.destroy());
      this.zones.forEach((z) => z.destroy());
      this.theme.resetJars();
      this.layoutBowls();
      this.createBowls();
      wrapped.forEach((on, i) => { if (on) this.theme.wrapJar(i, this.board.bowls[i][0], true); });
      // новые задние стенки созданы позже корма — поднимаем корм над ними (глубина у них одна)
      this.portions.flat().forEach((p) => this.children.bringToTop(p));
      // корм переезжает за своей банкой (в съеденных банках его уже не видно)
      this.portions.forEach((list, i) => {
        if (this.board.isComplete(i)) return;
        list.forEach((p, slot) => {
          const pos = this.slotPos(i, slot);
          this.tweens.killTweensOf(p);
          this.stopPulse(p);
          this.tweens.add({ targets: p, x: pos.x, y: pos.y, duration: A.liftDuration * 2, ease: 'Cubic.easeOut' });
        });
      });
      // новая банка выпрыгивает
      const last = this.board.bowls.length - 1;
      for (const j of [this.jarBack[last], this.jarFront[last]]) {
        j.setScale(0.2).setAlpha(0);
        this.tweens.add({ targets: j, scale: 1, alpha: 1, duration: 360, ease: 'Back.easeOut' });
      }
      sfx(this, 'sfx_popup', CONFIG.audio.popup);
    });
  }

  // «Нюх»: подсказать ход из решения уровня; игрок ушёл с пути — сначала предложить откатиться.
  hint() {
    if (this.won || !this.boosterReady('hint')) return;
    this.deselect();
    const level = LEVELS[this.levelIndex];
    const h = hintFor(level, this.board);
    if (!h) return;
    if (h.move) return this.useBooster('hint', () => this.showHint(h.move));
    showPopup(this, {
      title: STR.offTrackTitle,
      text: STR.offTrackText(h.back),
      buttons: [
        {
          label: STR.yes, color: PAL.buyGreen, onTap: () => this.useBooster('hint', () => {
            for (let k = 0; k < h.back; k++) this.undoMove();
            const next = hintFor(level, this.board);
            if (next?.move) this.time.delayedCall(A.moveDuration, () => this.showHint(next.move));
          }),
        },
        { label: STR.no },
      ],
    });
  }

  // Подсказанный ход: банка, откуда брать, выбрана (тапни, куда класть), банка, куда класть, подпрыгивает.
  showHint([from, to]) {
    sfx(this, 'sfx_star', CONFIG.audio.star);
    this.select(from);
    const layers = [this.jarBack[to], this.jarFront[to], ...this.theme.jarExtras(to)];
    const portions = this.portions[to];
    const dy = -A.liftY * this.dim.scale * 0.6;
    const repeat = Math.max(1, Math.round(CONFIG.boosters.hintShowMs / 500) - 1);
    this.tweens.add({ targets: [...layers, ...portions], y: '+=' + dy, duration: 250, yoyo: true, repeat, ease: 'Sine.easeInOut' });
  }

  // Кнопка лотка «нельзя»: звук и дрожь.
  shakeButton(btn) {
    sfx(this, 'sfx_invalid');
    const x = btn.x;
    this.tweens.add({ targets: btn, x: x + 8, duration: 50, yoyo: true, repeat: 2, onComplete: () => { btn.x = x; } });
  }

  // Отмена тратит общий запас; запас кончился — предлагаем купить за монеты (позже — за рекламу).
  undo() {
    if (this.won) return;
    this.deselect();
    const last = this.board.history[this.board.history.length - 1];
    if (!last) return;
    // запаса нет — покупка в один тап (цена на кнопке), монет не хватает — окно
    if (!spendUndo()) {
      if (!buyUndo()) return this.notEnoughCoins();
      sfx(this, 'sfx_coins', CONFIG.audio.coins);
      spendUndo();
    }
    this.refreshUndo();
    this.undoMove();
  }

  // Откатить последний ход с анимацией (запас отмен не трогает — это делает вызывающий).
  undoMove() {
    const last = this.board.history[this.board.history.length - 1];
    if (!last) return;
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
      level, reward, isLast, fxStars: this.fxStars,
      onNext: () => (lives() > 0 ? go() : showNoLives(this, go)),
      onHome: () => this.leave(),
      onTake: () => { this.coinPill.setValue(coins()); this.refreshUndo(); },
    });
  }
}
