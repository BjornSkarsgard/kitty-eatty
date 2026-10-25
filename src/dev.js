// Инструменты для тестов (ссылки ?set= / ?give= / ?level= / ?fps, бесконечная ульта, window.__game):
// в режиме разработки (npm run dev) и в тестовой сборке для GitHub Pages (VITE_TEST_TOOLS=1).
// В обычной сборке (npm run build — Cordova, магазины) их нет.
export const TEST_TOOLS = !!(import.meta.env?.DEV || import.meta.env?.VITE_TEST_TOOLS === '1');
