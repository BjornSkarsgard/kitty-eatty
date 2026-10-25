// Чистая логика поля, без Phaser. Миска — массив порций снизу вверх, порция — индекс цвета.
// capacity — сколько порций одного цвета (столько же вмещает обычная банка); caps — вместимость каждой банки
// (больше capacity — запасная банка ультракота).
export class Board {
  constructor(level) {
    this.capacity = level.capacity;
    this.bowls = level.bowls.map((b) => [...b]);
    this.caps = this.bowls.map(() => level.capacity);
    this.history = [];
  }

  // Добавить пустую банку (умение «+1 банка»); cap — её вместимость. Возвращает её номер.
  addBowl(cap = this.capacity) {
    this.bowls.push([]);
    this.caps.push(cap);
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

  // Брать можно из непустой и ещё не собранной миски.
  canPick(i) {
    return this.bowls[i].length > 0 && !this.isComplete(i);
  }

  canMove(from, to) {
    if (from === to || !this.canPick(from)) return false;
    const dst = this.bowls[to];
    if (dst.length >= this.caps[to]) return false;
    const src = this.bowls[from];
    return !dst.length || dst[dst.length - 1] === src[src.length - 1];
  }

  // Перекладывает верхнюю серию (сколько влезет). Возвращает число порций или 0.
  move(from, to) {
    if (!this.canMove(from, to)) return 0;
    const n = Math.min(this.topRun(from), this.caps[to] - this.bowls[to].length);
    this.bowls[to].push(...this.bowls[from].splice(-n));
    this.history.push({ from, to, n });
    return n;
  }

  // Ульта «Ловкие лапы»: поменять местами две порции [банка, место снизу]. Собранные банки не трогаем.
  // Ход записывается в историю ({ swap: [a, b] }) — отмена возвращает как было. false — нельзя.
  canSwap([b1, s1], [b2, s2]) {
    const ok = (b, s) => s >= 0 && s < this.bowls[b].length && !this.isComplete(b);
    return ok(b1, s1) && ok(b2, s2) && !(b1 === b2 && s1 === s2);
  }

  swap(a, b) {
    if (!this.canSwap(a, b)) return false;
    this.exchange(a, b);
    this.history.push({ swap: [a, b] });
    return true;
  }

  exchange([b1, s1], [b2, s2]) {
    const t = this.bowls[b1][s1];
    this.bowls[b1][s1] = this.bowls[b2][s2];
    this.bowls[b2][s2] = t;
  }

  // Откатывает последний ход (или обмен). Возвращает его запись или null.
  undo() {
    const rec = this.history.pop();
    if (!rec) return null;
    if (rec.swap) this.exchange(...rec.swap);
    else this.bowls[rec.from].push(...this.bowls[rec.to].splice(-rec.n));
    return rec;
  }

  isSolved() {
    return this.bowls.every((b, i) => !b.length || this.isComplete(i));
  }
}
