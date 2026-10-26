import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CatView } from '../theme/cats/CatView.js';
import { adHomeButton, openAdLadder } from '../view/RewardView.js';
import { preloadRewarded } from '../rewarded.js';
import { stockShelves, openPacks, openCoinPacks, openUltras, openGoods, offerUltra } from '../view/ShopView.js';
import { MapView } from '../view/MapView.js';
import { makeButton } from '../view/Button.js';
import { counterPill, tabBar, iconButton, plate, infinityMark, closeWindows, makeIcon } from '../view/ui.js';
import { addSettingsMenu } from '../view/settings.js';
import { panDuration, panFx, hud } from '../view/transition.js';
import { gameMusic, sfx } from '../audio.js';
import { beatPhase } from '../beat.js';
import {
  currentLevel, unlockedLevel, levelPassed, coins, catLevel, lives, livesRefillLeft, skinsOwned,
  chestsPending, openChest, infiniteLeft, claimMilestones, catXp, catLook, claimUltraGift, takeUltraIntro, dailyAvailable, catName,
} from '../core/save.js';
import { openCollection } from '../view/CollectionView.js';
import { openBox, closedBox } from '../view/ChestView.js';
import { catXpBar } from '../view/CatXpBar.js';
import { showUltraIntro } from '../view/UltraView.js';
import { addDevButton } from '../view/DevPanel.js';
import { openDaily } from '../view/DailyView.js';
import { showPopup } from '../view/Popup.js';
import { showNoLives, formatLeft } from '../view/lives.js';
import { LEVELS } from '../core/levels.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

const W = CONFIG.width;
const H = CONFIG.height;
const R = CONFIG.room;
const HC = CONFIG.home;
// Стена холла (арка, кусок стены) крупнее экрана в archScale раз от середины экрана — края обрезаны,
// проём больше, откосы уже. Арка кухни — прежнего размера (sx = 1): дверь видна в стене целиком.
// Все размеры стены в конфиге — до увеличения.
const SX = R.archScale;
const opening = (sx) => ({
  x: W / 2 + (R.opening.x - W / 2) * sx, w: R.opening.w * sx,
  top: H / 2 + (R.opening.top - H / 2) * sx, bottom: H / 2 + (R.opening.bottom - H / 2) * sx, vault: R.opening.vault * sx,
});
const OK = opening(1); // проём кухни
const ARCH_W = R.archWidth * SX;
const WALL_W = R.wallGap * SX;
// Зум сквозь открытую дверь: камера смотрит в середину проёма кухни, и весь экран — внутри проёма,
// включая верхние углы под сводом (иначе в конце влёта в углах видна арка и пропадает при включении уровня).
function coverZoom(o) {
  const cy = (o.top + o.bottom) / 2;
  const fits = (z) => {
    const hx = W / 2 / z;
    const hy = H / 2 / z;
    if (hx > o.w / 2 || cy + hy > o.bottom) return false;
    const up = o.top + o.vault - (cy - hy); // насколько верх экрана заходит в свод
    return up <= 0 || (hx / (o.w / 2)) ** 2 + (up / o.vault) ** 2 <= 1;
  };
  let z = 1;
  while (!fits(z)) z += 0.01;
  return z;
}
const DOOR_ZOOM = coverZoom(OK);

// Арки по кругу холла слева направо; круг замкнут (за профилем — снова кухня). Кухня — не вкладка,
// остальные пять — вкладки нижней панели в том же порядке.
const SLOTS = [
  { key: 'kitchen' },
  { key: 'shop', icon: 'shop', label: STR.tabs.shop, enabled: () => CONFIG.shop.enabled },
  { key: 'map', icon: 'map', label: STR.tabs.map },
  { key: 'home', icon: 'home', label: STR.tabs.home },
  { key: 'collection', icon: 'collection', label: STR.tabs.collection },
  { key: 'profile', icon: 'profile', label: STR.tabs.profile },
];
const TABS = SLOTS.slice(1);
const KITCHEN = 0;
const MAP = SLOTS.findIndex((s) => s.key === 'map');
const SHOP = SLOTS.findIndex((s) => s.key === 'shop');
const HOME = SLOTS.findIndex((s) => s.key === 'home');
const STEP = ARCH_W + WALL_W; // от арки до соседней на экране
const RING = SLOTS.length * STEP; // длина круга в пикселях поворота
const slotOf = (key) => Math.max(1, SLOTS.findIndex((s) => s.key === key));
// Сдвиг по кругу в пределах [-RING/2, RING/2).
const wrap = (x) => ((((x + RING / 2) % RING) + RING) % RING) - RING / 2;

// Главный экран — круглый холл дома кота. Стоим в центре, вокруг арки (hall_arch.png), за каждой своя комната
// (bg_room_<key>.jpg), за аркой сзади — закрытая дверь кухни (kitchen_door.png).
// Листаем пальцем или вкладками — поворачиваемся на месте: стена с арками едет со скоростью пальца, комнаты за
// ними — медленнее (R.depth), так видна глубина. Каждая комната видна только в своём проёме (маска по форме проёма).
// «Играть» — быстрый проезд с размытием и ветром к двери кухни, створки распахиваются, камера въезжает в проём
// и включается уровень. Из уровня — наоборот: из открытой двери отъезжаем, дверь закрывается, едем на главную.
// Кнопки и кот — внутри своих комнат и едут с ними; карта — отдельно (у неё своя маска), но держится за свою комнату.
export class RoomScene extends Phaser.Scene {
  constructor() {
    super('Room');
  }

  init(data) {
    this.fromKitchen = data.fromKitchen; // вернулись из уровня — начинаем у открытой двери кухни
    this.laidOut = null;
    this.tabLock = null; // сцена переиспользуется — блокировка стекла вкладок с прошлого раза не нужна
    this.pan = { p: (this.fromKitchen ? KITCHEN : slotOf(data.zone ?? 'home')) * STEP };
  }

