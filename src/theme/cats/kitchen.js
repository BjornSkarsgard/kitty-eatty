import * as Phaser from 'phaser';
import { CONFIG } from '../../config.js';
import { CatView } from './CatView.js';
import { makePortion, makeFxTextures, makeJuteWrap, makePortionHalo, makeSoftTexture, makePortionCover, makeIceCover } from './draw.js';
import { beatPhase } from '../../beat.js';
import { sfx, sfxRandom } from '../../audio.js';

const A = CONFIG.anim;
const L = CONFIG.layout;

// Тема «котики» на уровне. GameScene знает про тему только через этот класс:
//   createPortion — порция корма; createJar — банка (стекло сзади и спереди); jarComplete — банка собрана
//   (кот идёт есть, потом банку обматывает джут); jarUndone — отмена хода разобрала собранную банку;
//   плюс служебное: фон кухни, коты, размеры картинки банки для раскладки, что ещё двигать вместе с банкой, update.
// Состояние темы (коты, обмотки, кто когда мяукал) живёт здесь же; сцена — this.scene.
export class CatsLevel {
  constructor(scene) {
    this.scene = scene;
    this.cats = [];
    this.wraps = []; // обмотка-когтеточка съеденной банки
    this.lastFeedMeow = -Infinity;
    // Порядок хрустов на уровень, например 2 1 3: каждый кот берёт следующий, по кругу (2 1 3 2 1 …)
    this.chewOrder = Phaser.Utils.Array.Shuffle([1, 2, 3]);
    this.chewNext = 0;
  }

