// Магазин — полки в комнате магазина (bg_room_shop): товары стоят прямо на полках и видны ещё из холла,
// на вкладке «Магазин» камера наезжает на полки (src/scenes/RoomScene.js zoomShop).
// Верхняя полка: стартовый набор, «Наборы» (окно с остальными наборами), монеты (окно с пачками монет).
// Средняя: ультракоты, последний — табличка «Другие» (окно со всеми). Нижняя: подсказка, банка, отмена, жизнь —
// окно выбора количества, у каждого варианта цена в монетах и в рублях.
// Рубли — витрина до ИП (CONFIG.shop.payments): тап — «покупки скоро». Товары за монеты работают.
// Координаты на полках — px картинки bg_room_shop (CONFIG.room.shop), в контейнер комнаты их переводит place().
import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { showPopup } from './Popup.js';
import { makeIcon, infinityMark, panel, plate, iconButton, trackWindow } from './ui.js';
import { sfx } from '../audio.js';
import { CatView } from '../theme/cats/CatView.js';
import { ULTRAS, ULTS_READY } from '../theme/cats/ultras.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';
import { lives, coins, buyGoods, buyUltra, ultrasOwned, ultraPrice, breedSkin, adsState, adCoins, adGoods, adLife } from '../core/save.js';
import { showRewardedAd } from '../rewarded.js';
import { formatLeft } from './lives.js';

const font = () => `"${CONFIG.font}", sans-serif`;
// подписи на полках смотрят через камеру с сильным приближением — текст рисуем с запасом по чёткости
const SHARP = 3;
const label = (scene, x, y, s, size, color = PAL.text) => scene.add.text(x, y, s, {
  fontFamily: font(), fontStyle: 'bold', fontSize: `${size}px`, color, stroke: PAL.textStroke, strokeThickness: Math.max(2, Math.round(size / 4.5)),
}).setOrigin(0.5).setResolution(SHARP);

