// Фон карты главы → бесшовный по вертикали (повторяется по высоте главы без шва):
// node tools/seamless-v.mjs исходник.png src/assets/map_bg_N.jpg [--cut=H] [--blend=B] [--width=720]
// - cut — сколько строк исходника оставить сверху (низ с крупной деталью, которая не сошьётся, — отрезать);
// - blend — высота полосы, где верх плавно переходит в низ: тайл = cut − blend строк, его верхние blend строк —
//   смесь верха исходника и строк ниже тайла, так что низ тайла продолжается его же верхом;
// - результат — JPEG шириной width. Нужен ffmpeg.
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const opt = (k, d) => Number((args.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split('=')[1]);
const [src, out] = args.filter((a) => !a.startsWith('--'));
if (!src || !out) {
  console.log('Использование: node tools/seamless-v.mjs исходник.png src/assets/map_bg_N.jpg [--cut=H] [--blend=B] [--width=720]');
  process.exit(1);
}
const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', src]);
const [w, h] = String(probe.stdout).trim().split(',').map(Number);
const cut = opt('cut', h);
const blend = opt('blend', 240);
const width = opt('width', 720);
const raw = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', src, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 30 }).stdout;
const tileH = cut - blend;
const tile = Buffer.alloc(w * tileH * 3);
for (let y = 0; y < tileH; y++) {
  for (let x = 0; x < w * 3; x++) {
    const a = raw[y * w * 3 + x];
    if (y >= blend) { tile[y * w * 3 + x] = a; continue; }
    const b = raw[(y + tileH) * w * 3 + x]; // та же строка «после» тайла — её продолжение снизу
    const t = y / blend; // сверху — нижний кусок, к низу полосы — родной верх
    tile[y * w * 3 + x] = Math.round(b * (1 - t) + a * t);
  }
}
const enc = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${w}x${tileH}`, '-i', '-',
  '-vf', `scale=${width}:-2:flags=lanczos`, '-q:v', '3', out], { input: tile });
if (enc.status !== 0) throw new Error(String(enc.stderr));
console.log(`${out}: тайл ${w}×${tileH} → ширина ${width}`);
