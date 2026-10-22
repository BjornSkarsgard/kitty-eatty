// Список ассетов собирается при сборке: Vite видит, какие файлы лежат в src/assets.
// Чего нет — того нет в списке, игра рисует временную фигуру или молчит.
const files = import.meta.glob('./assets/**/*.{png,webp,jpg,svg,mp3,ogg}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const ASSETS = { images: {}, svg: {}, audio: {} };

for (const [path, url] of Object.entries(files)) {
  const name = path.split('/').pop().replace(/\.[^.]+$/, '');
  if (/\.(mp3|ogg)$/.test(path)) ASSETS.audio[name] = url;
  else if (/\.svg$/.test(path)) ASSETS.svg[name] = url;
  else ASSETS.images[name] = url;
}

// Что нужно экрану загрузки — грузится первым.
export const LOADING_KEYS = [
  'loading_head', 'music_loading',
  // кот на загрузке собирается из тех же частей, если отдельной loading_head нет
  'cat_head', 'cat_spots_head', 'cat_paw_grip',
  'cat_eyes_open', 'cat_eyes_happy', 'cat_eyes_grumpy', 'cat_eyes_closed',
  'cat_mouth_open', 'cat_mouth_closed',
];

export function queueAssets(load, filter = () => true) {
  for (const [key, url] of Object.entries(ASSETS.images)) if (filter(key)) load.image(key, url);
  for (const [key, url] of Object.entries(ASSETS.svg)) if (filter(key)) load.svg(key, url, { scale: 2 });
  for (const [key, url] of Object.entries(ASSETS.audio)) if (filter(key)) load.audio(key, url);
}
