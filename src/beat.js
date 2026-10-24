// Часы такта музыки: все пульсации в игре берут фазу отсюда, поэтому совпадают с долями трека.
// Темп и момент первой доли — CONFIG.audio.beats[ключ музыки] (считает tools/beat-detect.mjs).
// Позиция берётся у играющей музыки; если музыки нет (выключена, не загрузилась) — идём по таймеру сцены.
import { CONFIG } from './config.js';
import { musicPosition } from './audio.js';

const mod1 = (x) => x - Math.floor(x);

// Время в долях от первой доли трека (дробная часть — фаза текущей доли, 0 — удар).
function beatTime(scene) {
  const B = CONFIG.audio;
  const m = musicPosition();
  const b = m && B.beats[m.key];
  if (b) return ((m.seek - b.offset - B.beatLatency / 1000) * b.bpm) / 60;
  return (scene.time.now / 1000) * (B.beatFallbackBpm / 60);
}

// Фаза 0…1 цикла длиной в beats долей.
export function beatPhase(scene, beats = 1) {
  return mod1(beatTime(scene) / beats);
}

// Огибающая пульса 0…1: 1 на ударе, плавно спадает к середине доли.
export function beatPulse(scene, beats = 1) {
  const c = (Math.cos(beatPhase(scene, beats) * Math.PI * 2) + 1) / 2;
  return Math.pow(c, CONFIG.audio.beatSharpness);
}
