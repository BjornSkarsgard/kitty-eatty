import { CONFIG } from '../config.js';
import { showPopup } from './Popup.js';
import { lives, livesRefillLeft, buyLife, coins, adsState, adLife } from '../core/save.js';
import { sfx } from '../audio.js';
import { showRewardedAd, rewardedReady } from '../rewarded.js';
import { openCoinPacks } from './ShopView.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Окна про жизни: предупреждение «сгорит 1 жизнь» и «жизни кончились».

// 29:07 (или 1:05:07, если больше часа) — сколько осталось до следующей жизни.
export function formatLeft(ms) {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const ms2 = `${String(m).padStart(h ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
  return h ? `${h}:${ms2}` : ms2;
}

// Предупреждение перед тратой жизни: «Да» — onYes (жизнь сжигает вызывающий), «Нет» — ничего.
export function confirmLife(scene, title, onYes) {
  showPopup(scene, {
    title,
    text: STR.lifeWillBurn(lives(), CONFIG.lives.max),
    buttons: [
      { label: STR.yes, color: CONFIG.ui.exitColor, onTap: onYes },
      { label: STR.no },
    ],
  });
}

// Жизней нет: жизнь за ролик (если ролик готов и лимит CONFIG.ads.life не исчерпан), купить за монеты,
// подождать (onGot — жизнь появилась).
export function showNoLives(scene, onGot) {
  const L = CONFIG.lives;
  const buttons = [];
  const st = adsState();
  if (rewardedReady() && st.livesLeft > 0 && !st.lifeWait) {
    buttons.push({
      label: STR.adLife, color: PAL.adOrange,
      onTap: () => showRewardedAd(scene, () => { if (adLife()) { sfx(scene, 'sfx_coins', CONFIG.audio.coins); onGot?.(); } }),
    });
  }
  {
    buttons.push({
      label: STR.buyLife(L.price), color: PAL.buyGreen, keep: true,
      onTap: () => {
        if (coins() < L.price) return openCoinPacks(scene); // монет не хватает — окно монет поверх, это остаётся
        if (!buyLife()) return;
        popup();
        sfx(scene, 'sfx_coins', CONFIG.audio.coins);
        onGot?.();
      },
    });
  }
  buttons.push({ label: STR.wait });
  const text = () => STR.livesBackIn(formatLeft(livesRefillLeft()), coins());
  const popup = showPopup(scene, { title: STR.noLivesTitle, text: text(), buttons });
  // таймер тикает; дотикал — жизни вернулись: окно закрывается, и дальше как после покупки
  const tick = scene.time.addEvent({
    delay: 1000, loop: true,
    callback: () => {
      if (!popup.isOpen()) return tick.remove();
      if (lives() > 0) { tick.remove(); popup(); return onGot?.(); }
      popup.setText(text());
    },
  });
}