  create() {
    preloadRewarded(); // ролик за награду грузится заранее (жизнь за ролик, лесенка, магазин)
    this.windows = new Set(); // открытые окна (view/ui.js trackWindow) — сцена переиспользуется, список с нуля
    this.slots = SLOTS.map((s, i) => this.createSlot(s, i));
    this.createShop(this.slots[slotOf('shop')].room);
    this.createMap();
    this.createHome(this.slots[HOME].room);
    this.createCollection(this.slots[slotOf('collection')].room);
    this.createProfile(this.slots[slotOf('profile')].room);
    this.createDoor();

    const U = CONFIG.ui;
    this.coinPill = counterPill(this, 30 + U.pillWidth / 2, U.topY, 'coin', coins(), { depth: 25 }).setScrollFactor(0);
    this.tapPill(this.coinPill, U.pillWidth, () => openCoinPacks(this, () => this.refreshTop()));
    this.createLives();
    const gear = addSettingsMenu(this);
    // тесты: ключ под шестерёнкой — панель разработчика; закрыли — холл заново (всё перечитывается из сохранения).
    // Меню шестерёнки выпадает на его место — пока оно открыто, ключ спрятан.
    const dev = addDevButton(this, W - 62, U.topY + 110, () => this.scene.restart({ zone: 'home' }), () => this.refreshTop());
    if (dev) gear.onToggle = (open) => { dev.hidden = open; };
    this.tabs = tabBar(this, TABS.map((z) => ({ ...z, enabled: z.enabled ? z.enabled() : true })), (i) => { closeWindows(this); this.goTo(i + 1, i + 1 === SHOP ? { onDone: () => this.zoomShop() } : {}); }); // вкладка — сначала закрыть открытые окна
    this.mapBack = iconButton(this, 62, U.topY + 110, 'close', () => this.collapseMap(), {
      size: 84, shape: 'round', color: CONFIG.ui.exitColor, depth: 26,
    }).setScrollFactor(0).setVisible(false);
    this.setupHudCamera();
    this.setupInput();
    gameMusic(this);
    this.layout();
    if (this.fromKitchen) this.backFromKitchen();
    else this.showMilestones();
  }

  // При заходе на главную по очереди: награды открывшихся рубежей («Награды за путешествие», подарки с карты
  // пропадают) → подарок-ультракот (за его уровень) → знакомство с ультракотом (один раз, после ultraIntroLevel).
  showMilestones() {
    const got = claimMilestones();
    if (got) {
      this.map.redraw();
      return openBox(this, got.items.some((it) => it.icon === 'chest') ? 'chest' : 'gift', got.items, () => { this.afterBox(); this.showMilestones(); }, { title: STR.journeyTitle });
    }
    const ultra = claimUltraGift();
    if (ultra) {
      return openBox(this, 'gift', [{ ultra: ultra.id }], () => { this.makeHomeCat(); this.afterBox(); this.map.redraw(); this.showMilestones(); },
        { title: STR.ultraGiftTitle });
    }
    if (takeUltraIntro()) return showUltraIntro(this, CONFIG.ultras.find((u) => u.gift), () => this.showMilestones());
    // награда за вход ещё не забрана сегодня — окно само (первый заход за день; закрыл не забрав — покажется снова)
    if (dailyAvailable()) openDaily(this, () => this.afterBox());
  }

