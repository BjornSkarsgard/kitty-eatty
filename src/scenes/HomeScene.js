import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CatView } from '../view/CatView.js';
import { makeButton } from '../view/Button.js';
import { counterPill, tabBar } from '../view/ui.js';
import { addSettingsMenu } from '../view/settings.js';
import { music } from '../audio.js';
import { beatPhase } from '../beat.js';
import { currentLevel, coins } from '../save.js';
import LEVELS from '../levels/levels.json';

const HC = CONFIG.home;

// Вкладки нижней панели — общие для главного экрана и карты. Магазин — за флагом, коллекция и профиль — позже.
export const mainTabs = () => [
  { icon: 'shop', label: 'Магазин', scene: 'Shop', enabled: CONFIG.shop.enabled },
  { icon: 'map', label: 'Карта', scene: 'Map' },
  { icon: 'home', label: 'Главная', scene: 'Home' },
  { icon: 'collection', label: 'Коллекция', scene: 'Collection', enabled: false },
  { icon: 'profile', label: 'Профиль', scene: 'Profile', enabled: false },
];

// Главный экран — комната кота: кот по центру, большая «Играть N», снизу панель вкладок.
// Пока без арта: стена и пол кодом; фон bg_home.png — позже.
export class HomeScene extends Phaser.Scene {
  constructor() {
    super('Home');
  }

  create() {
    const W = CONFIG.width;
    const H = CONFIG.height;
    this.drawRoom();

    this.add.text(W / 2, HC.titleY, 'Накорми котиков', {
      fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '64px', color: '#ffffff',
      stroke: '#6b3d1f', strokeThickness: 12,
    }).setOrigin(0.5);

    // кот сидит на полу, дышит в такт музыке, на тап — случайная реакция, как в игре
    const s = HC.catScale;
    this.cat = new CatView(this, W / 2, HC.floorY - CONFIG.cat.origin[2] * s, HC.catColor);
    this.cat.setBaseScale(s).startIdle();
    this.cat.home = { x: this.cat.x, y: this.cat.y };
    this.cat.setInteractive(new Phaser.Geom.Rectangle(-55, -75, 110, 145), Phaser.Geom.Rectangle.Contains);
    this.cat.on('pointerdown', () => this.cat.poke());

    // верх: монеты и настройки; низ: главная кнопка «Играть» и вторичные иконки с подписями
    const U = CONFIG.ui;
    counterPill(this, 30 + U.pillWidth / 2, U.topY, 'coin', coins());
    addSettingsMenu(this);
    const level = currentLevel(LEVELS.length);
    makeButton(this, W / 2, HC.playY, `Играть ${LEVELS[level].id}`, () => this.scene.start('Game', { levelIndex: level }),
      { w: 440, h: 120, size: 56, color: 0xf5b301 });
    tabBar(this, mainTabs(), 'Home');
    music(this, 'music_game');
  }

  drawRoom() {
    const W = CONFIG.width;
    const H = CONFIG.height;
    if (this.textures.exists('bg_home')) {
      const bg = this.add.image(W / 2, H / 2, 'bg_home');
      bg.setScale(Math.max(W / bg.width, H / bg.height));
      return;
    }
    const g = this.add.graphics();
    g.fillGradientStyle(HC.wallTop, HC.wallTop, HC.wall, HC.wall, 1).fillRect(0, 0, W, HC.floorY);
    g.fillStyle(HC.floor, 1).fillRect(0, HC.floorY, W, H - HC.floorY);
    g.fillStyle(0x000000, 0.12).fillRect(0, HC.floorY, W, 14); // плинтус
    g.fillStyle(0x000000, 0.18).fillEllipse(W / 2, HC.floorY + 6, 260, 40); // тень под котом
  }

  update() {
    this.cat.breathe(beatPhase(this, CONFIG.anim.idleBreathBeats));
  }
}
