// Ультракоты — 15 пород (docs/meta.md, «Ульты ультракотов»). Своего арта пока нет: look — окрас обычного кота
// (id из CONFIG.skins), которым порода выглядит, пока не нарисована.
//   tier — ярус цены (CONFIG.ultraPrices); gift — даётся в подарок за прохождение уровня с этим номером (не продаётся);
//   soon — ульта нужна для механики, которой ещё нет (блокеры): пока не продаётся;
//   ult — id ульты (готовые — ULTS_READY), ultName / ultText — для окон;
//   boost — чем сильнее стандартные умения (jarCap — запасная банка вмещает на столько порций больше).
export const ULTRAS = [
  { id: 'mainecoon', name: 'Мейн-кун', look: 'brown', tier: 0, gift: 100, ult: 'swap', ultName: 'Ловкие лапы',
    ultText: 'Поменять местами две любые порции на поле — хоть со дна банки', boost: { jarCap: 1 }, boostText: 'Запасная банка — на порцию больше' },
  { id: 'sphynx', name: 'Сфинкс', look: 'peach', tier: 0, ult: 'paw', ultName: 'Лапа',
    ultText: 'Достать любую порцию из середины банки и положить сверху' },
  { id: 'abyssinian', name: 'Абиссинская', look: 'orange', tier: 0, ult: 'leap', ultName: 'Прыжок',
    ultText: 'Один ход без проверки цвета' },
  { id: 'oriental', name: 'Ориентальная', look: 'cream', tier: 0, ult: 'squeeze', ultName: 'Тесно, но влезет',
    ultText: 'Один ход без проверки вместимости' },
  { id: 'munchkin', name: 'Манчкин', look: 'gold', tier: 0, ult: 'pocket', ultName: 'Карман',
    ultText: 'Кот держит одну порцию в лапах — запасное место на весь уровень' },
  { id: 'ragdoll', name: 'Рэгдолл', look: 'white', tier: 1, ult: 'flip', ultName: 'Кувырок',
    ultText: 'Банка переворачивается вверх дном' },
  { id: 'british', name: 'Британская', look: 'gray', tier: 1, ult: 'order', ultName: 'Порядок',
    ultText: 'Одинаковый корм в банке ложится подряд' },
  { id: 'scottish', name: 'Скоттиш-страйт', look: 'smoke', tier: 1, ult: 'magnet', ultName: 'Магнит',
    ultText: 'Банка собирает наверх весь корм своего верхнего цвета со всего поля' },
  { id: 'siamese', name: 'Сиамская', look: 'cream', tier: 1, ult: 'sharpEye', ultName: 'Зоркий глаз',
    ultText: 'Открывает весь скрытый корм' },
  { id: 'burmese', name: 'Бурманская', look: 'chocolate', tier: 1, ult: 'instinct', ultName: 'Чутьё',
    ultText: 'Показывает 5 правильных ходов' },
  { id: 'bengal', name: 'Бенгальская', look: 'gold', tier: 2, ult: 'hunt', ultName: 'Охота',
    ultText: 'Порции выбранного цвета с верха всех банок слетаются в одну банку' },
  { id: 'persian', name: 'Персидская', look: 'white', tier: 2, ult: 'lazy', ultName: 'Лентяй',
    ultText: 'Сама делает 2 правильных хода' },
  { id: 'russianblue', name: 'Русская голубая', look: 'smoke', tier: 2, ult: 'snack', ultName: 'Перекус',
    ultText: 'Кот съедает все порции одного цвета' },
  { id: 'angora', name: 'Турецкая ангора', look: 'white', tier: 2, ult: 'claws', ultName: 'Когти',
    ultText: 'Снимает лёд с банки' },
  { id: 'norwegian', name: 'Норвежская лесная', look: 'brown', tier: 2, ult: 'blanket', ultName: 'Тёплый плед',
    ultText: 'Размораживает все банки' },
];

// Ульты, которые уже работают в игре. Породу с неготовой ультой пока не продаём («Скоро»).
export const ULTS_READY = new Set([
  'swap', 'paw', 'leap', 'squeeze', 'pocket', 'flip', 'order', 'magnet', 'sharpEye', 'instinct',
  'hunt', 'lazy', 'snack', 'claws', 'blanket',
]);
