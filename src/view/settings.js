import { CONFIG } from '../config.js';
import { setting, setSetting } from '../save.js';
import { applyMusicSetting } from '../audio.js';
import { showPopup } from './Popup.js';

// Переключатели в окне настроек. fx — свечения и пульсации (CONFIG.fx.enabled), для слабых телефонов.
const ITEMS = [
  { key: 'sound', name: 'Звуки' },
  { key: 'music', name: 'Музыка' },
  { key: 'fx', name: 'Эффекты' },
];

// Применить сохранённые настройки при запуске.
export function applySettings() {
  CONFIG.fx.enabled = setting('fx');
}

const label = (it) => `${it.name}: ${setting(it.key) ? 'вкл' : 'выкл'}`;

export function openSettings(scene) {
  const buttons = ITEMS.map((it) => ({
    label: label(it),
    keep: true,
    color: 0x7b5cf0,
    onTap: (btn) => {
      setSetting(it.key, !setting(it.key));
      if (it.key === 'music') applyMusicSetting();
      if (it.key === 'fx') applySettings();
      btn.setLabel(label(it));
    },
  }));
  buttons.push({ label: 'Готово', color: 0x4caf50 });
  showPopup(scene, { title: 'Настройки', buttons });
}
