import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { iconButton, plate, makeIcon, panel, kindBadge } from './ui.js';
import { showRewardedAd, rewardedReady } from '../rewarded.js';
import { addWinBoost } from '../core/save.js';
import { sfx } from '../audio.js';
import { catNeed } from '../core/save.js';
import { showCatLevelUps } from './CatLevelUpPopup.js';
import { catXpBar } from './CatXpBar.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Окно победы (как в референсе): панель с табличкой «Уровень N» и крестиком, похвала, у сложного уровня —
// строка «Сложный · монеты ×3», полоска опыта кота, «Награды:» на подставке, зелёная «Продолжить». Крестик — onHome.
// reward — что вернул recordWin (награды уже начислены). fxStars — частицы-звёздочки сцены.
// Новые уровни кота — окнами поверх (CatLevelUpPopup), onTake — обновить счётчики после «Забрать».
export function showWinPopup(scene, { level, reward, isLast, fxStars, onNext, onHome, onTake }) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const WC = CONFIG.win;
  const font = `"${CONFIG.font}", sans-serif`;
  scene.add.rectangle(W / 2, H / 2, W, H, PAL.black, 0.6).setDepth(20).setInteractive();

  // всё окно — в одном контейнере, он «выпрыгивает»
  const cy = H / 2 + WC.offsetY;
  const box = scene.add.container(W / 2, cy).setDepth(21);
  const pw = WC.width;
  const ph = WC.height;
  box.add(panel(scene, pw + 20, ph + 20));
  const g = scene.add.graphics();
  g.fillStyle(PAL.white, 0.08).fillRoundedRect(-pw / 2 + 24, -ph / 2 + 24, pw - 48, ph * 0.43, 34); // светлее под похвалой
  // подставка под награды
  g.fillStyle(PAL.deep, 1).fillEllipse(0, WC.rewardsY + 58, 380, 70);
  g.fillStyle(PAL.pedestal, 1).fillEllipse(0, WC.rewardsY + 46, 380, 64);
  box.add(g);
  box.add(plate(scene, 0, -ph / 2 + 4, STR.level(level.id), { depth: 0, color: PAL.plate }).setScale(1.25));

  const praise = scene.add.text(0, WC.praiseY, STR.praise[level.kind ?? 'normal'], {
    fontFamily: font, fontStyle: 'bold', fontSize: '84px', stroke: PAL.textGoldStroke, strokeThickness: 14,
    shadow: { offsetX: 0, offsetY: 6, color: PAL.praiseShadow, blur: 0, stroke: true, fill: true },
  }).setOrigin(0.5);
  const grad = praise.context.createLinearGradient(0, 0, 0, praise.height);
  grad.addColorStop(0.25, PAL.praiseTop);
  grad.addColorStop(0.75, PAL.praiseBottom);
  praise.setFill(grad);
  box.add(praise);

  // сложный / кошмарный — табличкой своего цвета
  if (level.kind) box.add(kindBadge(scene, 0, WC.kindY, level.kind, STR.kindWin[level.kind](), 32));

  box.add(scene.add.text(0, WC.rewardsY - 92, STR.rewards, {
    fontFamily: font, fontStyle: 'bold', fontSize: '36px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 7,
  }).setOrigin(0.5));
  const items = [['coin', reward.coins], ['undo', reward.undos], ['chest', reward.chests]].filter(([, n]) => n > 0);
  let coinText = null; // число монет — бегунок его умножит
  items.forEach(([icon, n], i) => {
    const x = (i - (items.length - 1) / 2) * 170;
    const plain = icon === 'coin' || icon === 'chest'; // свои картинки — без кружка под иконкой
    const ic = makeIcon(scene, icon, icon === 'chest' ? 118 : 104).setPosition(x, WC.rewardsY);
    if (!plain) ic.setScale(ic.scale * 0.8);
    box.add(plain ? ic : [scene.add.circle(x, WC.rewardsY, 48, PAL.button), ic]);
    const t = scene.add.text(x + 40, WC.rewardsY + 38, String(n), {
      fontFamily: font, fontStyle: 'bold', fontSize: '50px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 9,
    }).setOrigin(0.5);
    if (icon === 'coin') coinText = t;
    box.add(t);
  });
  if (reward.coins && level.id >= CONFIG.economy.winBoost.from && rewardedReady()) winBoost(scene, box, reward.coins, coinText, fxStars, onTake);
  if (!items.length) {
    box.add(scene.add.text(0, WC.rewardsY, STR.alreadyPassed, {
      fontFamily: font, fontStyle: 'bold', fontSize: '32px', color: PAL.textDim,
    }).setOrigin(0.5));
  }
  const bar = xpBar(scene, box, WC.xpY, reward);

  // полоска опыта кота доезжает, когда окно появилось; новые уровни кота — окном поверх
  scene.time.delayedCall(WC.revealMs, () => fillXpBar(scene, bar, reward, fxStars, onTake));

  box.add(makeButton(scene, 0, WC.buttonY, isLast ? STR.again : STR.next, onNext, { ...CONFIG.ui.bigButton, skin: 'green' }));
  box.add(iconButton(scene, pw / 2 - 6, -ph / 2 + 4, 'close', onHome, {
    size: 92, shape: 'round', color: CONFIG.ui.exitColor, depth: 0,
  }));

  box.setScale(0.5).setAlpha(0);
  sfx(scene, 'sfx_popup', CONFIG.audio.popup);
  // похвала вспыхивает искорками, монеты звенят, когда окно появилось
  if (reward.coins) scene.time.delayedCall(WC.revealMs - 100, () => sfx(scene, 'sfx_coins', CONFIG.audio.coins));
  scene.tweens.add({
    targets: box, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut',
    onComplete: () => {
      sfx(scene, 'sfx_star', CONFIG.audio.star, CONFIG.audio.starPitch[2]);
      fxStars.setDepth(23).explode(16, box.x, box.y + WC.praiseY);
    },
  });
}

