import { CONFIG } from '../config.js';
import { showPopup } from './Popup.js';
import { lives, livesRefillLeft, buyLife, coins } from '../core/save.js';
import { sfx } from '../audio.js';
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

// Жизней нет: ролик (этап 6), подождать (onGot — жизнь появилась). За монеты — только запасной путь,
// когда ролик показать нельзя: пока реклама выключена, кнопка есть всегда; на этапе 6 — при ошибке ролика.
export function showNoLives(scene, onGot) {
  const L = CONFIG.lives;
  const buttons = [];
  if (CONFIG.ads.enabled) buttons.push({ label: STR.adLives(L.adGives), color: PAL.adOrange, onTap: () => {} }); // этап 6
  else {
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
