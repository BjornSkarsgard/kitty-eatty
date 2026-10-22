import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // относительные пути — нужно для Cordova и Яндекс Игр
  build: {
    chunkSizeWarningLimit: 2000, // Phaser сам по себе ~1.2 МБ, это нормально
  },
  server: {
    host: true, // слушать в локальной сети, чтобы открыть с телефона по Wi-Fi
    port: 5173,
  },
});
