import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { panel, plate, iconButton, makeIcon, trackWindow } from './ui.js';
import { sfx } from '../audio.js';
import { devEdit, devState, devSet, catNeed } from '../core/save.js';
import { MILESTONES } from '../core/milestones.js';
import { TEST_TOOLS } from '../dev.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Панель разработчика для тестов: кнопка «DEV» на главном экране (только с тестовыми инструментами, src/dev.js),
// окно с кнопками — монеты, уровень кота, жизни, умения, сундуки и подарки, ульта, уровень игры, открыть всё.
// Меняет сохранение сразу; onClose — после закрытия (холл перерисовывается целиком). Тексты здесь — только для тестов,
// поэтому не в strings.ru.js.
// onChange — после каждой кнопки (обновить верхнюю полосу). Пока панель открыта, на месте «DEV» — красный крестик:
// тап по нему закрывает панель.
export function addDevButton(scene, x, y, onClose, onChange) {
  if (!TEST_TOOLS) return null;
  let close = null;
  const btn = iconButton(scene, x, y, 'none', () => {
    if (close) return close();
    close = openDevPanel(scene, () => { close = null; setOpen(false); onClose?.(); }, onChange);
    setOpen(true);
  }, {
    size: 84, shape: 'round', color: PAL.adOrange, depth: 26,
  }).setScrollFactor(0);
  // надпись «DEV» шрифтом игры (кнопка только для тестов — своего арта не нужно)
  const wrench = scene.add.text(0, -3, 'DEV', {
    fontFamily: `"${CONFIG.font}", sans-serif`, fontStyle: 'bold', fontSize: '28px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 6,
  }).setOrigin(0.5);
  const cross = makeIcon(scene, 'close', 84 * 0.62).setPosition(0, -3).setVisible(false);
  btn.add([wrench, cross]);
  const setOpen = (on) => {
    btn.setColor(on ? CONFIG.ui.exitColor : PAL.adOrange);
    wrench.setVisible(!on);
    cross.setVisible(on);
  };
  // окна игры (коллекция 40, окна 50, коробки 60) рисуются под верхней полосой, а ключ — в ней:
  // пока открыто какое-то окно (и не наша панель), ключ спрятан. btn.hidden — прячет ещё и меню шестерёнки.
  btn.hidden = false;
  const check = () => {
    const popup = !close && scene.children.list.some((o) => o.depth >= 40 && o.depth < 70 && o.visible);
    btn.setVisible(!btn.hidden && !popup);
  };
  scene.events.on('update', check);
  scene.events.once('shutdown', () => scene.events.off('update', check));
  return btn;
}

