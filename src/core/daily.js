// Награды за вход: что даёт день серии N (с 1). Считается из CONFIG.dailyLogin, игра ничего не хранит про таблицу.
// Возвращает { coins, undos, jars, infiniteMin, chests } — чего нет, то 0.
import { CONFIG } from '../config.js';

const D = CONFIG.dailyLogin;

// Ценность дня в монетах: растёт линейно до capDay.
export const dailyValue = (n) => D.base + D.step * (Math.min(n, D.capDay) - 1);

export function dailyReward(n) {
  const v = dailyValue(n);
  const r = { coins: 0, undos: 0, jars: 0, infiniteMin: 0, chests: 0 };
  const pos = ((n - 1) % 7) + 1; // день недели серии
  if (pos === 2) r.undos = Math.max(1, Math.round(v / CONFIG.economy.undoPrice));
  else if (pos === 4) r.infiniteMin = Math.max(15, Math.round(v / D.coinsPerMinute / 15) * 15);
  else if (pos === 6) r.jars = Math.max(1, Math.round(v / CONFIG.boosters.jar.price));
  else if (pos === 7) {
    r.chests = 1;
    r.coins = Math.max(0, Math.round((v - D.chestValue) / 10) * 10);
  } else r.coins = v;
  return r;
}