// Ценник под товаром: плашка с текстом и (для монет) монеткой.
function priceTag(scene, x, y, text, { coin = false, size = CONFIG.room.shop.tagSize } = {}) {
  const c = scene.add.container(x, y);
  const t = label(scene, coin ? size * 0.55 : 0, 0, text, size);
  const w = t.width + size * (coin ? 2.4 : 1.4);
  const h = size * 1.7;
  const g = scene.add.graphics();
  g.fillStyle(PAL.black, 0.25).fillRoundedRect(-w / 2 + 1, -h / 2 + 2, w, h, h / 2);
  g.fillStyle(PAL.plateDark, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  g.lineStyle(1.5, PAL.white, 0.6).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  c.add([g, t]);
  if (coin) c.add(makeIcon(scene, 'coin', size * 1.4).setPosition(-w / 2 + size * 0.9, 0));
  return c;
}

// Иконка товара: белые иконки умений — на фиолетовой подушечке, жизнь — сердце, ∞ — сердце с ∞.
function goodsIcon(scene, icon, size) {
  const c = scene.add.container(0, 0);
  if (icon === 'heart' || icon === 'infinite') {
    c.add(makeIcon(scene, 'heart', size));
    if (icon === 'infinite') c.add(infinityMark(scene, 0, 0, size));
    return c;
  }
  const g = scene.add.graphics();
  g.fillStyle(PAL.black, 0.25).fillEllipse(0, size * 0.42, size * 1.0, size * 0.28);
  g.fillStyle(PAL.button, 1).fillCircle(0, 0, size * 0.5);
  g.fillStyle(PAL.white, 0.18).fillEllipse(-size * 0.12, -size * 0.22, size * 0.5, size * 0.22);
  c.add([g, makeIcon(scene, icon, size * 0.72)]);
  return c;
}

// Ставит товары на полки комнаты room. place(x, y) — px картинки фона → координаты в контейнере комнаты.
// onTap(what, data) — тап по товару; what: 'starter' | 'packs' | 'coins' | 'ultra' | 'ultras' | 'goods'.
// Возвращает { refresh } — перерисовать (купили ультракота).
export function stockShelves(scene, room, place, k, onTap) {
  const S = CONFIG.room.shop;
  let parts = [];
  const put = (o, x, y) => { const p = place(x, y); room.add(o.setPosition(p.x, p.y)); parts.push(o); return o; };
  const tappable = (o, w, h, fn) => {
    o.setSize(w, h).setInteractive({ useHandCursor: true });
    o.on('pointerup', () => { sfx(scene, 'sfx_button'); fn(); });
    return o;
  };
  const draw = () => {
    parts.forEach((o) => o.destroy());
    parts = [];
    const [y1, y2, y3] = S.shelfY;
    // верхняя полка
    const art = (key, size) => {
      const c = scene.add.container(0, 0);
      if (scene.textures.exists(key)) {
        const img = scene.add.image(0, 0, key).setOrigin(0.5, 1);
        c.add(img.setScale((size * k) / Math.max(img.width, img.height)));
      }
      return c;
    };
    const starter = CONFIG.shop.packs[0];
    // «Наборы» — закрытый сундук (иконка chest: коробка и крышка), низом на полку
    const chestArt = (size) => {
      const c = scene.add.container(0, 0);
      const ic = makeIcon(scene, 'chest', size * k * S.chestScale);
      const b = ic.getBounds();
      c.add(ic.setY(-(b.y + b.height))); // низ сундука — на доске
      return c;
    };
    const top = [
      ['starter', art('pack_starter', S.topSize), `${starter.price} ₽`],
      ['packs', chestArt(S.topSize), STR.shop.packs],
      ['coins', art('coins_5', S.topSize), STR.shop.coins],
    ];
    top.forEach(([what, o, tag], i) => {
      const x = S.topX[i];
      put(tappable(o, S.topSize * k, S.topSize * k, () => onTap(what)), x, y1);
      put(priceTag(scene, 0, 0, tag), x, y1 + S.tagDy);
    });
    // средняя полка: ультракоты (кроме подарочного), сначала не купленные
    const owned = ultrasOwned();
    const list = ULTRAS.filter((u) => !u.gift).sort((a, b) => owned.includes(a.id) - owned.includes(b.id));
    // подписи пород — одного размера: все ужаты по самой длинной, чтобы влезла в место под котом
    const shown = list.slice(0, S.catsOnShelf);
    const names = shown.map((u) => label(scene, 0, 0, u.name, S.catNameSize));
    const fit = Math.min(1, S.catSlotW / Math.max(...names.map((t) => t.width)));
    shown.forEach((u, i) => {
      const x = S.catX[i];
      const cat = new CatView(scene, 0, 0, breedSkin(u.id));
      cat.setBaseScale(S.catScale * k);
      cat.startIdle();
      put(cat, x, y2 - CONFIG.cat.origin[2] * S.catScale);
      // зона тапа — прямоугольник вокруг кота (у контейнера кота нет своего размера)
      const zone = scene.add.zone(0, 0, 1, 1);
      put(tappable(zone, S.catTapW * k, S.catTapH * k, () => onTap('ultra', u)), x, y2 - S.catTapH / 2);
      const have = owned.includes(u.id);
      put(names[i].setScale(fit), x, y2 + S.catNameDy); // порода — на доске под котом
      put(priceTag(scene, 0, 0, have ? STR.shop.owned : STR.shop.short(ultraPrice(u)), { coin: !have }), x, y2 + S.catTagDy);
    });
    const more = plate(scene, 0, 0, STR.shop.more, { depth: 0 }).setScale(S.moreScale * k);
    more.list.forEach((o) => o.setResolution?.(SHARP));
    const mx = S.catX[S.catsOnShelf];
    put(tappable(more, more.getBounds().width / more.scaleX, 72, () => onTap('ultras')), mx, y2 - S.moreDy);
    // нижняя полка: умения и жизни
    CONFIG.shop.goods.forEach((g, i) => {
      const x = S.goodsX[i];
      const ic = goodsIcon(scene, g.icon, S.goodsSize * k);
      put(tappable(ic, S.goodsSize * k, S.goodsSize * k, () => onTap('goods', g)), x, y3 - S.goodsSize * 0.55);
      put(priceTag(scene, 0, 0, STR.shop.goods[g.icon]), x, y3 + S.tagDy);
    });
  };
  draw();
  return { refresh: draw };
}

// ---------- окна ----------

// Окно-витрина: заголовок, крестик, строки (rows) или сетка; поверх всего. Возвращает close().
// depth — слой (окно монет — выше обычных окон: оно открывается и поверх окна покупки).
function shopWindow(scene, title, height, build, depth = CONFIG.shopWindow.depth) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const V = CONFIG.shopWindow;
  const parts = [];
  let untrack = null;
  const close = () => {
    if (!untrack) return;
    untrack();
    untrack = null;
    parts.forEach((o) => o.destroy());
  };
  untrack = trackWindow(scene, close);
  sfx(scene, 'sfx_popup', CONFIG.audio.popup);
  const shade = scene.add.rectangle(W / 2, H / 2, W, H, PAL.black, 0.6).setDepth(depth).setScrollFactor(0).setInteractive();
  shade.on('pointerdown', close);
  parts.push(shade);
  const box = scene.add.container(W / 2, H / 2 + V.offsetY).setDepth(depth).setScrollFactor(0);
  parts.push(box);
  box.add(panel(scene, V.width + 20, height + 20));
  box.add(scene.add.zone(0, 0, V.width, height).setInteractive()); // тапы по панели не закрывают окно
  box.add(plate(scene, 0, -height / 2 + 4, title, { depth: 0, color: PAL.plate }).setScale(1.2));
  box.add(iconButton(scene, V.width / 2 - 26, -height / 2 + 4, 'close', close, { size: 84, shape: 'round', color: CONFIG.ui.exitColor, depth: 0 }));
  build(box, close);
  return close;
}

