import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { LOADING_KEYS, queueAssets } from '../assets.js';
import { CatView } from '../view/CatView.js';
import { Capsule } from '../view/Capsule.js';
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

    this.drawBowl();
    this.createCat();

    // Объёмная надпись: заливка светлеет кверху, толстая обводка и тень вниз (свет сверху).
    const T = Lc.title;
    const title = this.add.text(this.center.x, this.center.y - 10, 'Загрузка…', {
      fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: `${T.size}px`,
      stroke: T.stroke, strokeThickness: T.strokeWidth,
      shadow: { offsetX: 0, offsetY: T.shadowY, color: T.shadow, blur: 0, stroke: true, fill: true },
    }).setOrigin(0.5);
    const grad = title.context.createLinearGradient(0, 0, 0, title.height);
    grad.addColorStop(0.25, T.top);
    grad.addColorStop(0.8, T.bottom);
    title.setFill(grad);
    this.createBar();
    this.loadProgress = 0;
    this.drawBar(0);

    music(this, 'music_loading');
    this.startedAt = this.time.now;

    // Полоса идёт по меньшему из двух: сколько загружено и сколько прошло от minDuration —
    // поэтому плавно заполняется, даже если файлы загрузились мгновенно.
    queueAssets(this.load, (key) => !LOADING_KEYS.includes(key));
    this.load.on('progress', (p) => { this.loadProgress = p; });
    this.load.once('complete', () => {
      this.loadProgress = 1;
      const wait = Math.max(0, Lc.minDuration - (this.time.now - this.startedAt));
      this.time.delayedCall(wait, () => this.scene.start('Game'));
    });
    this.load.start();
  }

  // Стенки миски уходят от проёма к краям экрана (кольца темнеют), в центре — светлый проём с ободком.
  // Есть картинка loading_bowl — рисуем её (проём на ней уже залит), иначе — кольцами.
  drawBowl() {
    const Lc = CONFIG.loading;
    const { x, y } = this.center;
    if (this.textures.exists('loading_bowl')) {
      const A = Lc.bowlArt;
      this.add.rectangle(0, 0, CONFIG.width, CONFIG.height, Lc.wallDark).setOrigin(0); // если картинка не закроет экран
      const img = this.add.image(x, y, 'loading_bowl');
      img.setOrigin(A.cx / img.width, A.cy / img.height).setScale(Lc.radius / A.rim);
      return;
    }
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
    this.peek = this.add.container(0, 0).setDepth(10); // кот поверх надписи и полосы

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
      // рисуем лапу вокруг её центра, чтобы поворот pawAngle был на месте
      const paw = this.add.container(side * Lc.pawSpread, 6 * Lc.catScale).setAngle(Lc.pawAngle);
      paw.baseY = paw.y;
      const pawKey = `cat_${CONFIG.colors[Lc.color].name}_paw`;
      if (this.textures.exists(pawKey)) {
        // лапа сверху, пальчики внизу картинки — как у временной фигуры; у каждого цвета свой спрайт, без tint
        const img = this.add.image(0, 0, pawKey);
        img.setScale((Lc.pawArtSize * Lc.catScale) / Math.max(img.width, img.height));
        paw.add(img);
      } else {
        const g = this.add.graphics();
        const s = Lc.catScale;
        g.fillStyle(CONFIG.colors[Lc.color].fill, 1).lineStyle(5, CONFIG.outline, 1);
        g.fillEllipse(0, 0, 30 * s, 38 * s).strokeEllipse(0, 0, 30 * s, 38 * s);
        g.lineStyle(3, CONFIG.outline, 1);
        g.lineBetween(-5 * s, 12 * s, -5 * s, 18 * s); // пальчики (при pawAngle 0 — внутрь миски)
        g.lineBetween(5 * s, 12 * s, 5 * s, 18 * s);
        paw.add(g);
      }
      return paw;
    });
    this.peek.add([head, ...this.paws]); // лапы поверх головы
  }

  // Полоса из картинок: жёлоб loading_bar_track и заливка loading_bar_fill в цвет кота.
  createBar() {
    const B = CONFIG.loading.bar;
    const x = this.center.x - B.width / 2;
    const y = this.center.y + B.y;
    if (!this.textures.exists('loading_bar_track') || !this.textures.exists('loading_bar_fill')) {
      this.bar = this.add.graphics();
      return;
    }
    new Capsule(this, x, y, 'loading_bar_track', B.height).setWidth(B.width);
    const inset = B.height * B.fillInset;
    this.barFill = new Capsule(this, x + inset, y, 'loading_bar_fill', B.height * B.fillHeight)
      .setTint(CONFIG.colors[CONFIG.loading.color].fill);
    this.barFillMax = B.width - 2 * inset;
  }

  drawBar(p) {
    if (this.barFill) {
      this.barFill.setWidth(this.barFillMax * p);
      return;
    }
    const w = 220;
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
    this.drawBar(Math.min(this.loadProgress, t / Lc.minDuration));
    const a = (t / (beat * Lc.beatsPerOrbit)) * Math.PI * 2 - Math.PI / 2; // старт сверху
    this.peek.x = this.center.x + Math.cos(a) * Lc.radius;
    this.peek.y = this.center.y + Math.sin(a) * Lc.radius;
    this.peek.rotation = a + Math.PI / 2; // локальная +y — к центру

    // в ритм: голова покачивается, лапы по очереди постукивают по ободку
    const n = Math.floor(t / beat);
    const frac = (t % beat) / beat;
    const hit = Math.pow(1 - frac, 3);
    this.catHead.angle = Lc.headAngle + Math.sin((t / beat) * Math.PI) * Lc.headBob;
    this.catHead.setScale(this.catHeadBase * (1 + Lc.pulse * hit));
    this.paws.forEach((paw, i) => {
      paw.y = paw.baseY - (n % 2 === i ? Lc.pawLift * Math.sin(frac * Math.PI) : 0);
    });
  }
}