export function openDevPanel(scene, onClose, onChange) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const depth = 70;
  const font = `"${CONFIG.font}", sans-serif`;
  const parts = [];
  const add = (o) => { parts.push(o); return o.setDepth(depth).setScrollFactor(0); };
  let untrack = null;
  const close = () => {
    if (!untrack) return;
    untrack();
    untrack = null;
    parts.forEach((o) => o.destroy());
    onClose?.();
  };
  untrack = trackWindow(scene, close);
  add(scene.add.rectangle(W / 2, H / 2, W, H, PAL.black, 0.6).setInteractive());
  // между верхней полосой и вкладками (они рисуются поверх окон своей камерой)
  const box = add(scene.add.container(W / 2, H / 2 - 10));
  const pw = 680;
  const ph = 980;
  box.add(panel(scene, pw, ph));
  box.add(scene.add.zone(0, 0, pw, ph).setInteractive());
  box.add(plate(scene, 0, -ph / 2 + 4, 'Разработка', { depth: 0, color: PAL.plate }));

  // что сейчас в сохранении
  const status = scene.add.text(0, -ph / 2 + 62, '', {
    fontFamily: font, fontStyle: 'bold', fontSize: '20px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 4,
    align: 'center', lineSpacing: 2,
  }).setOrigin(0.5, 0);
  box.add(status);
  const refresh = () => {
    const d = devState();
    const inf = d.infiniteUntil && d.infiniteUntil > Date.now() ? ` ∞${Math.ceil((d.infiniteUntil - Date.now()) / 60000)}м` : '';
    const ultInf = d.dev?.ultInf ?? CONFIG.ultInfiniteDev;
    status.setText([
      `Монеты ${d.coins} · Кот ${d.catLevel} (${d.xp}/${catNeed(d.catLevel)}) · Жизни ${d.lives}/${CONFIG.lives.max}${inf}`,
      `Отм ${d.undos} · Подск ${d.hints} · Банки ${d.jars} · Сунд ${d.chests} · Подарки ${d.daily.extra || 0}`,
      `Уровень ${d.current + 1} (откр. ${d.unlocked + 1}) · Ульта ${ultInf ? 'беск.' : `${d.ultCharge}/${CONFIG.ultRecharge}`} · ${d.ultra ?? 'обычный кот'}`,
    ].join('\n'));
    ultBtn?.setLabel?.(ultInf ? 'Беск.: вкл' : 'Беск.: выкл');
  };
  const edit = (fn) => { devEdit(fn); sfx(scene, 'sfx_coins', CONFIG.audio.coins * 0.5); refresh(); onChange?.(); };

  // строка: подпись слева, кнопки справа
  let y = -ph / 2 + 185;
  let ultBtn = null;
  const row = (label, buttons) => {
    box.add(scene.add.text(-pw / 2 + 30, y, label, {
      fontFamily: font, fontStyle: 'bold', fontSize: '24px', color: PAL.textGold, stroke: PAL.textStroke, strokeThickness: 5,
    }).setOrigin(0, 0.5));
    const bw = 104;
    const x0 = -pw / 2 + 200;
    buttons.forEach(([text, fn], k) => {
      const b = makeButton(scene, x0 + k * (bw + 8) + bw / 2, y, text, fn, { w: bw, h: 54, size: 21, color: PAL.buttonPlain });
      box.add(b);
      if (text.startsWith('Беск')) ultBtn = b;
    });
    y += 64;
  };
  const level = (id) => { devSet({ level: Math.max(1, Math.min(CONFIG.levelGen.count, id)) }); sfx(scene, 'sfx_button'); refresh(); onChange?.(); };

  row('Монеты', [['+100', () => edit((d) => { d.coins += 100; })], ['+1000', () => edit((d) => { d.coins += 1000; })],
    ['+10к', () => edit((d) => { d.coins += 10000; })], ['0', () => edit((d) => { d.coins = 0; })]]);
  row('Кот', [['−1', () => edit((d) => { d.catLevel = Math.max(1, d.catLevel - 1); d.xp = 0; })], ['+1', () => edit((d) => { d.catLevel += 1; d.xp = 0; })],
    ['+5', () => edit((d) => { d.catLevel += 5; d.xp = 0; })], ['почти', () => edit((d) => { d.xp = catNeed(d.catLevel) - 1; })]]);
  row('Жизни', [['0', () => edit((d) => { d.lives = 0; d.refillAt = Date.now() + CONFIG.lives.refillMinutes * 60000; d.infiniteUntil = null; })],
    ['+1', () => edit((d) => { d.lives = Math.min(CONFIG.lives.max, d.lives + 1); if (d.lives >= CONFIG.lives.max) d.refillAt = null; })],
    ['полные', () => edit((d) => { d.lives = CONFIG.lives.max; d.refillAt = null; })],
    ['∞ 30м', () => edit((d) => { d.infiniteUntil = Math.max(Date.now(), d.infiniteUntil || 0) + 30 * 60000; })]]);
  row('Умения', [['отм +5', () => edit((d) => { d.undos += 5; })], ['подск +5', () => edit((d) => { d.hints += 5; })],
    ['банк +5', () => edit((d) => { d.jars += 5; })], ['все 0', () => edit((d) => { d.undos = 0; d.hints = 0; d.jars = 0; })]]);
  row('Коробки', [['сунд +1', () => edit((d) => { d.chests += 1; })], ['подар +1', () => edit((d) => { d.daily.extra = (d.daily.extra || 0) + 1; })],
    ['кличка +1', () => edit((d) => { d.nameTokens += 1; })], ['рубежи', () => edit((d) => { d.msDone = 0; })]]);
  row('Ульта', [['зарядить', () => edit((d) => { d.ultCharge = CONFIG.ultRecharge; })], ['разрядить', () => edit((d) => { d.ultCharge = 0; })],
    ['Беск.: выкл', () => edit((d) => { d.dev.ultInf = !(d.dev.ultInf ?? CONFIG.ultInfiniteDev); })]]);
  row('Уровень', [['−1', () => level(devState().current)], ['+1', () => level(devState().current + 2)], ['+10', () => level(devState().current + 11)],
    ['к рубежу', () => level(MILESTONES.find((m) => m.id > devState().current + 1)?.id ?? 1)]]);
  row('Открыть', [['окрасы', () => edit((d) => { d.skins = CONFIG.skins.map((k) => k.id); })],
    ['клички', () => edit((d) => { d.names = CONFIG.nameList.map((n) => n.id); })],
    ['породы', () => edit((d) => { d.ultras = CONFIG.ultras.map((u) => u.id); })],
    ['знаком.', () => edit((d) => { d.ultraIntro = false; })]]);

  box.add(scene.add.text(0, y - 6, 'Уровень: −1 / +1 — пройдено всё до него, прошлые рубежи забраны.\n«рубежи» — заново выдать награды пройденных рубежей.\n«знаком.» — снова показать знакомство с ультракотом.', {
    fontFamily: font, fontSize: '20px', color: PAL.textDim, align: 'center', wordWrap: { width: pw - 60 },
  }).setOrigin(0.5, 0));

  // сброс — двумя тапами, чтобы не случайно
  let armed = false;
  const reset = makeButton(scene, 0, ph / 2 - 62, 'Сбросить весь прогресс', () => {
    if (!armed) { armed = true; reset.setLabel?.('Точно? Ещё раз'); return; }
    try { window.localStorage.removeItem('kittyeatty.save'); } catch (e) { /* нет доступа */ }
    location.reload();
  }, { w: 420, h: 72, size: 26, color: CONFIG.ui.exitColor });
  box.add(reset);
  refresh();
  sfx(scene, 'sfx_popup', CONFIG.audio.popup);
  return close;
}
