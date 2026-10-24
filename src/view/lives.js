import { CONFIG } from '../config.js';
import { showPopup } from './Popup.js';
import { lives, livesRefillLeft, buyLife, coins } from '../save.js';
import { sfx } from '../audio.js';

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
    text: `Сгорит 1 жизнь. Сейчас жизней: ${lives()}`,
    buttons: [
      { label: 'Да', color: CONFIG.ui.exitColor, onTap: onYes },
      { label: 'Нет' },
    ],
  });
}

// Жизней нет: купить за монеты (onGot — жизнь появилась), ролик (этап 6), подождать.
export function showNoLives(scene, onGot) {
  const L = CONFIG.lives;
  const buttons = [{
    label: `Купить жизнь за ${L.price}`, color: 0x4caf50, disabled: coins() < L.price,
    onTap: () => { if (buyLife()) { sfx(scene, 'sfx_coins', CONFIG.audio.coins); onGot?.(); } },
  }];
  if (CONFIG.ads.enabled) buttons.push({ label: `Ролик: +${L.adGives} жизни`, color: 0xf0a020, onTap: () => {} }); // этап 6
  buttons.push({ label: 'Подождать' });
  showPopup(scene, {
    title: 'Жизни кончились',
    text: `Все жизни вернутся через ${formatLeft(livesRefillLeft())}\nМонет: ${coins()}`,
    buttons,
  });
}
