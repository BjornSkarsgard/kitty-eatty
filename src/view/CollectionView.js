import { CONFIG } from '../config.js';
import { showPopup } from './Popup.js';
import { iconButton, plate, makeIcon, panel } from './ui.js';
import { makeButton } from './Button.js';
import { sfx } from '../audio.js';
import { NAMES, checkCustomName } from '../names.js';
import {
  skinsOwned, selectedSkin, selectSkin, buySkin, coins,
  namesOwned, selectedName, selectName, buyName, customName, nameTokens, setCustomName, CUSTOM,
} from '../save.js';

// Окно коллекции, две вкладки внизу: «Окрасы» и «Клички».
// Окрасы — сетка голов кота. Открытый — в цвете, с именем; выбранный — в золотой рамке с галочкой.
// Закрытый — тёмный силуэт и подпись, как получить (цена / уровень кота / «Сундук»).
// Клички — список страницами; цвет клетки — редкость. Своя кличка (именная табличка) — первой клеткой.
// Тап по открытому — выбрать, по закрытому с ценой — купить, по остальным — подсказка, откуда он берётся.
// onChange() — выбрано или куплено что-то (обновить кота на главной, кличку, монеты).
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

  let tab = 'skins';
  let page = 0;
  let grid = null;
  const text = (x, y, s, size, color = '#ffffff') => scene.add.text(x, y, s, {
    fontFamily: font, fontStyle: 'bold', fontSize: `${size}px`, color, stroke: '#2b1a66', strokeThickness: Math.round(size / 4.5),
  }).setOrigin(0.5);
  const check = (x, y) => {
    const ok = scene.add.graphics();
    ok.fillStyle(0x43c43a, 1).fillCircle(x, y, 18);
    ok.lineStyle(5, 0xffffff, 1).beginPath().moveTo(x - 9, y).lineTo(x - 2, y + 7).lineTo(x + 10, y - 7).strokePath();
    return ok;
  };
  const cell = (x, y, cw, ch, color, alpha, selected) => {
    const cg = scene.add.graphics();
    cg.fillStyle(0x000000, 0.25).fillRoundedRect(x - cw / 2 + 3, y - ch / 2 + 6, cw, ch, 20);
    cg.fillStyle(color, alpha).fillRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 20);
    if (selected) cg.lineStyle(6, 0xffc83d, 1).strokeRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 20);
    return cg;
  };
  const priceLabel = (x, y, price) => {
    const t = text(x + 14, y, String(price), 22, '#ffe066');
    return [t, makeIcon(scene, 'coin', 30).setPosition(x + 14 - t.width / 2 - 18, y)];
  };

  // ---------- окрасы ----------
  const drawSkins = () => {
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
      grid.add(cell(x, y, cw, ch, have ? 0x6d52e8 : 0x3b27a0, 1, k.id === cur));
      const head = scene.add.image(x, y - 14, `cat_${k.file}_head`);
      head.setScale(V.head / Math.max(head.width, head.height));
      if (!have) head.setTint(0x1b1033).setAlpha(0.75); // силуэт
      grid.add(head);
      const ly = y + ch / 2 - 24;
      if (have) grid.add(text(x, ly, k.name, 22));
      else if (k.price) grid.add(priceLabel(x - 14, ly, k.price));
      else grid.add(text(x, ly, k.catLevel ? `Ур. кота ${k.catLevel}` : 'Сундук', 22, '#c9b8ff'));
      if (k.id === cur) grid.add(check(x + cw / 2 - 18, y - ch / 2 + 18));
      const zone = scene.add.zone(x, y, cw, ch).setInteractive();
      zone.on('pointerdown', () => tapSkin(k, have));
      grid.add(zone);
    });
  };

  const tapSkin = (k, have) => {
    if (have) {
      if (k.id === selectedSkin()) return;
      sfx(scene, 'sfx_toggle', CONFIG.audio.toggle);
      selectSkin(k.id);
      onChange?.();
      return draw();
    }
    if (k.price) {
      return offerBuy(k.name, `Купить окрас за ${k.price} монет?`, k.price, () => buySkin(k.id) && selectSkin(k.id));
    }
    showPopup(scene, {
      title: k.name,
      text: k.catLevel ? `Откроется на ${k.catLevel} уровне кота` : 'Выпадает только из сундуков',
      buttons: [{ label: 'Понятно' }],
    });
  };

  // ---------- клички ----------
  // своя кличка (есть или можно придумать) — первой клеткой, потом весь список
  const nameItems = () => {
    const list = NAMES.map((n) => ({ ...n }));
    if (customName() || nameTokens() > 0) list.unshift({ id: CUSTOM, name: customName() || 'Придумать кличку', rarity: 'legendary', custom: true });
    return list;
  };

  const drawNames = () => {
    const items = nameItems();
    const per = V.namesPerPage;
    const pages = Math.ceil(items.length / per);
    page = Math.min(page, pages - 1);
    const owned = namesOwned();
    const cur = selectedName();
    const cw = V.nameW;
    const ch = V.nameH - 10;
    const y0 = -ph / 2 + V.gridTop - 30;
    items.slice(page * per, page * per + per).forEach((n, i) => {
      const x = (i % 2 ? 1 : -1) * (cw / 2 + 8);
      const y = y0 + Math.floor(i / 2) * V.nameH;
      const have = n.custom ? !!customName() : owned.includes(n.id);
      const color = CONFIG.names.colors[n.rarity];
      grid.add(cell(x, y, cw, ch, color, have || n.custom ? 1 : 0.4, n.id === cur));
      if (have) grid.add(text(x, y, n.name, 26));
      else if (n.custom) grid.add(text(x, y, `✎ ${n.name} (${nameTokens()})`, 24));
      else {
        grid.add(text(x, y - 13, n.name, 22, '#e0d6ff'));
        const price = !n.catLevel && CONFIG.names.price[n.rarity];
        if (price) grid.add(priceLabel(x - 14, y + 16, price));
        else grid.add(text(x, y + 16, n.catLevel ? `Ур. кота ${n.catLevel}` : 'Сундук', 18, '#c9b8ff'));
      }
      if (n.id === cur) grid.add(check(x + cw / 2 - 20, y - ch / 2 + 16));
      const zone = scene.add.zone(x, y, cw, ch).setInteractive();
      zone.on('pointerdown', () => tapName(n, have));
      grid.add(zone);
    });
    // листание страниц
    if (pages > 1) {
      const py = V.pagerY;
      grid.add(text(0, py, `${page + 1} / ${pages}`, 30));
      const arrow = (dx, step, label) => {
        const b = makeButton(scene, dx, py, label, () => { page = (page + step + pages) % pages; draw(); }, { w: 90, h: 64, size: 38 });
        grid.add(b);
      };
      arrow(-150, -1, '‹');
      arrow(150, 1, '›');
    }
  };

  const tapName = (n, have) => {
    if (n.custom && !customName()) return promptName(scene, (s) => { setCustomName(s); onChange?.(); draw(); });
    if (have) {
      if (n.id === selectedName()) {
        // своя уже выбрана — можно переименовать, если есть ещё табличка
        if (n.custom && nameTokens() > 0) promptName(scene, (s) => { setCustomName(s); onChange?.(); draw(); });
        return;
      }
      sfx(scene, 'sfx_toggle', CONFIG.audio.toggle);
      selectName(n.id);
      onChange?.();
      return draw();
    }
    const price = !n.catLevel && CONFIG.names.price[n.rarity];
    if (price) return offerBuy(n.name, `Купить кличку за ${price} монет?`, price, () => buyName(n.id) && selectName(n.id));
    showPopup(scene, {
      title: n.name,
      text: n.catLevel ? `Откроется на ${n.catLevel} уровне кота` : 'Легендарная кличка — только из сундуков',
      buttons: [{ label: 'Понятно' }],
    });
  };

  // ---------- общее ----------
  const offerBuy = (title, question, price, buy) => {
    showPopup(scene, {
      title,
      text: `${question}\nМонет: ${coins()}`,
      buttons: [
        {
          label: 'Купить', color: 0x4caf50, disabled: coins() < price,
          onTap: () => {
            if (!buy()) return;
            sfx(scene, 'sfx_coins', CONFIG.audio.coins);
            onChange?.();
            draw();
          },
        },
        { label: 'Не надо' },
      ],
    });
  };

  const draw = () => {
    grid?.destroy();
    grid = scene.add.container(0, 0);
    box.add(grid);
    if (tab === 'skins') drawSkins();
    else drawNames();
    // вкладки внизу: выбранная — жёлтая
    [['skins', 'Окрасы', -150], ['names', 'Клички', 150]].forEach(([key, label, x]) => {
      grid.add(makeButton(scene, x, ph / 2 - 52, label, () => { if (tab !== key) { tab = key; page = 0; draw(); } }, {
        w: 260, h: 74, size: 34, color: tab === key ? 0xf5b301 : 0x4b33a8,
      }));
    });
  };

  sfx(scene, 'sfx_popup', CONFIG.audio.popup);
  draw();
  box.setScale(0.6).setAlpha(0);
  scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
  return close;
}

