import * as Phaser from 'phaser';
import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { iconButton, plate, makeIcon, panel } from './ui.js';
import { sfx } from '../audio.js';
import { catNeed } from '../core/save.js';
import { showCatLevelUps } from './CatLevelUpPopup.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Окно победы (как в референсе): панель с табличкой «Уровень N» и крестиком, звёзды, похвала по звёздам,
// число ходов, полоска опыта кота, «Награды:» на подставке, зелёная «Продолжить». Крестик — onHome.
// reward — что вернул recordWin (награды уже начислены). fxStars — частицы-звёздочки сцены.
// Новые уровни кота — окнами поверх (CatLevelUpPopup), onTake — обновить счётчики после «Забрать».
export function showWinPopup(scene, { level, moves, reward, isLast, fxStars, onNext, onHome, onTake }) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const WC = CONFIG.win;
  const font = `"${CONFIG.font}", sans-serif`;
  scene.add.rectangle(W / 2, H / 2, W, H, PAL.black, 0.6).setDepth(20).setInteractive();

  // всё, кроме звёзд, — в одном контейнере, он «выпрыгивает»; звёзды появляются следом
  const cy = H / 2 + WC.offsetY;
  const box = scene.add.container(W / 2, cy).setDepth(21);
  const pw = WC.width;
  const ph = WC.height;
  box.add(panel(scene, pw + 20, ph + 20));
  const g = scene.add.graphics();
  g.fillStyle(PAL.white, 0.08).fillRoundedRect(-pw / 2 + 24, -ph / 2 + 24, pw - 48, ph * 0.43, 34); // светлее под звёздами
  // подставка под награды
  g.fillStyle(PAL.deep, 1).fillEllipse(0, WC.rewardsY + 58, 380, 70);
  g.fillStyle(PAL.pedestal, 1).fillEllipse(0, WC.rewardsY + 46, 380, 64);
  box.add(g);
  box.add(plate(scene, 0, -ph / 2 + 4, STR.level(level.id), { depth: 0, color: PAL.plate }).setScale(1.25));

  const praise = scene.add.text(0, WC.praiseY, STR.praise[reward.stars - 1], {
    fontFamily: font, fontStyle: 'bold', fontSize: '84px', stroke: PAL.textGoldStroke, strokeThickness: 14,
    shadow: { offsetX: 0, offsetY: 6, color: PAL.praiseShadow, blur: 0, stroke: true, fill: true },
  }).setOrigin(0.5);
  const grad = praise.context.createLinearGradient(0, 0, 0, praise.height);
  grad.addColorStop(0.25, PAL.praiseTop);
  grad.addColorStop(0.75, PAL.praiseBottom);
  praise.setFill(grad);
  box.add(praise);

  // ходы — на тёмной полоске, в стиле табличек окна
  const movesText = scene.add.text(0, WC.movesY, STR.moves(moves, level.minMoves), {
    fontFamily: font, fontStyle: 'bold', fontSize: '32px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 6,
  }).setOrigin(0.5);
  const mw = movesText.width + 48;
  const mg = scene.add.graphics();
  mg.fillStyle(PAL.deep, 1).fillRoundedRect(-mw / 2, WC.movesY - 26, mw, 52, 26);
  mg.lineStyle(3, PAL.rim, 1).strokeRoundedRect(-mw / 2, WC.movesY - 26, mw, 52, 26);
  box.add([mg, movesText]);

  box.add(scene.add.text(0, WC.rewardsY - 92, STR.rewards, {
    fontFamily: font, fontStyle: 'bold', fontSize: '36px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 7,
  }).setOrigin(0.5));
  const items = [['coin', reward.coins], ['undo', reward.undos], ['chest', reward.chests]].filter(([, n]) => n > 0);
  items.forEach(([icon, n], i) => {
    const x = (i - (items.length - 1) / 2) * 170;
    const plain = icon === 'coin' || icon === 'chest'; // свои картинки — без кружка под иконкой
    const ic = makeIcon(scene, icon, icon === 'chest' ? 118 : 104).setPosition(x, WC.rewardsY);
    if (!plain) ic.setScale(ic.scale * 0.8);
    box.add(plain ? ic : [scene.add.circle(x, WC.rewardsY, 48, PAL.button), ic]);
    box.add(scene.add.text(x + 40, WC.rewardsY + 38, String(n), {
      fontFamily: font, fontStyle: 'bold', fontSize: '50px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 9,
    }).setOrigin(0.5));
  });
  if (!items.length) {
    box.add(scene.add.text(0, WC.rewardsY, STR.alreadyPassed, {
      fontFamily: font, fontStyle: 'bold', fontSize: '32px', color: PAL.textDim,
    }).setOrigin(0.5));
  }
  const bar = xpBar(scene, box, WC.xpY, reward);

  // полоска опыта кота доезжает, когда звёзды отпрыгали; новые уровни кота — окном поверх
  scene.time.delayedCall(400 + reward.stars * CONFIG.stars.popDelay + 300, () => fillXpBar(scene, bar, reward, fxStars, onTake));

  box.add(makeButton(scene, 0, WC.buttonY, isLast ? STR.again : STR.next, onNext, { w: 380, h: 150, size: 50, skin: 'green' }));
  box.add(iconButton(scene, pw / 2 - 6, -ph / 2 + 4, 'close', onHome, {
    size: 92, shape: 'round', color: CONFIG.ui.exitColor, depth: 0,
  }));

  box.setScale(0.5).setAlpha(0);
  sfx(scene, 'sfx_popup', CONFIG.audio.popup);
  // монеты звенят, когда звёзды отпрыгали
  if (reward.coins) scene.time.delayedCall(400 + reward.stars * CONFIG.stars.popDelay + 200, () => sfx(scene, 'sfx_coins', CONFIG.audio.coins));
  scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
  showStars(scene, box, WC.starsY, reward.stars, fxStars);
}

