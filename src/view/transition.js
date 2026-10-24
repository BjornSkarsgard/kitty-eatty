import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { sfx } from '../audio.js';

// Эффекты переходов между холлом (RoomScene) и кухней (уровнем).
// - Быстрый проезд по кругу холла к двери кухни и обратно: размытие в движении, мультяшные струйки ветра,
//   звук sfx_whoosh серединой на середину проезда (panFx).
// - Сквозь открытую дверь — зум камеры: холл приближается, пока проём не заполнит экран, и на этом кадре
//   включается уровень, который сам доезжает зумом до 1 (zoomIn / enterZoom). Назад — наоборот.
// Размытие — только WebGL и включённые эффекты; в Canvas — просто быстрый проезд.
const T = () => CONFIG.transition;

function blurOn(scene) {
  if (!CONFIG.fx.enabled || scene.game.renderer.type !== Phaser.WEBGL) return null;
  return scene.cameras.main.postFX?.addBlur(T().blurQuality, 1, 0, 0) || null;
}

// Сколько длится проезд на span пикселей (span — со знаком, важна только длина).
export function panDuration(span) {
  return T().duration + T().perScreen * Math.max(0, Math.abs(span) / CONFIG.width - 1);
}

// Эффекты на время проезда длиной ms в сторону dir (1 — камера едет вправо, -1 — влево).
export function panFx(scene, dir, ms) {
  const whoosh = scene.cache.audio.get('sfx_whoosh');
  const soundMs = whoosh?.duration ? whoosh.duration * 1000 : ms;
  scene.time.delayedCall(Math.max(0, (ms - soundMs) / 2), () => sfx(scene, 'sfx_whoosh', T().volume));
  const blur = blurOn(scene);
  // размытие: нарастает к середине проезда и уходит к концу
  if (blur) {
    scene.tweens.addCounter({
      from: 0, to: 1, duration: ms, ease: 'Linear',
      onUpdate: (tw) => (blur.strength = Math.sin(tw.getValue() * Math.PI) * T().blur),
      onComplete: () => scene.cameras.main.postFX?.remove(blur),
    });
  }
  if (CONFIG.fx.enabled) windStreaks(scene, dir, ms);
}

// Закреплённые на экране элементы (монеты, настройки, вкладки) — при зуме в дверь гаснут, на выходе проявляются.
// Зоны нажатия (вкладки) прозрачности не имеют — их пропускаем.
export const hud = (scene) => scene.children.list.filter((o) => o.scrollFactorX === 0 && o.visible && typeof o.alpha === 'number');

// Камера приближается в zoom (центр — середина экрана), потом onDone.
export function zoomIn(scene, zoom, ms, onDone) {
  scene.input.enabled = false;
  scene.tweens.add({ targets: hud(scene), alpha: 0, duration: ms * 0.5 });
  scene.tweens.add({ targets: scene.cameras.main, zoom, duration: ms, ease: 'Cubic.easeIn', onComplete: onDone });
}

// Сцена начинается приближенной в zoom и отъезжает до 1; закреплённые элементы проявляются к концу.
export function enterZoom(scene, zoom, ms, onDone) {
  const cam = scene.cameras.main;
  cam.setZoom(zoom);
  scene.input.enabled = false;
  hud(scene).forEach((o) => {
    const a = o.alpha; // бледные вкладки остаются бледными
    o.setAlpha(0);
    scene.tweens.add({ targets: o, alpha: a, duration: ms * 0.5, delay: ms * 0.5 });
  });
  scene.tweens.add({
    targets: cam, zoom: 1, duration: ms, ease: 'Cubic.easeOut',
    onComplete: () => { scene.input.enabled = true; onDone?.(); },
  });
}

// Мультяшные струйки ветра: белые изогнутые штрихи с острыми концами проносятся поперёк экрана навстречу
// движению. Несколько вариантов рисуются один раз в текстуры (wind_0..), дальше это обычные картинки —
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