  // Фон — кухня (bg_game); за краями экрана — зеркальные продолжения кухни: видны, только пока уровень маленький
  // в проёме двери холла (влёт и выход), остальное время спрятаны — setMirrors. Лапки на обоях.
  // Текстуры эффектов (искорки, сердечки, конфетти).
  createBackground() {
    const scene = this.scene;
    if (scene.textures.exists('bg_game')) {
      const bg = scene.add.image(CONFIG.width / 2, CONFIG.height / 2, 'bg_game');
      bg.setScale(Math.max(CONFIG.width / bg.width, CONFIG.height / bg.height));
      this.mirrors = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]].map(([dx, dy]) =>
        scene.add.image(bg.x + dx * bg.displayWidth, bg.y + dy * bg.displayHeight, 'bg_game')
          .setScale(bg.scaleX, bg.scaleY).setFlip(dx !== 0, dy !== 0));
      this.createWallPaws(bg);
    }
    makeFxTextures(scene);
  }

  // Зеркальные продолжения кухни: нужны только на время перехода через дверь холла.
  setMirrors(on) {
    this.mirrors?.forEach((m) => m.setVisible(on));
  }

  // Лапки на обоях: штамп paw.png ровной сеткой по стене (ряды через dy, соседние сдвинуты на полшага dx).
  // Каждая — тёмный отпечаток и поверх него светлый слой, который в разнобой плавно проявляется и гаснет
  // (не больше glow.max за раз; это эффект — без fx.enabled только отпечатки).
  createWallPaws(bg) {
    const scene = this.scene;
    const P = CONFIG.wallPaws;
    if (!scene.textures.exists('paw')) return;
    const s = bg.scaleX;
    const src = bg.texture.getSourceImage();
    const toScreen = (x, y) => ({ x: bg.x + (x - src.width / 2) * s, y: bg.y + (y - src.height / 2) * s });
    const scale = (P.size * s) / scene.textures.get('paw').getSourceImage().width;
    const half = P.size / 2;
    const lit = [];
    for (let k = Math.ceil((P.top + half - P.y0) / P.dy); P.y0 + k * P.dy <= P.bottom - half; k++) {
      const y = P.y0 + k * P.dy;
      const shift = Math.abs(k) % 2 ? P.dx / 2 : 0;
      // по краям лапки могут уходить за экран наполовину, как обрезанный рисунок обоев
      for (let x = P.x0 + shift - Math.floor((P.x0 + shift + half) / P.dx) * P.dx; x <= src.width + half; x += P.dx) {
        const pos = toScreen(x, y);
        scene.add.image(pos.x, pos.y, 'paw').setScale(scale).setTint(P.color).setAlpha(P.alpha);
        lit.push(scene.add.image(pos.x, pos.y, 'paw').setScale(scale).setTint(P.glow.color).setAlpha(0));
      }
    }
    if (!CONFIG.fx.enabled) return;
    const G = P.glow;
    let active = 0;
    const next = () => {
      const idle = lit.filter((p) => !p.glowing);
      if (active < G.max && idle.length) {
        const p = Phaser.Utils.Array.GetRandom(idle);
        p.glowing = true;
        active++;
        scene.tweens.add({
          targets: p, alpha: Phaser.Math.FloatBetween(...G.alpha), duration: G.fade, hold: G.hold,
          yoyo: true, ease: 'Sine.easeInOut',
          onComplete: () => { p.glowing = false; active--; },
        });
      }
      scene.time.delayedCall(Phaser.Math.Between(...G.gap), next);
    };
    next();
  }

  // ---------- банки и корм ----------

  // Картинка банки для раскладки: размеры файла jar_back и где у неё горлышко, донышко, пол и край стекла (px файла).
  jarArt() {
    const tex = this.scene.textures.get('jar_back').getSourceImage();
    return { width: tex.width, height: tex.height, ...CONFIG.jar.art };
  }

  // Банка из двух картинок: jar_back (стекло, тёмное нутро) под кормом, jar_front (горлышко, донышко, блики) над ним.
  // Каждая — из трёх кусков: горлышко и донышко как есть, стенки растянуты по высоте. dim — размеры раскладки сцены.
  createJar(r, dim) {
    const scene = this.scene;
    for (const key of ['jar_back', 'jar_front']) {
      const tex = scene.textures.get(key);
      if (tex.has('top')) continue;
      const { width: W, height: H } = tex.getSourceImage();
      const { top, bottom } = CONFIG.jar.art;
      tex.add('top', 0, 0, 0, W, top);
      tex.add('mid', 0, 0, top, W, bottom - top);
      tex.add('bot', 0, 0, bottom, W, H - bottom);
    }
    const make = (key) => {
      const { k, neck, base } = dim;
      const top = scene.add.image(0, r.top - neck, key, 'top').setOrigin(0.5, 0).setScale(k);
      const mid = scene.add.image(0, r.top, key, 'mid').setOrigin(0.5, 0).setScale(k);
      mid.setDisplaySize(mid.displayWidth, r.bottom - base - r.top);
      const bot = scene.add.image(0, r.bottom - base, key, 'bot').setOrigin(0.5, 0).setScale(k);
      return scene.add.container(r.x, 0, [top, mid, bot]);
    };
    this.wraps.push(null);
    return { back: make('jar_back'), front: make('jar_front') };
  }

  createPortion(color, w, h) {
    return makePortion(this.scene, color, w, h);
  }

  // Скрыть / открыть порцию «?». animate — открывается на глазах: «?» сжимается, звук.
  setHidden(p, on, animate = false) {
    const scene = this.scene;
    if (on) {
      if (!p.cover) makePortionCover(scene, p);
      scene.tweens.killTweensOf(p.cover);
      p.cover.setVisible(true).setScale(1).setAlpha(1);
      return;
    }
    if (!p.cover || !p.cover.visible) return;
    if (!animate) return p.cover.setVisible(false);
    sfx(scene, 'sfx_pick', 0.6);
    scene.tweens.add({
      targets: p.cover, scaleX: 0, alpha: 0, duration: CONFIG.blockers.revealMs, ease: 'Back.easeIn',
      onComplete: () => p.cover.setVisible(false).setScale(1).setAlpha(1),
    });
  }

  // Лёд поверх банки (над стеклом спереди). Возвращает контейнер с setCount(n) и melt() — растаять.
  createIce(r, dim) {
    const scene = this.scene;
    const ice = makeIceCover(scene, r, dim).setDepth(3);
    ice.melt = () => {
      sfx(scene, 'sfx_complete', 0.5);
      this.fxCrumbs.setParticleTint(CONFIG.blockers.iceColor);
      this.fxCrumbs.explode(A.crumbs * 2, r.x, ice.centerY);
      scene.tweens.add({ targets: ice, alpha: 0, scaleX: 1.15, duration: CONFIG.blockers.thawMs, ease: 'Quad.easeOut', onComplete: () => ice.destroy() });
    };
    return ice;
  }

  // Что ещё двигается вместе с банкой (подъём, тряска): обмотка, если банка съедена.
  jarExtras(bowl) {
    return [this.wraps[bowl]].filter(Boolean);
  }

  // Золотой ореол вокруг порции из выбранной серии и мягкая текстура света в стекле.
  portionHalo(p, color, width) {
    return makePortionHalo(this.scene, p, color, width);
  }

  softTexture() {
    makeSoftTexture(this.scene);
    return 'fx_soft';
  }

  // ---------- коты ----------

  // Над банками — по коту на каждый цвет корма уровня. Тап по коту — случайная реакция (только если сидит на месте).
  createCats(board) {
    const scene = this.scene;
    const colors = new Set(board.bowls.flat());
    const n = Math.max(...colors) + 1;
    const spacing = Math.min(L.catSpacing, (CONFIG.width - 60) / n);
    const x0 = CONFIG.width / 2 - ((n - 1) * spacing) / 2;
    this.cats = [];
    for (let c = 0; c < n; c++) {
      const scale = Math.min(1, spacing / L.catSpacing);
      const cat = new CatView(scene, x0 + c * spacing, L.catsFloorY - CONFIG.cat.origin[2] * scale, c);
      cat.setDepth(10).setBaseScale(scale).startIdle();
      cat.home = { x: cat.x, y: cat.y };
      cat.fedBowl = null;
      cat.setInteractive(new Phaser.Geom.Rectangle(-55, -75, 110, 145), Phaser.Geom.Rectangle.Contains);
      cat.on('pointerdown', () => cat.poke());
      this.cats.push(cat);
    }
    // крошки при укусе и сердечки, когда наелся
    const fx = (key, cfg) => scene.add.particles(0, 0, key, { emitting: false, ...cfg }).setDepth(12);
    this.fxCrumbs = fx('fx_dot', {
      speed: { min: 90, max: 240 }, angle: { min: 200, max: 340 }, gravityY: 900,
      lifespan: 650, scale: { start: 0.8, end: 0.25 }, alpha: { start: 1, end: 0 },
    });
    this.fxHearts = fx('fx_heart', {
      speedX: { min: -60, max: 60 }, speedY: { min: -170, max: -90 }, gravityY: -30,
      lifespan: 1200, scale: { start: 0.7, end: 1.2 }, alpha: { start: 1, end: 0 },
    });
  }

  // Каждый кадр: коты дышат в такт музыке, соседние — в противофазе.
  update() {
    const breath = beatPhase(this.scene, A.idleBreathBeats);
    this.cats.forEach((cat, k) => cat.breathe(breath + (k % 2) * 0.5));
  }

  // Банка собрана: кот мяукает, прыгает к банке, ест (голова ныряет, крошки, хруст),
  // радуется (сердечки) и прыгает обратно. Ввод всё это время не блокируется.
  // game — сцена уровня: где банка (bowlRects, mouthY), какие в ней порции (portions), звёздочки (fxStars).
  jarComplete(bowl, color) {
    const game = this.scene;
    const cat = this.cats[color];
    const r = game.bowlRects[bowl];
    cat.fedBowl = bowl;
    cat.stopActions().setMood('open');

    sfx(game, 'sfx_complete');
    const mouthY = game.mouthY(bowl);
    game.fxStars.explode(10, r.x, mouthY);
    // в конце уровня банки собираются одна за другой — мяукает только первый кот, остальные молча
    if (game.time.now - this.lastFeedMeow >= CONFIG.audio.feedMeowCooldown) {
      this.lastFeedMeow = game.time.now;
      cat.meow();
    }
    cat.disableInteractive(); // пока кот у банки, он не перехватывает тапы по соседним банкам

    const eatY = mouthY - A.catEatOffsetY * cat.baseScale;
    cat.walkTo(r.x, eatY, () => {
      cat.setMood('happy');
      const food = game.portions[bowl].slice().reverse(); // сверху вниз
      cat.eat(food.length, (k) => {
        if (k === 0) sfx(game, `sfx_chew_${this.chewOrder[this.chewNext++ % this.chewOrder.length]}`, 0.8);
        // порция подлетает ко рту и исчезает
        cat.track(game.tweens.add({
          targets: food[k], y: mouthY, scale: 0, alpha: 0, duration: A.eatPerPortion * 0.5, ease: 'Back.easeIn',
        }));
        this.fxCrumbs.setParticleTint(CONFIG.colors[color].fill);
        this.fxCrumbs.explode(A.crumbs, r.x, mouthY);
      }, () => {
        sfxRandom(game, 'sfx_purr', 3);
        this.wrapJar(bowl, color);
        this.fxHearts.explode(A.hearts, cat.x, cat.y - 60 * cat.baseScale);
        cat.track(game.time.delayedCall(A.catReturnDelay, () => cat.walkTo(cat.home.x, cat.home.y, () => cat.setInteractive())));
      });
    });
  }

  // Отмена хода «разобрала» банку: кот бросает есть и, ворча, возвращается. Корм на место.
  jarUndone(color) {
    const game = this.scene;
    const cat = this.cats[color];
    if (cat.fedBowl === null) return;
    const bowl = cat.fedBowl;
    cat.fedBowl = null;
    cat.stopActions().setMood('grumpy');
    game.portions[bowl].forEach((p) => {
      game.tweens.killTweensOf(p);
      p.setScale(1).setAlpha(1);
    });
    this.unwrapJar(bowl);
    cat.walkTo(cat.home.x, cat.home.y, () => cat.setMood('open').setInteractive());
  }

  // Банки пересоздаются (добавили банку «+1 банка»): старые обмотки убрать, список — заново.
  resetJars() {
    this.wraps.forEach((w, i) => { if (w) this.unwrapJar(i, true); });
    this.wraps = [];
  }

  // Банку снизу вверх обматывает джутовая верёвка цвета корма, затем выскакивает картинка корма.
  // instant — сразу обмотанная (банку пересоздали на новом месте).
  wrapJar(bowl, color, instant = false) {
    const game = this.scene;
    this.unwrapJar(bowl, true);
    const J = CONFIG.jute;
    const r = game.bowlRects[bowl];
    const top = r.top;
    const bottom = r.bottom - game.dim.base;
    const wrap = makeJuteWrap(game, color, game.dim.bw, top, bottom).setPosition(r.x, 0).setDepth(2);
    this.wraps[bowl] = wrap;
    if (instant) {
      wrap.reveal(1);
      wrap.icon.setScale(wrap.iconScale);
      return;
    }
    wrap.reveal(0);
    wrap.t = 0;
    const wrapTime = J.coilDuration * wrap.coils;
    game.tweens.add({ targets: wrap, t: 1, duration: wrapTime, onUpdate: () => wrap.reveal(wrap.t) });
    wrap.icon.setScale(0);
    game.tweens.add({ targets: wrap.icon, scale: wrap.iconScale, delay: wrapTime, duration: J.iconDuration, ease: 'Back.easeOut' });
  }

  unwrapJar(bowl, instant = false) {
    const game = this.scene;
    const wrap = this.wraps[bowl];
    if (!wrap) return;
    this.wraps[bowl] = null;
    const parts = [wrap.rope, wrap.icon];
    game.tweens.killTweensOf(parts);
    game.tweens.killTweensOf(wrap);
    if (instant) return wrap.destroy();
    game.tweens.add({ targets: wrap, alpha: 0, duration: CONFIG.jute.unwrapDuration, onComplete: () => wrap.destroy() });
  }
}
