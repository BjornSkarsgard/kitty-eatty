import { CONFIG } from '../config.js';
import { makeButton } from './Button.js';
import { panel, plate, makeIcon, trackWindow, infinityMark } from './ui.js';
import { sfx } from '../audio.js';
import { dailyState, dailyMissSeen, claimDaily } from '../core/save.js';
import { dailyReward } from '../core/daily.js';
import { STR } from '../theme/cats/strings.ru.js';
import { PALETTE as PAL } from '../theme/cats/palette.js';

// Окно «Награды за вход» (подарок дня): неделя серии — 7 карточек (дни 1–7, с 8-го — 8–14 и т. д.): забранные —
// бледные с галочкой, сегодняшняя — в золотой рамке и дышит, будущие — что дадут. Внизу — серия, защита от пропуска
// и «Забрать» (если сегодня ещё не забрано). Был откат серии — строка об этом (один раз). onDone — после закрытия.
export function openDaily(scene, onDone) {
  const W = CONFIG.width;
  const H = CONFIG.height;
  const depth = 60;
  const font = `"${CONFIG.font}", sans-serif`;
  const st = dailyState();
  const parts = [];
  const add = (o) => { parts.push(o); return o.setDepth(depth).setScrollFactor(0); };
  let untrack = null;
  const close = () => {
    if (!untrack) return;
    untrack();
    untrack = null;
    parts.forEach((o) => o.destroy());
    onDone?.();
  };
  untrack = trackWindow(scene, close);
  add(scene.add.rectangle(W / 2, H / 2, W, H, PAL.black, 0.6).setInteractive());
  const box = add(scene.add.container(W / 2, H / 2 - 10));
  const pw = 660;
  const ph = 900;
  box.add(panel(scene, pw + 20, ph + 20));
  box.add(scene.add.zone(0, 0, pw, ph).setInteractive());
  box.add(plate(scene, 0, -ph / 2 + 4, STR.dailyTitle, { depth: 0, color: PAL.plate }).setScale(1.1));
  const text = (x, y, s, size, color = PAL.text) => scene.add.text(x, y, s, {
    fontFamily: font, fontStyle: 'bold', fontSize: `${size}px`, color, stroke: PAL.textStroke, strokeThickness: Math.round(size / 4.5),
    align: 'center',
  }).setOrigin(0.5);

  // неделя серии, в которой сегодняшний день
  const first = Math.floor((Math.max(1, st.day) - 1) / 7) * 7 + 1;
  const cw = 140;
  const ch = 190;
  const cards = [];
  for (let k = 0; k < 7; k++) {
    const day = first + k;
    const row = k < 4 ? 0 : 1;
    const inRow = row === 0 ? 4 : 3;
    const col = row === 0 ? k : k - 4;
    const x = (col - (inRow - 1) / 2) * (cw + 14);
    const y = -ph / 2 + 190 + row * (ch + 24);
    const claimed = day < st.day || (day === st.day && !st.canClaim);
    const today = day === st.day && st.canClaim;
    const c = scene.add.container(x, y);
    const g = scene.add.graphics();
    g.fillStyle(PAL.black, 0.25).fillRoundedRect(-cw / 2 + 3, -ch / 2 + 6, cw, ch, 22);
    g.fillStyle(today ? PAL.panelLight : PAL.deep, 1).fillRoundedRect(-cw / 2, -ch / 2, cw, ch, 22);
    if (today) g.lineStyle(7, PAL.goldLight, 1).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 22);
    if (day % 7 === 0 && !today) g.lineStyle(4, PAL.gold, 0.8).strokeRoundedRect(-cw / 2, -ch / 2, cw, ch, 22);
    c.add([g, text(0, -ch / 2 + 26, STR.dayN(day), 24, today ? PAL.textGold : PAL.text)]);
    const [icon, label] = rewardLook(dailyReward(day));
    const ic = makeIcon(scene, icon, icon === 'chest' ? 66 : 70).setPosition(0, icon === 'chest' ? 14 : 6);
    c.add(ic);
    if (icon === 'heart') c.add(infinityMark(scene, 0, 4, 74));
    const lt = c.add(text(0, ch / 2 - 30, label, 26)).list.at(-1);
    // сундук с монетами: «+N» и монетка рядом, чтобы не читалось как «+N сундуков»
    if (icon === 'chest' && label.startsWith('+')) {
      lt.setX(-16);
      c.add(makeIcon(scene, 'coin', 30).setPosition(-16 + lt.width / 2 + 18, ch / 2 - 30));
    }
    if (claimed) {
      c.setAlpha(0.45);
      c.add(check(scene, cw / 2 - 22, ch / 2 - 24));
    }
    if (today) scene.tweens.add({ targets: c, scale: 1.05, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    box.add(c);
    cards.push({ c, day });
  }

  // серия и защита от пропуска — под карточками; после «Забрать» обновляется
  const infoY = -ph / 2 + 190 + (ch + 24) + ch / 2 + 34;
  const info = scene.add.text(0, infoY, '', {
    fontFamily: font, fontStyle: 'bold', fontSize: '25px', color: PAL.text, stroke: PAL.textStroke, strokeThickness: 6,
    align: 'center', wordWrap: { width: pw - 70 }, lineSpacing: 6,
  }).setOrigin(0.5, 0);
  const showInfo = (streak, shield, clean, miss) => {
    const lines = [STR.dailyStreak(streak)];
    if (miss) lines.push(STR.dailyMissed(miss.to + 1));
    lines.push(shield ? STR.dailyShieldOn : STR.dailyShieldOff(CONFIG.dailyLogin.shieldDays - clean));
    info.setText(lines.join('\n'));
  };
  showInfo(st.canClaim ? st.day - 1 : st.day, st.shield, st.clean, st.miss);
  box.add(info);
  if (st.miss) dailyMissSeen();

  const btnY = ph / 2 - 90;
  if (st.canClaim) {
    const btn = makeButton(scene, 0, btnY, STR.take, () => {
      const got = claimDaily();
      btn.destroy();
      if (got) {
        sfx(scene, 'sfx_coins', CONFIG.audio.coins);
        const now = dailyState();
        showInfo(now.day, now.shield, now.clean, st.miss);
        const card = cards.find((x) => x.day === got.day)?.c;
        if (card) {
          scene.tweens.killTweensOf(card);
          card.setScale(1);
          scene.tweens.add({ targets: card, alpha: 0.45, duration: 300 });
          const ok = check(scene, cw / 2 - 22, ch / 2 - 24).setScale(0);
          card.add(ok);
          scene.tweens.add({ targets: ok, scale: 1, duration: 300, ease: 'Back.easeOut' });
        }
      }
      box.add(makeButton(scene, 0, btnY, STR.done, close, { ...CONFIG.ui.bigButton, skin: 'green' }));
    }, { ...CONFIG.ui.bigButton, skin: 'green' });
    box.add(btn);
  } else {
    box.add(text(0, btnY - 90, STR.dailyTomorrow, 26, PAL.textDim));
    box.add(makeButton(scene, 0, btnY, STR.ok, close, { ...CONFIG.ui.bigButton, skin: 'green' }));
  }
  sfx(scene, 'sfx_popup', CONFIG.audio.popup);
  box.setScale(0.6).setAlpha(0);
  scene.tweens.add({ targets: box, scale: 1, alpha: 1, duration: 280, ease: 'Back.easeOut' });
  return close;
}

// Карточка дня: главная награда — иконка и подпись.
function rewardLook(r) {
  if (r.chests) return ['chest', r.coins ? `+${r.coins}` : STR.chest];
  if (r.coins) return ['coin', String(r.coins)];
  if (r.undos) return ['undo', `×${r.undos}`];
  if (r.jars) return ['addjar', `×${r.jars}`];
  return ['heart', STR.infiniteMin(r.infiniteMin)];
}

function check(scene, x, y) {
  const ok = scene.add.graphics();
  ok.fillStyle(PAL.okGreen, 1).fillCircle(0, 0, 18);
  ok.lineStyle(5, PAL.white, 1).beginPath().moveTo(-9, 0).lineTo(-2, 7).lineTo(10, -7).strokePath();
  return ok.setPosition(x, y);
}