const text = (scene, x, y, s, size, color = PAL.text) => scene.add.text(x, y, s, {
  fontFamily: font(), fontStyle: 'bold', fontSize: `${size}px`, color, stroke: PAL.textStroke, strokeThickness: Math.round(size / 4.5),
}).setOrigin(0.5);

// Кнопка цены: монеты — зелёная (работает), рубли — витрина до ИП (тап — «скоро»).
function priceButton(scene, x, y, w, { coinsPrice, rub }, onBuy) {
  if (coinsPrice != null) {
    const b = makeButton(scene, x, y, `   ${coinsPrice}`, onBuy, { w, h: 64, size: 28, color: PAL.buyGreen });
    b.add(makeIcon(scene, 'coin', 34).setPosition(-b.list[b.list.length - 1].width / 2 - 4, 0));
    return b;
  }
  return makeButton(scene, x, y, STR.shop.rub(rub), () => paySoon(scene), { w, h: 64, size: 28, color: CONFIG.shop.payments ? PAL.buyGreen : PAL.buttonDisabled });
}

function paySoon(scene) {
  showPopup(scene, { title: STR.shop.soonTitle, text: STR.shop.soonText, buttons: [{ label: STR.ok }] });
}

// Монет не хватает — сразу окно покупки монет.
function notEnough(scene) {
  openCoinPacks(scene);
}

