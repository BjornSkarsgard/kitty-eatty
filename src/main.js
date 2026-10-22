import * as Phaser from 'phaser';
import { CONFIG } from './config.js';
import { GameScene } from './scenes/GameScene.js';

if (window.__debugLog) window.__debugLog('main.js загружен, Phaser ' + Phaser.VERSION);

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
  scene: [GameScene],
});

// Игра запустилась — отладочный текст больше не нужен.
game.events.once(Phaser.Core.Events.READY, () => {
  const debug = document.getElementById('debug');
  if (debug) debug.hidden = true;
});

// Для отладки из консоли браузера в режиме разработки.
if (import.meta.env.DEV) window.__game = game;
