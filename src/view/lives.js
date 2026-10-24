import { CONFIG } from '../config.js';
import { showPopup } from './Popup.js';
import { lives, livesRefillLeft, buyLife, coins } from '../core/save.js';
import { sfx } from '../audio.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Окна про жизни: предупреждение «сгорит 1 жизнь» и «жизни кончились».

// 5:42:07 — сколько осталось до полных жизней.
export function formatLeft(ms) {
  const t = Math.ceil(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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

// Жизней нет: купить за монеты (onGot — жизнь появилась), ролик (этап 6), подождать.
export function showNoLives(scene, onGot) {
  const L = CONFIG.lives;
  const buttons = [{
    label: STR.buyLife(L.price), color: PAL.buyGreen, disabled: coins() < L.price,
    onTap: () => { if (buyLife()) { sfx(scene, 'sfx_coins', CONFIG.audio.coins); onGot?.(); } },
  }];
  if (CONFIG.ads.enabled) buttons.push({ label: STR.adLives(L.adGives), color: PAL.adOrange, onTap: () => {} }); // этап 6
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
