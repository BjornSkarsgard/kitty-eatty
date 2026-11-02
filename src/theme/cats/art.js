// Полный набор породы выбирается целиком: при недостающем слое остаётся обычный кот.
// Цвет хранится отдельно от породы; сохранения и доступность окрасов не меняются.
const PARTS = ['head', 'body', 'tail', 'leg_l', 'leg_r', 'paw', 'eyes_grumpy', 'eyes_closed'];
const SHARED = ['eyes_open', 'eyes_happy', 'mouth_open', 'mouth_closed'];

export function catArt(textures, color, breed = null) {
  const prefix = `cat_${breed}_${color}`;
  const shared = `cat_${breed}_`;
  const complete = breed && PARTS.every(part => textures.exists(`${prefix}_${part}`))
    && SHARED.every(part => textures.exists(`${shared}${part}`));
  return complete ? { prefix, shared } : { prefix: `cat_${color}`, shared: '' };
}

export const catHeadKey = (textures, color, breed = null) => `${catArt(textures, color, breed).prefix}_head`;
