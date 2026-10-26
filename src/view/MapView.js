import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { CatView } from '../theme/cats/CatView.js';
import { sfx } from '../audio.js';
import { unlockedLevel, catLook, milestonesDone } from '../core/save.js';
import { milestoneAt } from '../core/milestones.js';
import { closedBox } from './ChestView.js';
import { LEVELS } from '../core/levels.js';
import { kindBadge, makeIcon } from './ui.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

const M = CONFIG.map;
const W = CONFIG.width;
const H = CONFIG.height;
const N = LEVELS.length;
const mapH = M.padBottom + M.padTop + (N - 1) * M.spacing;

// Где на карте уровень i (0 — первый, внизу), в координатах карты.
function nodePos(i) {
  return { x: W / 2 + Math.sin(i * M.wave) * M.amplitude, y: mapH - M.padBottom - i * M.spacing };
}

// Главы: по CHAPTER уровней, тема — CONFIG.chapters (по кругу, если глав больше). Глава k (с 0) занимает по высоте
// карты от середины между её последним и следующим уровнем до середины между первым и предыдущим.
const CHAPTER = CONFIG.levelGen.chapter;
const CHAPTERS = Math.ceil(N / CHAPTER);
const theme = (k) => CONFIG.chapters[k % CONFIG.chapters.length];
const chapterTop = (k) => (k >= CHAPTERS - 1 ? 0 : nodePos((k + 1) * CHAPTER).y + M.spacing / 2);
const chapterBottom = (k) => (k === 0 ? mapH : nodePos(k * CHAPTER).y + M.spacing / 2);
// глава под точкой карты y
const chapterAtY = (y) => {
  for (let k = 0; k < CHAPTERS; k++) if (y >= chapterTop(k)) return k;
  return CHAPTERS - 1;
};
// случайное, но всегда одинаковое для уровня i (раскладка украшений)
const hash = (i) => { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// Карта уровней внутри контейнера: окно шириной с экран, высотой viewH, которое можно уменьшить (рамка на стене)
// и плавно развернуть на весь экран — это одна и та же карта, меняются только масштаб и высота окна, без скачков.
// Текущий уровень — в середине окна.
// Тропинка из следов лапок снизу вверх, кружки с номером (под сложными — табличка), у рубежей — подарок
// (в конце главы — сундук), пока награда не забрана; на самом дальнем открытом сидит кот.
// На сцене только видимые уровни: 300 штук сразу — тяжело для слабого Android.
export class MapView {
  constructor(scene, x, y, scale, viewH = H) {
    this.scene = scene;
    this.current = unlockedLevel(N); // край прогресса: здесь кот, дальше — закрыто
    this.root = scene.add.container(x, y).setScale(scale);
    this.viewH = viewH; // высота окна в координатах карты; меняется твином при разворачивании
    this.bg = scene.add.rectangle(0, 0, W, H, M.background); // тянется по высоте окна, если оно выше экрана
    this.root.add(this.bg);
    this.content = scene.add.container(-W / 2, 0);
    // слои: фон глав, следы, кружки, всё над кружками (звёзды, кот)
    this.ground = scene.add.container(0, 0);
    this.layers = [0, 1, 2].map(() => scene.add.container(0, 0));
    this.content.add([this.ground, ...this.layers]);
    this.chapterViews = new Map();
    this.makeFx();
    this.root.add(this.content);
    this.maskShape = scene.make.graphics({}, false);
    this.root.setMask(this.maskShape.createGeometryMask());
    this.views = new Map();
    this.velocity = 0;
    this.setScroll(nodePos(this.current).y - H / 2);
  }

  // scroll — верх окна высотой с экран в координатах карты (середина окна — scroll + H / 2).
  // Окно выше экрана (карта на весь экран из рамки на стене) не выходит за края карты.
  setScroll(s) {
    const e = Math.max(0, (this.viewH - H) / 2);
    this.scroll = Phaser.Math.Clamp(s, e, Math.max(e, mapH - H - e));
    this.content.y = -this.scroll - H / 2;
    this.refresh();
  }

  // Прямоугольник окна в мире (для маски и попадания пальцем).
  bounds() {
    const r = this.root;
    return new Phaser.Geom.Rectangle(r.x - (W / 2) * r.scale, r.y - (this.viewH / 2) * r.scale, W * r.scale, this.viewH * r.scale);
  }

  // Каждый кадр: инерция прокрутки; маска перерисовывается, только когда окно карты сдвинулось или изменилось.
  update(dragging) {
    if (!dragging && Math.abs(this.velocity) > 0.2) {
      this.setScroll(this.scroll + this.velocity);
      this.velocity *= M.friction;
    }
    const fullH = Math.max(H, this.viewH);
    if (this.bg.scaleY !== fullH / H) {
      this.bg.scaleY = fullH / H;
      this.setScroll(this.scroll);
    }
    const b = this.bounds();
    if (this.maskRect && Phaser.Geom.Rectangle.Equals(b, this.maskRect)) return;
    this.maskRect = b;
    this.maskShape.clear().fillStyle(PAL.white).fillRect(b.x, b.y, b.width, b.height);
  }

  // Тап по точке мира: уровень открыт — запуск, закрыт — покачивание.
  tapAt(wx, wy) {
    const r = this.root;
    const lx = (wx - r.x) / r.scale + W / 2;
    const ly = (wy - r.y) / r.scale + H / 2 + this.scroll;
    for (const [i, v] of this.views) {
      if (Phaser.Math.Distance.Between(lx, ly, v.node.x, v.node.y) > M.nodeSize * 0.6) continue;
      if (i > this.current) {
        sfx(this.scene, 'sfx_invalid');
        this.scene.tweens.add({ targets: v.node, x: v.node.x + 8, duration: 50, yoyo: true, repeat: 2 });
        return;
      }
      sfx(this.scene, 'sfx_button');
      this.scene.tweens.add({ targets: v.node, scale: v.node.scale * 0.9, duration: 70, yoyo: true,
        onComplete: () => this.scene.startLevel(i) });
      return;
    }
  }

  // Пересоздать все видимые уровни (забрали награды рубежей — подарки с карты пропадают).
  redraw() {
    for (const v of this.views.values()) v.parts.forEach((o) => o.destroy());
    this.views.clear();
    this.refresh();
  }

  // Создаёт уровни, попавшие в окно (с запасом), и убирает ушедшие.
  refresh() {
    const half = Math.max(H, this.viewH) / 2;
    const top = this.scroll + H / 2 - half - M.spacing;
    const bottom = this.scroll + H / 2 + half + M.spacing;
    const from = Math.max(0, Math.floor((mapH - M.padBottom - bottom) / M.spacing));
    const to = Math.min(N - 1, Math.ceil((mapH - M.padBottom - top) / M.spacing));
    for (const [i, v] of this.views) {
      if (i < from || i > to) {
        v.parts.forEach((o) => o.destroy());
        this.views.delete(i);
      }
    }
    for (let i = from; i <= to; i++) if (!this.views.has(i)) this.views.set(i, this.makeLevel(i));
    // главы в окне: фон и указатель
    const c0 = chapterAtY(bottom);
    const c1 = chapterAtY(top);
    for (const [k, parts] of this.chapterViews) {
      if (k < c0 || k > c1) {
        parts.forEach((o) => o.destroy());
        this.chapterViews.delete(k);
      }
    }
    for (let k = c0; k <= c1; k++) if (!this.chapterViews.has(k)) this.chapterViews.set(k, this.makeChapter(k));
    this.setFxChapter(this.chapter());
  }

  // Глава в середине окна (0 — первая).
  chapter() {
    return chapterAtY(this.scroll + H / 2);
  }

  // Сколько уровней главы k пройдено (до края прогресса).
  chapterDone(k) {
    return Phaser.Math.Clamp(this.current - k * CHAPTER, 0, Math.min(CHAPTER, N - k * CHAPTER));
  }

  // Фон главы k (повторяется по её высоте; снизу — полосами, всё прозрачнее, заходит на предыдущую главу,
  // так стык перетекает) и указатель с названием у её начала (пройдена — штамп «Пройдено»).
  makeChapter(k) {
    const scene = this.scene;
    const parts = [];
    const key = `map_bg_${k + 1}`;
    const top = chapterTop(k);
    const bottom = chapterBottom(k);
    if (scene.textures.exists(key)) {
      const src = scene.textures.get(key).getSourceImage();
      const ts = W / src.width; // тайл — по ширине карты
      const tile = (y0, h, alpha) => {
        const t = scene.add.tileSprite(0, y0, W / ts, h / ts, key).setOrigin(0).setScale(ts).setAlpha(alpha);
        t.tilePositionY = (y0 - top) / ts; // узор непрерывный по всей главе
        this.ground.add(t);
        parts.push(t);
      };
      tile(top, bottom - top, 1);
      if (k > 0) { // заход на предыдущую главу: полосы всё прозрачнее вниз
        const step = M.chapterBlend / M.blendSteps;
        for (let s = 0; s < M.blendSteps; s++) tile(bottom + s * step, step + 1, 1 - (s + 1) / (M.blendSteps + 1));
      }
    }
    // указатель главы — между её первым уровнем и предыдущим (у первой главы — под первым уровнем)
    const y = k === 0 ? nodePos(0).y + M.spacing * 0.62 : bottom;
    const sign = scene.add.container(W / 2, y);
    if (scene.textures.exists('map_sign')) {
      const img = scene.add.image(0, 0, 'map_sign');
      sign.add(img.setScale(M.signW / img.width));
    }
    const label = scene.add.text(0, M.signW * 0.06, STR.chapterSign(k + 1, theme(k).name), {
      fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: `${M.signFont}px`, color: PAL.text,
      stroke: PAL.textBrown, strokeThickness: 7,
    }).setOrigin(0.5);
    if (label.width > M.signW * 0.7) label.setScale((M.signW * 0.7) / label.width);
    sign.add(label);
    if (this.chapterDone(k) >= Math.min(CHAPTER, N - k * CHAPTER)) {
      const stamp = scene.add.container(M.signW * 0.33, -M.signW * 0.07).setAngle(-12);
      const st = scene.add.text(0, 0, STR.chapterPassed, {
        fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '24px', color: PAL.text, stroke: PAL.okGreenDark, strokeThickness: 6,
      }).setOrigin(0.5);
      const w = st.width + 26;
      const g = scene.add.graphics();
      g.fillStyle(PAL.okGreen, 1).fillRoundedRect(-w / 2, -20, w, 40, 12);
      g.lineStyle(3, PAL.white, 0.9).strokeRoundedRect(-w / 2, -20, w, 40, 12);
      stamp.add([g, st]);
      sign.add(stamp);
    }
    this.layers[2].add(sign);
    parts.push(sign);
    return parts;
  }

  // Частицы над картой — своей главы (картинка mapN_fx или мягкая точка цвета темы), летят по fx темы.
  makeFx() {
    const scene = this.scene;
    if (!scene.textures.exists('fx_dot_map')) {
      const g = scene.make.graphics({}, false);
      for (let r = 12; r > 0; r -= 2) g.fillStyle(PAL.white, 0.12).fillCircle(12, 12, r);
      g.generateTexture('fx_dot_map', 24, 24);
      g.destroy();
    }
    this.fx = scene.add.particles(0, 0, 'fx_dot_map', { emitting: false });
    this.root.add(this.fx);
    this.fxChapter = -1;
  }

  setFxChapter(k) {
    if (k === this.fxChapter || !CONFIG.fx.enabled) return;
    this.fxChapter = k;
    const T = theme(k);
    const key = this.scene.textures.exists(`map${k + 1}_fx`) ? `map${k + 1}_fx` : 'fx_dot_map';
    const k1 = M.fxSize / this.scene.textures.get(key).getSourceImage().width;
    const half = () => Math.max(H, this.viewH) / 2;
    const motion = {
      fall: { speedY: { min: 30, max: 70 }, speedX: { min: -25, max: 25 }, y: { onEmit: () => -half() } },
      rise: { speedY: { min: -70, max: -30 }, speedX: { min: -15, max: 15 }, y: { onEmit: () => half() } },
      drift: { speedY: { min: -12, max: 12 }, speedX: { min: -18, max: 18 }, y: { onEmit: () => (Math.random() * 2 - 1) * half() } },
    }[T.fx];
    this.fx.stop();
    this.fx.killAll();
    this.fx.setTexture(key);
    this.fx.setConfig({
      ...motion, x: { min: -W / 2, max: W / 2 }, lifespan: 9000, frequency: M.fxEvery, quantity: 1,
      rotate: { min: 0, max: 360 }, scale: { min: k1 * 0.6, max: k1 }, alpha: { start: 0.85, end: 0 },
      tint: key === 'fx_dot_map' ? T.tint : 0xffffff, emitting: true,
    });
  }

  makeLevel(i) {
    const scene = this.scene;
    const [paws, nodes, top] = this.layers;
    const parts = [];
    const p = nodePos(i);
    // следы до следующего уровня, носками вперёд по тропинке: свои у главы (mapN_paw) или лапки
    const own = `map${Math.floor(i / CHAPTER) + 1}_paw`;
    const pawKey = scene.textures.exists(own) ? own : 'paw';
    if (i < N - 1 && scene.textures.exists(pawKey)) {
      const q = nodePos(i + 1);
      const angle = Phaser.Math.Angle.Between(p.x, p.y, q.x, q.y) + Math.PI / 2;
      const pawSize = pawKey === own ? M.chapterPawSize : M.pawSize;
      const scale = pawSize / scene.textures.get(pawKey).getSourceImage().width;
      // только в просвете между краями кружков, чтобы следы не прятались под ними
      const gap = ((M.nodeSize + M.pawSize) / 2) / Phaser.Math.Distance.Between(p.x, p.y, q.x, q.y);
      for (let k = 1; k <= M.pawsBetween; k++) {
        const t = gap + (1 - 2 * gap) * ((k - 0.5) / M.pawsBetween);
        const side = (k % 2 ? -1 : 1) * 10; // лево-право, как настоящие следы
        const img = scene.add.image(Phaser.Math.Linear(p.x, q.x, t) + Math.cos(angle) * side,
          Phaser.Math.Linear(p.y, q.y, t) + Math.sin(angle) * side, pawKey)
          .setScale(scale).setRotation(angle);
        if (pawKey === 'paw') img.setTint(M.pawColor).setAlpha(M.pawAlpha);
        paws.add(img);
        parts.push(img);
      }
    }

    // украшение главы у тропинки — с дальней от неё стороны, между уровнями
    const deco = `map${Math.floor(i / CHAPTER) + 1}_d${1 + Math.floor(hash(i) * 6)}`;
    if (M.decorEvery && i % M.decorEvery === 0 && scene.textures.exists(deco)) {
      const left = Math.sin(i * M.wave + M.wave / 2) > 0; // тропинка здесь справа — украшение слева
      const img = scene.add.image(left ? M.decorX : W - M.decorX, p.y - M.spacing / 2 + (hash(i + 7) - 0.5) * 50, deco);
      img.setScale(M.decorSize / Math.max(img.width, img.height)).setAngle((hash(i + 3) - 0.5) * 20);
      paws.add(img);
      parts.push(img);
    }

    const level = LEVELS[i];
    const state = i === this.current ? 'current' : i < this.current ? 'done' : 'locked';
    const node = scene.add.container(p.x, p.y);
    node.add(this.makeNodeFace(state, level.puzzle));
    node.add(scene.add.text(0, -2, String(level.id), {
      fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '46px',
      color: state === 'locked' ? PAL.textMapLocked : PAL.text, stroke: PAL.textBrown, strokeThickness: state === 'locked' ? 0 : 8,
    }).setOrigin(0.5));
    nodes.add(node);
    parts.push(node);

    if (level.kind) {
      const badge = kindBadge(scene, p.x, p.y + M.nodeSize * M.kindBadgeY, level.kind, STR.kindShort[level.kind], M.kindBadgeSize);
      top.add(badge);
      parts.push(badge);
    }

    const ms = milestoneAt(level.id);
    if (ms) parts.push(...this.makeMilestone(ms, p));

    if (state === 'current') {
      node.setScale(M.currentScale);
      const cat = this.makeCat(p.x, p.y - M.nodeSize * (0.5 - M.catOverlap) * M.currentScale - 40 * M.catScale);
      top.add(cat);
      parts.push(cat);
      scene.tweens.add({ targets: node, scale: M.currentScale * M.currentPulse, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    }
    return { node, parts };
  }

  // Рубеж у уровня: золотое кольцо вокруг кружка (всегда), сбоку подарок (в конце главы — сундук), под ним — что
  // внутри; награду забрали — подарок бледный, с галочкой. Возвращает созданное (для уборки при прокрутке).
  makeMilestone(ms, p) {
    const scene = this.scene;
    const [, nodes, top] = this.layers;
    const parts = [];
    const ring = scene.add.graphics();
    const r = M.nodeSize / 2 + M.milestoneRing;
    ring.lineStyle(M.milestoneRing + 4, PAL.goldDark, 1).strokeCircle(p.x, p.y + 3, r);
    ring.lineStyle(M.milestoneRing, PAL.gold, 1).strokeCircle(p.x, p.y, r);
    nodes.addAt(ring, 0); // под кружками
    parts.push(ring);

    const done = ms.id <= milestonesDone();
    const side = p.x > W / 2 ? -1 : 1; // к середине карты — там тропинка не мешает
    const bx = p.x + side * M.nodeSize * M.milestoneX;
    const by = p.y - M.nodeSize * 0.15;
    const box = closedBox(scene, ms.reward.chests ? 'chest' : 'gift', M.milestoneSize).setPosition(bx, by);
    top.add(box);
    parts.push(box);
    if (done) {
      box.setAlpha(0.4);
      const ok = scene.add.graphics();
      ok.fillStyle(PAL.okGreen, 1).fillCircle(bx, by, 20);
      ok.lineStyle(5, PAL.white, 1).beginPath().moveTo(bx - 10, by).lineTo(bx - 2, by + 8).lineTo(bx + 11, by - 7).strokePath();
      top.add(ok);
      parts.push(ok);
      return parts;
    }
    scene.tweens.add({ targets: box, y: by - 8, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    // что внутри — плашка под подарком
    const R = ms.reward;
    // конец главы — монеты и ∞; середина — мелочь (сундук на первом рубеже виден самой коробкой)
    const [icon, label] = R.coins ? ['coin', `${R.coins} + ∞ ${STR.infiniteMin(R.infiniteMin)}`]
      : R.undos ? ['undo', `×${R.undos}`] : R.hints ? ['hint', `×${R.hints}`] : ['heart', `×${R.lives}`];
    const chip = scene.add.container(bx, by + M.milestoneSize * 0.62);
    const t = scene.add.text(14, 0, label, {
      fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '22px', color: PAL.textBrown,
    }).setOrigin(0.5);
    const w = t.width + 50;
    const g = scene.add.graphics();
    g.fillStyle(PAL.black, 0.2).fillRoundedRect(-w / 2 + 2, -17 + 3, w, 34, 17);
    g.fillStyle(PAL.cream, 1).fillRoundedRect(-w / 2, -17, w, 34, 17);
    g.lineStyle(3, PAL.brownRim, 1).strokeRoundedRect(-w / 2, -17, w, 34, 17);
    const name = icon === 'chest' ? 'heart' : icon;
    const ic = makeIcon(scene, name, 28).setPosition(-w / 2 + 18, 0);
    // белые иконки (отмена) на светлой плашке не видны — на фиолетовом кружке, как на кнопках
    if (name !== 'coin' && name !== 'heart') {
      g.fillStyle(PAL.button, 1).fillCircle(-w / 2 + 18, 0, 17);
      ic.setScale(ic.scale * 0.8);
    }
    chip.add([g, ic, t]);
    top.add(chip);
    parts.push(chip);
    return parts;
  }

  // Кружок уровня: картинка map_node*.png или заглушка-печенька кодом.
  makeNodeFace(state, puzzle) {
    const scene = this.scene;
    const key = state === 'locked' ? 'map_node_locked' : state === 'current' ? 'map_node_current' : puzzle ? 'map_node_puzzle' : 'map_node';
    if (scene.textures.exists(key)) {
      const img = scene.add.image(0, 0, key);
      return img.setScale(M.nodeSize / Math.max(img.width, img.height));
    }
    const C = M.colors;
    const fill = state === 'locked' ? C.locked : state === 'current' ? C.current : puzzle ? C.puzzle : C.done;
    const r = M.nodeSize / 2;
    const g = scene.add.graphics();
    g.fillStyle(PAL.black, 0.18).fillCircle(4, 8, r);
    g.fillStyle(C.edge, 1).fillCircle(0, 0, r);
    g.fillStyle(fill, 1).fillCircle(0, -3, r - 8);
    g.fillStyle(PAL.white, 0.35).fillEllipse(-r * 0.3, -r * 0.42, r * 0.7, r * 0.35);
    return g;
  }

  // Кот на текущем уровне — голова выглядывает из-за кружка и качается.
  makeCat(x, y) {
    const cat = new CatView(this.scene, x, y, catLook(), { headOnly: true }).setMood('happy');
    cat.setScale(M.catScale);
    this.scene.tweens.add({ targets: cat, angle: { from: -6, to: 6 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    return cat;
  }
}
