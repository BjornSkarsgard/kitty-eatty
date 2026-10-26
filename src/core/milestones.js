// Рубежи на карте («Путешествие»): после каких уровней и что дают. Правило — CONFIG.milestones,
// список строится один раз при запуске. Награда: { coins, undos, hints, lives, chests, infiniteMin } (чего нет — 0).
import { CONFIG } from '../config.js';

const M = CONFIG.milestones;
const CHAPTER = CONFIG.levelGen.chapter;

function build() {
  const list = [];
  let k = 0; // номер рубежа середины главы — по нему идёт круг наград
  for (let id = M.every; id <= CONFIG.levelGen.count; id += M.every) {
    const chapter = id % CHAPTER === 0;
    const reward = { coins: 0, undos: 0, hints: 0, lives: 0, chests: 0, infiniteMin: 0, ...(chapter ? M.chapter : M.cycle[k++ % M.cycle.length]) };
    if (id === M.firstChest) reward.chests += 1;
    list.push({ id, chapter, reward });
  }
  return list;
}

export const MILESTONES = build();

// Рубеж после уровня с этим id (или undefined).
export const milestoneAt = (id) => MILESTONES.find((m) => m.id === id);
