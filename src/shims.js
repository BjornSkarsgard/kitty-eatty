// Заплатки окружения. Импортируется в main.js первым, до Phaser.
//
// Phaser при старте делает `navigator.vibrate = navigator.vibrate || ...`.
// На iOS navigator.vibrate — свойство только для чтения, а в собранном Vite
// модуле действует строгий режим, поэтому присваивание падает с TypeError.
// Делаем свойство обычным записываемым, сохранив исходное значение.
try {
  Object.defineProperty(navigator, 'vibrate', {
    value: navigator.vibrate,
    writable: true,
    configurable: true,
  });
} catch (e) {
  // Не получилось — значит свойство и так можно менять.
}
