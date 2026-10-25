// Вибро-отклик: haptic('pick') → navigator.vibrate(CONFIG.haptics.pick). Работает в браузере Android (Chrome, Яндекс
// Браузер) и позже в Cordova; на iOS и десктопе API нет — молча ничего не делает. Выключается в настройках («Вибрация»).
import { CONFIG } from './config.js';
import { setting } from './core/save.js';

export function haptic(kind) {
  if (!CONFIG.haptics.on || !setting('vibro')) return;
  const p = CONFIG.haptics[kind];
  if (!p || typeof navigator === 'undefined' || !navigator.vibrate) return;
  try { navigator.vibrate(p); } catch { /* браузер запретил — без вибрации */ }
}
