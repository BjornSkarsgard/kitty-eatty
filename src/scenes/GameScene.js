import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { Board } from '../core/Board.js';
import { CatsLevel } from '../theme/cats/kitchen.js';
import { CatView } from '../theme/cats/CatView.js';
import { beatPulse } from '../beat.js';
import { sfx, music } from '../audio.js';
import {
  currentLevel, setCurrentLevel, recordWin, undos, coins, spendUndo, buyUndo, lives, loseLife, infiniteLeft,
  boosters, boosterUnlocked, spendBooster, buyBooster, selectedUltra, ultLeft, spendUlt,
} from '../core/save.js';
import { ULTS_READY } from '../theme/cats/ultras.js';
import { hintFor } from '../core/hint.js';
import { confirmLife, showNoLives } from '../view/lives.js';
import { showWinPopup } from '../view/WinPopup.js';
import { showPopup } from '../view/Popup.js';
import { iconButton, counterPill, plate, tray, kindBadge } from '../view/ui.js';
import { addSettingsMenu } from '../view/settings.js';
import { LEVELS } from '../core/levels.js';
import { TEST_TOOLS } from '../dev.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

const L = CONFIG.layout;

// В режиме разработки можно открыть любой уровень: http://<адрес>:5173/?level=150
function levelFromUrl() {
  if (!TEST_TOOLS) return null;
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
    // ультракот: ульта восстанавливается за CONFIG.ultRecharge уровней (save.ultLeft); ultPick — ждём тап по порции,
    // ultFirst — первая выбранная порция [банка, место]
    this.ultra = selectedUltra();
    this.ultPick = false;
    this.ultFirst = null;
    this.instinct = 0; // «Чутьё»: сколько ещё ходов подсвечивать
    this.pocket = false; // «Карман» манчкина уже на уровне
    // насколько выше обычной может стать банка (место в рядах — с начала уровня): запасная банка ультракота +boost.jarCap
    const U2 = this.ultra;
    this.reserveSlots = U2?.boost?.jarCap ?? 0;
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
  // Сложный или кошмарный уровень — табличка до первого хода; первая встреча с механикой — окно «Новинка!»
  // (не после «Заново»).
  showKind() {
    const { kind, intro } = LEVELS[this.levelIndex];
    if (this.again) return;
    const novelty = () => intro && showPopup(this, { title: STR.novelty, text: STR.noveltyText[intro], buttons: [{ label: STR.ok }] });
    if (!kind) return novelty();
    showPopup(this, {
      title: STR.kind[kind],
      text: STR.kindText[kind](CONFIG.economy.kindCoins[kind]),
      buttons: [{ label: STR.letsGo, color: kind === 'nightmare' ? PAL.plateNightmare : PAL.plateHard, onTap: novelty }],
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
  // банки только расступаются, а не уменьшаются. Ряды — с запасом по высоте на reserveSlots порций
  // (банка ультракота бывает выше обычной); банка стоит на дне ряда, её высота — по своей вместимости.
  layoutBowls() {
    const n = this.board.bowls.length;
    const art = this.theme.jarArt();
    const tex = art; // width / height картинки банки
    const neck = (bw) => (art.top * bw) / tex.width;
    const base = (bw) => ((tex.height - art.bottom) * bw) / tex.width;
    const floor = (bw) => ((tex.height - art.floor) * bw) / tex.width;
    // высота ряда (в порциях) — по самой высокой банке ряда, но не ниже обычной с запасом
    const slotsMin = this.board.capacity + this.reserveSlots;
    const caps = this.board.caps;
    const rowSlots = (count, perRow, r) => Math.max(slotsMin, ...caps.slice(r * perRow, Math.min(count, (r + 1) * perRow)).slice(0, perRow));
    const availW = CONFIG.width - L.sideMargin * 2;
    const availH = L.bowlsBottom - L.bowlsTop - neck(L.bowlWidth);
    const fit = (count) => {
      let best = null;
      for (let rows = 1; rows <= 4; rows++) {
        const perRow = Math.ceil(count / rows);
        const w = perRow * L.bowlWidth + (perRow - 1) * L.bowlGapX;
        let h = (rows - 1) * L.bowlGapY;
        for (let r = 0; r < rows; r++) h += (count > n ? slotsMin : rowSlots(count, perRow, r)) * L.portionHeight + L.bowlPadding + floor(L.bowlWidth);
        const scale = Math.min(1, availW / w, availH / h);
        if (perRow <= L.maxPerRow && (!best || scale > best.scale + 0.001)) best = { rows, perRow, scale };
      }
      return best;
    };
    if (this.scaleCap === undefined) {
      const extra = (boosterUnlocked('jar') ? CONFIG.boosters.jar.perLevel : 0) + (this.ultra?.ult === 'pocket' ? 1 : 0);
      this.scaleCap = fit(n + extra).scale;
    }
    const { rows, perRow } = fit(n);
    const scale = Math.min(fit(n).scale, this.scaleCap); // выросшая банка («Тесно, но влезет») — всё мельче
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
    const rowH = [];
    for (let r = 0; r < rows; r++) rowH.push(rowSlots(n, perRow, r) * d.ph + d.pad + d.floor);
    const totalH = rowH.reduce((a, b) => a + b, 0) + (rows - 1) * d.gy;
    const top0 = L.bowlsBottom - totalH; // нижний ряд стоит на столе

    this.bowlRects = [];
    let top = top0;
    for (let r = 0; r < rows; r++) {
      const count = Math.min(perRow, n - r * perRow);
      const rowW = count * d.bw + (count - 1) * d.gx;
      const x0 = (CONFIG.width - rowW) / 2 + d.bw / 2;
      const bh = rowH[r];
      if (r > 0) top += rowH[r - 1] + d.gy;
      for (let c = 0; c < count; c++) {
        const i = this.bowlRects.length;
        const own = this.board.caps[i] * d.ph + d.pad + d.floor; // высота самой банки
        this.bowlRects.push({ x: x0 + c * (d.bw + d.gx), top: top + bh - own, bottom: top + bh });
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
      zone.on('pointerdown', (p) => this.onBowlTap(i, p));
      return zone;
    });
    // лёд — поверх замороженных банок, с числом: сколько ещё собрать
    this.iceViews = this.bowlRects.map((r, i) => (this.board.isFrozen(i) ? this.theme.createIce(r, this.dim).setCount(this.board.iceLeft(i)) : null));
  }

  createPortions() {
    const w = this.dim.bw - this.theme.jarArt().edge * 2 * this.dim.k - 2;
    const h = this.dim.ph - 4 * this.dim.scale;
    this.portions = this.board.bowls.map((bowl, i) => bowl.map((color, slot) => {
      const p = this.theme.createPortion(color, w, h);
      const pos = this.slotPos(i, slot);
      p.setPosition(pos.x, pos.y);
      if (this.board.isHidden(i, slot)) this.theme.setHidden(p, true);
      return p;
    }));
  }

  // После любого изменения поля: «?» — как в Board (открылась — на глазах), растаявший лёд — тает, на остальном — новое число.
  syncBlockers() {
    this.portions.forEach((list, i) => list.forEach((p, s) => this.theme.setHidden(p, this.board.isHidden(i, s), true)));
    const { thawed, caps } = this.board.takeChanges();
    if (caps) this.relayout();
    for (const i of thawed) {
      this.iceViews[i]?.melt();
      this.iceViews[i] = null;
    }
    this.iceViews.forEach((v, i) => v?.setCount(this.board.iceLeft(i)));
  }

  // Банка выросла или сжалась («Тесно, но влезет»): банки заново, при нужде всё мельче — корм масштабируется следом.
  relayout() {
    const old = this.dim.scale;
    this.rebuildJars();
    const k = this.dim.scale / old;
    if (Math.abs(k - 1) < 0.001) return;
    this.portions.flat().forEach((p) => {
      p.baseScale = (p.baseScale ?? 1) * k;
      if (p.scale > 0) this.tweens.add({ targets: p, scale: p.baseScale, duration: A.liftDuration * 2, ease: 'Cubic.easeOut' });
    });
  }

  // Порции разлетаются по местам из Board после ульты или её отмены: банки, где ничего не поменялось, не трогаем;
  // в остальных каждая порция летит на ближайшее место своего цвета. Возвращает лишние (съеденные «Перекусом»).
  resyncPortions() {
    const same = (i) => this.portions[i]?.length === this.board.bowls[i].length
      && this.portions[i].every((p, s) => p.color === this.board.bowls[i][s]);
    const changed = this.board.bowls.map((_, i) => !same(i));
    const pool = [];
    this.portions.forEach((list, i) => { if (changed[i]) pool.push(...list); });
    const next = this.board.bowls.map((b, i) => {
      if (!changed[i]) return this.portions[i];
      return b.map((c, s) => {
        const pos = this.slotPos(i, s);
        let best = -1;
        let bestD = Infinity;
        pool.forEach((p, k) => {
          if (p.color !== c) return;
          const d = Phaser.Math.Distance.Between(p.x, p.y, pos.x, pos.y);
          if (d < bestD) { bestD = d; best = k; }
        });
        const p = pool.splice(best, 1)[0];
        this.flyTo(p, pos, 0);
        return p;
      });
    });
    this.portions = next;
    return pool;
  }

  // Лоток внизу — игровые действия: отмена (с бейджем — сколько осталось), заново; на этапе 6 — «+1 банка».
  // Выход домой — в столбике под шестерёнкой.
  createButtons() {
    const U = CONFIG.ui;
    const W = CONFIG.width;
    const step = U.iconButton + 48;
    // подсказка — только когда есть её иконка icon_hint (арт ещё не готов)
    const ultOn = this.ultra && ULTS_READY.has(this.ultra.ult);
    const items = [
      ultOn && ['ult', () => this.ult()],
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
    if (ultOn) {
      // на кнопке ульты — голова ультракота из частей (пока окраса-замены): глаза открыты и моргают; золотая подложка
      const b = this.trayBtns.ult;
      const head = new CatView(this, 0, 0, this.ultra.look, { headOnly: true }).setMood('open');
      const box = head.getBounds();
      const k = (U.iconButton * 0.74) / Math.max(box.width, box.height);
      head.setScale(k).setPosition(-box.centerX * k, -box.centerY * k - 2);
      b.addAt(head, 2);
      head.startIdle();
      b.setColor(PAL.gold);
    }
    this.refreshUndo();
  }

  // ---------- ввод ----------

  onBowlTap(i, pointer) {
    if (this.won) return;
    if (this.ultPick) return this.pickForUlt(i, pointer);
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
    p.setScale(p.baseScale ?? 1);
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
        p.setScale((p.baseScale ?? 1) * (1 + (A.selectPulse - 1) * env));
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

  doMove(from, to, opts) {
    this.moved = true;
    const startSlot = this.portions[to].length;
    const n = this.board.move(from, to, opts);
    const moved = this.portions[from].splice(-n);
    this.portions[to].push(...moved);
    this.selected = null;

    this.fly(moved, to, startSlot);
    this.settleBowl(from); // если серия влезла не вся — остаток опускается обратно

    this.afterChange([to]);
    if (this.instinct > 0) this.nextInstinct();
  }

  // Бейджи на отмене и умениях — сколько осталось; 0 — вместо бейджа цена (тап — покупка); не открытое умение — бледное;
  // монеты в пилюле.
  refreshUndo() {
    const n = undos();
    this.undoBtn.setBadge(n > 0 ? n : null).setPrice(n > 0 ? null : CONFIG.economy.undoPrice);
    // ульта: готова — бейдж «!»; заряжается — бледная, на бейдже сколько уровней пройдено из нужных (2/5)
    const left = ultLeft();
    this.trayBtns.ult?.setBadge(left ? `${CONFIG.ultRecharge - left}/${CONFIG.ultRecharge}` : '!').setAlpha(left ? 0.5 : 1);
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
      this.board.addBowl(this.board.capacity + (this.ultra?.boost?.jarCap ?? 0));
      this.portions.push([]);
      this.rebuildJars();
      // новая банка выпрыгивает
      const last = this.board.bowls.length - 1;
      for (const j of [this.jarBack[last], this.jarFront[last]]) {
        j.setScale(0.2).setAlpha(0);
        this.tweens.add({ targets: j, scale: 1, alpha: 1, duration: 360, ease: 'Back.easeOut' });
      }
      sfx(this, 'sfx_popup', CONFIG.audio.popup);
    });
  }

  // Банки заново на новых местах (добавили банку, банка выросла): старые банки, зоны тапа и обмотки — пересоздаём,
  // корм перелетает за своей банкой. Масштаб не меняется (см. layoutBowls).
  rebuildJars() {
      this.iceViews.forEach((v) => v?.destroy());
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
  }

  // Ульта ультракота (бесплатно, восстанавливается за CONFIG.ultRecharge уровней). «Ловкие лапы»: тап по кнопке —
  // «выбери порцию», тап по порции (любой, хоть со дна) — она светится, тап по второй — мейн-кун меняет их местами.
  // Повторный тап по кнопке — отмена. Обмен — ход в истории: отмена хода возвращает как было (заряд не возвращается).
  // Остальные ульты — так же: сразу (Зоркий глаз, Тёплый плед, Карман, Лентяй, Чутьё) или после выбора цели —
  // банки (Кувырок, Порядок, Магнит, Набег, Когти), порции (Лапа, Перекус) или хода «откуда — куда» (Прыжок, Тесно).
  // Заряд тратится, только когда ульта что-то сделала.
  ult() {
    if (this.won) return;
    if (ultLeft()) {
      this.shakeButton(this.trayBtns.ult);
      return showPopup(this, { title: this.ultra.ultName, text: STR.ultCharging(ultLeft()), buttons: [{ label: STR.ok }] });
    }
    this.deselect();
    if (this.ultPick) return this.endUltPick();
    const u = this.ultra.ult;
    const instant = { sharpEye: 1, blanket: 1, pocket: 1, lazy: 1, instinct: 1 };
    if (instant[u]) return this.ultNow(u);
    this.ultPick = true;
    sfx(this, 'sfx_pick');
    this.setUltPrompt(u === 'swap' ? STR.ultPick : STR.ultPrompt[u]);
  }

  // Ульта сработала: заряд, звёздочки, звук, кнопки.
  ultDone(x, y) {
    spendUlt();
    this.moved = true;
    if (x !== undefined) this.fxStars.explode(14, x, y);
    sfx(this, 'sfx_star', CONFIG.audio.star);
    this.refreshUndo();
  }

  // Ульты без выбора цели.
  ultNow(u) {
    const B = this.board;
    const nothing = () => showPopup(this, { title: this.ultra.ultName, text: STR.ultNothing[u], buttons: [{ label: STR.ok }] });
    const level = LEVELS[this.levelIndex];
    if (u === 'sharpEye') {
      if (!B.revealAll()) return nothing();
      this.ultDone();
      return this.syncBlockers();
    }
    if (u === 'blanket') {
      const all = B.bowls.map((_, i) => i).filter((i) => B.isFrozen(i));
      if (!all.length) return nothing();
      B.thawNow(all);
      this.ultDone();
      return this.syncBlockers();
    }
    if (u === 'pocket') {
      if (this.pocket) return nothing();
      this.pocket = true;
      B.addBowl(1);
      this.portions.push([]);
      this.rebuildJars();
      const last = B.bowls.length - 1;
      this.ultDone(this.bowlRects[last].x, this.mouthY(last));
      return;
    }
    if (u === 'instinct') {
      if (!hintFor(level, B)) return nothing();
      this.ultDone();
      this.instinct = CONFIG.ultInstinct;
      return this.nextInstinct();
    }
    if (u === 'lazy') {
      if (!hintFor(level, B)) return nothing();
      this.ultDone();
      // кот сам делает несколько правильных ходов (сбились с пути — сначала откат, отмены не тратятся)
      let left = CONFIG.ultLazy;
      const step = () => {
        if (this.won || left <= 0) return;
        const h = hintFor(level, this.board);
        if (!h) return;
        if (h.back) for (let k = 0; k < h.back; k++) this.undoMove();
        else { this.doMove(...h.move); left--; }
        this.time.delayedCall(A.moveDuration + 150, step);
      };
      step();
    }
  }

  // «Чутьё»: подсветить следующий правильный ход (после каждого хода игрока — следующий, пока не кончится).
  nextInstinct() {
    const h = hintFor(LEVELS[this.levelIndex], this.board);
    if (!h?.move) { this.instinct = 0; return; }
    this.instinct--;
    this.time.delayedCall(A.moveDuration, () => { if (!this.won && this.selected === null) this.showHint(h.move); });
  }

  // Подсказка ульты сверху: что тапнуть. Длинная — ужимается под ширину экрана (с запасом на «дыхание»).
  setUltPrompt(text) {
    this.ultPrompt?.destroy();
    this.ultPrompt = plate(this, CONFIG.width / 2, CONFIG.layout.bowlsTop - 40, text, { color: PAL.plate }).setDepth(16);
    const k = Math.min(1, (CONFIG.width - 60) / (this.ultPrompt.getBounds().width * 1.06));
    this.ultPrompt.setScale(k);
    this.tweens.add({ targets: this.ultPrompt, scale: k * 1.06, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  }

  endUltPick() {
    if (Array.isArray(this.ultFirst)) this.stopPulse(this.portions[this.ultFirst[0]][this.ultFirst[1]]);
    else if (this.ultFirst !== null) this.settleBowl(this.ultFirst);
    this.ultPick = false;
    this.ultFirst = null;
    this.ultPrompt?.destroy();
    this.ultPrompt = null;
  }

  // Какая порция под пальцем: место по высоте тапа (выше корма — верхняя).
  slotAt(i, pointer) {
    const n = this.board.bowls[i].length;
    if (!n) return -1;
    const r = this.bowlRects[i];
    const s = Math.floor((r.bottom - this.dim.floor - pointer.worldY) / this.dim.ph);
    return Phaser.Math.Clamp(s, 0, n - 1);
  }

  pickForUlt(i, pointer) {
    const u = this.ultra.ult;
    if (u !== 'swap') return this.pickTarget(u, i, pointer);
    const slot = pointer ? this.slotAt(i, pointer) : this.board.bowls[i].length - 1;
    const here = [i, slot];
    if (slot < 0 || this.board.isComplete(i) || this.board.isFrozen(i)) return this.shake(i); // пусто, съедена, во льду
    if (!this.ultFirst) {
      this.ultFirst = here;
      sfx(this, 'sfx_pick');
      this.pulse(this.portions[i][slot]);
      return this.setUltPrompt(STR.ultPick2);
    }
    const first = this.ultFirst;
    if (first[0] === i && first[1] === slot) return this.endUltPick(); // та же порция — снять выбор
    this.endUltPick();
    if (!this.board.swap(first, here)) return this.shake(i);
    spendUlt();
    this.moved = true;
    this.swapSprites(first, here);
    this.fxStars.explode(10, this.bowlRects[first[0]].x, this.slotPos(...first).y);
    this.fxStars.explode(10, this.bowlRects[i].x, this.slotPos(...here).y);
    sfx(this, 'sfx_star', CONFIG.audio.star);
    this.refreshUndo();
    this.afterChange([first[0], i]);
  }

  // Цель для остальных ульт выбрана тапом по банке i (pointer — куда именно, для порций).
  pickTarget(u, i, pointer) {
    const B = this.board;
    const r = this.bowlRects[i];
    const slot = pointer ? this.slotAt(i, pointer) : B.bowls[i].length - 1;
    const fail = () => this.shake(i);
    const before = B.bowls.map((_, j) => B.isComplete(j));
    const newly = () => B.bowls.map((_, j) => j).filter((j) => B.isComplete(j) && !before[j]); // собрались этой ультой
    // ход «откуда — куда»: первый тап — откуда (банка приподнимается), второй — куда
    if (u === 'leap' || u === 'squeeze') {
      if (this.ultFirst === null) {
        if (!B.canPick(i)) return fail();
        this.ultFirst = i;
        this.liftJar(i, -A.liftY * this.dim.scale, 'Back.easeOut');
        sfx(this, 'sfx_pick');
        return this.setUltPrompt(STR.ultTo);
      }
      const from = this.ultFirst;
      if (from === i) { this.settleBowl(i); this.ultFirst = null; return this.endUltPick(); }
      const opts = u === 'leap' ? { anyColor: true } : { anyRoom: true, anyColor: false };
      if (!B.canMove(from, i, opts)) return fail();
      this.ultFirst = null;
      this.endUltPick();
      this.doMove(from, i, opts);
      return this.ultDone(r.x, this.mouthY(i));
    }
    let ok = false;
    if (u === 'claws') ok = B.thawNow([i]).length > 0;
    else if (u === 'flip') ok = B.flip(i);
    else if (u === 'order') ok = B.order(i);
    else if (u === 'magnet') ok = B.magnet(i);
    else if (u === 'paw') ok = slot >= 0 && B.paw(i, slot);
    else if (u === 'raid') ok = B.raid(i);
    else if (u === 'snack') {
      if (slot < 0 || !B.open(i)) return fail();
      const c = B.bowls[i][slot];
      ok = B.snack(c);
      if (ok) {
        this.endUltPick();
        const eaten = this.resyncPortions();
        this.feedLeftovers(eaten, c);
        this.ultDone(r.x, this.mouthY(i));
        return this.afterChange(newly());
      }
    }
    if (!ok) return fail();
    this.endUltPick();
    if (u === 'claws') { this.ultDone(r.x, this.mouthY(i)); return this.syncBlockers(); }
    this.resyncPortions();
    this.ultDone(r.x, this.mouthY(i));
    this.afterChange(newly());
  }

  // «Перекус»: съеденные порции летят к коту своего цвета и исчезают.
  feedLeftovers(list, color) {
    const cat = this.theme.cats[color];
    list.forEach((p, k) => {
      this.tweens.killTweensOf(p);
      this.stopPulse(p);
      p.setDepth(6);
      this.tweens.add({
        targets: p, x: cat?.x ?? p.x, y: cat?.y ?? p.y - 200, scale: 0.2, alpha: 0, delay: k * 60, duration: 500, ease: 'Cubic.easeIn',
        onComplete: () => p.destroy(),
      });
    });
    if (cat) cat.meow?.();
  }

  // Порции меняются местами в списках и перелетают крест-накрест.
  swapSprites([b1, s1], [b2, s2]) {
    const p1 = this.portions[b1][s1];
    const p2 = this.portions[b2][s2];
    this.portions[b1][s1] = p2;
    this.portions[b2][s2] = p1;
    this.flyTo(p1, this.slotPos(b2, s2), 0);
    this.flyTo(p2, this.slotPos(b1, s1), A.moveStagger);
  }

  flyTo(p, dst, delay) {
    this.tweens.killTweensOf(p);
    this.stopPulse(p);
    p.setAlpha(1).setDepth(5);
    const x0 = p.x;
    const y0 = p.y;
    const arc = A.moveArc * this.dim.scale * 1.5;
    p.flyT = 0;
    this.tweens.add({
      targets: p, flyT: 1, delay, duration: A.moveDuration * 1.3, ease: 'Sine.easeInOut',
      onUpdate: () => {
        const t = p.flyT;
        p.setPosition(x0 + (dst.x - x0) * t, y0 + (dst.y - y0) * t - arc * 4 * t * (1 - t));
      },
      onComplete: () => { p.setDepth(0); sfx(this, 'sfx_drop'); },
    });
  }

  // После хода или обмена: собранные банки — коту, всё собрано — победа.
  afterChange(bowls) {
    this.syncBlockers();
    for (const b of new Set(bowls)) if (this.board.isComplete(b)) this.theme.jarComplete(b, this.board.bowls[b][0]);
    if (this.board.isSolved()) {
      this.won = true;
      this.time.delayedCall(A.winDelay, () => this.showWin());
    }
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
    if (this.ultPick) this.endUltPick();
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
    if (!this.board.history.length) return;
    sfx(this, 'sfx_undo', CONFIG.audio.undo);
    // банки, которые были собраны и после отмены уже нет, — кот бросает есть
    const done = this.board.bowls.map((b, i) => (this.board.isComplete(i) ? b[0] : null));
    const rec = this.board.undo();
    done.forEach((c, i) => { if (c !== null && !this.board.isComplete(i)) this.theme.jarUndone(c); });
    if (rec.swap) this.swapSprites(...rec.swap);
    else if (rec.snap) this.resyncPortions();
    else {
      const startSlot = this.portions[rec.from].length;
      const moved = this.portions[rec.to].splice(-rec.n);
      this.portions[rec.from].push(...moved);
      this.fly(moved, rec.from, startSlot);
      this.settleBowl(rec.to);
    }
    this.syncBlockers();
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
