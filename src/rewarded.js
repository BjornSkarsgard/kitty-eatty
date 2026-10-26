// Ролик за награду. Настоящая реклама (Yandex Mobile Ads / SDK Яндекс Игр) — этап 6, пока CONFIG.ads.enabled выключен:
// в тестовой сборке вместо ролика окно «тестовая реклама» (награда начисляется), в обычной — «скоро».
// onReward — только когда ролик досмотрен; не загрузился или закрыли раньше — ничего, игра не ждёт.
import { CONFIG } from './config.js';
import { TEST_TOOLS } from './dev.js';
import { showPopup } from './view/Popup.js';
import { STR } from './theme/cats/strings.ru.js';
import { PALETTE as PAL } from './theme/cats/palette.js';

export function showRewardedAd(scene, onReward) {
  if (CONFIG.ads.enabled) return onReward(); // этап 6: здесь будет вызов SDK
  if (TEST_TOOLS) {
    return showPopup(scene, {
      title: STR.ads.testTitle,
      text: STR.ads.testText,
      buttons: [{ label: STR.ads.testDone, color: PAL.adOrange, onTap: onReward }, { label: STR.ads.testSkip }],
    });
  }
  showPopup(scene, { title: STR.ads.soonTitle, text: STR.ads.soonText, buttons: [{ label: STR.ok }] });
}
