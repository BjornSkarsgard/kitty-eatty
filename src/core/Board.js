// Чистая логика поля, без Phaser. Миска — массив порций снизу вверх, порция — индекс цвета.
// capacity — сколько порций одного цвета (столько же вмещает обычная банка); caps — вместимость каждой банки
// (больше capacity — запасная банка ультракота, 1 — «Карман» манчкина).
// hid — скрытый корм «?»: флаги рядом с цветами (hid[i][s] — порция скрыта), переезжают вместе с порцией;
// верхняя порция банки всегда открыта (reveal после каждого изменения), открытая больше не скрывается.
// ice — лёд: ice[i] = k — банка заморожена, пока не собрано k банок; из неё нельзя брать и в неё нельзя класть.
// Растаявшая (thawed) больше не замерзает, даже после отмены.
// history — ходы { from, to, n }, обмены { swap } и ульты { snap } (снимок поля до ульты — отмена возвращает его).
export class Board {
  constructor(level) {
    this.capacity = level.capacity;
    this.bowls = level.bowls.map((b) => [...b]);
    this.caps = this.bowls.map(() => level.capacity);
    this.hid = this.bowls.map((b, i) => b.map((_, s) => !!level.hidden?.[i]?.[s]));
    this.ice = this.bowls.map(() => 0);
    for (const [i, k] of level.ice ?? []) this.ice[i] = k;
    this.thawed = this.bowls.map(() => false);
    this.history = [];
    this.changes = { revealed: [], thawed: [] };
    this.after();
    this.changes = { revealed: [], thawed: [] }; // открытое на старте — не событие
  }

  // После любого изменения: открыть верхний корм, растопить лёд. События копятся до takeChanges (для анимаций).
  after() {
    this.changes.revealed.push(...this.reveal());
    this.changes.thawed.push(...this.thaw());
  }

  takeChanges() {
    const c = this.changes;
    this.changes = { revealed: [], thawed: [] };
    return c;
  }

  // Добавить пустую банку (умение «+1 банка», «Карман»); cap — её вместимость. Возвращает её номер.
  addBowl(cap = this.capacity) {
    this.bowls.push([]);
    this.hid.push([]);
    this.caps.push(cap);
    this.ice.push(0);
    this.thawed.push(false);
    return this.bowls.length - 1;
  }

  // Сколько одинаковых порций лежит сверху подряд.
  topRun(i) {
    const b = this.bowls[i];
    if (!b.length) return 0;
    const color = b[b.length - 1];
    let run = 1;
    while (run < b.length && b[b.length - 1 - run] === color) run++;
    return run;
  }

  isComplete(i) {
    const b = this.bowls[i];
    return b.length === this.capacity && b.every((c) => c === b[0]);
  }

  completedCount() {
    return this.bowls.reduce((n, _, i) => n + (this.isComplete(i) ? 1 : 0), 0);
  }

  isFrozen(i) {
    return this.ice[i] > 0 && !this.thawed[i];
  }

  // Сколько ещё собрать банок до таяния (0 — не заморожена).
  iceLeft(i) {
    return this.isFrozen(i) ? this.ice[i] - this.completedCount() : 0;
  }

  // Растопить лёд, где собрано достаточно банок. Возвращает номера растаявших сейчас.
  thaw() {
    const done = this.completedCount();
    const now = [];
    this.ice.forEach((k, i) => {
      if (k > 0 && !this.thawed[i] && done >= k) { this.thawed[i] = true; now.push(i); }
    });
    return now;
  }

  // Растопить банку сразу (ульты «Когти», «Тёплый плед»). Записывается в историю — но лёд обратно не нарастает.
  thawNow(list) {
    const now = list.filter((i) => this.isFrozen(i));
    now.forEach((i) => { this.thawed[i] = true; });
    this.changes.thawed.push(...now);
    return now;
  }

