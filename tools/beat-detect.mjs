// Темп и первая доля трека: node tools/beat-detect.mjs src/assets/audio/music_game.mp3
// - ffmpeg раскладывает звук в моно 11025 Гц;
// - огибающая «атак» — рост громкости по кадрам ~23 мс;
// - темп — по автокорреляции огибающей (ищем 70–180 BPM; выше 120 — делим пополам), фаза — сдвиг, при котором
//   доли чаще всего попадают на атаки.
// Результат вписать в CONFIG.audio.beats (игра по нему синхронизирует пульсации с музыкой). Нужен ffmpeg.
import { spawnSync } from 'node:child_process';

const file = process.argv[2];
if (!file) {
  console.log('Использование: node tools/beat-detect.mjs src/assets/audio/music_game.mp3');
  process.exit(1);
}
const RATE = 11025;
const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-ac', '1', '-ar', String(RATE), '-f', 'f32le', '-'],
  { maxBuffer: 1 << 30 });
if (r.status !== 0) throw new Error(String(r.stderr));
const pcm = new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);

const HOP = 256;
const frames = Math.floor(pcm.length / HOP);
const env = new Float32Array(frames);
let prev = 0;
for (let f = 0; f < frames; f++) {
  let e = 0;
  for (let i = f * HOP; i < (f + 1) * HOP; i++) e += pcm[i] * pcm[i];
  const le = Math.log(1e-9 + e);
  env[f] = Math.max(0, le - prev); // только рост громкости
  prev = le;
}
const fps = RATE / HOP;

// темп: автокорреляция огибающей
let best = { bpm: 0, score: -1 };
for (let bpm = 70; bpm <= 180; bpm += 0.05) {
  const lag = (60 / bpm) * fps;
  let s = 0;
  for (let f = 0; f + lag * 4 < frames; f += 2) {
    const v = env[f];
    for (let m = 1; m <= 4; m++) s += v * env[Math.round(f + lag * m)];
  }
  if (s > best.score) best = { bpm, score: s };
}
// двойной темп (хай-хэт на восьмых) — берём основную долю: для пульсаций нужен спокойный ритм
if (best.bpm > 120) best.bpm /= 2;
// фаза: сдвиг, при котором сетка долей собирает больше всего атак (при половинном темпе — сильная доля)
const period = (60 / best.bpm) * fps;
let phase = { off: 0, score: -1 };
for (let off = 0; off < period; off += 0.25) {
  let s = 0;
  for (let t = off; t < frames; t += period) s += env[Math.round(t)] + 0.5 * (env[Math.round(t) + 1] || 0);
  if (s > phase.score) phase = { off, score: s };
}
const bpm = Math.round(best.bpm * 100) / 100;
const offset = Math.round((phase.off / fps) * 1000) / 1000;
console.log(`темп ${bpm} BPM, первая доля ${offset} с, длина трека ${(pcm.length / RATE).toFixed(2)} с`);
console.log(JSON.stringify({ bpm, offset }));
