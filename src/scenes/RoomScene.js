import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CatView } from '../view/CatView.js';
import { MapView } from '../view/MapView.js';
import { makeButton } from '../view/Button.js';
import { counterPill, tabBar, iconButton } from '../view/ui.js';
import { addSettingsMenu } from '../view/settings.js';
import { panDuration, panFx, hud } from '../view/transition.js';
import { music, sfx } from '../audio.js';
import { beatPhase } from '../beat.js';
import { currentLevel, unlockedLevel, levelStars, coins } from '../save.js';
import LEVELS from '../levels/levels.json';

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
  { key: 'shop', icon: 'shop', label: 'Магазин', enabled: () => CONFIG.shop.enabled },
  { key: 'map', icon: 'map', label: 'Карта' },
  { key: 'home', icon: 'home', label: 'Главная' },
  { key: 'collection', icon: 'collection', label: 'Коллекция' },
  { key: 'profile', icon: 'profile', label: 'Профиль' },
];
const TABS = SLOTS.slice(1);
const KITCHEN = 0;
const MAP = SLOTS.findIndex((s) => s.key === 'map');
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
    this.tabLock = null; // сцена переиспользуется — блокировка стекла вкладок с прошлого раза не нужна
    this.pan = { p: (this.fromKitchen ? KITCHEN : slotOf(data.zone ?? 'home')) * STEP };
  }

  create() {
    this.slots = SLOTS.map((s, i) => this.createSlot(s, i));
    this.createShop(this.slots[slotOf('shop')].room);
    this.createMap();
    this.createHome(this.slots[HOME].room);
    this.createCollection(this.slots[slotOf('collection')].room);
    this.createProfile(this.slots[slotOf('profile')].room);
    this.createDoor();

    const U = CONFIG.ui;
    counterPill(this, 30 + U.pillWidth / 2, U.topY, 'coin', coins(), { depth: 25 }).setScrollFactor(0);
    addSettingsMenu(this);
    this.tabs = tabBar(this, TABS.map((z) => ({ ...z, enabled: z.enabled ? z.enabled() : true })), (i) => this.goTo(i + 1));
    this.mapBack = iconButton(this, 62, U.topY + 110, 'close', () => this.collapseMap(), {
      size: 84, shape: 'round', color: CONFIG.ui.exitColor, depth: 26,
    }).setScrollFactor(0).setVisible(false);
    this.setupHudCamera();
    this.setupInput();
    music(this, 'music_game');
    this.layout();
    if (this.fromKitchen) this.backFromKitchen();
  }

  // Монеты, настройки и вкладки — на своей камере: основная камера приближается (к карте, в дверь кухни),
  // а интерфейс остаётся как есть. Всё, что появится позже (сердечки, струйки ветра), — только в основной.
  setupHudCamera() {
    const hud = this.children.list.filter((o) => o.scrollFactorX === 0);
    this.hudCam = this.cameras.add(0, 0, W, H);
    this.hudCam.ignore(this.children.list.filter((o) => !hud.includes(o)));
    this.cameras.main.ignore(hud);
    const onAdded = (o) => this.hudCam.ignore(o);
    this.events.on(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded);
    // события сцены переживают перезапуск — без этого старая подписка прятала бы новый интерфейс
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.ADDED_TO_SCENE, onAdded));
  }

  // Точка экрана → мир основной камеры (она бывает приближена).
  worldAt(p) {
    return this.cameras.main.getWorldPoint(p.x, p.y);
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
    mask.fillStyle(0xffffff)
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
    const white = Phaser.Display.Color.ValueToColor(0xffffff);
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
        game.cameras.main.setZoom(1).setScroll(0, 0);
        game.input.enabled = true;
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
        this.goTo(HOME, { ring: true, dir: -1, ms, onDone: () => { this.tabLock = null; this.input.enabled = true; } });
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
      title = this.add.text(W / 2, HC.titleY, 'Накорми котиков', {
        fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '54px', color: '#ffffff',
        stroke: '#6b3d1f', strokeThickness: 12,
      }).setOrigin(0.5);
    }
    const shadow = this.add.graphics().fillStyle(0x000000, 0.18).fillEllipse(W / 2, HC.floorY + HC.shadowY, 260, 40);
    // кот сидит на полу, дышит в такт музыке, на тап — случайная реакция, как в игре
    const s = HC.catScale;
    this.cat = new CatView(this, W / 2, HC.floorY - CONFIG.cat.origin[2] * s, HC.catColor);
    this.cat.setBaseScale(s).startIdle();
    this.cat.home = { x: this.cat.x, y: this.cat.y };
    this.cat.setInteractive(new Phaser.Geom.Rectangle(-55, -75, 110, 145), Phaser.Geom.Rectangle.Contains);
    this.cat.on('pointerdown', () => this.cat.poke());
    const level = currentLevel(LEVELS.length);
    const play = makeButton(this, W / 2, HC.playY, `Играть ${LEVELS[level].id}`, () => this.startLevel(level),
      { w: 380, h: 150, size: 52, skin: 'yellow' });
    room.add([title, shadow, this.cat, play]);
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

  createShop(room) {
    room.add(this.add.text(W / 2, 940, 'Скоро откроется', this.noteStyle()).setOrigin(0.5));
  }

  // Неоткрытые породы — «?» в пустых рамках на стене. Сами породы — позже.
  createCollection(room) {
    const C = R.collection;
    C.y.forEach((y) => C.x.forEach((x) => {
      room.add(this.add.text(x, y, '?', { ...this.titleStyle(), fontSize: '80px', color: '#8d7aa8' }).setOrigin(0.5));
    }));
  }

  // Таблички со статистикой на пустой стене под полкой с кубками.
  createProfile(room) {
    const P = R.profile;
    const passed = unlockedLevel(LEVELS.length);
    const stars = LEVELS.reduce((sum, l) => sum + levelStars(l), 0);
    const rows = [['Пройдено уровней', passed], ['Звёзд собрано', stars], ['Монет', coins()]];
    const x0 = W / 2 - P.w / 2;
    rows.forEach(([name, value], k) => {
      const y = P.y + k * P.step;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.18).fillRoundedRect(x0 + 4, y - P.h / 2 + 8, P.w, P.h, 24);
      g.fillStyle(0xfff3e0, 1).fillRoundedRect(x0, y - P.h / 2, P.w, P.h, 24);
      g.lineStyle(4, 0x9c6a3c, 1).strokeRoundedRect(x0, y - P.h / 2, P.w, P.h, 24);
      room.add([
        g,
        this.add.text(x0 + 28, y, name, { ...this.noteStyle(), fontSize: '30px', color: '#6b3d1f', strokeThickness: 0 }).setOrigin(0, 0.5),
        this.add.text(x0 + P.w - 28, y, String(value), { ...this.titleStyle(), fontSize: '44px' }).setOrigin(1, 0.5),
      ]);
    });
  }

  titleStyle() {
    return { fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '60px', color: '#ffffff', stroke: '#6b3d1f', strokeThickness: 12 };
  }

  noteStyle() {
    return { fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '34px', color: '#ffffff', stroke: '#6b3d1f', strokeThickness: 7 };
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
    });
    this.input.on('wheel', (p, objs, dx, dy) => {
      if (this.mapOpen) this.map.setScroll(this.map.scroll + dy / (this.cameras.main.zoom * this.map.root.scale));
    });
  }

  update() {
    this.cat.breathe(beatPhase(this, CONFIG.anim.idleBreathBeats));
    this.layout();
    this.map.update(this.gesture?.axis === 'y');
  }
}
