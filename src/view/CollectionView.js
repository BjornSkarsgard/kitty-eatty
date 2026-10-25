import { CONFIG } from '../config.js';
import { showPopup } from './Popup.js';
import { iconButton, plate, makeIcon, panel, trackWindow } from './ui.js';
import { makeButton } from './Button.js';
import { sfx } from '../audio.js';
import { NAMES, checkCustomName } from '../theme/cats/names.js';
import {
  skinsOwned, selectedSkin, selectSkin, buySkin, coins,
  namesOwned, selectedName, selectName, buyName, customName, nameTokens, setCustomName, CUSTOM,
  ultrasOwned, selectedUltra, selectUltra, buyUltra, ultraPrice,
} from '../core/save.js';
import { ULTRAS, ULTS_READY } from '../theme/cats/ultras.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Окно коллекции, три вкладки внизу: «Окрасы», «Клички» и «Породы» (ультракоты).
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
  let untrack = null;
  const close = () => {
    if (!untrack) return;
    untrack();
    untrack = null;
    parts.forEach((o) => o.destroy());
  };
  untrack = trackWindow(scene, close);

  const shade = scene.add.rectangle(W / 2, H / 2, W, H, PAL.black, 0.6).setDepth(depth).setScrollFactor(0).setInteractive();
  shade.on('pointerdown', close);
  parts.push(shade);
  const box = scene.add.container(W / 2, H / 2 + V.offsetY).setDepth(depth).setScrollFactor(0);
  parts.push(box);
  const pw = V.width;
  const ph = V.height;
  box.add(panel(scene, pw + 20, ph + 20));
  // панель ловит тапы, чтобы они не закрывали окно
  box.add(scene.add.zone(0, 0, pw, ph).setInteractive());
  box.add(plate(scene, 0, -ph / 2 + 4, STR.collection, { depth: 0, color: PAL.plate }).setScale(1.2));
  box.add(iconButton(scene, pw / 2 - 26, -ph / 2 + 4, 'close', close, { size: 84, shape: 'round', color: CONFIG.ui.exitColor, depth: 0 }));

  let tab = 'skins';
  let page = 0;
  let grid = null;
  const text = (x, y, s, size, color = PAL.text) => scene.add.text(x, y, s, {
    fontFamily: font, fontStyle: 'bold', fontSize: `${size}px`, color, stroke: PAL.textStroke, strokeThickness: Math.round(size / 4.5),
  }).setOrigin(0.5);
  const check = (x, y) => {
    const ok = scene.add.graphics();
    ok.fillStyle(PAL.okGreen, 1).fillCircle(x, y, 18);
    ok.lineStyle(5, PAL.white, 1).beginPath().moveTo(x - 9, y).lineTo(x - 2, y + 7).lineTo(x + 10, y - 7).strokePath();
    return ok;
  };
  const cell = (x, y, cw, ch, color, alpha, selected) => {
    const cg = scene.add.graphics();
    cg.fillStyle(PAL.black, 0.25).fillRoundedRect(x - cw / 2 + 3, y - ch / 2 + 6, cw, ch, 20);
    cg.fillStyle(color, alpha).fillRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 20);
    if (selected) cg.lineStyle(6, PAL.goldLight, 1).strokeRoundedRect(x - cw / 2, y - ch / 2, cw, ch, 20);
    return cg;
  };
  const priceLabel = (x, y, price) => {
    const t = text(x + 14, y, String(price), 22, PAL.textGold);
    return [t, makeIcon(scene, 'coin', 30).setPosition(x + 14 - t.width / 2 - 18, y)];
  };

  // ---------- окрасы ----------
  const drawSkins = () => {
    const owned = skinsOwned();
    const cur = selectedUltra() ? null : selectedSkin(); // играем ультракотом — окрас обычного не отмечен
    const x0 = -((V.cols - 1) * V.cellW) / 2;
    const y0 = -ph / 2 + V.gridTop;
    CONFIG.skins.forEach((k, i) => {
      const x = x0 + (i % V.cols) * V.cellW;
      const y = y0 + Math.floor(i / V.cols) * V.cellH;
      const have = owned.includes(k.id);
      const cw = V.cellW - 14;
      const ch = V.cellH - 14;
      grid.add(cell(x, y, cw, ch, have ? PAL.panelLight : PAL.deep, 1, k.id === cur));
      const head = scene.add.image(x, y - 14, `cat_${k.file}_head`);
      head.setScale(V.head / Math.max(head.width, head.height));
      if (!have) head.setTint(PAL.silhouette).setAlpha(0.75); // силуэт
      grid.add(head);
      const ly = y + ch / 2 - 24;
      if (have) grid.add(text(x, ly, k.name, 22));
      else if (k.price) grid.add(priceLabel(x - 14, ly, k.price));
      else grid.add(text(x, ly, k.catLevel ? STR.catLevelShort(k.catLevel) : STR.chest, 22, PAL.textMuted));
      if (k.id === cur) grid.add(check(x + cw / 2 - 18, y - ch / 2 + 18));
      const zone = scene.add.zone(x, y, cw, ch).setInteractive();
      zone.on('pointerdown', () => tapSkin(k, have));
      grid.add(zone);
    });
  };

  const tapSkin = (k, have) => {
    if (have) {
      if (k.id === selectedSkin() && !selectedUltra()) return;
      sfx(scene, 'sfx_toggle', CONFIG.audio.toggle);
      selectSkin(k.id);
      onChange?.();
      return draw();
    }
    if (k.price) {
      return offerBuy(k.name, STR.buySkinQ(k.price), k.price, () => buySkin(k.id) && selectSkin(k.id));
    }
    showPopup(scene, {
      title: k.name,
      text: k.catLevel ? STR.unlocksAtCatLevel(k.catLevel) : STR.chestOnly,
      buttons: [{ label: STR.ok }],
    });
  };

  // ---------- клички ----------
  // своя кличка (есть или можно придумать) — первой клеткой, потом весь список
  const nameItems = () => {
    const list = NAMES.map((n) => ({ ...n }));
    if (customName() || nameTokens() > 0) list.unshift({ id: CUSTOM, name: customName() || STR.inventName, rarity: 'legendary', custom: true });
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
        grid.add(text(x, y - 13, n.name, 22, PAL.textLocked));
        const price = !n.catLevel && CONFIG.names.price[n.rarity];
        if (price) grid.add(priceLabel(x - 14, y + 16, price));
        else grid.add(text(x, y + 16, n.catLevel ? STR.catLevelShort(n.catLevel) : STR.chest, 18, PAL.textMuted));
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
    if (price) return offerBuy(n.name, STR.buyNameQ(price), price, () => buyName(n.id) && selectName(n.id));
    showPopup(scene, {
      title: n.name,
      text: n.catLevel ? STR.unlocksAtCatLevel(n.catLevel) : STR.legendaryChestOnly,
      buttons: [{ label: STR.ok }],
    });
  };

  // ---------- породы (ультракоты) ----------
  // Пока своего арта нет — голова окраса-замены (look). Купленная / подаренная — в цвете с названием,
  // остальные — силуэт и подпись: цена, «Подарок на N уровне» или «Скоро» (ульта ещё не работает).
  const drawUltras = () => {
    const owned = ultrasOwned();
    const cur = selectedUltra()?.id;
    const x0 = -((V.cols - 1) * V.cellW) / 2;
    const y0 = -ph / 2 + V.gridTop;
    ULTRAS.forEach((u, i) => {
      const x = x0 + (i % V.cols) * V.cellW;
      const y = y0 + Math.floor(i / V.cols) * V.cellH;
      const have = owned.includes(u.id);
      const cw = V.cellW - 14;
      const ch = V.cellH - 14;
      grid.add(cell(x, y, cw, ch, have ? PAL.panelLight : PAL.deep, 1, u.id === cur));
      const file = CONFIG.skins.find((k) => k.id === u.look).file;
      const head = scene.add.image(x, y - 14, `cat_${file}_head`);
      head.setScale(V.head / Math.max(head.width, head.height));
      if (!have) head.setTint(PAL.silhouette).setAlpha(0.75); // силуэт
      grid.add(head);
      const ly = y + ch / 2 - 24;
      const price = ultraPrice(u);
      if (have) grid.add(text(x, ly, u.name, u.name.length > 10 ? 16 : 20));
      else if (u.gift) grid.add(text(x, ly, STR.levelShort(u.gift), 22, PAL.textMuted));
      else if (u.soon || !ULTS_READY.has(u.ult)) grid.add(text(x, ly, STR.soon, 22, PAL.textMuted));
      else grid.add(priceLabel(x - 14, ly, price));
      if (u.id === cur) grid.add(check(x + cw / 2 - 18, y - ch / 2 + 18));
      const zone = scene.add.zone(x, y, cw, ch).setInteractive();
      zone.on('pointerdown', () => tapUltra(u, have));
      grid.add(zone);
    });
  };

  const tapUltra = (u, have) => {
    const info = STR.ultraInfo(u.ultName, u.ultText, u.boostText);
    if (have) {
      if (u.id === selectedUltra()?.id) return showPopup(scene, { title: u.name, text: info, buttons: [{ label: STR.ok }] });
      sfx(scene, 'sfx_toggle', CONFIG.audio.toggle);
      selectUltra(u.id);
      onChange?.();
      return draw();
    }
    const price = ultraPrice(u);
    if (price && !u.soon && ULTS_READY.has(u.ult)) {
      return offerBuy(u.name, `${info}
${STR.buyUltraQ(price)}`, price, () => buyUltra(u.id));
    }
    showPopup(scene, {
      title: u.name,
      text: `${info}
${u.gift ? STR.ultraGiftAt(u.gift) : STR.ultraSoon}`,
      buttons: [{ label: STR.ok }],
    });
  };

  // ---------- общее ----------
  const offerBuy = (title, question, price, buy) => {
    showPopup(scene, {
      title,
      text: `${question}\n${STR.coinsLeft(coins())}`,
      buttons: [
        {
          label: STR.buy, color: PAL.buyGreen, disabled: coins() < price,
          onTap: () => {
            if (!buy()) return;
            sfx(scene, 'sfx_coins', CONFIG.audio.coins);
            onChange?.();
            draw();
          },
        },
        { label: STR.noThanks },
      ],
    });
  };

  const draw = () => {
    grid?.destroy();
    grid = scene.add.container(0, 0);
    box.add(grid);
    if (tab === 'skins') drawSkins();
    else if (tab === 'names') drawNames();
    else drawUltras();
    // вкладки внизу: выбранная — жёлтая
    [['skins', STR.tabSkins, -205], ['names', STR.tabNames, 0], ['ultras', STR.tabUltras, 205]].forEach(([key, label, x]) => {
      grid.add(makeButton(scene, x, ph / 2 - 52, label, () => { if (tab !== key) { tab = key; page = 0; draw(); } }, {
        w: 196, h: 74, size: 30, color: tab === key ? PAL.gold : PAL.plate,
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
function promptName(scene, onOk) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const rect = scene.game.canvas.getBoundingClientRect();
  const k = rect.width / W;
  const input = document.createElement('input');
  input.maxLength = 16;
  input.placeholder = STR.nameLabel;
  Object.assign(input.style, {
    position: 'fixed', left: `${rect.left + (W / 2 - 220) * k}px`, top: `${rect.top + (H / 2 - 125) * k}px`, // над строкой текста окна — туда пишется ошибка
    width: `${440 * k}px`, height: `${64 * k}px`, fontSize: `${30 * k}px`, textAlign: 'center',
    borderRadius: `${20 * k}px`, border: `${4 * k}px solid #8f6be8`, outline: 'none', zIndex: 10,
    fontFamily: `"${CONFIG.font}", sans-serif`, fontWeight: 'bold', color: PAL.textStrokeSoft, background: PAL.inputBg,
  });
  document.body.appendChild(input);
  setTimeout(() => input.focus(), 50);
  const popup = showPopup(scene, {
    title: STR.customNameTitle,
    text: '\n\n',
    buttons: [
      {
        label: STR.done, color: PAL.buyGreen, keep: true,
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
      { label: STR.cancel },
    ],
  });
  // окно закрыли (отмена, тап мимо) — убрать и поле
  const watch = scene.time.addEvent({ delay: 200, loop: true, callback: () => { if (!popup.isOpen()) { input.remove(); watch.remove(); } } });
}
