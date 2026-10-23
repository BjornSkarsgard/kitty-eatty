import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CatView } from '../view/CatView.js';
import { MapView } from '../view/MapView.js';
import { makeButton } from '../view/Button.js';
import { counterPill, tabBar, iconButton, makeIcon } from '../view/ui.js';
import { addSettingsMenu } from '../view/settings.js';
import { turnTo, turnIn } from '../view/transition.js';
import { music, sfx } from '../audio.js';
import { beatPhase } from '../beat.js';
import { currentLevel, unlockedLevel, levelStars, coins } from '../save.js';
import LEVELS from '../levels/levels.json';

const W = CONFIG.width;
const H = CONFIG.height;
const R = CONFIG.room;
const HC = CONFIG.home;

// Участки комнаты слева направо — они же вкладки нижней панели.
const ZONES = [
  { key: 'shop', icon: 'shop', label: 'Магазин', enabled: () => CONFIG.shop.enabled },
  { key: 'map', icon: 'map', label: 'Карта' },
  { key: 'home', icon: 'home', label: 'Главная' },
  { key: 'collection', icon: 'collection', label: 'Коллекция' },
  { key: 'profile', icon: 'profile', label: 'Профиль' },
];
const zoneIndex = (key) => Math.max(0, ZONES.findIndex((z) => z.key === key));

// Главный экран — одна широкая комната (дом кота), вкладки — её участки: магазин (полки), карта (висит на стене),
// главная (кот), коллекция (фото-рамки пород), профиль (уголок кота). Переход между вкладками — камера плавно
// едет вбок; можно листать пальцем. Сверху монеты и настройки, снизу вкладки — стоят на месте.
// Пока без арта: стена, пол и предметы кодом; фон каждого участка — bg_room_<key>.jpg (позже).
export class RoomScene extends Phaser.Scene {
  constructor() {
    super('Room');
  }

  init(data) {
    this.startZone = zoneIndex(data.zone ?? 'home');
    this.turn = data.turn; // пришли из уровня — въезжаем «поворотом»
  }

  create() {
    const cam = this.cameras.main;
    cam.setBounds(0, 0, W * ZONES.length, H);
    cam.scrollX = this.startZone * W;
    this.drawRoom();
    this.createShop(0);
    this.createMap(W);
    this.createHome(2 * W);
    this.createCollection(3 * W);
    this.createProfile(4 * W);

    const U = CONFIG.ui;
    counterPill(this, 30 + U.pillWidth / 2, U.topY, 'coin', coins(), { depth: 25 }).setScrollFactor(0);
    addSettingsMenu(this);
    this.tabs = tabBar(this, ZONES.map((z) => ({ ...z, enabled: z.enabled ? z.enabled() : true })), (i) => this.goTo(i));
    this.mapBack = iconButton(this, 62, U.topY + 110, 'close', () => this.collapseMap(), {
      size: 84, shape: 'round', color: CONFIG.ui.exitColor, depth: 26,
    }).setScrollFactor(0).setVisible(false);
    this.setupInput();
    music(this, 'music_game');
    if (this.turn) turnIn(this, this.turn);
  }

  // Путь поворота: кухня — за правым краем комнаты. Уходим вправо — едем до края и ещё экран;
  // приезжаем оттуда (dir -1) — от правого края до своего участка.
  turnExit(dir) {
    const s = this.cameras.main.scrollX;
    return dir > 0 ? W * (ZONES.length - 1) - s + W : s + W;
  }

  turnEnter(dir) {
    const s = this.cameras.main.scrollX;
    return dir < 0 ? W * (ZONES.length - 1) - s : s;
  }

  // В уровень — «поворотом» на кухню.
  startLevel(index) {
    turnTo(this, 'Game', { levelIndex: index }, 1);
  }

  // ---------- комната ----------

  // Стена и пол на всю ширину; на стыках участков — вертикальные «косяки» (в арте там будут шкаф, штора, растение).
  drawRoom() {
    const total = W * ZONES.length;
    const g = this.add.graphics();
    g.fillGradientStyle(HC.wallTop, HC.wallTop, HC.wall, HC.wall, 1).fillRect(0, 0, total, HC.floorY);
    g.fillStyle(HC.floor, 1).fillRect(0, HC.floorY, total, H - HC.floorY);
    g.fillStyle(0x000000, 0.12).fillRect(0, HC.floorY, total, 14);
    ZONES.forEach((z, i) => {
      if (this.textures.exists(`bg_room_${z.key}`)) {
        const bg = this.add.image(i * W + W / 2, H / 2, `bg_room_${z.key}`);
        bg.setScale(Math.max(W / bg.width, H / bg.height));
      }
      if (i) {
        g.fillStyle(0x9c6a3c, 1).fillRect(i * W - 18, 0, 36, HC.floorY);
        g.fillStyle(0xffffff, 0.15).fillRect(i * W - 14, 0, 6, HC.floorY);
      }
    });
  }

