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

// 2) Preload: вид изнутри миски вверх. Кот снаружи заглядывает в миску — голова свешивается
// внутрь круга, лапы лежат на ободке — и обходит ободок по кругу в ритм музыки.
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('Preload');
  }

  create() {
    const Lc = CONFIG.loading;
    const W = CONFIG.width;
    const H = CONFIG.height;
    this.center = { x: W / 2, y: H * 0.46 };

    const html = document.getElementById('loader');
    if (html) html.hidden = true; // дальше рисует Phaser

    this.drawBowl();
    this.createCat();

    this.add.text(this.center.x, this.center.y - 10, 'Загрузка…', {
      fontFamily: 'sans-serif', fontSize: '40px', color: '#5a3a2a',
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

  // Стенки миски уходят от проёма к краям экрана (кольца темнеют), в центре — светлый проём с ободком.
  drawBowl() {
    const Lc = CONFIG.loading;
    const { x, y } = this.center;
    const g = this.add.graphics();
    g.fillStyle(Lc.wallDark, 1).fillRect(0, 0, CONFIG.width, CONFIG.height);
    const rings = 5;
    for (let k = 0; k < rings; k++) {
      const t = k / (rings - 1);
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(
        Phaser.Display.Color.ValueToColor(Lc.wallDark), Phaser.Display.Color.ValueToColor(Lc.wall), 1, t);
      g.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 1);
      g.fillCircle(x, y, Lc.radius + Lc.rimWidth / 2 + (rings - k) * 90);
    }
    g.fillStyle(Lc.opening, 1).fillCircle(x, y, Lc.radius);
    g.fillStyle(0xffffff, 0.35).fillCircle(x, y - Lc.radius * 0.15, Lc.radius * 0.55); // свет сверху
    g.lineStyle(Lc.rimWidth, Lc.rimColor, 1).strokeCircle(x, y, Lc.radius);
    g.lineStyle(CONFIG.outlineWidth, CONFIG.outline, 1);
    g.strokeCircle(x, y, Lc.radius - Lc.rimWidth / 2);
    g.strokeCircle(x, y, Lc.radius + Lc.rimWidth / 2);
  }

  // Контейнер кота повёрнут так, что его локальная ось +y смотрит в центр миски.
  createCat() {
    const Lc = CONFIG.loading;
    this.peek = this.add.container(0, 0);

    let head;
    if (this.textures.exists('loading_head')) {
      const img = this.add.image(0, 0, 'loading_head');
      img.setScale((70 * Lc.catScale) / Math.max(img.width, img.height) * 2);
      head = this.add.container(0, 0, [img]);
    } else {
      head = new CatView(this, 0, 0, Lc.color, { headOnly: true }).setMood('happy');
      head.head.y = 0;
      head.setScale(Lc.catScale);
    }
    head.y = Lc.headInset;
    this.catHead = head;
    this.catHeadBase = head.scaleX;

    this.paws = [-1, 1].map((side) => {
      const paw = this.add.container(side * Lc.pawSpread, 0);
      if (this.textures.exists('cat_paw')) {
        const img = this.add.image(0, 0, 'cat_paw').setTint(CONFIG.colors[Lc.color].fill);
        img.setScale((40 * Lc.catScale) / Math.max(img.width, img.height));
        paw.add(img);
      } else {
        const g = this.add.graphics();
        const s = Lc.catScale;
        g.fillStyle(CONFIG.colors[Lc.color].fill, 1).lineStyle(5, CONFIG.outline, 1);
        g.fillEllipse(0, 6 * s, 30 * s, 38 * s).strokeEllipse(0, 6 * s, 30 * s, 38 * s);
        g.lineStyle(3, CONFIG.outline, 1);
        g.lineBetween(-5 * s, 18 * s, -5 * s, 24 * s); // пальчики смотрят внутрь миски
        g.lineBetween(5 * s, 18 * s, 5 * s, 24 * s);
        paw.add(g);
      }
      return paw;
    });
    this.peek.add([head, ...this.paws]); // лапы поверх головы
  }

  drawBar(p) {
    const w = 300;
    const x = this.center.x - w / 2;
    const y = this.center.y + 40;
    this.bar.clear();
    this.bar.fillStyle(0x000000, 0.12).fillRoundedRect(x, y, w, 22, 11);
    this.bar.fillStyle(CONFIG.colors[CONFIG.loading.color].fill, 1).fillRoundedRect(x, y, Math.max(22, w * p), 22, 11);
    this.bar.lineStyle(4, CONFIG.outline, 1).strokeRoundedRect(x, y, w, 22, 11);
  }

  update(time) {
    const Lc = CONFIG.loading;
    const beat = 60000 / Lc.bpm;
    const t = time - this.startedAt;
    const a = (t / (beat * Lc.beatsPerOrbit)) * Math.PI * 2 - Math.PI / 2; // старт сверху
    this.peek.x = this.center.x + Math.cos(a) * Lc.radius;
    this.peek.y = this.center.y + Math.sin(a) * Lc.radius;
    this.peek.rotation = a + Math.PI / 2; // локальная +y — к центру

    // в ритм: голова покачивается, лапы по очереди постукивают по ободку
    const n = Math.floor(t / beat);
    const frac = (t % beat) / beat;
    const hit = Math.pow(1 - frac, 3);
    this.catHead.angle = Math.sin((t / beat) * Math.PI) * Lc.headBob;
    this.catHead.setScale(this.catHeadBase * (1 + Lc.pulse * hit));
    this.paws.forEach((paw, i) => {
      paw.y = n % 2 === i ? -Lc.pawLift * Math.sin(frac * Math.PI) : 0;
    });
  }
}