// Три звезды в ряд внутри окна победы (box): сначала все пустые — выпрыгивают вместе с окном,
// потом заработанные по очереди заполняются со вспышкой. Картинки ui_star / ui_star_empty;
// пока их нет — растянутая искорка fx_star (пустая — бледная).
function showStars(scene, box, y, count, fxStars) {
  const S = CONFIG.stars;
  const full = scene.textures.exists('ui_star') ? 'ui_star' : 'fx_star';
  const hasEmpty = scene.textures.exists('ui_star_empty');
  const fit = (img) => img.setScale(S.size / Math.max(img.width, img.height));
  for (let i = 0; i < 3; i++) {
    const sx = (i - 1) * (S.size + S.gap);
    const sy = y + (i === 1 ? 0 : S.size * 0.12); // средняя чуть выше — дугой
    box.add(fit(scene.add.image(sx, sy, hasEmpty ? 'ui_star_empty' : full)).setAlpha(hasEmpty ? 1 : S.emptyAlpha));
    if (i >= count) continue;
    const star = fit(scene.add.image(sx, sy, full));
    box.add(star);
    const target = star.scale;
    star.setScale(0);
    scene.tweens.add({
      targets: star, scale: target, duration: 380, ease: 'Back.easeOut', delay: 400 + i * S.popDelay,
      onStart: () => sfx(scene, 'sfx_star', CONFIG.audio.star, CONFIG.audio.starPitch[i]), // до — ми — соль
      onComplete: () => fxStars.setDepth(23).explode(10, box.x + sx, box.y + sy),
    });
  }
}

// Полоска опыта в окне победы: слева кружок с уровнем кота, в полоске «опыт / нужно», справа сверху «+N опыта».
// Сначала показывает, каким кот был до победы; fillXpBar доводит.
function xpBar(scene, box, y, reward) {
  const C = CONFIG.catXp;
  const font = `"${CONFIG.font}", sans-serif`;
  const w = C.barWidth;
  const h = C.barHeight;
  const x0 = -w / 2 + 30; // полоска чуть правее — слева кружок уровня
  const track = scene.add.graphics();
  track.fillStyle(PAL.night, 1).fillRoundedRect(x0, y - h / 2, w, h, h / 2);
  track.lineStyle(3, PAL.rim, 1).strokeRoundedRect(x0, y - h / 2, w, h, h / 2);
  const fill = scene.add.graphics();
  const text = scene.add.text(x0 + w / 2, y, '', {
    fontFamily: font, fontStyle: 'bold', fontSize: '26px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 5,
  }).setOrigin(0.5);
  const badge = scene.add.container(x0 - 6, y);
  const bg = scene.add.graphics();
  bg.fillStyle(PAL.goldDark, 1).fillCircle(0, 4, 40);
  bg.fillStyle(PAL.gold, 1).fillCircle(0, 0, 40);
  bg.fillStyle(PAL.white, 0.3).fillEllipse(-10, -16, 34, 16);
  const num = scene.add.text(0, 2, '', {
    fontFamily: font, fontStyle: 'bold', fontSize: '40px', color: PAL.text, stroke: PAL.textGoldStroke, strokeThickness: 7,
  }).setOrigin(0.5);
  badge.add([bg, num]);
  const gain = scene.add.text(x0 + w, y - h / 2 - 22, reward.xp ? STR.xpGain(reward.xp) : '', {
    fontFamily: font, fontStyle: 'bold', fontSize: '28px', color: PAL.textGold, stroke: PAL.textStroke, strokeThickness: 6,
  }).setOrigin(1, 0.5);
  box.add([track, fill, text, badge, gain]);
  const bar = {
    level: reward.cat.level,
    set: (level, xp) => {
      const need = catNeed(level);
      const k = Phaser.Math.Clamp(xp / need, 0, 1);
      fill.clear();
      if (k > 0) fill.fillStyle(PAL.goldLight, 1).fillRoundedRect(x0 + 4, y - h / 2 + 4, Math.max(h - 8, (w - 8) * k), h - 8, (h - 8) / 2);
      if (k > 0) fill.fillStyle(PAL.white, 0.35).fillRoundedRect(x0 + 10, y - h / 2 + 7, Math.max(0, (w - 8) * k - 12), 6, 3);
      text.setText(`${Math.floor(xp)} / ${need}`);
      num.setText(String(level));
    },
    badge,
  };
  bar.set(reward.cat.level, reward.cat.xp);
  return bar;
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
