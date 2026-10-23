// Звук с защитой от отсутствующих файлов: нет файла — тишина, без ошибок.
import { CONFIG } from './config.js';

const has = (scene, key) => scene.cache.audio.exists(key);

export function sfx(scene, key, volume = 1) {
  if (has(scene, key)) scene.sound.play(key, { volume: CONFIG.audio.sfx * volume });
}

// Случайный из вариантов: sfxRandom(scene, 'sfx_meow', 3) → sfx_meow_1..3. Тот же вариант дважды подряд не играет.
const lastVariant = {};

export function sfxRandom(scene, base, count, volume = 1) {
  const keys = [];
  for (let i = 1; i <= count; i++) if (has(scene, `${base}_${i}`)) keys.push(`${base}_${i}`);
  const pool = keys.length > 1 ? keys.filter((k) => k !== lastVariant[base]) : keys;
  if (!pool.length) return;
  const key = pool[Math.floor(Math.random() * pool.length)];
  lastVariant[base] = key;
  sfx(scene, key, volume);
}

// Одна музыка на всю игру. Зацикливание с перекрёстным затуханием: за loopCrossfade мс до конца
// трека запускается новая копия с начала, старая гаснет. Поэтому трек не обязан идеально
// стыковаться конец-в-начало — шов размывается.
let current = null;

export function music(scene, key) {
  if (current && current.key === key) return;
  stopMusic();
  if (!has(scene, key)) return;
  const mgr = scene.sound;
  const xf = CONFIG.audio.loopCrossfade;
  const state = { key, stopped: false, sound: null, timer: null };
  current = state;

  const startCopy = () => {
    if (state.stopped) return;
    const snd = mgr.add(key, { volume: 0 });
    snd.play();
    snd.setVolume(0); // Phaser до старта отдаёт volume = 1 — без этого музыка начиналась на полной громкости
    state.sound = snd;
    fade(snd, CONFIG.audio.music, xf, null, 0);
    const untilNext = Math.max(1000, snd.duration * 1000 - xf);
    state.timer = setTimeout(() => {
      if (state.stopped) return;
      fade(snd, 0, xf, () => snd.destroy());
      startCopy();
    }, untilNext);
  };
  startCopy();
}

// Сворачивание и возврат в игру. Phaser сам мгновенно приостанавливает звук, и на iOS при возврате на долю
// секунды проигрывается оборванный кусок буфера — «писк». Поэтому паузу делаем сами: сначала плавно в тишину,
// и только когда тишина дошла до динамика — пауза; при возврате — запуск и плавное возвращение громкости.
export function setupAudioFocus(game) {
  const A = CONFIG.audio;
  game.events.once('ready', () => {
    const snd = game.sound;
    if (!snd.context) return; // HTML5 Audio (без WebAudio) — оставляем как есть
    snd.pauseOnBlur = false;
    const ctx = snd.context;
    const gain = snd.masterVolumeNode.gain;
    const GESTURES = ['touchend', 'click', 'pointerup', 'keydown'];
    let timer = null;

    const fadeIn = () => {
      const now = ctx.currentTime;
      gain.cancelScheduledValues(now);
      gain.setValueAtTime(0, now);
      gain.linearRampToValueAtTime(snd.volume, now + A.focusFadeIn / 1000);
    };
    // iOS включает звук только по завершённому касанию (touchend / click), а иногда — не с первого раза.
    // Пробуем на каждом, пока аудиосистема не заработает.
    const tryResume = () => ctx.resume().catch(() => {});
    const listen = (on) => GESTURES.forEach((e) => (on ? document.addEventListener : document.removeEventListener)
      .call(document, e, tryResume, true));
    // Громкость возвращаем, когда аудиосистема сама сообщила, что работает, — неважно, что её запустило.
    ctx.addEventListener('statechange', () => {
      if (ctx.state !== 'running' || document.hidden) return;
      listen(false);
      fadeIn();
    });

    document.addEventListener('visibilitychange', () => {
      const t = ctx.currentTime;
      clearTimeout(timer);
      gain.cancelScheduledValues(t);
      gain.setValueAtTime(gain.value, t);
      if (document.hidden) {
        listen(false);
        gain.linearRampToValueAtTime(0, t + A.focusFadeOut / 1000);
        timer = setTimeout(() => ctx.suspend().catch(() => {}), A.focusFadeOut + A.focusSuspendDelay);
      } else {
        gain.setValueAtTime(0, t);
        if (ctx.state === 'running') fadeIn(); // пауза ещё не успела наступить
        else {
          listen(true);
          tryResume();
        }
      }
    });
  });
}

// Что играет и с какой секунды трека (у свежей копии петли) — для часов такта (beat.js).
export function musicPosition() {
  const snd = current?.sound;
  if (!snd || !snd.isPlaying) return null;
  return { key: current.key, seek: snd.seek };
}

export function stopMusic() {
  if (!current) return;
  const state = current;
  current = null;
  state.stopped = true;
  clearTimeout(state.timer);
  const snd = state.sound;
  if (snd) fade(snd, 0, CONFIG.audio.musicFade, () => snd.destroy());
}

// Плавная громкость на таймере, а не на твинах сцены: переживает перезапуск сцены.
function fade(sound, to, ms, done, from = sound.volume) {
  const start = performance.now();
  const id = setInterval(() => {
    const t = Math.min(1, (performance.now() - start) / ms);
    if (!sound.manager) return clearInterval(id); // уже уничтожен
    sound.setVolume(from + (to - from) * t);
    if (t === 1) {
      clearInterval(id);
      if (done) done();
    }
  }, 30);
}