  createHome(x0) {
    this.add.text(x0 + W / 2, HC.titleY, 'Накорми котиков', {
      fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '64px', color: '#ffffff',
      stroke: '#6b3d1f', strokeThickness: 12,
    }).setOrigin(0.5);
    this.add.graphics().fillStyle(0x000000, 0.18).fillEllipse(x0 + W / 2, HC.floorY + 6, 260, 40);
    // кот сидит на полу, дышит в такт музыке, на тап — случайная реакция, как в игре
    const s = HC.catScale;
    this.cat = new CatView(this, x0 + W / 2, HC.floorY - CONFIG.cat.origin[2] * s, HC.catColor);
    this.cat.setBaseScale(s).startIdle();
    this.cat.home = { x: this.cat.x, y: this.cat.y };
    this.cat.setInteractive(new Phaser.Geom.Rectangle(-55, -75, 110, 145), Phaser.Geom.Rectangle.Contains);
    this.cat.on('pointerdown', () => this.cat.poke());
    const level = currentLevel(LEVELS.length);
    makeButton(this, x0 + W / 2, HC.playY, `Играть ${LEVELS[level].id}`, () => this.startLevel(level),
      { w: 440, h: 120, size: 56, color: 0xf5b301 });
  }

  // Карта висит на стене в рамке и сразу показывает, где сейчас кот. Любое касание — разворачивается на весь экран.
  createMap(x0) {
    const s = R.posterScale;
    const cx = x0 + W / 2;
    const fw = W * s + 2 * R.frameWidth;
    const fh = H * s + 2 * R.frameWidth;
    const frame = this.add.graphics();
    frame.fillStyle(0x000000, 0.25).fillRoundedRect(cx - fw / 2 + 8, R.posterY - fh / 2 + 14, fw, fh, 18);
    frame.fillStyle(0x8a5a33, 1).fillRoundedRect(cx - fw / 2, R.posterY - fh / 2, fw, fh, 18);
    frame.fillStyle(0xb07a52, 1).fillRoundedRect(cx - fw / 2 + 6, R.posterY - fh / 2 + 6, fw - 12, fh - 12, 14);
    this.map = new MapView(this, cx, R.posterY, s);
    this.mapPlace = { x: cx, y: R.posterY, scale: s };
    this.mapFrame = frame;
    this.mapOpen = false;
  }

  createShop(x0) {
    const g = this.add.graphics();
    for (let k = 0; k < 3; k++) {
      const y = 380 + k * 170;
      g.fillStyle(0x000000, 0.15).fillRect(x0 + 90, y + 18, 540, 10);
      g.fillStyle(0x8a5a33, 1).fillRect(x0 + 80, y, 560, 20);
    }
    this.add.text(x0 + W / 2, 260, 'Магазин', this.titleStyle()).setOrigin(0.5);
    this.add.text(x0 + W / 2, 940, 'Скоро откроется', this.noteStyle()).setOrigin(0.5);
  }

