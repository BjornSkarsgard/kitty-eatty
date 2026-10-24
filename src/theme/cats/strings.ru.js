// Все надписи интерфейса (русский). Для Яндекс Игр позже добавим strings.en.js с теми же ключами.
// Тексты с числами — функции. Содержимое темы (имена окрасов, клички) — в config.js и names.js, не здесь.
export const STR = {
  gameTitle: 'Накорми котиков',
  loading: 'Загрузка…',

  // общее
  ok: 'Понятно',
  yes: 'Да',
  no: 'Нет',
  buy: 'Купить',
  noThanks: 'Не надо',
  take: 'Забрать',
  done: 'Готово',
  cancel: 'Отмена',
  coinsLeft: (n) => `Монет: ${n}`,

  // холл
  tabs: { shop: 'Магазин', map: 'Карта', home: 'Главная', collection: 'Коллекция', profile: 'Профиль' },
  play: (n) => `Играть ${n}`,
  soon: 'Скоро откроется',
  profile: { catLevel: 'Уровень кота', passed: 'Пройдено уровней', stars: 'Звёзд собрано' },

  // сундук и подарок дня
  chest: 'Сундук',
  gift: 'Подарок',
  chestInfo: (everyStars, everyCatLevels, stars) =>
    `Сундук даётся за каждые ${everyStars} звёзд и каждый ${everyCatLevels}-й уровень кота.\nЗвёзд: ${stars}/${everyStars}`,
  dailyTitle: 'Подарок дня',
  dailyTomorrow: 'Следующий подарок — завтра',

  // уровень
  level: (n) => `Уровень ${n}`,
  leaveTitle: 'Выйти из уровня?',
  restartTitle: 'Начать заново?',
  noUndosTitle: 'Отмены кончились',
  buyFor: (price) => `Купить за ${price} монет`,
  watchAd: 'Смотреть рекламу',

  // победа и уровень кота
  praise: ['Неплохо!', 'Отлично!', 'Идеально!'], // по числу звёзд (1, 2, 3)
  moves: (moves, min) => `Ходов: ${moves}  ·  минимум ${min}`,
  rewards: 'Награды:',
  alreadyPassed: 'Уровень уже пройден',
  again: 'С начала',
  next: 'Продолжить',
  xpGain: (n) => `+${n} опыта`,
  catLevelUp: 'Новый уровень кота!',

  // жизни
  lifeWillBurn: (n, max) => `Сгорит 1 жизнь. Сейчас жизней: ${n}/${max}`,
  noLivesTitle: 'Жизни кончились',
  livesBackIn: (time, coins) => `Все жизни вернутся через ${time}\nМонет: ${coins}`,
  buyLife: (price) => `Купить жизнь за ${price}`,
  adLives: (n) => `Ролик: +${n} жизни`,
  wait: 'Подождать',

  // коллекция
  collection: 'Коллекция',
  tabSkins: 'Окрасы',
  tabNames: 'Клички',
  catLevelShort: (n) => `Ур. кота ${n}`,
  unlocksAtCatLevel: (n) => `Откроется на ${n} уровне кота`,
  chestOnly: 'Выпадает только из сундуков',
  legendaryChestOnly: 'Легендарная кличка — только из сундуков',
  buySkinQ: (price) => `Купить окрас за ${price} монет?`,
  buyNameQ: (price) => `Купить кличку за ${price} монет?`,

  // клички
  nameLabel: 'Кличка',
  inventName: 'Придумать кличку',
  customNameReward: '✎ Своя кличка',
  customNameTitle: 'Своя кличка',
  nameTooShort: 'Слишком коротко',
  nameTooLong: 'Не длиннее 16 букв',
  nameBadChars: 'Только буквы, пробел и дефис',
  nameForbidden: 'Такую кличку нельзя',
};
