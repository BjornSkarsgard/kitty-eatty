// Все числа игры, которые имеет смысл крутить руками.
// Все настройки игры одним объектом CONFIG — собраны из трёх частей:
//   config/balance.js      — баланс и экономика;
//   config/layout.js       — раскладка экранов, интерфейс, звук;
//   theme/cats/config.js   — всё про котиков.
// Анимации (anim) — общие из layout и кошачьи из темы вместе.
import { BALANCE } from './config/balance.js';
import { LAYOUT } from './config/layout.js';
import { CATS } from './theme/cats/config.js';

export const CONFIG = { ...BALANCE, ...LAYOUT, ...CATS, anim: { ...LAYOUT.anim, ...CATS.anim } };