// Строка товара: картинка слева, описание, кнопки цены справа.
function row(scene, box, y, w, h, { icon, title, lines = [] }, buttons) {
  const g = scene.add.graphics();
  g.fillStyle(PAL.black, 0.25).fillRoundedRect(-w / 2 + 3, y - h / 2 + 5, w, h, 22);
  g.fillStyle(PAL.panelLight, 1).fillRoundedRect(-w / 2, y - h / 2, w, h, 22);
  box.add(g);
  if (icon) box.add(icon.setPosition(-w / 2 + h * 0.55, y));
  // текст — между картинкой и кнопкой цены; состав переносится на строки, чтобы не уходить под кнопку
  const tx = -w / 2 + h * 1.1;
  const room = w / 2 - 190 - tx;
  const t = scene.add.text(tx, y - (lines.length ? 22 : 0), title, {
    fontFamily: font(), fontStyle: 'bold', fontSize: '26px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 6,
  }).setOrigin(0, 0.5);
  if (t.width > room) t.setScale(room / t.width);
  box.add(t);
  if (lines.length) {
    box.add(scene.add.text(tx, y + 16, lines.join(' · '), {
      fontFamily: font(), fontStyle: 'bold', fontSize: '18px', color: PAL.textGold, stroke: PAL.textStroke, strokeThickness: 4,
      wordWrap: { width: room }, lineSpacing: 2,
    }).setOrigin(0, 0.5));
  }
  buttons.forEach((b, i) => box.add(b.setPosition(w / 2 - 95, y + (i - (buttons.length - 1) / 2) * 70)));
}

const artIcon = (scene, key, size) => {
  if (!scene.textures.exists(key)) return null;
  const img = scene.add.image(0, 0, key);
  return img.setScale(size / Math.max(img.width, img.height));
};

// Состав набора одной строкой: монеты, ∞ жизни, умения, «без рекламы».
const packLines = (p) => [
  STR.shop.packCoins(p.coins), STR.shop.packInfinite(p.infiniteH), STR.shop.packBoosters(p.boosters),
  ...(p.noAds ? [STR.shop.noAds] : []),
];

// Наборы за рубли (все, кроме стартового, или только стартовый — only).
export function openPacks(scene, { only } = {}) {
  const V = CONFIG.shopWindow;
  const list = only ? [CONFIG.shop.packs[0]] : CONFIG.shop.packs.slice(1);
  const rh = V.rowH;
  const h = 150 + list.length * (rh + 14);
  shopWindow(scene, only ? STR.shop.starter : STR.shop.packs, h, (box) => {
    list.forEach((p, i) => {
      const y = -h / 2 + 120 + i * (rh + 14) + rh / 2;
      const tag = p.tag ? ` · ${STR.shop.tag[p.tag]}` : '';
      row(scene, box, y, V.width - 40, rh, {
        icon: artIcon(scene, i === 0 && only ? 'pack_starter' : `coins_${p.art}`, rh * 0.8),
        title: `${STR.shop.packName[p.id]}${tag}`,
        lines: packLines(p),
      }, [priceButton(scene, 0, 0, 170, { rub: p.price })]);
    });
  });
}

// Кнопка «за ролик»: оранжевая с иконкой ролика; можно — тап показывает ролик, нельзя — бледная с подписью why.
// wait — сколько ждать, мс (0 — можно смотреть, Infinity — «завтра»): тогда на кнопке таймер, дошёл до нуля — onReady.
function adButton(scene, w, wait, onWatched, onReady) {
  const label = () => (wait === Infinity ? STR.ads.tomorrow : wait ? formatLeft(wait) : '');
  const b = makeButton(scene, 0, 0, label(), () => { if (!wait) showRewardedAd(scene, onWatched); },
    { w, h: 64, size: 26, color: wait ? PAL.buttonDisabled : PAL.adOrange });
  if (!wait) b.add(makeIcon(scene, 'video', 46));
  else if (wait !== Infinity) {
    const until = Date.now() + wait;
    const timer = scene.time.addEvent({
      delay: 1000, loop: true,
      callback: () => {
        wait = Math.max(0, until - Date.now());
        if (wait) b.setLabel(label());
        else { timer.remove(); onReady?.(); }
      },
    });
    b.once('destroy', () => timer.remove());
  }
  return b;
}

