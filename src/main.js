import * as Phaser from 'phaser';
import { CONFIG } from './config.js';
import { GameScene } from './scenes/GameScene.js';
import { BootScene, PreloadScene } from './scenes/LoadingScenes.js';
import { RoomScene } from './scenes/RoomScene.js';
import { setupAudioFocus } from './audio.js';
import { loadFonts } from './fonts.js';
import { applySettings } from './view/settings.js';

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
});
