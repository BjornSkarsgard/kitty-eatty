import { CONFIG } from '../config.js';
import { setting, setSetting } from '../save.js';
import { applyMusicSetting } from '../audio.js';
import { settingsMenu } from './ui.js';

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
    { icon: 'music', ...toggle('music', applyMusicSetting) },
    { icon: 'fx', ...toggle('fx', applySettings) },
  ];
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) items.push({ icon: 'vibro', ...toggle('vibro') });
  const actions = onExit ? [{ icon: 'exit', color: CONFIG.ui.exitColor, onTap: onExit }] : [];
  return settingsMenu(scene, CONFIG.width - 62, CONFIG.ui.topY, items, actions);
}