// Пачки монет за рубли; первая строка — монеты за ролик (CONFIG.ads.shopCoins). onChange — монеты начислены
// (по умолчанию — обновить счётчик монет сцены). Открывается и сам, когда на покупку не хватает монет.
export function openCoinPacks(scene, onChange = () => { scene.refreshTop?.(); scene.coinPill?.setValue(coins()); }) {
  const V = CONFIG.shopWindow;
  const list = CONFIG.shop.coinPacks;
  const rh = V.coinRowH; // строк семь — пониже, чтобы окно не уходило под счётчики сверху
  const h = 150 + (list.length + 1) * (rh + 14);
  shopWindow(scene, STR.shop.coins, h, (box, close) => {
    const A = CONFIG.ads.shopCoins;
    const left = adsState().coinsLeft;
    const y0 = -h / 2 + 120 + rh / 2;
    row(scene, box, y0, V.width - 40, rh, {
      icon: artIcon(scene, 'coins_2', rh * 0.8), title: STR.ads.coinsRow(A.coins), lines: [STR.ads.left(left, A.perDay)],
    }, [adButton(scene, 170, left ? 0 : Infinity, () => {
      if (!adCoins()) return;
      sfx(scene, 'sfx_coins', CONFIG.audio.coins);
      onChange?.();
      close();
      openCoinPacks(scene, onChange);
    })]);
    list.forEach((p, i) => {
      const y = -h / 2 + 120 + (i + 1) * (rh + 14) + rh / 2;
      row(scene, box, y, V.width - 40, rh, { icon: artIcon(scene, `coins_${i + 1}`, rh * 0.8), title: STR.shop.packCoins(p.coins) },
        [priceButton(scene, 0, 0, 170, { rub: p.price })]);
    });
  }, V.coinsDepth);
}

// Товар нижней полки: варианты количества, у каждого цена в монетах и в рублях. onBought — после покупки.
export function openGoods(scene, g, onBought) {
  const V = CONFIG.shopWindow;
  const rh = V.goodsRowH;
  const h = 150 + g.options.length * (rh + 10);
  shopWindow(scene, STR.shop.goods[g.icon], h, (box, close) => {
    g.options.forEach((o, i) => {
      const y = -h / 2 + 115 + i * (rh + 10) + rh / 2;
      const buttons = [];
      // за ролик: самый дешёвый вариант умения — раз в час; одна жизнь — CONFIG.ads.life
      const ad = adOffer(g, o, i);
      if (ad) {
        buttons.push(adButton(scene, 120, ad.wait, () => {
          if (!ad.take()) return;
          sfx(scene, 'sfx_coins', CONFIG.audio.coins);
          close();
          onBought?.();
          openGoods(scene, g, onBought);
        }, () => { close(); openGoods(scene, g, onBought); })); // время вышло — окно заново, кнопка ролика активна
      }
      if (o.coins != null) {
        buttons.push(priceButton(scene, 0, 0, ad ? 120 : 150, { coinsPrice: o.coins }, () => {
          if (!buyGoods(o.coins, o.give)) return coins() < o.coins ? notEnough(scene) : null;
          sfx(scene, 'sfx_coins', CONFIG.audio.coins);
          close();
          onBought?.();
        }));
      }
      if (o.rub != null) buttons.push(priceButton(scene, 0, 0, ad ? 120 : 150, { rub: o.rub }));
      // две кнопки — рядом по горизонтали
      const g2 = scene.add.graphics();
      const w = V.width - 40;
      g2.fillStyle(PAL.black, 0.25).fillRoundedRect(-w / 2 + 3, y - rh / 2 + 5, w, rh, 20);
      g2.fillStyle(PAL.panelLight, 1).fillRoundedRect(-w / 2, y - rh / 2, w, rh, 20);
      box.add(g2);
      box.add(goodsIcon(scene, o.icon ?? g.icon, rh * 0.62).setPosition(-w / 2 + rh * 0.5, y));
      box.add(scene.add.text(-w / 2 + rh * 0.95, y, STR.shop.amount(g.icon, o), {
        fontFamily: font(), fontStyle: 'bold', fontSize: '28px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 6,
      }).setOrigin(0, 0.5));
      const bw = ad ? 128 : 160;
      buttons.forEach((b, j) => box.add(b.setPosition(w / 2 - bw / 2 - 10 - (buttons.length - 1 - j) * bw, y)));
    });
  });
}

