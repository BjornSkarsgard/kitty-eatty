import Phaser from 'phaser';
import { CONFIG } from '../config.js';

// Временная сцена этапа 1: проверка, что Phaser работает и тач доходит.
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    const { width, height } = CONFIG;

    this.add.text(width / 2, height * 0.3, 'Накорми котиков', {
      fontFamily: 'sans-serif', fontSize: '56px', color: '#ffffff',
    }).setOrigin(0.5);

    const square = this.add.rectangle(width / 2, height / 2, 160, 160, 0xff9f43)
      .setStrokeStyle(8, 0x1b1426);

    const hint = this.add.text(width / 2, height * 0.7, 'Тапни по экрану', {
      fontFamily: 'sans-serif', fontSize: '36px', color: '#cfc6e0',
    }).setOrigin(0.5);

    let taps = 0;
    this.input.on('pointerdown', (p) => {
      taps += 1;
      hint.setText(`Тапов: ${taps}`);
      this.tweens.add({ targets: square, x: p.x, y: p.y, duration: 200, ease: 'Quad.easeOut' });
    });
  }
}
