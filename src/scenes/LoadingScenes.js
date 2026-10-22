import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { LOADING_KEYS, queueAssets } from '../assets.js';
import { CatView } from '../view/CatView.js';
import { music } from '../audio.js';

// 1) Boot: грузит только то, что нужно самому экрану загрузки (голова, музыка).
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    queueAssets(this.load, (key) => LOADING_KEYS.includes(key));
  }

  create() {
    this.scene.start('Preload');
  }
}

// 2) Preload: голова кота едет по кругу и крутится в ритм музыки, пока грузится всё остальное.
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  create() {
    const Lc = CONFIG.loading;
    const W = CONFIG.width;
    const H = CONFIG.height;
    this.center = { x: W / 2, y: H * 0.45 };

    const html = document.getElementById('loader');
    if (html) html.hidden = true; // дальше рисует Phaser

    if (this.textures.exists('loading_head')) {
      const img = this.add.image(0, 0, 'loading_head');
      img.setScale(150 / Math.max(img.width, img.height));
      this.head = this.add.container(0, 0, [img]);
    } else {
      this.head = new CatView(this, 0, 0, Lc.color, { headOnly: true }).setMood('happy');
      this.head.head.y = 0; // голова без тела — по центру контейнера
      this.head.setScale(1.6);
    }
    this.headScale = this.head.scale;

    this.add.text(W / 2, H * 0.72, 'Загрузка…', {
      fontFamily: 'sans-serif', fontSize: '40px', color: '#ffffff',
    }).setOrigin(0.5);
    this.bar = this.add.graphics();
    this.drawBar(0);

    music(this, 'music_loading');
    this.startedAt = this.time.now;

    queueAssets(this.load, (key) => !LOADING_KEYS.includes(key));
    this.load.on('progress', (p) => this.drawBar(p));
    this.load.once('complete', () => {
      this.drawBar(1);
      const wait = Math.max(0, Lc.minDuration - (this.time.now - this.startedAt));
      this.time.delayedCall(wait, () => this.scene.start('Game'));
    });
    this.load.start();
  }

  drawBar(p) {
    const w = 360;
    const x = CONFIG.width / 2 - w / 2;
    const y = CONFIG.height * 0.77;
    this.bar.clear();
    this.bar.fillStyle(0x000000, 0.3).fillRoundedRect(x, y, w, 22, 11);
    this.bar.fillStyle(CONFIG.colors[CONFIG.loading.color].fill, 1).fillRoundedRect(x, y, Math.max(22, w * p), 22, 11);
    this.bar.lineStyle(4, CONFIG.outline, 1).strokeRoundedRect(x, y, w, 22, 11);
  }

  update(time) {
    const Lc = CONFIG.loading;
    const beat = 60000 / Lc.bpm;
    const t = time - this.startedAt;
    const a = (t / (beat * Lc.beatsPerOrbit)) * Math.PI * 2 - Math.PI / 2;
    this.head.x = this.center.x + Math.cos(a) * Lc.radius;
    this.head.y = this.center.y + Math.sin(a) * Lc.radius;
    this.head.rotation = a * Lc.spinsPerOrbit;
    const frac = (t % beat) / beat;
    this.head.setScale(this.headScale * (1 + Lc.pulse * Math.pow(1 - frac, 3)));
  }
}
