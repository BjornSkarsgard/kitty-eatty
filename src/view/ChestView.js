import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { makeIcon, infinityMark, trackWindow } from './ui.js';
import { sfx } from '../audio.js';
import { NAMES } from '../theme/cats/names.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Открытие сундука или подарка (kind: 'chest' | 'gift'), награды уже начислены — здесь только показ.
// Сундук: 1) грохается сверху: сплющивается, из-под него пыль, экран вздрагивает;
// 2) подпрыгивает от нетерпения всё выше, из щели под крышкой бьёт свет и сыплются искры, звук всё выше;
// 3) сжимается — и взрывается: вспышка, ударная волна, сундук открывается (chest_open),
//    фонтан монет и конфетти, лучи fx_godrays крутятся, экран трясёт.
// Подарок: 1) плавно опускается со звоном; 2) пульсирует, как сердце: с каждым толчком раздувается сильнее
// и дрожит, как желе, толчки всё чаще, из-под крышки свет и искры; 3) лопается: крышка с бантом улетает,
// конфетти и звёзды. Дальше у обоих:
// 4) награды вылетают из коробки по дуге и приземляются с подскоком и искрами, за каждой — золотой ореол;
// 5) «Забрать» — монеты летят в счётчик монет. Числа — CONFIG.chestAnim; «Эффекты: выкл» — меньше частиц, без тряски.
// items: [{ icon, n }], [{ skin }] и т. д. (rewardItem). onDone — после «Забрать». title — надпись сверху.
// Всё закреплено на экране (scrollFactor 0), поверх всего.
export function openBox(scene, kind, items, onDone, { title } = {}) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const A = CONFIG.chestAnim;
  const fx = CONFIG.fx.enabled;
  const many = (n) => Math.round(n * (fx ? 1 : 0.3));
  const depth = 60;
  const font = `"${CONFIG.font}", sans-serif`;
  const ADD = Phaser.BlendModes.ADD;
  const parts = [];
  const add = (o) => { parts.push(o); return o.setDepth(depth).setScrollFactor(0); };
  // свой звук, а пока файла нет — запасной из уже имеющихся
  const snd = (key, fallback, volume = 1, rate = 1) => sfx(scene, scene.cache.audio.exists(key) ? key : fallback, volume, rate);
  // трясётся и основная камера, и камера интерфейса (окно сундука может быть на ней — RoomScene)
  const shake = ([ms, power]) => fx && [scene.cameras.main, scene.hudCam].forEach((c) => c?.shake(ms, power));
  const cx = W / 2;
  const cy = H / 2 + 120;
  // закрыть: награды уже начислены, поэтому и закрытие вкладкой посреди анимации — как «Забрать»
  let closed = false;
  const gift = kind === 'gift';
  const st = { sx: 1, sy: 1, lift: 0, angle: 0 }; // сплющивание, высота прыжка и наклон коробки (apply)
  const untrack = trackWindow(scene, () => finish());
  const finish = () => {
    if (closed) return;
    closed = true;
    untrack();
    scene.tweens.killTweensOf([st, ...parts]);
    parts.forEach((o) => o.destroy());
    onDone?.();
  };
  const later = (ms, fn) => scene.time.delayedCall(ms, () => { if (!closed) fn(); });

  // затемнение и вспышка — с запасом за края: экран трясётся, и край не должен открываться
  const bleed = 120;
  add(scene.add.rectangle(W / 2, H / 2, W + bleed * 2, H + bleed * 2, PAL.dim, 0.82).setInteractive()); // тапы не проходят вниз
  if (title) {
    add(scene.add.text(W / 2, 230, title, {
      fontFamily: font, fontStyle: 'bold', fontSize: '54px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 10,
      align: 'center', wordWrap: { width: W - 80 },
    }).setOrigin(0.5));
  }
  softTexture(scene);
  ringTexture(scene);
  const art = scene.textures.exists('fx_godrays');
  if (!art) raysTexture(scene);
  const raysKey = art ? 'fx_godrays' : 'fx_rays';
  const raysK = A.raysSize / scene.textures.get(raysKey).getSourceImage().width;

  const box = closedBox(scene, kind, A.size);
  const floorY = cy + box.bodyH / 2;
  const mouthY = floorY - box.bodyH * 0.8; // откуда вылетает всё из открытой коробки
  const glow = add(scene.add.image(cx, mouthY, 'fx_soft').setTint(PAL.ray).setBlendMode(ADD).setAlpha(0));
  const rays2 = add(scene.add.image(cx, mouthY, raysKey).setBlendMode(ADD).setAlpha(0).setScale(raysK * 0.3).setAngle(18));
  const rays = add(scene.add.image(cx, mouthY, raysKey).setBlendMode(ADD).setAlpha(0).setScale(raysK * 0.3));
  const shadow = add(scene.add.ellipse(cx, floorY, A.size * 0.95, A.size * 0.13, PAL.black, 0.35).setAlpha(0));
  scene.children.bringToTop(add(box)); // создана раньше лучей и сияния — поднимаем над ними
  const leak = add(scene.add.image(cx, 0, 'fx_soft').setTint(PAL.rayCore).setBlendMode(ADD).setAlpha(0)); // свет из щели
  const apply = () => {
    box.setScale(st.sx, st.sy).setAngle(st.angle);
    box.setPosition(cx, floorY - st.lift - (box.bodyH / 2) * st.sy);
    leak.setPosition(cx, box.y - (box.bodyH / 2) * st.sy).setScale((A.size * 1.1) / 128, 0.5);
    const far = Math.min(1, st.lift / 400); // высоко — тень меньше и бледнее
    shadow.setScale(1 - far * 0.7);
  };

  // частицы: пыль при ударе, искры, конфетти, монеты, тихие блёстки, пока награды на экране
  const emit = (key, cfg) => add(scene.add.particles(0, 0, key, { emitting: false, ...cfg }));
  const dust = emit('fx_soft', {
    speedX: { min: -320, max: 320 }, speedY: { min: -90, max: -10 }, lifespan: 650,
    scale: { start: 0.35, end: 1.1 }, alpha: { start: 0.55, end: 0 }, tint: PAL.dust,
  });
  const sparks = emit('fx_sparkle', {
    speed: { min: 180, max: 480 }, angle: { min: 200, max: 340 }, gravityY: 600, lifespan: 900,
    scale: { start: 1, end: 0 }, tint: [PAL.ray, PAL.rayCore, PAL.white], blendMode: ADD,
  });
  const confetti = emit('fx_confetti', {
    speed: { min: 380, max: 900 }, angle: { min: 215, max: 325 }, gravityY: 1000, lifespan: 2000,
    rotate: { min: 0, max: 360 }, scaleX: { min: 0.8, max: 1.5 }, scaleY: { min: 0.6, max: 1.4 },
    alpha: { start: 1, end: 0, ease: 'Quad.easeIn' }, tint: CONFIG.colors.map((c) => c.fill),
  });
  const coinK = A.coinSize / scene.textures.get('icon_coin').getSourceImage().width;
  const coins = emit('icon_coin', {
    speed: { min: 450, max: 850 }, angle: { min: 240, max: 300 }, gravityY: 1300, lifespan: 1500,
    rotate: { min: -180, max: 180 }, scale: { min: coinK * 0.7, max: coinK }, alpha: { start: 1, end: 0, ease: 'Quad.easeIn' },
  });
  const twinkle = emit('fx_sparkle', {
    x: { min: -A.size * 0.4, max: A.size * 0.4 }, speedY: { min: -90, max: -30 }, lifespan: 1600, frequency: 110,
    scale: { start: 0.7, end: 0 }, alpha: { start: 1, end: 0 }, tint: [PAL.ray, PAL.white], blendMode: ADD,
  });

  // шаг анимации коробки: меняем st за ms и сразу рисуем
  const step = (props, ms, ease = 'Quad.easeOut') => ({ ...props, duration: ms, ease, onUpdate: apply });

  // 1. сундук падает и грохается
  const dropChest = () => {
    scene.tweens.add({ targets: shadow, alpha: 1, duration: A.drop, ease: 'Quad.easeIn' });
    scene.tweens.add({
      targets: st, ...step({ lift: 0 }, A.drop, 'Quad.easeIn'),
      onComplete: () => {
        snd('sfx_chest_land', 'sfx_drop');
        dust.explode(many(A.dust), cx, floorY);
        shake(A.landShake);
        scene.tweens.chain({
          targets: st,
          tweens: [step({ sx: 1.25, sy: 0.75 }, 70), step({ sx: 1, sy: 1 }, 320, 'Back.easeOut')],
          onComplete: () => later(120, () => hop(0)),
        });
      },
    });
  };

  // 1. подарок плавно опускается и мягко пружинит
  const dropGift = () => {
    scene.tweens.add({ targets: shadow, alpha: 1, duration: A.giftDrop, ease: 'Sine.easeOut' });
    scene.tweens.add({
      targets: st, ...step({ lift: 0 }, A.giftDrop, 'Cubic.easeOut'),
      onComplete: () => {
        snd('sfx_gift_land', 'sfx_popup');
        sparks.explode(many(8), cx, floorY);
        scene.tweens.chain({
          targets: st,
          tweens: [step({ sx: 1.12, sy: 0.88 }, 80), step({ sx: 1, sy: 1 }, 300, 'Back.easeOut')],
          onComplete: () => later(150, () => pulse(0)),
        });
      },
    });
  };

  // 2. пульсирует: раздувается всё сильнее (желейно — вширь, потом ввысь), толчки всё чаще, свет из-под крышки ярче
  const pulse = (k) => {
    if (closed) return;
    if (k >= A.giftPulses) return burst();
    const f = k / (A.giftPulses - 1); // 0 — первый толчок, 1 — последний
    const g = 1 + A.giftGrow * (k + 1);
    const ms = A.giftPulseMs * Math.pow(A.giftAccel, k); // каждый следующий короче — к концу частят
    snd('sfx_gift_pulse', 'sfx_pick', 1, 1 + f * 0.6);
    sparks.explode(many(3 + f * 16), cx, leak.y);
    scene.tweens.add({ targets: leak, alpha: 0.3 + f * 0.7, duration: ms * 0.3 });
    scene.tweens.add({ targets: rays, alpha: 0.12 + f * 0.4, scale: raysK * (0.4 + f * 0.4), duration: ms * 0.5 });
    shake([60, 0.001 + f * 0.006]);
    scene.tweens.chain({
      targets: st,
      tweens: [
        step({ sx: g * 1.08, sy: g * 0.93 }, ms * 0.3, 'Back.easeOut'),
        step({ sx: g * 0.96, sy: g * 1.05 }, ms * 0.25, 'Sine.easeInOut'),
        step({ sx: g, sy: g }, ms * 0.45, 'Sine.easeOut'),
      ],
      onComplete: () => pulse(k + 1),
    });
  };

  st.lift = floorY + A.size;
  apply();
  if (gift) dropGift();
  else dropChest();

  // 2. подпрыгивает всё выше, свет из щели и искры всё сильнее
  const hop = (k) => {
    if (closed) return;
    if (k >= A.hops.length) return tension();
    const side = k % 2 ? 1 : -1;
    scene.tweens.chain({
      targets: st,
      tweens: [
        step({ sx: 1.12, sy: 0.86 }, 90),
        step({ lift: A.hops[k], sx: 0.92, sy: 1.1, angle: side * (4 + k * 3) }, A.hopMs * 0.55),
        step({ lift: 0, sx: 1, sy: 1, angle: 0 }, A.hopMs * 0.45, 'Quad.easeIn'),
        step({ sx: 1.15, sy: 0.85 }, 60),
        step({ sx: 1, sy: 1 }, 140, 'Back.easeOut'),
      ],
      onComplete: () => hop(k + 1),
    });
    later(90 + A.hopMs, () => { // приземлился
      snd('sfx_chest_shake', 'sfx_pick', 1, 1 + k * 0.15);
      sparks.explode(many(4 + k * 5), cx, leak.y);
      scene.tweens.add({ targets: leak, alpha: 0.35 + k * 0.25, duration: 160 });
      scene.tweens.add({ targets: rays, alpha: 0.15 + k * 0.12, scale: raysK * (0.4 + k * 0.12), duration: 300 });
      shake([80, 0.002 + k * 0.002]);
    });
  };

  // перед взрывом сжимается, как пружина
  const tension = () => {
    scene.tweens.add({ targets: leak, alpha: 1, duration: A.tension });
    scene.tweens.add({ targets: st, ...step({ sx: 1.2, sy: 0.72 }, A.tension, 'Sine.easeIn'), onComplete: burst });
  };

  // 3. взрыв: вспышка, волна, коробка открывается, монеты и конфетти
  const burst = () => {
    if (closed) return;
    if (gift) snd('sfx_gift_open', 'sfx_popup');
    else snd('sfx_chest_open', 'sfx_star');
    later(120, () => sfx(scene, 'sfx_coins', CONFIG.audio.coins));
    shake(A.burstShake);
    const flash = add(scene.add.rectangle(W / 2, H / 2, W + bleed * 2, H + bleed * 2, PAL.white, 1).setAlpha(0));
    scene.tweens.add({ targets: flash, alpha: 0.9, duration: A.flash * 0.25, yoyo: true, hold: 30, onComplete: () => flash.destroy() });
    const ring = add(scene.add.image(cx, mouthY, 'fx_ring').setTint(PAL.rayCore).setBlendMode(ADD).setScale(0.2));
    scene.tweens.add({ targets: ring, scale: A.ringScale, alpha: 0, duration: 550, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
    leak.setAlpha(0);
    box.open();
    scene.tweens.chain({ targets: st, tweens: [step({ sx: 0.88, sy: 1.22 }, 90), step({ sx: 1, sy: 1 }, 420, 'Elastic.easeOut')] });
    confetti.explode(many(gift ? A.confetti * 1.6 : A.confetti), cx, mouthY); // у подарка вместо монет — больше конфетти
    if (!gift) coins.explode(many(A.coins), cx, mouthY);
    sparks.explode(many(A.sparks), cx, mouthY);
    // лучи: вспыхивают и крутятся в разные стороны, сзади — тёплое сияние
    scene.tweens.add({ targets: rays, alpha: 1, scale: raysK * 1.15, duration: 260, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: rays2, alpha: 0.55, scale: raysK * 0.85, duration: 300, ease: 'Back.easeOut' });
    scene.tweens.add({ targets: rays, angle: 360, duration: A.raysTurn, repeat: -1 });
    scene.tweens.add({ targets: rays2, angle: 18 - 360, duration: A.raysTurn * 1.4, repeat: -1 });
    if (fx) {
      glow.setScale(A.glowSize / 128);
      scene.tweens.add({
        targets: glow, alpha: 0.85, duration: 200,
        onComplete: () => scene.tweens.add({ targets: glow, alpha: 0.45, scale: (A.glowSize / 128) * 0.85, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
      });
      twinkle.setPosition(cx, mouthY).start();
    }
    later(A.flash, showRewards);
  };

  // 4. награды вылетают по дуге и встают рядами над коробкой
  items = items.filter((it) => it.icon !== 'hint' || scene.textures.exists('icon_hint')); // подсказка — когда будет иконка
  const placed = [];
  const showRewards = () => {
    const made = items.map((it) => add(rewardItem(scene, it, font)).setVisible(false));
    const spots = rewardSpots(made.map((o) => Math.max(A.rewardMinW, o.getBounds().width + A.rewardPad)));
    items.forEach((it, i) => later(i * A.rewardsDelay, () => {
      const { x, y } = spots[i];
      const halo = add(scene.add.image(x, y, 'fx_soft').setTint(PAL.ray).setBlendMode(ADD).setAlpha(0).setScale(A.haloSize / 128));
      scene.children.bringToTop(made[i]); // ореол — под наградой
      const item = made[i].setVisible(true).setPosition(cx, mouthY).setScale(0.2);
      placed.push({ it, item });
      snd('sfx_reward_pop', 'sfx_star', 1, 1 + i * 0.12);
      scene.tweens.addCounter({
        from: 0, to: 1, duration: A.rewardFly, ease: 'Linear',
        onUpdate: (tw) => {
          const t = tw.getValue();
          const e = 1 - (1 - t) * (1 - t);
          item.setPosition(cx + (x - cx) * e, mouthY + (y - mouthY) * t - A.rewardArc * 4 * t * (1 - t)).setScale(0.2 + 0.8 * e);
        },
        onComplete: () => {
          if (closed) return;
          sparks.explode(many(10), x, y);
          scene.tweens.chain({ targets: item, tweens: [{ scaleX: 1.2, scaleY: 0.8, duration: 70 }, { scaleX: 1, scaleY: 1, duration: 300, ease: 'Back.easeOut' }] });
          scene.tweens.add({
            targets: halo, alpha: 0.7, duration: 250,
            onComplete: () => scene.tweens.add({ targets: halo, alpha: 0.35, duration: 800, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
          });
        },
      });
    }));
    later(items.length * A.rewardsDelay + A.rewardFly, () => {
      const btn = add(makeButton(scene, cx, H - 270, STR.take, collect, { ...CONFIG.ui.bigButton, skin: 'green' }));
      btn.setScale(0);
      scene.tweens.add({ targets: btn, scale: 1, duration: 260, ease: 'Back.easeOut' });
    });
  };

  // Места наград: по рядам, пока ряд влезает в ширину экрана; нижний ряд — над коробкой, остальные выше.
  // widths — ширина каждой награды с отступом.
  const rewardSpots = (widths) => {
    const fits = (row) => row.reduce((s, i) => s + widths[i], 0) <= W - A.rewardMargin * 2;
    let rows = [[]];
    widths.forEach((_, i) => {
      if (rows[rows.length - 1].length && !fits([...rows[rows.length - 1], i])) rows.push([]);
      rows[rows.length - 1].push(i);
    });
    // столько же рядов, но поровну (6 наград — 3 и 3, а не 4 и 2), если так тоже влезает; нижние — на одну больше
    const n = widths.length;
    const even = rows.map((_, r) => Math.floor(n / rows.length) + (rows.length - 1 - r < n % rows.length ? 1 : 0));
    const balanced = even.map((k, r) => Array.from({ length: k }, (__, j) => even.slice(0, r).reduce((s, x) => s + x, 0) + j));
    if (balanced.every(fits)) rows = balanced;
    const spots = [];
    const bottomY = cy - A.size * A.rewardsY;
    rows.forEach((row, r) => {
      const y = bottomY - (rows.length - 1 - r) * A.rewardRowGap;
      let x = cx - row.reduce((s, i) => s + widths[i], 0) / 2;
      row.forEach((i) => {
        spots[i] = { x: x + widths[i] / 2, y };
        x += widths[i];
      });
    });
    return spots;
  };

  // 5. «Забрать»: монеты летят в счётчик монет (если он есть на экране), остальное тает. Второй тап — сразу закрыть.
  let collecting = false;
  const collect = () => {
    if (collecting) return finish();
    collecting = true;
    const pill = scene.coinPill;
    let wait = 250;
    placed.forEach(({ it, item }) => {
      scene.tweens.add({ targets: item, scale: 0, alpha: 0, duration: 250, ease: 'Back.easeIn' });
      if (it.icon !== 'coin' || !pill) return;
      const tx = pill.x + pill.icon.x;
      const ty = pill.y + pill.icon.y;
      for (let k = 0; k < A.coinFly; k++) {
        const c = add(scene.add.image(item.x, item.y, 'icon_coin').setScale(coinK));
        const delay = k * 45;
        wait = Math.max(wait, delay + 520);
        scene.tweens.add({
          targets: c, x: tx, y: ty, scale: coinK * 0.7, delay, duration: 480, ease: 'Cubic.easeIn',
          onComplete: () => {
            c.setVisible(false);
            if (k === 0) sfx(scene, 'sfx_coins', CONFIG.audio.coins);
            scene.tweens.add({ targets: pill, scale: 1.12, duration: 60, yoyo: true, onComplete: () => pill.setScale(1) });
          },
        });
      }
    });
    later(wait, finish);
  };
}

// Закрытая коробка: тело и крышка сверху (контейнер; крышка — box.lid). size — ширина на экране.
export function closedBox(scene, kind, size) {
  const c = scene.add.container(0, 0);
  const bodyKey = `${kind}_body`;
  const lidKey = `${kind}_lid`;
  if (!scene.textures.exists(bodyKey) || !scene.textures.exists(lidKey)) {
    const g = scene.add.graphics();
    g.fillStyle(kind === 'gift' ? PAL.giftStub : PAL.chestStub, 1).fillRoundedRect(-size / 2, -size * 0.35, size, size * 0.7, 24);
    c.add(g);
    c.lid = g;
    c.bodyH = size * 0.7;
    c.open = () => {};
    return c;
  }
  const body = scene.add.image(0, 0, bodyKey).setOrigin(0.5, 0.5);
  const k = size / body.width;
  body.setScale(k);
  const lid = scene.add.image(0, 0, lidKey).setOrigin(0.5, 1).setScale(k);
  lid.y = -body.displayHeight / 2 + lid.displayHeight * CONFIG.chestAnim.lidOverlap[kind];
  c.add([body, lid]);
  c.lid = lid;
  c.bodyH = body.displayHeight;
  // открыть: есть картинка <kind>_open (сундук с откинутой крышкой и золотом) — она, той же ширины, низ к низу;
  // нет (подарок) — крышка срывается и улетает, кружась
  c.open = () => {
    const openKey = `${kind}_open`;
    if (scene.textures.exists(openKey)) {
      body.setVisible(false);
      lid.setVisible(false);
      const img = scene.add.image(0, body.displayHeight / 2, openKey).setOrigin(0.5, 1);
      c.add(img.setScale(size / img.width));
      return;
    }
    scene.tweens.add({ targets: lid, y: lid.y - 560, angle: -200, alpha: 0, duration: 750, ease: 'Cubic.easeOut' });
  };
  return c;
}

// Одна награда: иконка с числом, голова кота нового окраса с именем, кличка или именная табличка.
function rewardItem(scene, it, font) {
  const c = scene.add.container(0, 0);
  if (it.name || it.token) {
    const n = NAMES.find((x) => x.id === it.name);
    const color = it.token ? CONFIG.names.colors.legendary : CONFIG.names.colors[n.rarity];
    const label = it.token ? STR.customNameReward : n.name;
    const t = scene.add.text(0, 6, label, {
      fontFamily: font, fontStyle: 'bold', fontSize: '30px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 7,
    }).setOrigin(0.5);
    const w = Math.max(150, t.width + 40);
    const g = scene.add.graphics();
    g.fillStyle(PAL.black, 0.3).fillRoundedRect(-w / 2 + 3, -30 + 6, w, 66, 22);
    g.fillStyle(color, 1).fillRoundedRect(-w / 2, -30, w, 66, 22);
    g.lineStyle(4, PAL.white, 0.8).strokeRoundedRect(-w / 2, -30, w, 66, 22);
    c.add([g, t, scene.add.text(0, -52, STR.nameLabel, {
      fontFamily: font, fontStyle: 'bold', fontSize: '24px', color: PAL.textGold, stroke: PAL.textStroke, strokeThickness: 5,
    }).setOrigin(0.5)]);
    return c;
  }
  if (it.ultra) { // ультракот: голова (пока окраса-замены) и название породы
    const u = CONFIG.ultras.find((x) => x.id === it.ultra);
    const file = CONFIG.skins.find((s) => s.id === u.look).file;
    const head = scene.add.image(0, -6, `cat_${file}_head`);
    head.setScale(150 / Math.max(head.width, head.height));
    c.add([head, scene.add.text(0, 84, u.name, {
      fontFamily: font, fontStyle: 'bold', fontSize: '36px', color: PAL.textGold, stroke: PAL.textStroke, strokeThickness: 8,
    }).setOrigin(0.5)]);
    return c;
  }
  if (it.skin) {
    const k = CONFIG.skins.find((s) => s.id === it.skin);
    const head = scene.add.image(0, -6, `cat_${k.file}_head`);
    head.setScale(130 / Math.max(head.width, head.height));
    c.add([head, scene.add.text(0, 70, k.name, {
      fontFamily: font, fontStyle: 'bold', fontSize: '30px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 7,
    }).setOrigin(0.5)]);
    return c;
  }
  if (it.icon === 'infinite') {
    // бесконечные жизни: сердце с белым ∞, под ним «30 мин»
    const heart = makeIcon(scene, 'heart', 110);
    c.add([heart, infinityMark(scene, 0, 0, 110), scene.add.text(0, 72, STR.infiniteMin(it.n), {
      fontFamily: font, fontStyle: 'bold', fontSize: '34px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 7,
    }).setOrigin(0.5)]);
    return c;
  }
  const ic = makeIcon(scene, it.icon, 120);
  if (it.icon !== 'coin') {
    ic.setScale(ic.scale * 0.8);
    c.add(scene.add.circle(0, 0, 56, PAL.button));
  }
  c.add([ic, scene.add.text(44, 48, String(it.n), {
    fontFamily: font, fontStyle: 'bold', fontSize: '54px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 10,
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
    g.fillStyle(PAL.ray, 0.3);
    g.fillTriangle(s / 2, s / 2,
      s / 2 + Math.cos(a - w) * s / 2, s / 2 + Math.sin(a - w) * s / 2,
      s / 2 + Math.cos(a + w) * s / 2, s / 2 + Math.sin(a + w) * s / 2);
  }
  g.fillStyle(PAL.rayCore, 0.5).fillCircle(s / 2, s / 2, s * 0.16);
  g.fillStyle(PAL.white, 0.6).fillCircle(s / 2, s / 2, s * 0.08);
  g.generateTexture('fx_rays', s, s);
  g.destroy();
}

// Мягкое пятно света 128×128 (белое, к краям гаснет) — пыль, сияние, ореолы; красится setTint.
function softTexture(scene) {
  if (scene.textures.exists('fx_soft')) return;
  const g = scene.make.graphics({}, false);
  for (let r = 64; r > 0; r -= 2) g.fillStyle(PAL.white, 0.045).fillCircle(64, 64, r);
  g.generateTexture('fx_soft', 128, 128);
  g.destroy();
}

// Кольцо ударной волны 256×256: яркий обод и мягкий ореол вокруг.
function ringTexture(scene) {
  if (scene.textures.exists('fx_ring')) return;
  const g = scene.make.graphics({}, false);
  for (let k = 0; k < 6; k++) g.lineStyle(4 + k * 5, PAL.white, 0.12).strokeCircle(128, 128, 110);
  g.lineStyle(6, PAL.white, 1).strokeCircle(128, 128, 110);
  g.generateTexture('fx_ring', 256, 256);
  g.destroy();
}
