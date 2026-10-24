import { CONFIG } from '../config.js';
import { showPopup } from './Popup.js';
import { iconButton, plate, makeIcon, panel } from './ui.js';
import { sfx } from '../audio.js';
import { skinsOwned, selectedSkin, selectSkin, buySkin, coins } from '../save.js';

// Окно коллекции: сетка рескинов обычного кота. Открытый — в цвете, с именем; выбранный — в золотой рамке с галочкой.
// Закрытый — тёмный силуэт и подпись, как получить (цена / уровень кота / «Сундук»). Тап по открытому — выбрать,
// по закрытому с ценой — купить, по остальным — подсказка, откуда он берётся.
// onChange(id) — выбран другой окрас или куплен новый (обновить кота на главной, монеты).
export function openCollection(scene, { onChange } = {}) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const V = CONFIG.collection;
  const depth = 40;
  const font = `"${CONFIG.font}", sans-serif`;
  const parts = [];
  const close = () => parts.forEach((o) => o.destroy());

  const shade = scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.6).setDepth(depth).setScrollFactor(0).setInteractive();
  shade.on('pointerdown', close);
  parts.push(shade);
  const box = scene.add.container(W / 2, H / 2 + V.offsetY).setDepth(depth).setScrollFactor(0);
  parts.push(box);
  const pw = V.width;
  const ph = V.height;
  box.add(panel(scene, pw + 20, ph + 20));
  // панель ловит тапы, чтобы они не закрывали окно
  box.add(scene.add.zone(0, 0, pw, ph).setInteractive());
  box.add(plate(scene, 0, -ph / 2 + 4, 'Коллекция', { depth: 0, color: 0x4b33a8 }).setScale(1.2));
  box.add(iconButton(scene, pw / 2 - 26, -ph / 2 + 4, 'close', close, { size: 84, shape: 'round', color: CONFIG.ui.exitColor, depth: 0 }));

  let grid = null;
  const draw = () => {
    grid?.destroy();
    grid = scene.add.container(0, 0);
    box.add(grid);
    const owned = skinsOwned();
    const cur = selectedSkin();
    const x0 = -((V.cols - 1) * V.cellW) / 2;
    const y0 = -ph / 2 + V.gridTop;
    CONFIG.skins.forEach((k, i) => {
      const x = x0 + (i % V.cols) * V.cellW;
      const y = y0 + Math.floor(i / V.cols) * V.cellH;
      const have = owned.includes(k.id);
      const cw = V.cellW - 14;
      const ch = V.cellH - 14;
      const cg = scene.add.graphics();
      cg.fillStyle(0x000000, 0.25).fillRoundedRect(x - cw / 2 + 3, y - ch / 2 + 6, cw, ch, 22);
      cg.fillStyle(have ? 0x6d52e8 : 0x3b27a0, 1).fillRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 22);
      if (k.id === cur) cg.lineStyle(6, 0xffc83d, 1).strokeRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 22);
      const head = scene.add.image(x, y - 14, `cat_${k.file}_head`);
      head.setScale(V.head / Math.max(head.width, head.height));
      if (!have) head.setTint(0x1b1033).setAlpha(0.75); // силуэт
      grid.add([cg, head]);
      const label = (s, color = '#ffffff') => scene.add.text(x, y + ch / 2 - 24, s, {
        fontFamily: font, fontStyle: 'bold', fontSize: '22px', color, stroke: '#2b1a66', strokeThickness: 5,
      }).setOrigin(0.5);
      if (have) grid.add(label(k.name));
      else if (k.price) {
        const t = label(String(k.price), '#ffe066');
        grid.add([t, makeIcon(scene, 'coin', 30).setPosition(x - t.width / 2 - 18, y + ch / 2 - 24)]);
      } else grid.add(label(k.catLevel ? `Ур. кота ${k.catLevel}` : 'Сундук', '#c9b8ff'));
      if (k.id === cur) {
        const ok = scene.add.graphics();
        ok.fillStyle(0x43c43a, 1).fillCircle(x + cw / 2 - 18, y - ch / 2 + 18, 18);
        ok.lineStyle(5, 0xffffff, 1).beginPath().moveTo(x + cw / 2 - 27, y - ch / 2 + 18)
          .lineTo(x + cw / 2 - 20, y - ch / 2 + 25).lineTo(x + cw / 2 - 8, y - ch / 2 + 11).strokePath();
        grid.add(ok);
      }
      const zone = scene.add.zone(x, y, cw, ch).setInteractive();
      zone.on('pointerdown', () => tap(k, have));
      grid.add(zone);
    });
  };

  const tap = (k, have) => {
    if (have) {
      if (k.id === selectedSkin()) return;
      sfx(scene, 'sfx_toggle', CONFIG.audio.toggle);
      selectSkin(k.id);
      onChange?.(k.id);
      return draw();
    }
    if (k.price) {
      showPopup(scene, {
        title: k.name,
        text: `Купить окрас за ${k.price} монет?\nМонет: ${coins()}`,
        buttons: [
          {
            label: 'Купить', color: 0x4caf50, disabled: coins() < k.price,
            onTap: () => {
              if (!buySkin(k.id)) return;
              sfx(scene, 'sfx_coins', CONFIG.audio.coins);
              selectSkin(k.id);
              onChange?.(k.id);
              draw();
            },
          },
          { label: 'Не надо' },
        ],
      });
      return;
    }
    showPopup(scene, {
      title: k.name,
      text: k.catLevel ? `Откроется на ${k.catLevel} уровне кота` : 'Выпадает только из сундуков',
      buttons: [{ label: 'Понятно' }],
    });
  };

  sfx(scene, 'sfx_popup', CONFIG.audio.popup);
  draw();
  box.setScale(0.6).setAlpha(0);
  scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
  return close;
}