  // Открыть верхние порции. Возвращает [[банка, место], …] открывшихся сейчас.
  reveal() {
    const now = [];
    this.bowls.forEach((b, i) => {
      const s = b.length - 1;
      if (s >= 0 && this.hid[i][s]) { this.hid[i][s] = false; now.push([i, s]); }
    });
    return now;
  }

  isHidden(i, s) {
    return !!this.hid[i][s];
  }

  // Брать можно из непустой, не собранной и не замороженной миски.
  canPick(i) {
    return this.bowls[i].length > 0 && !this.isComplete(i) && !this.isFrozen(i);
  }

  canMove(from, to, { anyColor = false, anyRoom = false } = {}) {
    if (from === to || !this.canPick(from) || this.isFrozen(to)) return false;
    const dst = this.bowls[to];
    if (!anyRoom && dst.length >= this.caps[to]) return false;
    const src = this.bowls[from];
    return anyColor || !dst.length || dst[dst.length - 1] === src[src.length - 1];
  }

  // Перекладывает верхнюю серию (сколько влезет). Возвращает число порций или 0.
  // anyColor — ульта «Прыжок» (цвет не важен), anyRoom — «Тесно, но влезет» (вся серия, сверх вместимости).
  move(from, to, opts = {}) {
    if (!this.canMove(from, to, opts)) return 0;
    const run = this.topRun(from);
    const n = opts.anyRoom ? run : Math.min(run, this.caps[to] - this.bowls[to].length);
    this.bowls[to].push(...this.bowls[from].splice(-n));
    this.hid[to].push(...this.hid[from].splice(-n).map(() => false)); // переложенные — уже на виду
    this.history.push({ from, to, n });
    this.after();
    return n;
  }

  // Ульта «Ловкие лапы»: поменять местами две порции [банка, место снизу]. Собранные и замороженные не трогаем.
  canSwap([b1, s1], [b2, s2]) {
    const ok = (b, s) => s >= 0 && s < this.bowls[b].length && !this.isComplete(b) && !this.isFrozen(b);
    return ok(b1, s1) && ok(b2, s2) && !(b1 === b2 && s1 === s2);
  }

  swap(a, b) {
    if (!this.canSwap(a, b)) return false;
    this.exchange(a, b);
    this.history.push({ swap: [a, b] });
    this.after();
    return true;
  }

  exchange([b1, s1], [b2, s2]) {
    for (const arr of [this.bowls, this.hid]) {
      const t = arr[b1][s1];
      arr[b1][s1] = arr[b2][s2];
      arr[b2][s2] = t;
    }
  }

  // ---------- ульты: снимок поля, изменение, запись в историю ----------

  snapshot() {
    return { bowls: this.bowls.map((b) => [...b]), hid: this.hid.map((h) => [...h]), caps: [...this.caps] };
  }

  // Применить изменение change() как одну ульту. false — ничего не изменилось (снимок не пишется).
  ultOp(change) {
    const snap = this.snapshot();
    if (!change()) return false;
    this.history.push({ snap });
    this.after();
    return true;
  }

  // Можно ли трогать банку ультой: не пустая (если нужно), не собранная, не замороженная.
  open(i, needFood = true) {
    return (!needFood || this.bowls[i].length > 0) && !this.isComplete(i) && !this.isFrozen(i);
  }

  // «Лапа»: порция с места s поднимается наверх своей банки.
  paw(i, s) {
    const b = this.bowls[i];
    if (!this.open(i) || s < 0 || s >= b.length - 1) return false;
    return this.ultOp(() => {
      b.push(...b.splice(s, 1));
      this.hid[i].push(...this.hid[i].splice(s, 1).map(() => false));
      return true;
    });
  }

  // «Кувырок»: банка вверх дном.
  flip(i) {
    if (!this.open(i) || this.bowls[i].length < 2) return false;
    return this.ultOp(() => { this.bowls[i].reverse(); this.hid[i].reverse(); return true; });
  }

