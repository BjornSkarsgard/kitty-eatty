// Подготовка PNG на диске: шерсть меняет цвет, альфа и остальные материалы сохраняются.
export const PARTS = ['head', 'body', 'tail', 'leg_l', 'leg_r', 'paw', 'eyes_grumpy', 'eyes_closed'];

export function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max];
}

export function hsv2rgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

const smooth = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
const hueDist = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const furWeight = ([h, s], h0) => (1 - smooth(32, 50, hueDist(h, h0))) * smooth(0.12, 0.3, s);

// Голубой рабочий мастер хорошо отделяется от белого, розового и тёмного контура.
export function blueFurColor({ rgba }, mask = null) {
  let n = 0;
  const acc = [0, 0, 0];
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 250) continue;
    if (mask && (mask.rgba[i] < 128 || mask.rgba[i + 3] < 250)) continue;
    const [h, s, v] = rgb2hsv(rgba[i], rgba[i + 1], rgba[i + 2]);
    if (h > 190 && h < 235 && s > 0.35 && v > 0.5) {
      for (let k = 0; k < 3; k++) acc[k] += rgba[i + k];
      n++;
    }
  }
  if (!n) throw new Error('В мастере нет голубой шерсти; укажите sourceFill или проверьте исходник');
  return rgb2hsv(...acc.map(x => x / n));
}

// Необязательная маска: белое — менять, чёрное — сохранить; альфа маски тоже учитывается.
// Явная маска позволяет позже работать с любым исходным оттенком, а не только голубым.
export function recolorPart(image, sourceHSV, fill, mask = null) {
  if (mask && (mask.w !== image.w || mask.h !== image.h)) throw new Error('Размер маски шерсти не совпадает с частью');
  const [h0, s0, v0] = sourceHSV;
  if (!(s0 > 0 && v0 > 0)) throw new Error('Базовый цвет шерсти должен иметь насыщенность и яркость');
  const [h1, s1, v1] = rgb2hsv((fill >> 16) & 255, (fill >> 8) & 255, fill & 255);
  const rgba = Buffer.from(image.rgba);
  for (let i = 0; i < rgba.length; i += 4) {
    if (!rgba[i + 3]) continue;
    const hsv = rgb2hsv(rgba[i], rgba[i + 1], rgba[i + 2]);
    const [h, s, v] = hsv;
    const w = mask ? mask.rgba[i] / 255 * mask.rgba[i + 3] / 255 : furWeight(hsv, h0);
    if (!w) continue;
    const rgb = hsv2rgb(h1 + (h - h0), Math.min(1, s * s1 / s0), Math.min(1, v * v1 / v0));
    for (let k = 0; k < 3; k++) rgba[i + k] = Math.round(rgba[i + k] * (1 - w) + rgb[k] * w);
  }
  return { w: image.w, h: image.h, rgba };
}
