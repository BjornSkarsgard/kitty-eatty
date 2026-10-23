import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { sfx } from '../audio.js';

// Переход «поворот» между комнатой и кухней (уровнем): обе сцены едут вбок одновременно, вплотную друг к другу —
// старая уходит, новая въезжает, пустоты между ними нет. Размытие в движении и звук ветра — будто резко
// повернулись на 180°. dir: 1 — поворот вправо (новая въезжает справа), -1 — влево.
// Кухня стоит в доме сразу за последним участком комнаты, поэтому из комнаты проезжаем все участки до её края
// (главная → коллекция → лежанка → кухня) и обратно так же. Сколько ехать — спрашиваем у сцен:
// scene.turnExit(dir) — путь до своего края, scene.turnEnter(dir) — путь от края до своего места; без них — экран.
// Размытие — только WebGL и включённые эффекты; в Canvas — просто быстрый проезд.
const T = () => CONFIG.transition;

// Начать поворот из сцены from в сцену toKey: новая запускается параллельно и сама доводит переход (turnIn).
export function turnTo(from, toKey, data, dir) {
  from.input.enabled = false;
  from.scene.launch(toKey, { ...data, turn: { from: from.scene.key, dir } });
}

function blurOn(scene) {
  if (!CONFIG.fx.enabled || scene.game.renderer.type !== Phaser.WEBGL) return null;
  return scene.cameras.main.postFX?.addBlur(T().blurQuality, 1, 0, 0) || null;
}

// Закреплённые на экране элементы (кнопки сверху, вкладки) — они не едут с комнатой, поэтому гаснут/появляются.
// Зоны нажатия (вкладки) прозрачности не имеют — их пропускаем.
const hud = (scene) => scene.children.list.filter((o) => o.scrollFactorX === 0 && o.visible && typeof o.alpha === 'number');

// Вызывается в create() новой сцены, если её запустили поворотом (data.turn).
export function turnIn(scene, { from, dir }) {
  const old = scene.scene.get(from);
  scene.scene.bringToTop();
  const W = CONFIG.width;
  const cam = scene.cameras.main;
  const oldCam = old.cameras.main;
  const to = cam.scrollX;
  const span = (old.turnExit ? old.turnExit(dir) : W) + (scene.turnEnter ? scene.turnEnter(dir) : 0);
  const ms = T().duration + T().perScreen * Math.max(0, span / W - 1);
  // звук ветра — серединой на середину поворота (там камера быстрее всего)
  const whoosh = scene.cache.audio.get('sfx_whoosh');
  const soundMs = whoosh?.duration ? whoosh.duration * 1000 : ms;
  scene.time.delayedCall(Math.max(0, (ms - soundMs) / 2), () => sfx(scene, 'sfx_whoosh', T().volume));
  const bounds = cam.useBounds ? Phaser.Geom.Rectangle.Clone(cam.getBounds()) : null;
  cam.removeBounds();
  oldCam.removeBounds();
  cam.scrollX = to - dir * span;

  const blurs = [blurOn(scene), blurOn(old)].filter(Boolean);
  // размытие: нарастает к середине поворота и уходит к концу
  if (blurs.length) {
    scene.tweens.addCounter({
      from: 0, to: 1, duration: ms, ease: 'Linear',
      onUpdate: (tw) => { const s = Math.sin(tw.getValue() * Math.PI) * T().blur; blurs.forEach((b) => (b.strength = s)); },
    });
  }
  scene.tweens.add({ targets: hud(old), alpha: 0, duration: ms * 0.4 });
  // свои закреплённые элементы проявляются к концу — каждый до своей прозрачности (бледные вкладки остаются бледными)
  hud(scene).forEach((o) => {
    const a = o.alpha;
    o.setAlpha(0);
    scene.tweens.add({ targets: o, alpha: a, duration: ms * 0.5, delay: ms * 0.5 });
  });
  if (CONFIG.fx.enabled) windStreaks(scene, dir, ms);
  scene.input.enabled = false;
  scene.tweens.add({ targets: oldCam, scrollX: oldCam.scrollX + dir * span, duration: ms, ease: 'Cubic.easeInOut' });
  scene.tweens.add({
    targets: cam, scrollX: to, duration: ms, ease: 'Cubic.easeInOut',
    onComplete: () => {
      if (bounds) cam.setBounds(bounds.x, bounds.y, bounds.width, bounds.height);
      if (blurs[0] && scene.cameras.main.postFX) scene.cameras.main.postFX.remove(blurs[0]);
      scene.input.enabled = true;
      scene.scene.stop(from);
    },
  });
}

// Мультяшные струйки ветра: белые изогнутые штрихи с острыми концами проносятся поперёк экрана навстречу
// повороту. Несколько вариантов рисуются один раз в текстуры (wind_0..), дальше это обычные картинки —
// дешевле всего и в WebGL, и в Canvas. Есть свои картинки wind_N.png — берутся они.
const WIND_VARIANTS = 4;

function windTextures(scene) {
  for (let v = 0; v < WIND_VARIANTS; v++) {
    const key = `wind_${v}`;
    if (scene.textures.exists(key)) continue;
    const len = 400;
    const thick = 22;
    const bend = [-0.1, 0.06, 0.12, -0.04][v] * len;
    const pad = Math.abs(bend) + thick;
    const g = scene.make.graphics({}, false);
    const top = [];
    const bottom = [];
    const steps = 20;
    for (let s = 0; s <= steps; s++) {
      const u = s / steps;
      const x = u * len;
      const y = pad + Math.sin(u * Math.PI) * bend;
      const w = Math.sin(u * Math.PI) * thick * (0.3 + 0.7 * u); // хвост тоньше головы
      top.push(new Phaser.Math.Vector2(x, y - w / 2));
      bottom.unshift(new Phaser.Math.Vector2(x, y + w / 2));
    }
    g.fillStyle(0xffffff, 1).fillPoints([...top, ...bottom], true);
    g.generateTexture(key, len, pad * 2);
    g.destroy();
  }
}

function windStreaks(scene, dir, ms) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  windTextures(scene);
  for (let k = 0; k < T().streaks; k++) {
    const img = scene.add.image(0, Phaser.Math.Between(80, H - 80), `wind_${k % WIND_VARIANTS}`)
      .setScrollFactor(0).setDepth(1000).setAlpha(0);
    const s = Phaser.Math.FloatBetween(0.6, 1.4);
    img.setScale(s * (dir > 0 ? -1 : 1), s * Phaser.Math.FloatBetween(0.6, 1)); // голова штриха — по ходу ветра
    const half = (img.width * s) / 2;
    img.x = dir > 0 ? W + half : -half;
    const delay = Phaser.Math.Between(0, ms * 0.35);
    const dur = Phaser.Math.Between(ms * 0.55, ms * 0.8);
    scene.tweens.add({ targets: img, x: dir > 0 ? -half : W + half, duration: dur, delay, ease: 'Quad.easeInOut', onComplete: () => img.destroy() });
    scene.tweens.add({ targets: img, alpha: T().streakAlpha, duration: dur * 0.3, delay, yoyo: true, hold: dur * 0.4 });
  }
}
