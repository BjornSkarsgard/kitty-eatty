import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { makeIcon } from './ui.js';
import { sfx } from '../audio.js';

// Открытие сундука или подарка (kind: 'chest' | 'gift'), награды уже начислены — здесь только показ:
// коробка падает сверху с подскоком → раскачивается всё сильнее, сзади разгораются лучи → вспышка, крышка улетает →
// награды выпрыгивают по одной → «Забрать». items: [{ icon, n }] и [{ skin }]. onDone — после «Забрать».
// Всё закреплено на экране (scrollFactor 0), поверх всего.
export function openBox(scene, kind, items, onDone) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const A = CONFIG.chestAnim;
  const depth = 60;
  const font = `"${CONFIG.font}", sans-serif`;
  const parts = [];
  const add = (o) => { parts.push(o); return o.setDepth(depth).setScrollFactor(0); };
  const cx = W / 2;
  const cy = H / 2 + 120;

  add(scene.add.rectangle(W / 2, H / 2, W, H, 0x120a2a, 0.82).setInteractive()); // тапы не проходят вниз
  raysTexture(scene);
  const rays = add(scene.add.image(cx, cy - 40, 'fx_rays').setAlpha(0).setScale(0.4).setBlendMode(Phaser.BlendModes.ADD));
  const box = add(closedBox(scene, kind, A.size)).setPosition(cx, -A.size);

  // 1. падает с подскоком, на приземлении сплющивается
  scene.tweens.add({
    targets: box, y: cy, duration: A.drop, ease: 'Bounce.easeOut',
    onComplete: () => {
      sfx(scene, 'sfx_popup', CONFIG.audio.popup);
      scene.tweens.add({ targets: box, scaleX: 1.12, scaleY: 0.86, duration: 90, yoyo: true, ease: 'Quad.easeOut', onComplete: spin });
    },
  });

  // 2. раскачивается всё сильнее и чаще, лучи разгораются и крутятся
  const spin = () => {
    scene.tweens.add({ targets: rays, alpha: 0.9, scale: 1.1, duration: A.spin, ease: 'Quad.easeIn' });
    scene.tweens.add({ targets: rays, angle: 120, duration: A.spin + 4000 });
    scene.tweens.addCounter({
      from: 0, to: 1, duration: A.spin, ease: 'Linear',
      onUpdate: (tw) => {
        const t = tw.getValue();
        box.angle = Math.sin(t * t * 40) * A.spinAngle * t; // частота и размах растут
        box.setScale(1 + 0.08 * t * Math.abs(Math.sin(t * t * 40)));
      },
      onComplete: burst,
    });
  };

  // 3. вспышка: крышка улетает, коробка открыта
  const burst = () => {
    box.setAngle(0).setScale(1);
    sfx(scene, 'sfx_star', CONFIG.audio.star, CONFIG.audio.starPitch[2]);
    const flash = add(scene.add.rectangle(W / 2, H / 2, W, H, 0xffffff, 1).setAlpha(0));
    scene.tweens.add({ targets: flash, alpha: 1, duration: A.flash * 0.3, yoyo: true, hold: 40, onComplete: () => flash.destroy() });
    const lid = box.lid;
    scene.tweens.add({ targets: lid, y: lid.y - 520, angle: -25, alpha: 0, duration: 650, ease: 'Cubic.easeOut' });
    scene.tweens.add({ targets: rays, scale: 1.35, duration: 300, yoyo: true, ease: 'Quad.easeOut' });
    scene.time.delayedCall(A.flash, showRewards);
  };

  // 4. награды выпрыгивают из коробки в ряд над ней
  const showRewards = () => {
    const gap = 180;
    const y = cy - A.size * 0.95;
    items.forEach((it, i) => {
      const x = cx + (i - (items.length - 1) / 2) * gap;
      const item = add(rewardItem(scene, it, font)).setPosition(cx, cy - 40).setScale(0);
      scene.tweens.add({
        targets: item, x, y, scale: 1, duration: 420, delay: i * A.rewardsDelay, ease: 'Back.easeOut',
        onStart: () => sfx(scene, it.icon === 'coin' ? 'sfx_coins' : 'sfx_star', it.icon === 'coin' ? CONFIG.audio.coins : CONFIG.audio.star),
      });
    });
    scene.time.delayedCall(items.length * A.rewardsDelay + 300, () => {
      const btn = add(makeButton(scene, cx, H - 270, 'Забрать', () => {
        parts.forEach((o) => o.destroy());
        onDone?.();
      }, { w: 360, h: 140, size: 50, skin: 'green' }));
      btn.setScale(0);
      scene.tweens.add({ targets: btn, scale: 1, duration: 260, ease: 'Back.easeOut' });
    });
  };
}