  // Монеты, настройки и вкладки — на своей камере: основная камера приближается (к карте, в дверь кухни),
  // а интерфейс остаётся как есть. Всё, что появится позже (сердечки, струйки ветра), — только в основной.
  setupHudCamera() {
    const hud = this.children.list.filter((o) => o.scrollFactorX === 0);
    this.hudCam = this.cameras.add(0, 0, W, H);
    this.hudCam.ignore(this.children.list.filter((o) => !hud.includes(o)));
    this.cameras.main.ignore(hud);
    // окна (всё, что создаётся, пока открыто окно — trackWindow записывает его первым) — на камере интерфейса, поверх
    // счётчиков сверху и без приближения основной камеры; пока камера на полках магазина — тоже. Полки магазина
    // перерисовываются на основной (onMain)
    const onHud = () => (this.windows?.size || this.shopOpen) && !this.toMain;
    const onAdded = (o) => (onHud() ? this.cameras.main : this.hudCam).ignore(o);
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded);
    // события сцены переживают перезапуск — без этого старая подписка прятала бы новый интерфейс
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded));
  }

  // Точка экрана → мир основной камеры (она бывает приближена).
  worldAt(p) {
    return this.cameras.main.getWorldPoint(p.x, p.y);
  }

  // Тап по счётчику вверху — окно покупки (монеты — пачки монет, жизни — жизни). С развёрнутой карты — сначала свернуть
  // (окна рисуются без приближения камеры).
  tapPill(pill, w, open) {
    pill.setSize(w, 64).setInteractive();
    pill.on('pointerdown', () => {
      if (this.mapBusy || this.windows?.size) return; // окно уже открыто — второе не открываем
      sfx(this, 'sfx_button');
      if (this.mapOpen) return this.collapseMap(open);
      open();
    });
  }

  // Жизни в верхней полосе рядом с монетами; не полные — под ними таймер до следующей. Бесконечные — на сердечке
  // белый ∞, в плашке — сколько они ещё идут. Обновляются раз в секунду.
  createLives() {
    const U = CONFIG.ui;
    const w = 150;
    const x = 30 + U.pillWidth + 20 + w / 2;
    this.livesPill = counterPill(this, x, U.topY, 'heart', '', { w, depth: 25 }).setScrollFactor(0);
    this.tapPill(this.livesPill, w, () => openGoods(this, CONFIG.shop.goods.find((g) => g.icon === 'heart'), () => this.refreshTop()));
    const ic = this.livesPill.icon;
    this.livesInf = infinityMark(this, ic.x, ic.y, 72).setVisible(false);
    this.livesPill.add(this.livesInf);
    this.livesTimer = this.add.text(x, U.topY + 46, '', {
      fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '24px', color: PAL.text, stroke: PAL.textStrokeSoft, strokeThickness: 6,
    }).setOrigin(0.5).setDepth(25).setScrollFactor(0);
    this.refreshTop();
    this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshTop() });
  }

  refreshTop() {
    this.coinPill.setValue(coins());
    // 4/5 — сколько из скольких и под плашкой время до следующей; бесконечные — ∞ на сердечке и время в плашке
    const inf = infiniteLeft();
    this.livesInf.setVisible(inf > 0);
    this.livesPill.text.setFontSize(inf ? (inf >= 3600000 ? 24 : 30) : 34);
    this.livesPill.setValue(inf ? formatLeft(inf) : lives() + '/' + CONFIG.lives.max);
    const left = inf ? 0 : livesRefillLeft();
    this.livesTimer.setText(left ? formatLeft(left) : '');
  }

  // ---------- холл ----------

  // Арка: комната (контейнер под маской проёма) и стена с аркой над ней.
  createSlot(s, i) {
    const sx = s.key === 'kitchen' ? 1 : SX;
    const O = opening(sx);
    const room = this.add.container(0, 0).setDepth(0);
    const key = s.key === 'kitchen' ? 'bg_game' : `bg_room_${s.key}`;
    let bg = null;
    if (this.textures.exists(key)) {
      bg = this.add.image(W / 2, H / 2, key, '__BASE'); // кадр явно: к bg_room_map добавлены кусочки рамки
      room.add(bg.setScale(Math.max(W / bg.width, H / bg.height)));
    }
    // кухня — в натуральную величину: через открытую дверь въезжаем в неё зумом прямо в уровень
    room.setScale(s.key === 'kitchen' ? 1 : R.roomScale);
    const mask = this.make.graphics({}, false);
    mask.fillStyle(PAL.white)
      .fillEllipse(O.x, O.top + O.vault, O.w + 6, 2 * O.vault + 6)
      .fillRect(O.x - O.w / 2 - 3, O.top + O.vault, O.w + 6, O.bottom - O.top - O.vault + 6);
    room.setMask(mask.createGeometryMask());
    let arch = null;
    if (this.textures.exists('hall_arch')) {
      arch = this.add.image(0, H / 2, 'hall_arch').setDepth(5);
      arch.setScale((H / arch.height) * sx);
    }
    // кусок стены справа от арки — до следующей (hall_wall.jpg, tools/fit-hall-wall.mjs)
    const wall = this.textures.exists('hall_wall') && R.wallGap ? this.add.image(0, H / 2, 'hall_wall').setDepth(5) : null;
    wall?.setDisplaySize(WALL_W, H * SX);
    return { i, room, mask, arch, wall, bg, O, archW: R.archWidth * sx };
  }

  // Каждый кадр: всё на своих местах для текущего поворота pan.p.
  layout() {
    const p = this.pan.p;
    this.laidOut = { p, tab: this.tabLock ? this.tabLock.f : null };
    for (const s of this.slots) {
      const d = wrap(s.i * STEP - p); // где арка относительно экрана
      const on = Math.abs(d) < (W + s.archW) / 2; // хоть краем на экране
      const k = s.room.scale;
      s.room.setVisible(on).setPosition(W / 2 - (W / 2) * k + R.depth * d, s.O.top * (1 - k));
      s.mask.x = d;
      s.arch?.setVisible(on).setX(W / 2 + d);
      // стена — от края этой арки до края следующей (у кухни арка уже — стена рядом с ней шире)
      const next = this.slots[(s.i + 1) % SLOTS.length];
      const l = d + s.archW / 2;
      const r = d + STEP - next.archW / 2;
      if (s.wall) {
        s.wall.displayWidth = r - l;
        s.wall.setVisible(l < W / 2 && r > -W / 2).setX(W / 2 + (l + r) / 2);
      }
      s.d = d;
    }
    this.placeDoor(this.slots[KITCHEN].d);
    const P = this.mapPlace();
    this.map.root.setPosition(P.x, P.y).setScale(P.scale);
    // вкладки: доля пути между арками; на пути к кухне и обратно стекло стоит на «Главной» (tabLock)
    this.tabs.setPosition(this.tabLock ? this.tabLock.f : (((p % RING) + RING) % RING) / STEP - 1);
  }

  // Стекло вкладок перестаёт следить за поворотом и переезжает на «Главную» (или сразу стоит там).
  lockTabsHome(slide = true) {
    const home = HOME - 1;
    this.tabLock = { f: slide ? Phaser.Math.Clamp((((this.pan.p % RING) + RING) % RING) / STEP - 1, 0, TABS.length - 1) : home };
    if (slide) this.tweens.add({ targets: this.tabLock, f: home, duration: R.tabSlide, ease: 'Cubic.easeOut' });
  }

  // Поворот к арке slot. Между вкладками — напрямую (магазин … профиль, мимо кухни не ездим);
  // ring — по кругу кратчайшим путём (к двери кухни и обратно; dir — куда ехать, если пути равны).
  goTo(slot, { ring = false, dir = 1, ms = R.panDuration, ease = 'Cubic.easeInOut', onDone } = {}) {
    if (this.mapOpen && slot !== MAP) return this.collapseMap(() => this.goTo(slot, { ring, dir, ms, ease, onDone }));
    if (this.shopOpen && slot !== SHOP) return this.collapseShop(() => this.goTo(slot, { ring, dir, ms, ease, onDone }));
    this.pan.p = ((this.pan.p % RING) + RING) % RING;
    let delta = ring ? wrap(slot * STEP - this.pan.p) : slot * STEP - this.pan.p;
    if (ring && Math.abs(Math.abs(delta) - RING / 2) < 1) delta = (dir * RING) / 2;
    if (Math.abs(delta) > 1 && !onDone) sfx(this, 'sfx_swipe', CONFIG.audio.swipe);
    this.tweens.killTweensOf(this.pan);
    this.tweens.add({ targets: this.pan, p: this.pan.p + delta, duration: ms, ease, onComplete: onDone });
    return delta;
  }

  // ---------- кухня ----------

  // Дверь вписана в проём так, чтобы декоративная канавка вокруг створок шла на одном расстоянии (door.gap)
  // от края проёма и по бокам, и по своду. Пропорции двери и проёма разные, поэтому верх (свод и табличка)
  // и прямой низ масштабируются по высоте отдельно: верх — под свод, низ тянется до пола.
  // Каждая створка — два кусочка (верх и низ), у обоих петля на внешнем краю.
  createDoor() {
    if (!this.textures.exists('kitchen_door')) return;
    const D = R.door;
    const src = this.textures.get('kitchen_door').get('__BASE');
    const dw = src.width;
    const dh = src.height;
    const sx = (OK.w / 2 - D.gap) / (dw / 2 - D.side);
    const arcY = OK.top + OK.vault; // центр свода на экране
    const syTop = (OK.vault - D.gap) / (D.arc - D.groove);
    const splitY = arcY + (D.split - D.arc) * syTop;
    const syBottom = (D.bottom - splitY) / (dh - D.split);
    this.doorSX = sx;
    this.leaves = [];
    [0, 1].forEach((side) => {
      const top = this.add.image(0, arcY, 'kitchen_door', '__BASE').setOrigin(side, D.arc / dh).setScale(sx, syTop);
      top.setCrop(side * dw / 2, 0, dw / 2, D.split);
      const bottom = this.add.image(0, splitY, 'kitchen_door', '__BASE').setOrigin(side, D.split / dh).setScale(sx, syBottom);
      bottom.setCrop(side * dw / 2, D.split, dw / 2, dh - D.split);
      for (const leaf of [top, bottom]) {
        leaf.setDepth(3);
        leaf.side = side;
        this.leaves.push(leaf);
      }
    });
  }

  placeDoor(d) {
    const cx = OK.x + d;
    this.leaves?.forEach((leaf) => leaf.setX(cx + (leaf.side ? 1 : -1) * (leaf.width / 2) * this.doorSX));
  }

  // Створки: open — распахнуты (сжаты к петлям и затенены) или закрыты; ms = 0 — сразу.
  swingDoor(open, ms, onDone) {
    if (!this.leaves) return onDone?.();
    const white = Phaser.Display.Color.ValueToColor(PAL.white);
    const shade = Phaser.Display.Color.ValueToColor(R.door.shade);
    const set = (t) => {
      // створки при закрытии пружинят (t чуть меньше 0) — тень не дальше «нет тени», иначе цвет переполняется и мигает
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(white, shade, 1, Phaser.Math.Clamp(t, 0, 1));
      this.leaves.forEach((leaf) => {
        leaf.scaleX = this.doorSX * (1 - (1 - R.door.open) * t);
        leaf.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      });
    };
    const to = open ? 1 : 0;
    if (!ms) { set(to); return onDone?.(); }
    const k = { t: 1 - to };
    this.tweens.add({ targets: k, t: to, duration: ms, ease: open ? 'Quad.easeIn' : 'Back.easeOut',
      onUpdate: () => set(k.t), onComplete: onDone });
  }

  // В уровень: уровень сразу запускается под холлом (за дверью кухни его видно, когда она откроется),
  // быстрый проезд к двери (с главной — через коллекцию и профиль, с карты — через магазин), дверь распахивается —
  // за ней уже коты и банки, — и камера влетает в проём, а уровень одновременно доезжает до полного экрана.
  startLevel(index) {
    if (this.mapOpen) return this.collapseMap(() => this.startLevel(index));
    if (lives() <= 0) return showNoLives(this, () => { this.refreshTop(); this.startLevel(index); });
    this.input.enabled = false;
    this.lockTabsHome();
    const game = this.scene.get('Game');
    this.scene.launch('Game', { levelIndex: index, behindDoor: true });
    let arrived = false;
    let ready = false;
    const go = () => {
      if (!arrived || !ready) return;
      this.slots[KITCHEN].bg?.setVisible(false); // вместо картинки кухни — живой уровень
      this.kitchenView(0);
      this.swingDoor(true, R.door.openDuration, () => this.flyIntoKitchen());
    };
    game.events.once(Phaser.Scenes.Events.CREATE, () => { ready = true; go(); });
    const span = wrap(KITCHEN * STEP - this.pan.p);
    if (Math.abs(span) < 2) { arrived = true; return go(); }
    const ms = panDuration(span);
    const delta = this.goTo(KITCHEN, { ring: true, dir: 1, ms, onDone: () => { arrived = true; go(); } });
    panFx(this, Math.sign(delta), ms);
  }

  // Холл и уровень за дверью на доле пути t (0 — стоим перед открытой дверью, 1 — проём во весь экран).
  // Камера холла приближается в DOOR_ZOOM · doorFly и сдвигается так, чтобы середина проёма встала в середину экрана.
  // Кухня — «дальше» холла: она растёт ровно в той же пропорции, что и холл, поэтому в начале она меньше проёма
  // (вокруг — зеркальные продолжения фона кухни в GameScene), а в конце — ровно во весь экран, и в этот же момент
  // арка (вместе со сводом) уже целиком ушла за края — уровень включается без скачка.
  kitchenView(t) {
    const cam = this.cameras.main;
    const gcam = this.scene.get('Game').cameras.main;
    const dy = (OK.top + OK.bottom) / 2 - H / 2; // середина проёма ниже/выше середины экрана
    const end = DOOR_ZOOM * R.doorFly;
    const zr = 1 + (end - 1) * t;
    cam.setZoom(zr);
    cam.scrollY = dy * t;
    const cy = H / 2 + (1 - t) * dy * zr; // где сейчас на экране середина проёма
    const zg = zr / end;
    gcam.setZoom(zg);
    gcam.scrollY = (H / 2 - cy) / zg;
  }

  flyIntoKitchen() {
    const game = this.scene.get('Game');
    this.tweens.add({ targets: hud(this), alpha: 0, duration: R.doorZoomDuration * 0.5 });
    this.tweens.addCounter({
      from: 0, to: 1, duration: R.doorZoomDuration, ease: 'Cubic.easeIn',
      onUpdate: (tw) => this.kitchenView(tw.getValue()),
      onComplete: () => {
        game.enteredFromHall();
        this.scene.stop();
      },
    });
  }

  // Из уровня — то же в обратную сторону: холл запускается поверх ещё живого уровня у открытой двери,
  // уровень уменьшается обратно в проём, камера отъезжает, дверь закрывается перед котами и банками,
  // и только тогда уровень выключается; потом быстро едем на главную тем же путём — через профиль и коллекцию.
  backFromKitchen() {
    this.input.enabled = false;
    this.lockTabsHome(false);
    this.slots[KITCHEN].bg?.setVisible(false);
    this.swingDoor(true, 0);
    this.kitchenView(1);
    hud(this).forEach((o) => {
      const a = o.alpha; // бледные вкладки остаются бледными
      o.setAlpha(0);
      this.tweens.add({ targets: o, alpha: a, duration: R.doorZoomDuration * 0.5, delay: R.doorZoomDuration * 0.5 });
    });
    this.tweens.addCounter({
      from: 1, to: 0, duration: R.doorZoomDuration, ease: 'Cubic.easeOut',
      onUpdate: (tw) => this.kitchenView(tw.getValue()),
      onComplete: () => this.swingDoor(false, R.door.openDuration, () => {
        this.scene.stop('Game');
        const ms = panDuration(RING / 2);
        panFx(this, -1, ms);
        this.goTo(HOME, { ring: true, dir: -1, ms, onDone: () => { this.tabLock = null; this.input.enabled = true; this.showMilestones(); } });
      }),
    });
  }

  // ---------- комнаты (координаты — как на картинке комнаты во весь экран) ----------

  createHome(room) {
    // логотип Kitty Eatty (logo.png) слегка покачивается; без картинки — название текстом
    let title;
    if (this.textures.exists('logo')) {
      title = this.add.image(W / 2, HC.logoY, 'logo');
      const k = HC.logoWidth / title.width;
      title.setScale(k);
      this.tweens.add({ targets: title, scale: k * HC.logoPulse, duration: HC.logoPulseMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    } else {
      title = this.add.text(W / 2, HC.titleY, STR.gameTitle, {
        fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '54px', color: PAL.text,
        stroke: PAL.textBrown, strokeThickness: 12,
      }).setOrigin(0.5);
    }
    const shadow = this.add.graphics().fillStyle(PAL.black, 0.18).fillEllipse(W / 2, HC.floorY + HC.shadowY, 260, 40);
    // кот сидит на полу, дышит в такт музыке, на тап — случайная реакция, как в игре
    const s = HC.catScale;
    this.homeRoom = room;
    this.cat = null; // сцена переиспользуется — кот с прошлого раза уже уничтожен
    this.makeHomeCat();
    const level = currentLevel(LEVELS.length);
    const play = makeButton(this, W / 2, HC.playY, STR.play(LEVELS[level].id), () => this.startLevel(level),
      { ...CONFIG.ui.bigButton, skin: 'yellow' });
    // полоска уровня кота под кличкой (опыт меняется только на уровне — холл при возврате создаётся заново)
    const xp = catXpBar(this, W / 2, HC.xpY, { w: HC.xpWidth, h: HC.xpHeight }).set(catLevel(), catXp());
    room.add([title, shadow, this.cat, play, xp]);
    this.refreshName();
    this.createBoxes(room);
    const AB = HC.adButton;
    room.add(adHomeButton(this, AB.x, AB.y, () => openAdLadder(this, () => this.afterBox())));
  }

  // По бокам от «Играть»: сундук (число неоткрытых) и подарок дня («!», если можно забрать).
  // Есть что открыть — коробка покачивается.
  createBoxes(room) {
    const B = HC.boxes;
    const make = (kind, x, onTap) => {
      const c = this.add.container(x, B.y);
      // «Ежедневно» — календарь icon_daily.png (нет картинки — коробка подарка)
      const box = kind === 'gift' && this.textures.exists('icon_daily') ? makeIcon(this, 'daily', B.size * 1.05) : closedBox(this, kind, B.size);
      const badge = this.add.container(B.size * 0.42, -B.size * 0.42);
      const bg = this.add.graphics();
      bg.fillStyle(PAL.badgeShadow, 1).fillCircle(0, 3, 24).fillStyle(CONFIG.ui.badgeColor, 1).fillCircle(0, 0, 24);
      bg.lineStyle(4, PAL.white, 1).strokeCircle(0, 0, 24);
      const num = this.add.text(0, -1, '', { fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '28px', color: PAL.text }).setOrigin(0.5);
      badge.add([bg, num]);
      const label = this.add.text(0, B.size * 0.5 + 20, '', this.noteStyle()).setOrigin(0.5).setFontSize(26);
      c.add([box, badge, label]);
      c.setSize(B.size, B.size).setInteractive();
      c.on('pointerdown', () => onTap()); // звук — в onTap: открыть или «пусто»
      c.badge = (t) => { badge.setVisible(!!t); num.setText(String(t || '')); };
      c.label = label;
      c.box = box;
      room.add(c);
      return c;
    };
    this.chestBtn = make('chest', B.x, () => this.tapChest());
    this.giftBtn = make('gift', W - B.x, () => this.tapGift());
    this.refreshBoxes();
  }

  refreshBoxes() {
    const n = chestsPending();
    this.chestBtn.badge(n);
    this.chestBtn.label.setText(STR.chest);
    const gift = dailyAvailable();
    this.giftBtn.badge(gift ? '!' : '');
    this.giftBtn.label.setText(STR.gift);
    // есть что открыть — покачивается
    for (const [btn, on] of [[this.chestBtn, n > 0], [this.giftBtn, gift]]) {
      this.tweens.killTweensOf(btn.box);
      btn.box.setAngle(0);
      if (on) this.tweens.add({ targets: btn.box, angle: { from: -6, to: 6 }, duration: 260, yoyo: true, repeat: -1, repeatDelay: 1400, ease: 'Sine.easeInOut' });
    }
  }

  // После сундука или подарка: монеты, коллекция, кнопки.
  // Комната после наград: может вызываться, пока открыто окно (ролик на главной), — рисуем на основной камере.
  afterBox() {
    this.onMain(() => {
      this.refreshTop();
      this.refreshName();
      this.refreshBoxes();
      this.refreshCollectionWall();
    });
  }

  tapChest() {
    const items = openChest();
    if (!items) {
      return this.denyBox(this.chestBtn, () => showPopup(this, {
        title: STR.chest,
        text: STR.chestInfo(),
        buttons: [{ label: STR.ok }],
      }));
    }
    sfx(this, 'sfx_button');
    openBox(this, 'chest', items, () => this.afterBox());
  }

  // Подарок дня — окно «Награды за вход» (неделя серии), в любой момент.
  tapGift() {
    sfx(this, 'sfx_button');
    openDaily(this, () => this.afterBox());
  }

  // Открыть нечего: звук отмены, коробка дрожит, потом — окно с подсказкой (then). Повторный тап во время дрожи — мимо.
  denyBox(btn, then) {
    if (btn.denying) return;
    btn.denying = true;
    sfx(this, 'sfx_invalid');
    const D = HC.boxes;
    this.tweens.add({
      targets: btn.box, x: D.shake, duration: D.shakeMs, yoyo: true, repeat: 3, ease: 'Sine.easeInOut',
      onComplete: () => { btn.box.x = 0; btn.denying = false; then(); },
    });
  }

  // Кличка — табличкой над котом.
  refreshName() {
    this.profileName?.setText(catName());
    this.namePlate?.destroy();
    this.namePlate = plate(this, W / 2, HC.nameY, catName(), { depth: 0 });
    // тап по кличке — коллекция сразу на вкладке кличек
    const b = this.namePlate.getBounds();
    this.namePlate.setSize(b.width, b.height).setInteractive();
    this.namePlate.on('pointerdown', () => { sfx(this, 'sfx_button'); this.showCollection('names'); });
    this.homeRoom.add(this.namePlate);
  }

  // Кот на главной — выбранного в коллекции окраса; при смене окраса пересоздаётся на том же месте.
  makeHomeCat() {
    const s = HC.catScale;
    const old = this.cat;
    this.cat = new CatView(this, W / 2, HC.floorY - CONFIG.cat.origin[2] * s, catLook());
    this.cat.setBaseScale(s).startIdle();
    this.cat.home = { x: this.cat.x, y: this.cat.y };
    this.cat.setInteractive(new Phaser.Geom.Rectangle(-55, -75, 110, 145), Phaser.Geom.Rectangle.Contains);
    this.cat.on('pointerdown', () => this.cat.poke());
    if (old) {
      this.homeRoom.addAt(this.cat, this.homeRoom.getIndex(old));
      old.destroy();
    }
  }

  // Карта висит в большой рамке на стене bg_room_map и сразу показывает, где сейчас кот.
  // Любое касание — камера влетает в комнату вплотную к рамке, и карта вытягивается на весь экран.
  // Боковые планки рамки — кусочки той же картинки комнаты, тянутся вместе с картой.
  createMap() {
    const P = this.mapPlace();
    this.map = new MapView(this, P.x, P.y, P.scale, R.posterViewH);
    this.map.root.setDepth(1);
    this.mapOpen = false;
    this.mapBusy = false; // камера летит — пальцем не трогаем
    const F = R.mapFrame;
    if (this.slots[MAP].bg) {
      const tex = this.textures.get('bg_room_map');
      this.frameBars = [[F.left, 'map_bar_l'], [F.right - F.bar, 'map_bar_r']].map(([x, name]) => {
        if (!tex.has(name)) tex.add(name, 0, x, F.barY, F.bar, F.barH);
        return this.add.image(0, 0, 'bg_room_map', name).setDepth(19).setVisible(false);
      });
    }
  }

  // Точка картинки комнаты карты (px исходника) → мир.
  mapRoomPoint(x, y) {
    const s = this.slots[MAP];
    const bg = s.bg;
    return {
      x: s.room.x + (bg.x + (x - bg.width / 2) * bg.scale) * s.room.scale,
      y: s.room.y + (bg.y + (y - bg.height / 2) * bg.scale) * s.room.scale,
      k: bg.scale * s.room.scale,
    };
  }

  // Боковые планки рамки по высоте окна карты.
  placeFrameBars() {
    if (!this.frameBars) return;
    const F = R.mapFrame;
    const r = this.map.root;
    const h = this.map.viewH * r.scale;
    [F.left, F.right - F.bar].forEach((x, i) => {
      const p = this.mapRoomPoint(x + F.bar / 2, 0);
      this.frameBars[i].setPosition(p.x, r.y).setDisplaySize(F.bar * p.k, h);
    });
  }

  // Где карта на экране сейчас: рамка в комнате карты, комната — за своей аркой.
  mapPlace() {
    const room = this.slots[MAP].room;
    return { x: room.x + R.posterX * room.scale, y: room.y + R.posterY * room.scale, scale: R.posterScale * room.scale };
  }

  // Магазин: товары на полках комнаты магазина (src/view/ShopView.js), видны и из холла.
  createShop(room) {
    this.shopOpen = false;
    const bg = this.slots[SHOP].bg;
    if (!bg) return;
    const place = (x, y) => ({ x: bg.x + (x - bg.width / 2) * bg.scale, y: bg.y + (y - bg.height / 2) * bg.scale });
    // чёткие полки крупно — поверх фона, под товарами; видны, когда камера наехала
    if (this.textures.exists('shop_shelves')) {
      const Sh = R.shop.sharp;
      const p = place(Sh.x, Sh.y);
      this.shopSharp = this.add.image(p.x, p.y, 'shop_shelves').setOrigin(0).setScale(Sh.k * bg.scale).setAlpha(0);
      room.addAt(this.shopSharp, room.getIndex(bg) + 1);
    }
    this.shelves = stockShelves(this, room, place, bg.scale, (what, data) => this.shopTap(what, data));
  }

  // Точка картинки комнаты магазина (px bg_room_shop) → мир.
  shopPoint(x, y) {
    const s = this.slots[SHOP];
    const bg = s.bg;
    return {
      x: s.room.x + (bg.x + (x - bg.width / 2) * bg.scale) * s.room.scale,
      y: s.room.y + (bg.y + (y - bg.height / 2) * bg.scale) * s.room.scale,
    };
  }

  // Создать объекты на основной камере, даже когда магазин открыт (перерисовка полок).
  onMain(fn) {
    this.toMain = true;
    try { fn(); } finally { this.toMain = false; }
  }

  // Камера наезжает на полки (R.shop.view) — они занимают экран между верхней полосой и вкладками.
  zoomShop() {
    if (this.shopOpen || !this.shelves) return;
    this.shopOpen = true;
    this.mapBusy = true;
    const V = R.shop.view;
    const a = this.shopPoint(V.x, V.y);
    const b = this.shopPoint(V.x + V.w, V.y + V.h);
    const top = CONFIG.ui.topY + 60;
    const bottom = H - CONFIG.ui.tabBarHeight - 10;
    const zoom = Math.min(W / (b.x - a.x), (bottom - top) / (b.y - a.y));
    this.shopZoom = zoom;
    const cx = (a.x + b.x) / 2;
    const cy = (a.y + b.y) / 2 - ((top + bottom) / 2 - H / 2) / zoom; // полки — посередине между полосой и вкладками
    sfx(this, 'sfx_swipe', CONFIG.audio.swipe, 1.15);
    this.tweens.add({
      targets: this.cameras.main, zoom, scrollX: cx - W / 2, scrollY: cy - H / 2, duration: R.shop.zoomMs, ease: 'Cubic.easeInOut',
      onUpdate: () => this.sharpenShelves(zoom),
      onComplete: () => { this.mapBusy = false; },
    });
  }

  // Чёткие полки проявляются по мере наезда: от R.shop.sharp.sharpFrom до полного приближения full.
  sharpenShelves(full) {
    if (!this.shopSharp) return;
    const from = R.shop.sharp.sharpFrom;
    this.shopSharp.setAlpha(Phaser.Math.Clamp((this.cameras.main.zoom - from) / (full - from), 0, 1));
  }

  // Отъехать от полок; onDone — когда холл снова как был.
  collapseShop(onDone) {
    if (!this.shopOpen) return onDone?.();
    if (this.mapBusy) return;
    this.mapBusy = true;
    sfx(this, 'sfx_swipe', CONFIG.audio.swipe, 0.85);
    this.tweens.add({
      targets: this.cameras.main, zoom: 1, scrollX: 0, scrollY: 0, duration: R.shop.zoomMs * 0.8, ease: 'Cubic.easeInOut',
      onUpdate: () => this.sharpenShelves(this.shopZoom),
      onComplete: () => {
        this.shopOpen = false;
        this.mapBusy = false;
        if (this.homeDirty) { // купили ультракота — он теперь на главной
          this.homeDirty = false;
          this.makeHomeCat();
          this.afterBox();
        }
        onDone?.();
      },
    });
  }

  // Тап по товару на полке.
  shopTap(what, data) {
    if (!this.shopOpen) return this.goTo(SHOP, { onDone: () => this.zoomShop() }); // из холла — сначала к полкам
    const bought = () => {
      this.refreshTop();
      this.onMain(() => this.shelves.refresh());
      this.homeDirty = true;
    };
    if (what === 'starter') openPacks(this, { only: true });
    else if (what === 'packs') openPacks(this);
    else if (what === 'coins') openCoinPacks(this, () => this.refreshTop());
    else if (what === 'ultra') offerUltra(this, data, bought);
    else if (what === 'ultras') openUltras(this, (u, again) => offerUltra(this, u, () => { bought(); again(); }));
    else if (what === 'goods') openGoods(this, data, bought);
  }

  // Неоткрытые породы — «?» в пустых рамках на стене. Сами породы — позже.
  // В рамках на стене — открытые окрасы кота (головы), пустые рамки — «?». Тап по комнате — окно коллекции.
  createCollection(room) {
    this.collectionRoom = room;
    this.refreshCollectionWall();
  }

  refreshCollectionWall() {
    const room = this.collectionRoom;
    this.wallParts?.forEach((o) => o.destroy());
    this.wallParts = [];
    const C = R.collection;
    const owned = CONFIG.skins.filter((k) => skinsOwned().includes(k.id));
    let i = 0;
    C.y.forEach((y) => C.x.forEach((x) => {
      const k = owned[i++];
      let o;
      if (k) {
        o = this.add.image(x, y, `cat_${k.file}_head`);
        o.setScale(C.head / Math.max(o.width, o.height));
      } else o = this.add.text(x, y, '?', { ...this.titleStyle(), fontSize: '80px', color: PAL.textQuestion }).setOrigin(0.5);
      room.add(o);
      this.wallParts.push(o);
    }));
  }

  showCollection(tab) {
    openCollection(this, {
      tab,
      // окно коллекции ещё открыто — комнату перерисовываем на основной камере
      onChange: () => this.onMain(() => { this.makeHomeCat(); this.refreshName(); this.refreshCollectionWall(); this.refreshTop(); }),
    });
  }

  // Какая арка сейчас перед нами (номер в SLOTS).
  currentSlot() {
    return Math.round((((this.pan.p % RING) + RING) % RING) / STEP) % SLOTS.length;
  }

  // Таблички со статистикой на пустой стене под полкой с кубками.
  createProfile(room) {
    const P = R.profile;
    const passed = unlockedLevel(LEVELS.length);
    const hard = LEVELS.filter((l) => l.kind && levelPassed(l)).length;
    // первая строка — кличка (текст помельче: кличка бывает длинной; меняется в коллекции — refreshName)
    const rows = [[STR.profile.name, catName()], [STR.profile.catLevel, catLevel()], [STR.profile.passed, passed], [STR.profile.hard, hard]];
    const x0 = W / 2 - P.w / 2;
    rows.forEach(([name, value], k) => {
      const y = P.y + k * P.step;
      const g = this.add.graphics();
      g.fillStyle(PAL.black, 0.18).fillRoundedRect(x0 + 4, y - P.h / 2 + 8, P.w, P.h, 24);
      g.fillStyle(PAL.cream, 1).fillRoundedRect(x0, y - P.h / 2, P.w, P.h, 24);
      g.lineStyle(4, PAL.brownRim, 1).strokeRoundedRect(x0, y - P.h / 2, P.w, P.h, 24);
      room.add([
        g,
        this.add.text(x0 + 28, y, name, { ...this.noteStyle(), fontSize: '30px', color: PAL.textBrown, strokeThickness: 0 }).setOrigin(0, 0.5),
      ]);
      const val = this.add.text(x0 + P.w - 28, y, String(value), { ...this.titleStyle(), fontSize: k === 0 ? '34px' : '44px', strokeThickness: k === 0 ? 8 : 12 }).setOrigin(1, 0.5);
      room.add(val);
      if (k === 0) this.profileName = val;
    });
  }

  titleStyle() {
    return { fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '60px', color: PAL.text, stroke: PAL.textBrown, strokeThickness: 12 };
  }

  noteStyle() {
    return { fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '34px', color: PAL.text, stroke: PAL.textBrown, strokeThickness: 7 };
  }

  // ---------- карта на весь экран ----------

  // Камера влетает сквозь арку в кабинет и встаёт вплотную к рамке (рамка — во всю ширину экрана),
  // потом окно карты вытягивается вверх и вниз на весь экран, а планки рамки — вместе с ним.
  expandMap() {
    if (this.mapOpen) return;
    this.mapOpen = true;
    this.mapBusy = true;
    this.mapScroll0 = this.map.scroll; // окно выше экрана сдвигает прокрутку — при закрытии вернём
    const fly = () => {
      const F = R.mapFrame;
      const r = this.map.root;
      const zoom = W / (this.mapRoomPoint(F.right, 0).x - this.mapRoomPoint(F.left, 0).x);
      const cam = this.cameras.main;
      sfx(this, 'sfx_swipe', CONFIG.audio.swipe, 1.15);
      this.tweens.add({
        targets: cam, zoom, scrollX: r.x - W / 2, scrollY: r.y - H / 2, duration: R.mapFly, ease: 'Cubic.easeInOut',
        onComplete: () => {
          r.setDepth(19); // дальше окно выходит за рамку — над стеной холла
          this.frameBars?.forEach((bar) => bar.setVisible(true));
          this.placeFrameBars();
          this.tweens.add({
            targets: this.map, viewH: H / zoom / r.scale, duration: R.mapStretch, ease: 'Cubic.easeOut',
            onUpdate: () => this.placeFrameBars(),
            onComplete: () => { this.mapBusy = false; this.mapScrollOpen = this.map.scroll; },
          });
        },
      });
      this.mapBack.setVisible(true).setAlpha(0);
      this.tweens.add({ targets: this.mapBack, alpha: 1, duration: R.mapFly });
    };
    if (Math.abs(wrap(MAP * STEP - this.pan.p)) > 1) this.goTo(MAP, { onDone: fly });
    else fly();
  }

  // Обратно: окно карты сжимается в рамку, камера отлетает. onDone — когда холл снова как был.
  collapseMap(onDone) {
    if (!this.mapOpen) return onDone?.();
    if (this.mapBusy) return; // ещё летим — второй раз не начинаем
    this.mapOpen = false;
    this.mapBusy = true;
    this.map.velocity = 0;
    sfx(this, 'sfx_swipe', CONFIG.audio.swipe, 0.85);
    const scroll = this.mapScroll0 + (this.map.scroll - this.mapScrollOpen); // с тем, что игрок прокрутил сам
    this.tweens.add({ targets: this.mapBack, alpha: 0, duration: R.mapStretch, onComplete: () => this.mapBack.setVisible(false) });
    this.tweens.add({
      targets: this.map, viewH: R.posterViewH, duration: R.mapStretch, ease: 'Cubic.easeIn',
      onUpdate: () => { this.map.setScroll(scroll); this.placeFrameBars(); },
      onComplete: () => {
        this.frameBars?.forEach((bar) => bar.setVisible(false));
        this.map.root.setDepth(1);
        this.tweens.add({
          targets: this.cameras.main, zoom: 1, scrollX: 0, scrollY: 0, duration: R.mapFly, ease: 'Cubic.easeInOut',
          onComplete: () => { this.mapBusy = false; onDone?.(); },
        });
      },
    });
  }

  // ---------- палец ----------

  // Холл пальцем не листается — только вкладками. Палец нужен карте: касание рамки (тап или протяжка вверх-вниз)
  // разворачивает её, на развёрнутой — протяжка вверх-вниз прокручивает, тап по уровню запускает его.
  // Первое движение решает направление: вбок — ничего (и это уже не тап), вверх-вниз — карта.
  setupInput() {
    const TH = CONFIG.map.dragThreshold;
    this.input.on('pointerdown', (p, over) => {
      if (over.length || this.mapBusy) { this.gesture = null; return; } // кнопка, кот, вкладка; камера летит
      this.gesture = {
        x0: p.x, y0: p.y, axis: null, lastY: p.y, lastT: p.event.timeStamp,
        onPoster: !this.mapOpen && this.map.bounds().contains(this.worldAt(p).x, this.worldAt(p).y),
      };
      this.map.velocity = 0;
    });
    this.input.on('pointermove', (p) => {
      const g = this.gesture;
      if (!g) return;
      const dx = p.x - g.x0;
      const dy = p.y - g.y0;
      if (!g.axis) {
        if (Math.hypot(dx, dy) < TH) return;
        g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
        if (g.axis === 'y' && g.onPoster) this.expandMap();
      }
      if (g.axis === 'y' && this.mapOpen && !this.mapBusy) {
        const dt = Math.max(1, p.event.timeStamp - g.lastT);
        const k = this.cameras.main.zoom * this.map.root.scale; // экранные px → px карты
        this.map.velocity = ((g.lastY - p.y) / dt / k) * 16.7;
        this.map.setScroll(this.map.scroll + (g.lastY - p.y) / k);
      }
      g.lastY = p.y;
      g.lastT = p.event.timeStamp;
    });
    this.input.on('pointerup', (p) => {
      const g = this.gesture;
      this.gesture = null;
      // движения пальца могли не дойти (медленный кадр) — тапом считаем только короткое касание
      if (!g || g.axis || Math.hypot(p.x - g.x0, p.y - g.y0) >= TH) return;
      if (this.mapOpen) { const w = this.worldAt(p); this.map.tapAt(w.x, w.y); }
      else if (g.onPoster) this.expandMap();
      else if (SLOTS[this.currentSlot()].key === 'collection') this.showCollection();
    });
    this.input.on('wheel', (p, objs, dx, dy) => {
      if (this.mapOpen) this.map.setScroll(this.map.scroll + dy / (this.cameras.main.zoom * this.map.root.scale));
    });
  }

  update() {
    this.cat.breathe(beatPhase(this, CONFIG.anim.idleBreathBeats));
    // раскладка зависит только от поворота и стекла вкладок — пересчитываем, когда они сдвинулись
    const tab = this.tabLock ? this.tabLock.f : null;
    if (this.pan.p !== this.laidOut?.p || tab !== this.laidOut.tab) this.layout();
    this.map.update(this.gesture?.axis === 'y');
  }
}