// Вариант товара за ролик: { wait — мс до следующего (0 — можно, Infinity — завтра), take() — начислить }, или null.
// Умения: только первый (самый дешёвый) вариант, раз в CONFIG.ads.goodsEveryMin; жизни: одна жизнь, CONFIG.ads.life,
// и только когда жизни кончились.
function adOffer(g, o, i) {
  const st = adsState();
  if (g.icon === 'heart') {
    if (o.n !== 1 || o.minutes || o.forever || lives() > 0) return null; // жизнь за ролик — только когда жизни кончились
    return { wait: st.lifeWait, take: () => adLife() };
  }
  if (i !== 0) return null;
  const wait = st.goodsWait(g.icon);
  return { wait, take: () => adGoods(g.icon, o.give) };
}

// Все ультракоты: голова, порода, цена (или «Есть»). onPick(u, again) — тап по коту: окно с пояснением открывается
// поверх списка, список остаётся; again() — открыть список заново (после покупки — с «Есть»).
export function openUltras(scene, onPick) {
  const V = CONFIG.shopWindow;
  const list = ULTRAS.filter((u) => !u.gift);
  const owned = ultrasOwned();
  const cols = 3;
  const rows = Math.ceil(list.length / cols);
  const cw = (V.width - 40) / cols;
  const ch = V.ultraCellH;
  const h = 150 + rows * ch;
  shopWindow(scene, STR.shop.ultras, h, (box, close) => {
    list.forEach((u, i) => {
      const x = -((cols - 1) * cw) / 2 + (i % cols) * cw;
      const y = -h / 2 + 115 + Math.floor(i / cols) * ch + ch / 2;
      const have = owned.includes(u.id);
      const g = scene.add.graphics();
      g.fillStyle(PAL.black, 0.25).fillRoundedRect(x - cw / 2 + 8, y - ch / 2 + 10, cw - 16, ch - 12, 20);
      g.fillStyle(have ? PAL.panelLight : PAL.deep, 1).fillRoundedRect(x - cw / 2 + 5, y - ch / 2 + 5, cw - 16, ch - 12, 20);
      box.add(g);
      const head = new CatView(scene, x, y - 22, breedSkin(u.id), { headOnly: true });
      const b = head.getBounds();
      head.setScale(78 / Math.max(b.width, b.height));
      box.add(head);
      box.add(text(scene, x, y + 30, u.name, 20));
      const price = ultraPrice(u);
      if (have) box.add(text(scene, x, y + 56, STR.shop.owned, 20, PAL.textMuted));
      else {
        const t = text(scene, x + 12, y + 56, String(price), 22, PAL.textGold);
        box.add([t, makeIcon(scene, 'coin', 26).setPosition(x + 12 - t.width / 2 - 16, y + 56)]);
      }
      const zone = scene.add.zone(x, y, cw - 16, ch - 12).setInteractive();
      zone.on('pointerup', () => onPick(u, () => { close(); openUltras(scene, onPick); }));
      box.add(zone);
    });
  });
}

// Купить ультракота: окно с ультой и ценой. onBought — после покупки.
export function offerUltra(scene, u, onBought) {
  if (ultrasOwned().includes(u.id)) {
    return showPopup(scene, { title: u.name, text: STR.shop.ownedText, buttons: [{ label: STR.ok }] });
  }
  const price = ultraPrice(u);
  const ready = !u.soon && ULTS_READY.has(u.ult);
  // «Купить» окно не закрывает: монет не хватило — поверх окно монет, а описание кота остаётся
  const close = showPopup(scene, {
    title: u.name,
    text: `${STR.ultraInfo(u.ultName, u.ultText, u.boostText)}\n\n${ready ? STR.buyUltraQ(price) : STR.ultraSoon}`,
    buttons: ready ? [
      {
        label: STR.buy, color: PAL.buyGreen, keep: true,
        onTap: () => {
          if (coins() < price) return notEnough(scene);
          if (!buyUltra(u.id)) return;
          close();
          sfx(scene, 'sfx_coins', CONFIG.audio.coins);
          onBought?.();
        },
      },
      { label: STR.no },
    ] : [{ label: STR.ok }],
  });
}
