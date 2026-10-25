import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { panel, plate } from './ui.js';
import { sfx } from '../audio.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Знакомство с ультракотом (после CONFIG.ultraIntroLevel): тёмный силуэт головы, название породы, ульта и умения,
// «Будет доступен на N уровне», кнопка. Голова — пока окраса-замены (look), своего арта нет. onDone — после кнопки.
export function showUltraIntro(scene, u, onDone) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const depth = 60;
  const font = `"${CONFIG.font}", sans-serif`;
  const parts = [];
  const add = (o) => { parts.push(o); return o.setDepth(depth).setScrollFactor(0); };
  add(scene.add.rectangle(W / 2, H / 2, W, H, PAL.dim, 0.82).setInteractive()); // тапы не проходят вниз
  const box = add(scene.add.container(W / 2, H / 2));
  const pw = 560;
  const ph = 960;
  box.add(panel(scene, pw + 20, ph + 20));
  box.add(plate(scene, 0, -ph / 2 + 4, STR.ultraIntroTitle, { depth: 0, color: PAL.plate }).setScale(1.1));
  const file = CONFIG.skins.find((k) => k.id === u.look).file;
  const head = scene.add.image(0, -250, `cat_${file}_head`);
  head.setScale(230 / Math.max(head.width, head.height)).setTint(PAL.silhouette);
  const q = scene.add.text(0, -250, '?', {
    fontFamily: font, fontStyle: 'bold', fontSize: '120px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 14,
  }).setOrigin(0.5);
  const name = scene.add.text(0, -95, u.name, {
    fontFamily: font, fontStyle: 'bold', fontSize: '52px', color: PAL.textGold, stroke: PAL.textStroke, strokeThickness: 10,
  }).setOrigin(0.5);
  const body = scene.add.text(0, -45, `${STR.ultraInfo(u.ultName, u.ultText, u.boostText)}\n\n${STR.ultraIntroWhen(u.gift)}`, {
    fontFamily: font, fontStyle: 'bold', fontSize: '28px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 6,
    align: 'center', wordWrap: { width: pw - 80 },
  }).setOrigin(0.5, 0); // сверху вниз под названием
  box.add([head, q, name, body]);
  box.add(makeButton(scene, 0, ph / 2 - 80, STR.ultraIntroOk, () => {
    parts.forEach((o) => o.destroy());
    onDone?.();
  }, { ...CONFIG.ui.bigButton, skin: 'green' }));
  sfx(scene, 'sfx_popup', CONFIG.audio.popup);
  box.setScale(0.5).setAlpha(0);
  scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: head, scale: head.scale * 1.05, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
}
