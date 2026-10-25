import * as Phaser from 'phaser';
import { CONFIG } from './config.js';
import { GameScene } from './scenes/GameScene.js';
import { BootScene, PreloadScene } from './scenes/LoadingScenes.js';
import { RoomScene } from './scenes/RoomScene.js';
import { setupAudioFocus } from './audio.js';
import { loadFonts } from './fonts.js';
import { applySettings } from './view/settings.js';
import { devGive, devSet } from './core/save.js';

// Разработка: ?give=coins2000,chests3,gifts3,tokens1 — начислить в сохранение (один раз: параметр сразу убирается из адреса).
if (import.meta.env.DEV) {
  const url = new URL(location.href);
  const give = url.searchParams.get('give');
  if (give) {
    const n = (key) => Number((give.match(new RegExp(`${key}(\\d+)`)) || [])[1] || 0);
    devGive({ coins: n('coins'), chests: n('chests'), gifts: n('gifts'), tokens: n('tokens') });
    url.searchParams.delete('give');
    history.replaceState(null, '', url);
  }
  // ?set=milestone,chests2,gifts3 (или level25) — выставить точно, см. devSet в src/core/save.js
  const set = url.searchParams.get('set');
  if (set) {
    const n = (key) => { const m = set.match(new RegExp(`${key}(\\d+)`)); return m ? Number(m[1]) : null; };
    devSet({ milestone: /milestone/.test(set), level: n('level') ?? 0, chests: n('chests'), gifts: n('gifts') });
    url.searchParams.delete('set');
    history.replaceState(null, '', url);
  }
}

// Сначала шрифт — иначе первые надписи нарисуются системным.
applySettings();
loadFonts(CONFIG.font).then(() => {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: CONFIG.width,
    height: CONFIG.height,
    backgroundColor: CONFIG.background,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: [BootScene, PreloadScene, GameScene, RoomScene],
  });
  setupAudioFocus(game);

  // Для отладки из консоли браузера в режиме разработки.
  if (import.meta.env.DEV) window.__game = game;
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('fps')) fpsMeter();
});

// Разработка: ?fps — в углу экрана кадры в секунду сейчас и худшее за последние 5 секунд (по requestAnimationFrame).
function fpsMeter() {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed', right: '4px', bottom: '4px', padding: '4px 8px', zIndex: 20, pointerEvents: 'none',
    font: 'bold 14px monospace', color: '#fff', background: 'rgba(0,0,0,.6)', borderRadius: '6px',
  });
  document.body.appendChild(box);
  const seconds = []; // кадров в каждую из последних секунд
  let frames = 0;
  let start = performance.now();
  const tick = (now) => {
    frames++;
    if (now - start >= 1000) {
      seconds.push(Math.round((frames * 1000) / (now - start)));
      if (seconds.length > 5) seconds.shift();
      box.textContent = `FPS ${seconds[seconds.length - 1]} · мин ${Math.min(...seconds)}`;
      frames = 0;
      start = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
