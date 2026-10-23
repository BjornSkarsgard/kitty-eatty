import cyrillic from './assets/fonts/balsamiq-sans-700-cyrillic.woff2?url';
import latin from './assets/fonts/balsamiq-sans-700-latin.woff2?url';

// Шрифт лежит в проекте (Cordova и плохой интернет — без CDN). Phaser рисует текст на canvas,
// поэтому шрифт надо загрузить до первой надписи, иначе она нарисуется системным.
const FACES = [
  { url: cyrillic, unicodeRange: 'U+0301, U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116' },
  { url: latin, unicodeRange: 'U+0000-00FF, U+2000-206F, U+20AC, U+2122, U+2212' },
];

// Не дольше timeout мс: если шрифт не загрузился, игра всё равно стартует (с системным).
export function loadFonts(family, timeout = 3000) {
  if (typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve();
  const all = FACES.map(({ url, unicodeRange }) => {
    const face = new FontFace(family, `url(${url}) format('woff2')`, { weight: '700', unicodeRange });
    document.fonts.add(face);
    return face.load();
  });
  const wait = new Promise((resolve) => setTimeout(resolve, timeout));
  return Promise.race([Promise.all(all), wait]).catch(() => {});
}
