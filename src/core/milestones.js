// Рубежи на карте («Путешествие»): после каких уровней и что дают. Правило — CONFIG.milestones,
// список строится один раз при запуске. Награда: { coins, undos, chests, infiniteMin } (чего нет — 0).
import { CONFIG } from '../config.js';

const M = CONFIG.milestones;
const CHAPTER = CONFIG.levelGen.chapter;

function build() {
  const list = [];
  let k = 0; // номер обычного рубежа — по нему идёт круг наград
  for (let id = 1; id <= CONFIG.levelGen.count; id++) {
    if (id % (id <= M.until ? M.every : M.thenEvery) !== 0) continue;
    const reward = { coins: 0, undos: 0, chests: 0, infiniteMin: 0 };
    const chapter = id % CHAPTER === 0;
    if (chapter) {
      reward.chests = M.chapter.chests;
      reward.infiniteMin = M.chapter.infiniteMin;
    } else {
      const kind = M.cycle[k++ % M.cycle.length];
      if (kind === 'coins') reward.coins = M.coins + M.coinsPer100Levels * Math.floor(id / 100);
      if (kind === 'undos') reward.undos = M.undos;
      if (kind === 'infinite') reward.infiniteMin = id >= M.infiniteLongFrom ? M.infiniteLongMin : M.infiniteMin;
    }
    list.push({ id, chapter, reward });
  }
  return list;
}

export const MILESTONES = build();

// Рубеж после уровня с этим id (или undefined).
export const milestoneAt = (id) => MILESTONES.find((m) => m.id === id);
