// Готовые звуки (WAV/MP3/OGG из ElevenLabs и т. п.) → игра: node tools/sound-import.mjs файл.wav [ещё ...] [--peak=-3]
// - обрезает тишину в начале и в конце (конец — с коротким затуханием, без щелчка);
// - выравнивает громкость по пику (--peak, дБ), чтобы все звуки были одного уровня;
// - моно, 44,1 кГц, MP3 → src/assets/audio/<имя>.mp3 (имя берётся из файла).
// Нужен ffmpeg в системе. Громкость конкретного звука в игре крутится в src/config.js.
import { spawnSync } from 'node:child_process';
import { basename, join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'assets', 'audio');
const args = process.argv.slice(2);
const PEAK = Number((args.find((a) => a.startsWith('--peak=')) || '--peak=-3').slice(7));
const SILENCE = '-45dB'; // тише этого — тишина
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.log('Использование: node tools/sound-import.mjs ~/Загрузки/sfx_meow_1.wav [--peak=-3]');
  process.exit(1);
}

// Обрезка тишины с двух сторон: тишина в конце снимается так же, но на перевёрнутом звуке.
const TRIM = [
  `silenceremove=start_periods=1:start_threshold=${SILENCE}:start_silence=0.005`,
  'areverse',
  `silenceremove=start_periods=1:start_threshold=${SILENCE}:start_silence=0.02`,
  'afade=t=in:d=0.015',
  'areverse',
].join(',');

function ffmpeg(params) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-y', ...params], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stderr;
}

for (const file of files) {
  const name = basename(file, extname(file));
  const out = join(OUT, `${name}.mp3`);
  // первый проход: пик после обрезки
  const info = ffmpeg(['-i', file, '-af', `${TRIM},volumedetect`, '-f', 'null', '-']);
  const max = Number(info.match(/max_volume: ([-\d.]+) dB/)[1]);
  const gain = PEAK - max;
  ffmpeg(['-loglevel', 'error', '-i', file, '-af', `${TRIM},volume=${gain.toFixed(2)}dB`,
    '-ac', '1', '-ar', '44100', '-codec:a', 'libmp3lame', '-q:a', '3', out]);
  const dur = ffmpeg(['-i', out, '-f', 'null', '-']).match(/time=(\d+):(\d+):([\d.]+)/g).pop();
  console.log(`${name}.mp3  ${dur.slice(5)}  усиление ${gain >= 0 ? '+' : ''}${gain.toFixed(1)} дБ`);
}
