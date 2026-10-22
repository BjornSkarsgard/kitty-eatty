import './shims.js';
import * as Phaser from 'phaser';
import { CONFIG } from './config.js';
import { BootScene } from './scenes/BootScene.js';

if (window.__debugLog) window.__debugLog('main.js загружен, Phaser ' + Phaser.VERSION);

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: CONFIG.width,
  height: CONFIG.height,
  backgroundColor: CONFIG.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene],
});