  // «Порядок»: одинаковый корм в банке ложится подряд; сверху остаётся верхний цвет, ниже — по порядку появления сверху вниз.
  order(i) {
    const b = this.bowls[i];
    if (!this.open(i) || b.length < 2) return false;
    const seen = [];
    for (let s = b.length - 1; s >= 0; s--) if (!seen.includes(b[s])) seen.push(b[s]);
    const sorted = seen.slice().reverse().flatMap((c) => b.filter((x) => x === c));
    if (sorted.every((c, s) => c === b[s])) return false;
    return this.ultOp(() => {
      this.bowls[i] = sorted;
      this.hid[i] = sorted.map(() => false); // кот всё перебрал — всё видно
      return true;
    });
  }

  // «Магнит»: банка i забирает с верха остальных банок серии своего верхнего цвета, сколько влезет.
  magnet(i) {
    const b = this.bowls[i];
    if (!this.open(i)) return false;
    const c = b[b.length - 1];
    return this.ultOp(() => {
      let any = false;
      for (let j = 0; j < this.bowls.length && b.length < this.caps[i]; j++) {
        const s = this.bowls[j];
        if (j === i || !this.open(j) || s[s.length - 1] !== c) continue;
        const n = Math.min(this.topRun(j), this.caps[i] - b.length);
        b.push(...s.splice(-n));
        this.hid[i].push(...this.hid[j].splice(-n).map(() => false));
        any = true;
      }
      return any;
    });
  }

  // «Охота»: все порции цвета c со всего поля (из любых мест, кроме собранных и замороженных банок) слетаются
  // в банку dest — пустую или где только этот цвет.
  canHunt(c, dest) {
    const d = this.bowls[dest];
    return this.open(dest, false) && d.every((x) => x === c) && d.length < this.capacity;
  }

  hunt(c, dest) {
    if (!this.canHunt(c, dest)) return false;
    return this.ultOp(() => {
      let any = false;
      this.bowls.forEach((s, j) => {
        if (j === dest || !this.open(j)) return;
        for (let k = s.length - 1; k >= 0; k--) {
          if (s[k] !== c || this.bowls[dest].length >= this.caps[dest]) continue;
          s.splice(k, 1);
          this.hid[j].splice(k, 1);
          this.bowls[dest].push(c);
          this.hid[dest].push(false);
          any = true;
        }
      });
      return any;
    });
  }

  // «Перекус»: кот съедает все порции цвета c (кроме собранных и замороженных банок) — цвет уходит с поля.
  snack(c) {
    return this.ultOp(() => {
      let any = false;
      this.bowls.forEach((s, j) => {
        if (!this.open(j)) return;
        for (let k = s.length - 1; k >= 0; k--) {
          if (s[k] !== c) continue;
          s.splice(k, 1);
          this.hid[j].splice(k, 1);
          any = true;
        }
      });
      return any;
    });
  }

  // «Зоркий глаз»: открыть весь скрытый корм.
  revealAll() {
    if (!this.hid.some((h) => h.some(Boolean))) return false;
    return this.ultOp(() => { this.hid = this.hid.map((h) => h.map(() => false)); return true; });
  }

  // Откатывает последний ход, обмен или ульту. Возвращает его запись или null.
  undo() {
    const rec = this.history.pop();
    if (!rec) return null;
    if (rec.snap) {
      // банки, добавленные после ульты («+1 банка», «Карман»), остаются — к этому моменту они уже пустые
      rec.snap.bowls.forEach((b, i) => {
        this.bowls[i] = [...b];
        this.hid[i] = [...rec.snap.hid[i]];
        this.caps[i] = rec.snap.caps[i];
      });
    } else if (rec.swap) this.exchange(...rec.swap);
    else {
      this.bowls[rec.from].push(...this.bowls[rec.to].splice(-rec.n));
      this.hid[rec.from].push(...this.hid[rec.to].splice(-rec.n));
    }
    this.after();
    return rec;
  }

  isSolved() {
    return this.bowls.every((b, i) => !b.length || this.isComplete(i));
  }
}
