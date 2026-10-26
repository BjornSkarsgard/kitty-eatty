// Награды за рекламу на главной: иконка ролика (под ней — миниатюры наград лесенки) и окно-счётчик:
// за день — ролики по шагам, на шагах CONFIG.ads.ladder — монеты или сундук. Начисляет core/save.js adLadder.
import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { showPopup } from './Popup.js';
import { makeIcon, panel, plate, iconButton, trackWindow } from './ui.js';
import { sfx } from '../audio.js';
import { showRewardedAd } from '../rewarded.js';
import { adsState, adLadder } from '../core/save.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

const font = () => `"${CONFIG.font}", sans-serif`;
const text = (scene, x, y, s, size, color = PAL.text) => scene.add.text(x, y, s, {
  fontFamily: font(), fontStyle: 'bold', fontSize: `${size}px`, color, stroke: PAL.textStroke, strokeThickness: Math.round(size / 4.5),
}).setOrigin(0.5);

// Иконка награды шага лесенки: монета с числом или сундук.
function rewardIcon(scene, r, size) {
  const c = scene.add.container(0, 0);
  if (r.chests) c.add(makeIcon(scene, 'chest', size));
  else c.add([makeIcon(scene, 'coin', size), text(scene, size * 0.35, size * 0.42, String(r.coins), Math.round(size * 0.42))]);
  return c;
}

// Кнопка на главной: иконка ролика, под ней в ряд миниатюры наград. onTap — открыть окно.
export function adHomeButton(scene, x, y, onTap) {
  const A = CONFIG.home.adButton;
  const c = scene.add.container(x, y);
  const icon = makeIcon(scene, 'video', A.size);
  c.add(icon);
  const L = CONFIG.ads.ladder;
  L.forEach((r, i) => c.add(rewardIcon(scene, r, A.mini).setPosition((i - (L.length - 1) / 2) * A.mini * 1.15, A.size * 0.62)));
  c.setSize(A.size * 1.2, A.size * 1.4).setInteractive();
  c.on('pointerdown', () => { sfx(scene, 'sfx_button'); onTap(); });
  scene.tweens.add({ targets: icon, scale: icon.scale * 1.06, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
  return c;
}

// Окно-счётчик: шаги 1…N кружками, под шагами с наградой — награда; «Смотреть» — ролик и шаг вперёд.
// onChange — монеты или сундук начислены (обновить верхнюю полосу и кнопку сундука).
export function openAdLadder(scene, onChange) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const L = CONFIG.ads.ladder;
  const steps = L[L.length - 1].at;
  const parts = [];
  let untrack = null;
  const close = () => {
    if (!untrack) return;
    untrack();
    untrack = null;
    parts.forEach((o) => o.destroy());
  };
  untrack = trackWindow(scene, close);
  sfx(scene, 'sfx_popup', CONFIG.audio.popup);
  const pw = 620;
  const ph = 560;
  const shade = scene.add.rectangle(W / 2, H / 2, W, H, PAL.black, 0.6).setDepth(40).setScrollFactor(0).setInteractive();
  shade.on('pointerdown', close);
  parts.push(shade);
  const box = scene.add.container(W / 2, H / 2).setDepth(40).setScrollFactor(0);
  parts.push(box);
  box.add(panel(scene, pw + 20, ph + 20));
  box.add(scene.add.zone(0, 0, pw, ph).setInteractive());
  box.add(plate(scene, 0, -ph / 2 + 4, STR.ads.title, { depth: 0, color: PAL.plate }).setScale(1.2));
  box.add(iconButton(scene, pw / 2 - 26, -ph / 2 + 4, 'close', close, { size: 84, shape: 'round', color: CONFIG.ui.exitColor, depth: 0 }));
  const watched = adsState().watched;
  // дорожка шагов
  const step = (pw - 120) / (steps - 1);
  const x0 = -(pw - 120) / 2;
  const ty = -60;
  const g = scene.add.graphics();
  g.fillStyle(PAL.deep, 1).fillRoundedRect(x0, ty - 8, pw - 120, 16, 8);
  if (watched > 1) g.fillStyle(PAL.adOrange, 1).fillRoundedRect(x0, ty - 8, step * (Math.min(watched, steps) - 1), 16, 8);
  box.add(g);
  for (let k = 1; k <= steps; k++) {
    const x = x0 + (k - 1) * step;
    const done = k <= watched;
    const dot = scene.add.graphics();
    dot.fillStyle(done ? PAL.adOrange : PAL.deep, 1).fillCircle(x, ty, 30);
    dot.lineStyle(4, PAL.white, done ? 1 : 0.5).strokeCircle(x, ty, 30);
    box.add([dot, text(scene, x, ty, done ? '✓' : String(k), 28)]);
    const r = L.find((s) => s.at === k);
    if (r) box.add(rewardIcon(scene, r, 64).setPosition(x, ty + 78).setAlpha(done ? 0.45 : 1));
  }
  const left = steps - watched;
  box.add(text(scene, 0, ty - 90, left > 0 ? STR.ads.todayLeft(watched, steps) : STR.ads.allDone, 28));
  if (left > 0) {
    const btn = makeButton(scene, 0, ph / 2 - 95, `   ${STR.ads.watch}`, () => {
      showRewardedAd(scene, () => {
        const got = adLadder();
        close();
        if (got?.reward) {
          sfx(scene, 'sfx_coins', CONFIG.audio.coins);
          showPopup(scene, { title: STR.ads.gotTitle, text: got.reward.chests ? STR.ads.gotChest : STR.ads.gotCoins(got.reward.coins), buttons: [{ label: STR.ok }] });
        }
        onChange?.();
        if (!got?.reward) openAdLadder(scene, onChange);
      });
    }, { ...CONFIG.ui.bigButton, color: PAL.adOrange });
    btn.add(makeIcon(scene, 'video', 56).setPosition(-btn.list[btn.list.length - 1].width / 2 - 20, 0));
    box.add(btn);
  }
  return close;
}