  // Фото-рамки пород на стене; неоткрытые — силуэт с «?». Сами породы — позже.
  createCollection(x0) {
    this.add.text(x0 + W / 2, 220, 'Коллекция', this.titleStyle()).setOrigin(0.5);
    for (let k = 0; k < 6; k++) {
      const x = x0 + W / 2 + ((k % 2) - 0.5) * 260;
      const y = 400 + Math.floor(k / 2) * 230;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.2).fillRoundedRect(x - 95 + 6, y - 95 + 10, 190, 190, 14);
      g.fillStyle(0xd9a441, 1).fillRoundedRect(x - 95, y - 95, 190, 190, 14);
      g.fillStyle(0x4b3a5e, 1).fillRoundedRect(x - 78, y - 78, 156, 156, 8);
      this.add.text(x, y, '?', { ...this.titleStyle(), fontSize: '80px', color: '#8d7aa8' }).setOrigin(0.5);
    }
  }

  // Уголок кота: лежанка и полка с медалями-статистикой.
  createProfile(x0) {
    this.add.text(x0 + W / 2, 220, 'Профиль', this.titleStyle()).setOrigin(0.5);
    const passed = unlockedLevel(LEVELS.length);
    const stars = LEVELS.reduce((sum, l) => sum + levelStars(l), 0);
    const rows = [['Пройдено уровней', passed], ['Звёзд собрано', stars], ['Монет', coins()]];
    rows.forEach(([name, value], k) => {
      const y = 380 + k * 130;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.18).fillRoundedRect(x0 + 90 + 4, y - 48 + 8, 540, 96, 24);
      g.fillStyle(0xfff3e0, 1).fillRoundedRect(x0 + 90, y - 48, 540, 96, 24);
      g.lineStyle(4, 0x9c6a3c, 1).strokeRoundedRect(x0 + 90, y - 48, 540, 96, 24);
      this.add.text(x0 + 120, y, name, { ...this.noteStyle(), color: '#6b3d1f', strokeThickness: 0 }).setOrigin(0, 0.5);
      this.add.text(x0 + 600, y, String(value), { ...this.titleStyle(), fontSize: '48px' }).setOrigin(1, 0.5);
    });
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.2).fillEllipse(x0 + W / 2, HC.floorY + 40, 420, 80);
    g.fillStyle(0xc24d6b, 1).fillEllipse(x0 + W / 2, HC.floorY + 20, 400, 110);
    g.fillStyle(0xf28aa5, 1).fillEllipse(x0 + W / 2, HC.floorY + 8, 320, 70);
  }

  titleStyle() {
    return { fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '60px', color: '#ffffff', stroke: '#6b3d1f', strokeThickness: 12 };
  }

  noteStyle() {
    return { fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '34px', color: '#ffffff', stroke: '#6b3d1f', strokeThickness: 7 };
  }

  // ---------- переходы ----------

  goTo(i) {
    if (this.mapOpen && i !== 1) this.collapseMap();
    if (Math.abs(this.cameras.main.scrollX - i * W) > 1) sfx(this, 'sfx_swipe', CONFIG.audio.swipe);
    this.tweens.killTweensOf(this.cameras.main);
    this.tweens.add({ targets: this.cameras.main, scrollX: i * W, duration: R.panDuration, ease: 'Cubic.easeInOut' });
  }

  expandMap() {
    if (this.mapOpen) return;
    this.mapOpen = true;
    sfx(this, 'sfx_swipe', CONFIG.audio.swipe, 1.15);
    this.goTo(1);
    this.tweens.add({ targets: this.map.root, x: W + W / 2, y: H / 2, scale: 1, duration: R.zoomDuration, ease: 'Cubic.easeInOut' });
    this.tweens.add({ targets: this.mapFrame, alpha: 0, duration: R.zoomDuration });
    this.mapBack.setVisible(true).setAlpha(0);
    this.tweens.add({ targets: this.mapBack, alpha: 1, duration: R.zoomDuration });
  }

  collapseMap() {
    if (!this.mapOpen) return;
    this.mapOpen = false;
    sfx(this, 'sfx_swipe', CONFIG.audio.swipe, 0.85);
    const P = this.mapPlace;
    this.map.velocity = 0;
    this.tweens.add({ targets: this.map.root, x: P.x, y: P.y, scale: P.scale, duration: R.zoomDuration, ease: 'Cubic.easeInOut' });
    this.tweens.add({ targets: this.mapFrame, alpha: 1, duration: R.zoomDuration });
    this.tweens.add({ targets: this.mapBack, alpha: 0, duration: R.zoomDuration / 2, onComplete: () => this.mapBack.setVisible(false) });
  }

  // ---------- палец ----------

  // Первое движение решает направление: вбок — листаем комнату, вверх-вниз — прокручиваем развёрнутую карту.
  // Касание рамки с картой (тап или протяжка вверх-вниз) — разворачивает её.
  setupInput() {
    const cam = this.cameras.main;
    const TH = CONFIG.map.dragThreshold;
    this.input.on('pointerdown', (p, over) => {
      if (over.length) { this.gesture = null; return; } // кнопка, кот, вкладка
      this.tweens.killTweensOf(cam);
      this.gesture = {
        x0: p.x, y0: p.y, scroll0: cam.scrollX, axis: null, lastX: p.x, lastY: p.y, lastT: p.event.timeStamp, vx: 0,
        onPoster: !this.mapOpen && this.map.bounds().contains(p.worldX, p.worldY),
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
        const max = W * (ZONES.length - 1);
        let s = g.scroll0 - dx;
        if (s < 0) s *= 0.35; // у краёв — тянется с сопротивлением
        if (s > max) s = max + (s - max) * 0.35;
        g.vx = ((g.lastX - p.x) / dt) * 16.7;
        cam.scrollX = s;
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
        // протащили дальше swipeShare экрана или быстро взмахнули — на соседний участок, иначе — обратно
        const dx = g.x0 - p.x;
        let i = Math.round(g.scroll0 / W);
        if (Math.abs(dx) > W * R.swipeShare || Math.abs(g.vx) > R.flick) i += Math.sign(dx);
        this.goTo(Phaser.Math.Clamp(i, 0, ZONES.length - 1));
      }
    });
    this.input.on('wheel', (p, objs, dx, dy) => { if (this.mapOpen) this.map.setScroll(this.map.scroll + dy); });
  }

  update() {
    this.cat.breathe(beatPhase(this, CONFIG.anim.idleBreathBeats));
    this.map.update(this.gesture?.axis === 'y');
    this.tabs.setPosition(this.cameras.main.scrollX / W);
  }
}
