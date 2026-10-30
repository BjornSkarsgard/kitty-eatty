import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { panel, plate, trackWindow, iconButton } from './ui.js';
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
  // окно по высоте текста: сверху голова и название, ниже текст, под ним кнопка (между верхней полосой и вкладками)
  const box = add(scene.add.container(W / 2, H / 2 - 10));
  const pw = 600;
  const body = scene.add.text(0, 0, `${STR.ultraInfo(u.ultName, u.ultText, u.boostText)}\n\n${STR.ultraIntroWhen(u.gift)}`, {
    fontFamily: font, fontStyle: 'bold', fontSize: '26px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 6,
    align: 'center', wordWrap: { width: pw - 70 },
  }).setOrigin(0.5, 0);
  const headH = 190;
  const ph = 60 + headH + 70 + body.height + 40 + 150; // отступ, голова, название, текст, зазор, кнопка
  const top = -ph / 2;
  box.add(panel(scene, pw + 20, ph + 20));
  box.add(plate(scene, 0, top + 4, STR.ultraIntroTitle, { depth: 0, color: PAL.plate }).setScale(1.1));
  const file = CONFIG.skins.find((k) => k.id === u.look).file;
  const hy = top + 60 + headH / 2;
  const head = scene.add.image(0, hy, `cat_${file}_head`);
  head.setScale(headH / Math.max(head.width, head.height)).setTint(PAL.silhouette);
  const q = scene.add.text(0, hy, '?', {
    fontFamily: font, fontStyle: 'bold', fontSize: '100px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 12,
  }).setOrigin(0.5);
  const name = scene.add.text(0, top + 60 + headH + 35, u.name, {
    fontFamily: font, fontStyle: 'bold', fontSize: '48px', color: PAL.textGold, stroke: PAL.textStroke, strokeThickness: 10,
  }).setOrigin(0.5);
  body.setY(top + 60 + headH + 70);
  box.add([head, q, name, body]);
  let untrack = null;
  const finish = () => {
    if (!untrack) return;
    untrack();
    untrack = null;
    parts.forEach((o) => o.destroy());
    onDone?.();
  };
  untrack = trackWindow(scene, finish);
  box.add(makeButton(scene, 0, ph / 2 - 90, STR.ultraIntroOk, finish, { ...CONFIG.ui.bigButton, skin: 'green' }));
  box.add(iconButton(scene, pw / 2 - 26, top + 4, 'close', finish, { size: 84, shape: 'round', color: CONFIG.ui.exitColor, depth: 0 }));
  sfx(scene, 'sfx_popup', CONFIG.audio.popup);
  box.setScale(0.5).setAlpha(0);
  scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: head, scale: head.scale * 1.05, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
}
