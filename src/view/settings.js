import { CONFIG } from '../config.js';
import { setting, setSetting } from '../core/save.js';
import { applyMusicSetting, gameMusic } from '../audio.js';
import { settingsMenu } from './ui.js';
import { showPopup } from './Popup.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Применить сохранённые настройки при запуске. fx — свечения и пульсации (CONFIG.fx.enabled), для слабых телефонов.
export function applySettings() {
  CONFIG.fx.enabled = setting('fx');
}

const toggle = (key, after) => ({
  get: () => setting(key),
  set: (v) => { setSetting(key, v); after?.(); },
});

// Шестерёнка справа сверху со столбиком переключателей. Вибрация — только где телефон её умеет (Android);
// onExit — красная кнопка «выход» (в игре — домой).
export function addSettingsMenu(scene, { onExit } = {}) {
  const items = [
    { icon: 'sound', ...toggle('sound') },
    { icon: 'music', get: () => setting('music'), onTap: (refresh) => pickMusic(scene, refresh) },
    { icon: 'fx', ...toggle('fx', applySettings) },
  ];
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) items.push({ icon: 'vibro', ...toggle('vibro') });
  const actions = onExit ? [{ icon: 'exit', color: CONFIG.ui.exitColor, onTap: onExit }] : [];
  return settingsMenu(scene, CONFIG.width - 62, CONFIG.ui.topY, items, actions);
}

// Окно «Музыка»: треки CONFIG.audio.tracks и «Без музыки»; выбранный — с галочкой и зелёный. Выбор — сразу играет
// (старый трек плавно гаснет), окно закрывается. refresh — перекрасить кнопку музыки в меню.
function pickMusic(scene, refresh) {
  const on = setting('music');
  const pick = (track) => {
    setSetting('music', !!track);
    if (track) setSetting('track', track);
    applyMusicSetting();
    if (track) gameMusic(scene);
    refresh();
  };
  const row = (label, chosen, track) => ({ label: chosen ? `✓ ${label}` : label, color: chosen ? PAL.buyGreen : undefined, onTap: () => pick(track) });
  showPopup(scene, {
    title: STR.musicTitle,
    buttons: [
      ...CONFIG.audio.tracks.map((k) => row(STR.tracks[k], on && setting('track') === k, k)),
      row(STR.musicOff, !on, null),
    ],
  });
}
