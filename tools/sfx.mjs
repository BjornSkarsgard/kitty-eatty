// Синтез простых звуков игры: node tools/sfx.mjs [имя ...]
// - каждый звук — короткая формула (синус, шум, огибающая), никаких сэмплов и лицензий;
// - результат: src/assets/audio/<имя>.mp3 (через ffmpeg, он должен быть в системе);
// - без аргументов пересобирает все, с аргументами — только названные (sfx_pick sfx_drop …).
// Мяуканье не синтезируется: живое звучит в разы лучше (freesound CC0 или Suno).
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'src', 'assets', 'audio');
const SR = 44100;

// ---------- кирпичики ----------

const buf = (sec) => new Float32Array(Math.round(sec * SR));
// огибающая: быстрая атака, экспоненциальное затухание
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));
// частота, плавно меняющаяся от f0 к f1 за время dur
const sweep = (t, f0, f1, dur) => f0 * Math.pow(f1 / f0, Math.min(t / dur, 1));

// Синус с меняющейся частотой: freq(t) → Гц. Фаза копится, чтобы не было щелчков.
function tone(out, start, dur, freq, amp, attack, decay) {
  let ph = 0;
  const s0 = Math.round(start * SR);
  for (let i = 0; i < dur * SR && s0 + i < out.length; i++) {
    const t = i / SR;
    ph += (2 * Math.PI * freq(t)) / SR;
    out[s0 + i] += Math.sin(ph) * amp * env(t, attack, decay);
  }
}

// Колокольчик: основной тон + негармоничные обертоны, высокие гаснут быстрее.
function bell(out, start, f, amp, decay) {
  for (const [k, a, d] of [[1, 1, 1], [2.76, 0.35, 0.5], [5.4, 0.15, 0.25], [8.9, 0.06, 0.15]]) {
    tone(out, start, decay * d * 6, () => f * k, amp * a, 0.002, decay * d);
  }
}

// Шум через простые фильтры (одно-полюсные): lp — срез сверху, hp — снизу. Частоты могут меняться во времени.
function noise(out, start, dur, amp, attack, decay, lp = () => 20000, hp = () => 20) {
  let l = 0, h = 0, prev = 0;
  const s0 = Math.round(start * SR);
  for (let i = 0; i < dur * SR && s0 + i < out.length; i++) {
    const t = i / SR;
    const x = Math.random() * 2 - 1;
    l += (1 - Math.exp((-2 * Math.PI * lp(t)) / SR)) * (x - l);
    const ah = Math.exp((-2 * Math.PI * hp(t)) / SR);
    h = ah * (h + l - prev);
    prev = l;
    out[s0 + i] += h * amp * env(t, attack, decay);
  }
}

// Нормализация до пика peak и короткое затухание в самом конце (без щелчка).
function finish(out, peak) {
  let m = 0;
  for (const v of out) m = Math.max(m, Math.abs(v));
  const k = m ? peak / m : 0;
  const tail = Math.min(out.length, Math.round(0.01 * SR));
  for (let i = 0; i < out.length; i++) {
    const fade = i > out.length - tail ? (out.length - i) / tail : 1;
    out[i] *= k * fade;
  }
  return out;
}

// ---------- звуки ----------
// peak — громкость файла (0..1). Общую громкость эффектов лучше крутить в src/config.js (audio.sfx).

const SOUNDS = {
  // подняли порцию: короткий «поп» вверх
  sfx_pick() {
    const o = buf(0.12);
    tone(o, 0, 0.12, (t) => sweep(t, 380, 900, 0.05), 1, 0.003, 0.03);
    return finish(o, 0.6);
  },
  // порция легла: мягкий «плюх» вниз + стук
  sfx_drop() {
    const o = buf(0.18);
    tone(o, 0, 0.18, (t) => sweep(t, 520, 170, 0.08), 1, 0.002, 0.045);
    noise(o, 0, 0.03, 0.3, 0.001, 0.006, () => 3000);
    return finish(o, 0.6);
  },
  // так нельзя: два глухих низких «бамп»
  sfx_invalid() {
    const o = buf(0.3);
    for (const s of [0, 0.12]) tone(o, s, 0.15, (t) => sweep(t, 150, 95, 0.1), 1, 0.004, 0.04);
    return finish(o, 0.45);
  },
  // банка собрана: два колокольчика, второй на квинту выше
  sfx_complete() {
    const o = buf(0.9);
    bell(o, 0, 1318, 1, 0.12);   // ми
    bell(o, 0.08, 1976, 0.9, 0.16); // си
    return finish(o, 0.55);
  },
  // кнопка: сухой клик
  sfx_button() {
    const o = buf(0.05);
    noise(o, 0, 0.01, 0.6, 0.0005, 0.002, () => 8000, () => 1500);
    tone(o, 0, 0.05, () => 1600, 0.5, 0.001, 0.008);
    return finish(o, 0.5);
  },
  // отмена: «вжух» — шум, уходящий сверху вниз
  sfx_undo() {
    const o = buf(0.28);
    noise(o, 0, 0.28, 1, 0.08, 0.07, (t) => sweep(t, 6000, 600, 0.25), () => 300);
    tone(o, 0, 0.25, (t) => sweep(t, 700, 300, 0.22), 0.25, 0.05, 0.06);
    return finish(o, 0.5);
  },
  // кот жуёт: три хрустящих щелчка с разной высотой
  sfx_chew() {
    const o = buf(0.7);
    [[0, 2600], [0.22, 2000], [0.43, 2300]].forEach(([s, f]) => {
      for (let k = 0; k < 4; k++) {
        noise(o, s + k * 0.018 + Math.random() * 0.01, 0.05, 1 - k * 0.2, 0.001, 0.008, () => f * 2, () => f / 2);
      }
    });
    return finish(o, 0.5);
  },
  // наелся: мурлыканье — низкий шум, пульсирующий ~25 раз в секунду, вдох-выдох
  sfx_purr() {
    const dur = 1.6;
    const o = buf(dur);
    noise(o, 0, dur, 1, 0.001, 100, () => 400, () => 40);
    tone(o, 0, dur, () => 55, 0.4, 0.001, 100);
    for (let i = 0; i < o.length; i++) {
      const t = i / SR;
      const pulse = Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * 25 * t), 2);
      const breath = Math.sin(Math.PI * ((t % 0.8) / 0.8)) ** 0.7; // два «вдоха»
      o[i] *= pulse * breath;
    }
    return finish(o, 0.6);
  },
  // джингл победы: арпеджио до-ми-соль-до вверх и аккорд в конце
  music_win() {
    const o = buf(2.4);
    const C5 = 523.25;
    [1, 1.26, 1.5].forEach((k, i) => bell(o, i * 0.13, C5 * k, 0.8, 0.12));
    for (const k of [2, 2.52, 3]) bell(o, 0.42, C5 * k, 0.55, 0.3);
    tone(o, 0.42, 1.8, () => C5, 0.25, 0.01, 0.5); // мягкий низ под аккордом
    return finish(o, 0.6);
  },
};

// ---------- запись ----------

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SOUNDS);
for (const name of names) {
  if (!SOUNDS[name]) { console.log(`нет такого звука: ${name}`); continue; }
  const pcm = SOUNDS[name]();
  const out = join(OUT, `${name}.mp3`);
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'f32le', '-ar', String(SR), '-ac', '1', '-i', 'pipe:0',
    '-codec:a', 'libmp3lame', '-q:a', '4', out], { input: Buffer.from(pcm.buffer) });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
  console.log(`${name}.mp3  ${(pcm.length / SR).toFixed(2)} с`);
}
