import { defineConfig } from 'vite';

// Phaser при старте переприсваивает navigator.vibrate / navigator.getUserMedia / window.URL.
// В браузерах на iOS (Яндекс Браузер и др.) эти свойства только для чтения, а собранный
// модуль работает в строгом режиме — присваивание бросает TypeError и игра не стартует.
// Оборачиваем эти строки в try/catch прямо в коде Phaser при сборке.
const READONLY_ASSIGN = /^(\s*)((?:navigator\.(?:vibrate|getUserMedia)|window\.URL) = [^;\n]+;)/gm;

const phaserIosFix = {
  name: 'phaser-ios-readonly-fix',
  transform(code, id) {
    if (!/[\\/]phaser[\\/]/.test(id)) return null;
    if (!READONLY_ASSIGN.test(code)) return null;
    READONLY_ASSIGN.lastIndex = 0;
    return { code: code.replace(READONLY_ASSIGN, '$1try { $2 } catch (e) {}'), map: null };
  },
};

export default defineConfig({
  base: './', // относительные пути — нужно для Cordova и Яндекс Игр
  plugins: [phaserIosFix], // для сборки (npm run build)
  optimizeDeps: {
    rolldownOptions: { plugins: [phaserIosFix] }, // для dev-сервера (npm run dev)
  },
  build: {
    chunkSizeWarningLimit: 2000, // Phaser сам по себе ~1.2 МБ, это нормально
  },
  server: {
    host: true, // слушать в локальной сети, чтобы открыть с телефона по Wi-Fi
    port: 5173,
  },
});