// Закрытая коробка: тело и крышка сверху (контейнер; крышка — box.lid). size — ширина на экране.
export function closedBox(scene, kind, size) {
  const c = scene.add.container(0, 0);
  const bodyKey = `${kind}_body`;
  const lidKey = `${kind}_lid`;
  if (!scene.textures.exists(bodyKey) || !scene.textures.exists(lidKey)) {
    const g = scene.add.graphics();
    g.fillStyle(kind === 'gift' ? 0x7a3fe0 : 0xa0602a, 1).fillRoundedRect(-size / 2, -size * 0.35, size, size * 0.7, 24);
    c.add(g);
    c.lid = g;
    return c;
  }
  const body = scene.add.image(0, 0, bodyKey).setOrigin(0.5, 0.5);
  const k = size / body.width;
  body.setScale(k);
  const lid = scene.add.image(0, 0, lidKey).setOrigin(0.5, 1).setScale(k);
  lid.y = -body.displayHeight / 2 + lid.displayHeight * CONFIG.chestAnim.lidOverlap;
  c.add([body, lid]);
  c.lid = lid;
  return c;
}

// Одна награда: иконка с числом или голова кота нового окраса с именем.
function rewardItem(scene, it, font) {
  const c = scene.add.container(0, 0);
  if (it.skin) {
    const k = CONFIG.skins.find((s) => s.id === it.skin);
    const head = scene.add.image(0, -6, `cat_${k.file}_head`);
    head.setScale(130 / Math.max(head.width, head.height));
    c.add([head, scene.add.text(0, 70, k.name, {
      fontFamily: font, fontStyle: 'bold', fontSize: '30px', color: '#ffffff', stroke: '#2b1a66', strokeThickness: 7,
    }).setOrigin(0.5)]);
    return c;
  }
  const ic = makeIcon(scene, it.icon, 120);
  if (it.icon !== 'coin') {
    ic.setScale(ic.scale * 0.8);
    c.add(scene.add.circle(0, 0, 56, 0x7b5cf0));
  }
  c.add([ic, scene.add.text(44, 48, String(it.n), {
    fontFamily: font, fontStyle: 'bold', fontSize: '54px', color: '#ffffff', stroke: '#2b1a66', strokeThickness: 10,
  }).setOrigin(0.5)]);
  return c;
}

// Лучи за коробкой: золотые клинья от центра, рисуются один раз в текстуру.
function raysTexture(scene) {
  if (scene.textures.exists('fx_rays')) return;
  const s = 900;
  const g = scene.make.graphics({}, false);
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = (Math.PI / n) * 0.55;
    g.fillStyle(0xffd75a, 0.3);
    g.fillTriangle(s / 2, s / 2,
      s / 2 + Math.cos(a - w) * s / 2, s / 2 + Math.sin(a - w) * s / 2,
      s / 2 + Math.cos(a + w) * s / 2, s / 2 + Math.sin(a + w) * s / 2);
  }
  g.fillStyle(0xfff2b0, 0.5).fillCircle(s / 2, s / 2, s * 0.16);
  g.fillStyle(0xffffff, 0.6).fillCircle(s / 2, s / 2, s * 0.08);
  g.generateTexture('fx_rays', s, s);
  g.destroy();
}