// Бегунок: шкала ×2 ×3 ×4 ×3 ×2 (CONFIG.economy.winBoost), стрелка ездит туда-обратно; на кнопке — множитель под
// стрелкой. Нажал — стрелка встаёт насовсем, ролик; досмотрел — монеты ×k (сверху начисляется coins × (k − 1)) или
// сундук, не досмотрел — шкала исчезает, остаются обычные монеты. Ролик не загрузился заранее (rewardedReady) — шкалы нет.
// onTake — обновить счётчики.
function winBoost(scene, box, coins, coinText, fxStars, onTake) {
  const WC = CONFIG.win;
  const Z = CONFIG.economy.winBoost.zones;
  const total = Z.reduce((s, [, w]) => s + w, 0);
  const bw = WC.boostW;
  const bh = WC.boostH;
  const y = WC.boostY;
  const parts = [];
  const g = scene.add.graphics();
  const colors = { 2: PAL.boost2, 3: PAL.boost3, 4: PAL.boost4, chest: PAL.boostChest };
  g.fillStyle(PAL.black, 0.3).fillRoundedRect(-bw / 2 + 3, y - bh / 2 + 5, bw, bh, bh / 2);
  let x = -bw / 2;
  const zones = Z.map(([k, w]) => {
    const zw = (w / total) * bw;
    const z = { k, from: x, to: x + zw };
    x += zw;
    return z;
  });
  // зоны — цветные полосы; у крайних скруглены внешние углы, как у рамки шкалы
  const r = bh / 2;
  zones.forEach((z, i) => {
    const radius = { tl: i === 0 ? r : 0, bl: i === 0 ? r : 0, tr: i === zones.length - 1 ? r : 0, br: i === zones.length - 1 ? r : 0 };
    g.fillStyle(colors[z.k], 1).fillRoundedRect(z.from, y - bh / 2, z.to - z.from, bh, radius);
  });
  g.lineStyle(5, PAL.white, 0.9).strokeRoundedRect(-bw / 2, y - bh / 2, bw, bh, bh / 2);
  parts.push(g);
  // подписи ×N; сундук — маленький сундук над своей узкой зоной; соседние одинаковые зоны (×2 по бокам сундука) — без подписи
  zones.forEach((z) => {
    const cx = (z.from + z.to) / 2;
    if (z.k === 'chest') return parts.push(makeIcon(scene, 'chest', 30).setPosition(cx, y - WC.boostH * 0.62)); // сундучок над узкой зоной
    parts.push(scene.add.text(cx, y, `×${z.k}`, {
      fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: z.k === 4 ? '22px' : '26px', color: PAL.text,
      stroke: PAL.textStroke, strokeThickness: 6,
    }).setOrigin(0.5));
  });
  // стрелка-указатель над шкалой
  const arrow = scene.add.graphics();
  arrow.fillStyle(PAL.white, 1).fillTriangle(-16, -bh / 2 - 22, 16, -bh / 2 - 22, 0, -bh / 2 + 4);
  arrow.lineStyle(3, PAL.textStrokeHex ?? 0x3a2a78, 1).strokeTriangle(-16, -bh / 2 - 22, 16, -bh / 2 - 22, 0, -bh / 2 + 4);
  arrow.fillStyle(PAL.white, 1).fillRect(-3, -bh / 2, 6, bh);
  arrow.y = y;
  parts.push(arrow);
  const kAt = (ax) => (zones.find((z) => ax >= z.from && ax <= z.to) ?? zones[0]).k;
  const pos = { t: 0 };
  const run = scene.tweens.add({
    targets: pos, t: 1, duration: CONFIG.economy.winBoost.sweepMs, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    onUpdate: () => {
      arrow.x = -bw / 2 + pos.t * bw;
      showK(kAt(arrow.x));
    },
  });
  // на кнопке — «Смотреть ×N» или «Смотреть» и сундучок
  const showK = (k) => {
    btn.setLabel(STR.boostWatch(k));
    const t = btn.list.find((o) => o.type === 'Text');
    btnChest.setVisible(k === 'chest').setX(t.width / 2 + 34);
  };
  const btn = makeButton(scene, 0, WC.boostBtnY, STR.boostWatch(2), () => {
    if (!run.isPlaying()) return;
    run.pause();
    const k = kAt(arrow.x);
    showK(k);
    const gone = () => [...parts, btn].forEach((o) => scene.tweens.add({ targets: o, alpha: 0, duration: 250, onComplete: () => o.destroy() }));
    // попытка одна: досмотрел — награда ×k (или сундук), не досмотрел — шкала исчезает, остаются обычные монеты
    showRewardedAd(scene, () => {
      const chest = k === 'chest';
      addWinBoost(chest ? 0 : coins * (k - 1), chest ? 1 : 0);
      gone();
      celebrate(k);
      run.remove();
      onTake?.();
    }, () => { run.remove(); gone(); });
  }, { w: 380, h: 84, size: 34, color: PAL.adOrange });
  btn.add(makeIcon(scene, 'video', 50).setPosition(-160, 0));
  const btnChest = makeIcon(scene, 'chest', 52).setVisible(false);
  btn.add(btnChest);
  parts.push(btn);
  box.add(parts);

  // Что выиграл — крупно там, где была шкала: «×N» выпрыгивает с искрами, монеты в наградах отсчитываются до нового
  // числа; сундук выпрыгивает и остаётся по центру над «Продолжить».
  const celebrate = (k) => {
    const cy = (WC.boostY + WC.boostBtnY) / 2;
    const stars = (x, yy, n) => fxStars.setDepth(23).explode(n, box.x + x * box.scaleX, box.y + yy * box.scaleY);
    sfx(scene, 'sfx_star', CONFIG.audio.star, CONFIG.audio.starPitch[2]);
    if (k === 'chest') {
      const ch = makeIcon(scene, 'chest', 130).setPosition(0, cy + 10).setScale(0);
      box.add(ch);
      // сундук остаётся по центру, где была шкала (над «Продолжить»), и слегка покачивается
      scene.tweens.chain({
        targets: ch,
        tweens: [
          { scale: 1.25, duration: 260, ease: 'Back.easeOut', onStart: () => stars(0, cy, 24) },
          { scale: 1, duration: 160 },
        ],
        onComplete: () => scene.tweens.add({ targets: ch, angle: { from: -4, to: 4 }, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }),
      });
      return;
    }
    const big = text(scene, 0, cy, `×${k}`, 120, PAL.textGold).setScale(0);
    box.add(big);
    scene.tweens.chain({
      targets: big,
      tweens: [
        { scale: 1.3, duration: 260, ease: 'Back.easeOut', onStart: () => stars(0, cy, 24) },
        { scale: 1, duration: 160 },
        { alpha: 0, y: cy - 40, duration: 400, delay: 700 },
      ],
    });
    // монеты отсчитываются от обычных до умноженных, со звоном
    const n = { v: coins };
    scene.time.delayedCall(350, () => {
      sfx(scene, 'sfx_coins', CONFIG.audio.coins);
      scene.tweens.add({
        targets: n, v: coins * k, duration: 700, ease: 'Quad.easeOut',
        onUpdate: () => coinText?.setText(String(Math.round(n.v))),
        onComplete: () => {
          stars(40, WC.rewardsY, 14);
          scene.tweens.add({ targets: coinText, scale: 1.35, duration: 150, yoyo: true, ease: 'Quad.easeOut' });
        },
      });
    });
  };
}

