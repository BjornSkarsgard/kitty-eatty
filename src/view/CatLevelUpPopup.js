import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { plate, makeIcon, panel } from './ui.js';
import { sfx } from '../audio.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Окно «Новый уровень кота!»: кружок с номером, награды, «Забрать». Награды уже начислены при победе —
// здесь их только показываем; onTake — обновить счётчики. Несколько уровней подряд — несколько окон по очереди.
// fxStars — частицы-звёздочки сцены.
export function showCatLevelUps(scene, ups, { fxStars, onTake }) {
  const up = ups[0];
  if (!up) return;
  const W = CONFIG.width;
  const H = CONFIG.height;
  const font = `"${CONFIG.font}", sans-serif`;
  const shade = scene.add.rectangle(W / 2, H / 2, W, H, PAL.black, 0.45).setDepth(30).setInteractive();
  const box = scene.add.container(W / 2, H / 2).setDepth(31);
  const pw = 520;
  const ph = 560;
  box.add(panel(scene, pw + 20, ph + 20));
  const g = scene.add.graphics();
  // большой кружок уровня
  g.fillStyle(PAL.goldDark, 1).fillCircle(0, -70, 86);
  g.fillStyle(PAL.gold, 1).fillCircle(0, -76, 86);
  g.fillStyle(PAL.white, 0.3).fillEllipse(-24, -116, 70, 30);
  box.add(g);
  box.add(plate(scene, 0, -ph / 2 + 4, STR.catLevelUp, { depth: 0, color: PAL.plate }).setScale(1.1));
  box.add(scene.add.text(0, -72, String(up.level), {
    fontFamily: font, fontStyle: 'bold', fontSize: '96px', color: PAL.text, stroke: PAL.textGoldStroke, strokeThickness: 12,
  }).setOrigin(0.5));
  const items = [['coin', up.coins], ['undo', up.undos], ['skin', up.skin ? 1 : 0], ['chest', up.chest ? 1 : 0], ['name', up.name ? 1 : 0]].filter(([, n]) => n > 0);
  items.forEach(([icon, n], i) => {
    const x = (i - (items.length - 1) / 2) * 170;
    if (icon === 'name') { // новая кличка: табличка цвета редкости
      const nm = CONFIG.nameList.find((x) => x.id === up.name);
      const t = scene.add.text(x, 80, nm.name, {
        fontFamily: font, fontStyle: 'bold', fontSize: '26px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 6,
      }).setOrigin(0.5);
      const w = Math.max(130, t.width + 30);
      const g2 = scene.add.graphics();
      g2.fillStyle(CONFIG.names.colors[nm.rarity], 1).fillRoundedRect(x - w / 2, 54, w, 52, 18);
      g2.lineStyle(3, PAL.white, 0.8).strokeRoundedRect(x - w / 2, 54, w, 52, 18);
      box.add([g2, t, scene.add.text(x, 128, STR.nameLabel, {
        fontFamily: font, fontStyle: 'bold', fontSize: '22px', color: PAL.textGold, stroke: PAL.textStroke, strokeThickness: 5,
      }).setOrigin(0.5)]);
      return;
    }
    if (icon === 'skin') { // новый окрас: голова кота этого окраса и подпись
      const k = CONFIG.skins.find((s) => s.id === up.skin);
      const head = scene.add.image(x, 76, `cat_${k.file}_head`);
      head.setScale(110 / Math.max(head.width, head.height));
      box.add([head, scene.add.text(x, 128, k.name, {
        fontFamily: font, fontStyle: 'bold', fontSize: '26px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 6,
      }).setOrigin(0.5)]);
      return;
    }
    const plain = icon === 'coin' || icon === 'chest';
    const ic = makeIcon(scene, icon, icon === 'chest' ? 108 : 92).setPosition(x, 80);
    if (!plain) ic.setScale(ic.scale * 0.8);
    box.add(plain ? ic : [scene.add.circle(x, 80, 44, PAL.button), ic]);
    box.add(scene.add.text(x + 38, 114, String(n), {
      fontFamily: font, fontStyle: 'bold', fontSize: '44px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 8,
    }).setOrigin(0.5));
  });
  const take = () => {
    sfx(scene, 'sfx_coins', CONFIG.audio.coins);
    onTake?.();
    shade.destroy();
    box.destroy();
    showCatLevelUps(scene, ups.slice(1), { fxStars, onTake });
  };
  box.add(makeButton(scene, 0, 205, STR.take, take, { ...CONFIG.ui.bigButton, skin: 'green' }));
  box.setScale(0.5).setAlpha(0);
  sfx(scene, 'sfx_popup', CONFIG.audio.popup);
  scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 320, ease: 'Back.easeOut' });
  fxStars.setDepth(32).explode(16, W / 2, H / 2 - 76);
}
