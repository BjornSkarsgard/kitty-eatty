import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CatView } from '../view/CatView.js';
import { MapView } from '../view/MapView.js';
import { makeButton } from '../view/Button.js';
import { counterPill, tabBar, iconButton } from '../view/ui.js';
import { addSettingsMenu } from '../view/settings.js';
import { panDuration, panFx, zoomIn, enterZoom } from '../view/transition.js';
import { music, sfx } from '../audio.js';
import { beatPhase } from '../beat.js';
import { currentLevel, unlockedLevel, levelStars, coins } from '../save.js';
import LEVELS from '../levels/levels.json';

const W = CONFIG.width;
const H = CONFIG.height;
const R = CONFIG.room;
const HC = CONFIG.home;
const O = R.opening;

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
const RING = SLOTS.length * W; // длина круга в пикселях поворота
const slotOf = (key) => Math.max(1, SLOTS.findIndex((s) => s.key === key));
// Сдвиг по кругу в пределах [-RING/2, RING/2).
const wrap = (x) => ((((x + RING / 2) % RING) + RING) % RING) - RING / 2;

// Главный экран — круглый холл дома кота. Стоим в центре, вокруг арки (hall_arch.png), за каждой своя комната
// (bg_room_<key>.jpg), за аркой сзади — закрытая дверь кухни (kitchen_door.png) с кнопкой «Играть».
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
    this.pan = { p: (this.fromKitchen ? KITCHEN : slotOf(data.zone ?? 'home')) * W };
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
    this.setupInput();
    music(this, 'music_game');
    this.layout();
    if (this.fromKitchen) this.backFromKitchen();
  }

  // ---------- холл ----------

  // Арка: комната (контейнер под маской проёма) и стена с аркой над ней.
  createSlot(s, i) {
    const room = this.add.container(0, 0).setDepth(0);
    const key = s.key === 'kitchen' ? 'bg_game' : `bg_room_${s.key}`;
    if (this.textures.exists(key)) {
      const bg = this.add.image(W / 2, H / 2, key);
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
      arch.setScale(H / arch.height);
    }
    return { i, room, mask, arch };
  }

  // Каждый кадр: всё на своих местах для текущего поворота pan.p.
  layout() {
    const p = this.pan.p;
    for (const s of this.slots) {
      const d = wrap(s.i * W - p); // где арка относительно экрана
      const on = Math.abs(d) < W;
      const k = s.room.scale;
      s.room.setVisible(on).setPosition(W / 2 - (W / 2) * k + R.depth * d, O.top * (1 - k));
      s.mask.x = d;
      s.arch?.setVisible(on).setX(W / 2 + d);
      s.d = d;
    }
    this.placeDoor(this.slots[KITCHEN].d);
    if (!this.mapOpen && !this.mapMoving) {
      const P = this.mapPlace();
      this.map.root.setPosition(P.x, P.y).setScale(P.scale);
    }
    // вкладки: доля пути между арками; у кухни стекло упирается в крайнюю вкладку
    this.tabs.setPosition((((p % RING) + RING) % RING) / W - 1);
  }

  // Поворот к арке slot по кратчайшему пути (dir — куда ехать, если пути равны). ms и onDone — для проезда к кухне.
  goTo(slot, { dir = 1, ms = R.panDuration, ease = 'Cubic.easeInOut', onDone } = {}) {
    if (this.mapOpen && slot !== MAP) this.collapseMap();
    this.pan.p = ((this.pan.p % RING) + RING) % RING;
    let delta = wrap(slot * W - this.pan.p);
    if (Math.abs(Math.abs(delta) - RING / 2) < 1) delta = (dir * RING) / 2;
    if (Math.abs(delta) > 1 && !onDone) sfx(this, 'sfx_swipe', CONFIG.audio.swipe);
    this.tweens.killTweensOf(this.pan);
    this.tweens.add({ targets: this.pan, p: this.pan.p + delta, duration: ms, ease, onComplete: onDone });
    return delta;
  }

  // ---------- кухня ----------

  // Дверь — две створки из одной картинки (левая и правая половины), каждая сжимается к своей петле.
  // Кнопка «Играть» — на двери.
  createDoor() {
    if (this.textures.exists('kitchen_door')) {
      this.leaves = [0, 1].map((side) => {
        const leaf = this.add.image(0, 0, 'kitchen_door').setDepth(3).setOrigin(side, 1).setScale(R.door.scale);
        leaf.setCrop(side * leaf.width / 2, 0, leaf.width / 2, leaf.height);
        return leaf;
      });
    }
    const level = currentLevel(LEVELS.length);
    this.playButton = makeButton(this, 0, R.door.playY, `Играть ${LEVELS[level].id}`, () => this.startLevel(level),
      { w: 400, h: 116, size: 52, color: 0xf5b301 }).setDepth(4);
  }

  placeDoor(d) {
    const cx = O.x + d;
    this.leaves?.forEach((leaf, side) => leaf.setPosition(cx + (side ? 1 : -1) * (leaf.width / 2) * R.door.scale, R.door.bottom));
    this.playButton.setX(cx).setVisible(!this.doorOpen && Math.abs(d) < W);
  }

  // Створки: open — распахнуты (сжаты к петлям и затенены) или закрыты; ms = 0 — сразу.
  swingDoor(open, ms, onDone) {
    this.doorOpen = open; // кнопка «Играть» — только на закрытой двери
    if (!this.leaves) return onDone?.();
    const white = Phaser.Display.Color.ValueToColor(0xffffff);
    const shade = Phaser.Display.Color.ValueToColor(R.door.shade);
    const set = (t) => {
      const c = Phaser.Display.Color.Interpolate.ColorWithColor(white, shade, 1, t);
      this.leaves.forEach((leaf) => {
        leaf.scaleX = R.door.scale * (1 - (1 - R.door.open) * t);
        leaf.setTint(Phaser.Display.Color.GetColor(c.r, c.g, c.b));
      });
    };
    const to = open ? 1 : 0;
    if (!ms) { set(to); return onDone?.(); }
    const k = { t: 1 - to };
    this.tweens.add({ targets: k, t: to, duration: ms, ease: open ? 'Quad.easeIn' : 'Back.easeOut',
      onUpdate: () => set(k.t), onComplete: onDone });
  }

  // В уровень: быстрый проезд к двери кухни (с главной — через коллекцию и профиль, с карты — через магазин),
  // дверь распахивается, камера въезжает в проём.
  startLevel(index) {
    if (this.mapOpen) this.collapseMap();
    this.input.enabled = false;
    const go = () => this.swingDoor(true, R.door.openDuration, () =>
      zoomIn(this, R.doorZoom, R.doorZoomDuration, () => this.scene.start('Game', { levelIndex: index, fromHall: true })));
    const span = wrap(KITCHEN * W - this.pan.p);
    if (Math.abs(span) < 2) return go();
    const ms = panDuration(span);
    const delta = this.goTo(KITCHEN, { dir: 1, ms, onDone: go });
    panFx(this, Math.sign(delta), ms);
  }

  // Из уровня: начинаем в проёме открытой двери, отъезжаем, дверь закрывается, и быстро едем на главную
  // обратно тем же путём — через профиль и коллекцию.
  backFromKitchen() {
    this.swingDoor(true, 0);
    enterZoom(this, R.doorZoom, R.doorZoomDuration, () => {
      this.input.enabled = false;
      this.swingDoor(false, R.door.openDuration, () => {
        const ms = panDuration(RING / 2);
        panFx(this, -1, ms);
        this.goTo(HOME, { dir: -1, ms, onDone: () => (this.input.enabled = true) });
      });
    });
  }

  // ---------- комнаты (координаты — как на картинке комнаты во весь экран) ----------

  createHome(room) {
    const title = this.add.text(W / 2, HC.titleY, 'Накорми котиков', {
      fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '54px', color: '#ffffff',
      stroke: '#6b3d1f', strokeThickness: 12,
    }).setOrigin(0.5);
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
      { w: 440, h: 120, size: 56, color: 0xf5b301 });
    room.add([title, shadow, this.cat, play]);
  }

  // Карта висит в большой рамке на стене bg_room_map и сразу показывает, где сейчас кот.
  // Любое касание — разворачивается на весь экран.
  createMap() {
    const P = this.mapPlace();
    this.map = new MapView(this, P.x, P.y, P.scale, R.posterViewH);
    this.map.root.setDepth(1);
    this.mapOpen = false;
    this.mapMoving = false;
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

  expandMap() {
    if (this.mapOpen) return;
    this.mapOpen = true;
    sfx(this, 'sfx_swipe', CONFIG.audio.swipe, 1.15);
    this.goTo(MAP);
    this.map.root.setDepth(19); // над стеной холла, под вкладками
    this.tweens.add({ targets: this.map.root, x: W / 2, y: H / 2, scale: 1, duration: R.zoomDuration, ease: 'Cubic.easeInOut' });
    this.tweens.add({ targets: this.map, viewH: H, duration: R.zoomDuration, ease: 'Cubic.easeInOut' });
    this.mapBack.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.mapBack, alpha: 1, duration: R.zoomDuration });
  }

  collapseMap() {
    if (!this.mapOpen) return;
    this.mapOpen = false;
    this.mapMoving = true;
    sfx(this, 'sfx_swipe', CONFIG.audio.swipe, 0.85);
    this.map.velocity = 0;
    // догоняем рамку, даже если холл в это время поворачивается
    const from = { x: this.map.root.x, y: this.map.root.y, scale: this.map.root.scale };
    this.tweens.addCounter({
      from: 0, to: 1, duration: R.zoomDuration, ease: 'Cubic.easeInOut',
      onUpdate: (tw) => {
        const t = tw.getValue();
        const P = this.mapPlace();
        this.map.root.setPosition(from.x + (P.x - from.x) * t, from.y + (P.y - from.y) * t).setScale(from.scale + (P.scale - from.scale) * t);
      },
      onComplete: () => { this.mapMoving = false; this.map.root.setDepth(1); },
    });
    this.tweens.add({ targets: this.map, viewH: R.posterViewH, duration: R.zoomDuration, ease: 'Cubic.easeInOut' });
    this.tweens.add({ targets: this.mapBack, alpha: 0, duration: R.zoomDuration / 2, onComplete: () => this.mapBack.setVisible(false) });
  }

  // ---------- палец ----------

  // Первое движение решает направление: вбок — поворачиваемся по холлу, вверх-вниз — прокручиваем развёрнутую карту.
  // Касание рамки с картой (тап или протяжка вверх-вниз) — разворачивает её.
  setupInput() {
    const TH = CONFIG.map.dragThreshold;
    this.input.on('pointerdown', (p, over) => {
      if (over.length) { this.gesture = null; return; } // кнопка, кот, вкладка
      this.tweens.killTweensOf(this.pan);
      this.gesture = {
        x0: p.x, y0: p.y, pan0: this.pan.p, axis: null, lastX: p.x, lastY: p.y, lastT: p.event.timeStamp, vx: 0,
        onPoster: !this.mapOpen && !this.mapMoving && this.map.bounds().contains(p.worldX, p.worldY),
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
      const dt = Math.max(1, p.event.timeStamp - g.lastT);
      if (g.axis === 'x' && !this.mapOpen) {
        g.vx = ((g.lastX - p.x) / dt) * 16.7;
        this.pan.p = g.pan0 - dx; // круг замкнут — краёв нет
      } else if (g.axis === 'y' && this.mapOpen) {
        this.map.velocity = ((g.lastY - p.y) / dt) * 16.7;
        this.map.setScroll(this.map.scroll + (g.lastY - p.y));
      }
      g.lastX = p.x;
      g.lastY = p.y;
      g.lastT = p.event.timeStamp;
    });
    this.input.on('pointerup', (p) => {
      const g = this.gesture;
      this.gesture = null;
      if (!g) return;
      // движения пальца могли не дойти (медленный кадр) — решаем по итоговому сдвигу
      if (!g.axis && Math.abs(p.x - g.x0) >= TH && Math.abs(p.x - g.x0) > Math.abs(p.y - g.y0)) {
        g.axis = 'x';
        g.vx = (g.x0 - p.x) / 10;
      }
      if (!g.axis) {
        if (this.mapOpen) this.map.tapAt(p.worldX, p.worldY);
        else if (g.onPoster) this.expandMap();
        return;
      }
      if (g.axis === 'x' && !this.mapOpen) {
        // протащили дальше swipeShare экрана или быстро взмахнули — к соседней арке, иначе — обратно
        const dx = g.x0 - p.x;
        let i = Math.round(g.pan0 / W);
        if (Math.abs(dx) > W * R.swipeShare || Math.abs(g.vx) > R.flick) i += Math.sign(dx);
        this.goTo(((i % SLOTS.length) + SLOTS.length) % SLOTS.length, { dir: Math.sign(dx) || 1 });
      }
    });
    this.input.on('wheel', (p, objs, dx, dy) => { if (this.mapOpen) this.map.setScroll(this.map.scroll + dy); });
  }

  update() {
    this.cat.breathe(beatPhase(this, CONFIG.anim.idleBreathBeats));
    this.layout();
    this.map.update(this.gesture?.axis === 'y');
  }
}