// Текст окна победы: жирный, с обводкой.
function text(scene, x, y, s, size, color = PAL.text) {
  return scene.add.text(x, y, s, {
    fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: `${size}px`, color, stroke: PAL.textStroke,
    strokeThickness: Math.round(size / 5.5),
  }).setOrigin(0.5);
}

// Полоска опыта в окне победы: слева кружок с уровнем кота, в полоске «опыт / нужно», справа сверху «+N опыта».
// Сначала показывает, каким кот был до победы; fillXpBar доводит.
function xpBar(scene, box, y, reward) {
  const font = `"${CONFIG.font}", sans-serif`;
  const bar = catXpBar(scene, 0, y);
  const gain = scene.add.text(bar.barRight, y + bar.barTop - 22, reward.xp ? STR.xpGain(reward.xp) : '', {
    fontFamily: font, fontStyle: 'bold', fontSize: '28px', color: PAL.textGold, stroke: PAL.textStroke, strokeThickness: 6,
  }).setOrigin(1, 0.5);
  box.add([bar, gain]);
  return bar.set(reward.cat.level, reward.cat.xp);
}

// Полоска доезжает до нового опыта; на каждом новом уровне кота — до конца, кружок подпрыгивает с новым числом,
// и с нуля дальше. Потом — окна «Новый уровень кота!» по очереди.
function fillXpBar(scene, bar, reward, fxStars, onTake) {
  const C = CONFIG.catXp;
  if (!reward.xp) return;
  const steps = []; // [уровень, от, до]
  let level = reward.cat.level;
  let from = reward.cat.xp;
  let left = reward.xp;
  while (left > 0) {
    const room = catNeed(level) - from;
    const take = Math.min(left, room);
    steps.push([level, from, from + take]);
    left -= take;
    if (take === room) { level++; from = 0; } else from += take;
  }
  const run = (i) => {
    if (i >= steps.length) return showCatLevelUps(scene, reward.levelUps, { fxStars, onTake });
    const [lv, a, b] = steps[i];
    scene.tweens.addCounter({
      from: a, to: b, duration: C.barFillMs * Math.max(0.3, (b - a) / catNeed(lv)), ease: 'Cubic.easeOut',
      onUpdate: (tw) => bar.set(lv, tw.getValue()),
      onComplete: () => {
        if (b < catNeed(lv)) return run(i + 1);
        // новый уровень кота
        sfx(scene, 'sfx_star', CONFIG.audio.star, CONFIG.audio.starPitch[2]);
        bar.set(lv + 1, 0);
        scene.tweens.add({ targets: bar.badge, scale: 1.35, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
        scene.time.delayedCall(260, () => run(i + 1));
      },
    });
  };
  run(0);
}
