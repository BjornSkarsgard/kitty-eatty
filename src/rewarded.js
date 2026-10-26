// Ролик за награду. Настоящая реклама (Yandex Mobile Ads / SDK Яндекс Игр) — этап 6, пока CONFIG.ads.enabled выключен:
// в тестовой сборке вместо ролика окно «тестовая реклама» (награда начисляется), в обычной — «скоро».
// onReward — только когда ролик досмотрен; onFail — не загрузился или оборвался (игра не ждёт, награды нет).
import { CONFIG } from './config.js';
import { TEST_TOOLS } from './dev.js';
import { showPopup } from './view/Popup.js';
import { STR } from './theme/cats/strings.ru.js';
import { PALETTE as PAL } from './theme/cats/palette.js';

// Ролик грузится заранее (preloadRewarded — на старте уровня и после каждого показа), а кнопки «за ролик» (бегунок
// в окне победы) показываются, только если он уже готов (rewardedReady). Этап 6: здесь — загрузка через SDK и его
// событие «загружен»; пока готов всегда только в тестовой сборке.
let ready = false;

export function preloadRewarded() {
  if (ready) return;
  if (CONFIG.ads.enabled) return; // этап 6: SDK.load(), по событию «загружен» — ready = true
  ready = TEST_TOOLS;
}

export const rewardedReady = () => ready;

export function showRewardedAd(scene, onReward, onFail) {
  ready = false; // показали — этот ролик израсходован, следующий грузим сразу
  const reward = onReward;
  onReward = () => { preloadRewarded(); reward(); };
  const fail = onFail;
  onFail = () => { preloadRewarded(); fail?.(); };
  if (CONFIG.ads.enabled) return onReward(); // этап 6: здесь будет вызов SDK (ошибка или обрыв — onFail)
  if (TEST_TOOLS) {
    // тест: «Досмотрел» — как досмотренный ролик, «Не досмотрел» (и тап мимо окна) — как оборванный
    let done = false;
    return showPopup(scene, {
      title: STR.ads.testTitle,
      text: STR.ads.testText,
      buttons: [
        { label: STR.ads.testDone, color: PAL.adOrange, onTap: () => { done = true; onReward(); } },
        { label: STR.ads.testSkip, onTap: () => { done = true; onFail?.(); } },
      ],
      onClose: () => queueMicrotask(() => { if (!done) onFail?.(); }), // кнопка вызывается после закрытия окна
    });
  }
  showPopup(scene, { title: STR.ads.soonTitle, text: STR.ads.soonText, buttons: [{ label: STR.ok }] });
  onFail?.();
}