// Ввод своей клички: поле ввода страницы поверх игры (в Phaser своего нет), под ним «Готово» и «Отмена».
// Проверка — checkCustomName; ошибка показывается в окне. onOk(кличка) — только для прошедшей проверку.
export function promptName(scene, onOk) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const rect = scene.game.canvas.getBoundingClientRect();
  const k = rect.width / W;
  const input = document.createElement('input');
  input.maxLength = 16;
  input.placeholder = 'Кличка';
  Object.assign(input.style, {
    position: 'fixed', left: `${rect.left + (W / 2 - 220) * k}px`, top: `${rect.top + (H / 2 - 125) * k}px`, // над строкой текста окна — туда пишется ошибка
    width: `${440 * k}px`, height: `${64 * k}px`, fontSize: `${30 * k}px`, textAlign: 'center',
    borderRadius: `${20 * k}px`, border: `${4 * k}px solid #8f6be8`, outline: 'none', zIndex: 10,
    fontFamily: `"${CONFIG.font}", sans-serif`, fontWeight: 'bold', color: '#3b2a55', background: '#fff3e0',
  });
  document.body.appendChild(input);
  setTimeout(() => input.focus(), 50);
  const popup = showPopup(scene, {
    title: 'Своя кличка',
    text: '\n\n',
    buttons: [
      {
        label: 'Готово', color: 0x4caf50, keep: true,
        onTap: () => {
          const s = input.value.trim().replace(/\s+/g, ' ');
          const err = checkCustomName(s);
          if (err) return popup.setText(`\n\n${err}`);
          input.remove();
          popup();
          sfx(scene, 'sfx_star', CONFIG.audio.star);
          onOk(s);
        },
      },
      { label: 'Отмена' },
    ],
  });
  // окно закрыли (отмена, тап мимо) — убрать и поле
  const watch = scene.time.addEvent({ delay: 200, loop: true, callback: () => { if (!popup.isOpen()) { input.remove(); watch.remove(); } } });
}
