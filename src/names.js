// Клички кота (docs/meta.md). rarity: common / rare / legendary — от неё цена и шанс выпасть из сундука.
// start — есть с начала; catLevel — даётся за этот уровень кота; легендарные в магазине не продаются.
// Список можно свободно дополнять: id — латиницей, не менять у уже выпущенных (по нему хранится в сохранении).
export const NAMES = [
  { id: 'kotik', name: 'Котик', rarity: 'common', start: true },
  { id: 'murzik', name: 'Мурзик', rarity: 'common', catLevel: 2 },
  { id: 'barsik', name: 'Барсик', rarity: 'common' },
  { id: 'vaska', name: 'Васька', rarity: 'common' },
  { id: 'pushok', name: 'Пушок', rarity: 'common' },
  { id: 'ryzhik', name: 'Рыжик', rarity: 'common' },
  { id: 'timosha', name: 'Тимоша', rarity: 'common' },
  { id: 'kuzya', name: 'Кузя', rarity: 'common' },
  { id: 'persik', name: 'Персик', rarity: 'common' },
  { id: 'masyanya', name: 'Масяня', rarity: 'common' },
  { id: 'murka', name: 'Мурка', rarity: 'common' },
  { id: 'simba', name: 'Симба', rarity: 'common' },
  { id: 'bonya', name: 'Боня', rarity: 'common' },
  { id: 'tisha', name: 'Тиша', rarity: 'common' },
  { id: 'pirat', name: 'Пират', rarity: 'common' },
  { id: 'filya', name: 'Филя', rarity: 'common' },
  { id: 'plyushka', name: 'Плюшка', rarity: 'common' },
  { id: 'busya', name: 'Буся', rarity: 'common' },
  { id: 'sonya', name: 'Соня', rarity: 'common' },
  { id: 'markiz', name: 'Маркиз', rarity: 'common' },
  { id: 'lucky', name: 'Лаки', rarity: 'common' },
  { id: 'tosha', name: 'Тоша', rarity: 'common' },
  { id: 'myasik', name: 'Мясик', rarity: 'common' },
  { id: 'kexik', name: 'Кексик', rarity: 'common' },
  { id: 'umka', name: 'Умка', rarity: 'common' },
  { id: 'gosha', name: 'Гоша', rarity: 'common' },
  { id: 'luna', name: 'Луна', rarity: 'common' },
  { id: 'mila', name: 'Мила', rarity: 'common' },
  { id: 'pelmen', name: 'Пельмень', rarity: 'rare', catLevel: 7 },
  { id: 'kotleta', name: 'Котлета', rarity: 'rare' },
  { id: 'shprot', name: 'Шпрот', rarity: 'rare' },
  { id: 'sosiska', name: 'Сосиска', rarity: 'rare' },
  { id: 'pirozhok', name: 'Пирожок', rarity: 'rare' },
  { id: 'bublik', name: 'Бублик', rarity: 'rare' },
  { id: 'vatrushka', name: 'Ватрушка', rarity: 'rare' },
  { id: 'murmelad', name: 'Мурмелад', rarity: 'rare' },
  { id: 'teftel', name: 'Тефтель', rarity: 'rare' },
  { id: 'pryanik', name: 'Пряник', rarity: 'rare' },
  { id: 'syrnik', name: 'Сырник', rarity: 'rare', catLevel: 15 },
  { id: 'pelmeshka', name: 'Пельмешка', rarity: 'rare' },
  { id: 'graf', name: 'Граф Мурлыкин', rarity: 'legendary' },
  { id: 'pushistost', name: 'Его Пушистость', rarity: 'legendary' },
  { id: 'smetana', name: 'Король Сметаны', rarity: 'legendary' },
  { id: 'baron', name: 'Барон фон Мяу', rarity: 'legendary' },
  { id: 'admiral', name: 'Адмирал Хвост', rarity: 'legendary' },
  { id: 'usy', name: 'Мистер Усы', rarity: 'legendary', catLevel: 25 },
  { id: 'lord', name: 'Лорд Мурчалло', rarity: 'legendary' },
  { id: 'professor', name: 'Профессор Мяукин', rarity: 'legendary' },
];

// Своя кличка (именная табличка): буквы, пробел и дефис, 2–16 символов, без плохих слов.
// Это первая защита; когда появится рейтинг, клички будут проверяться ещё и на сервере.
const BAD = [
  'хуй', 'хуе', 'хуё', 'хуя', 'пизд', 'еба', 'ёба', 'ебл', 'ебу', 'ебё', 'бля', 'сук', 'сучк', 'муда', 'мудо', 'пидо', 'пидр',
  'гандон', 'гондон', 'залуп', 'шлюх', 'дроч', 'манда', 'жоп', 'сра', 'сран', 'говн', 'дерьм', 'нацис', 'фашис', 'гитлер',
  'fuck', 'shit', 'bitch', 'dick', 'cunt', 'nigg', 'fag', 'whore', 'porn', 'sex', 'секс', 'порн',
];

// null — можно; иначе — почему нельзя (показать игроку).
export function checkCustomName(raw) {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (s.length < 2) return 'Слишком коротко';
  if (s.length > 16) return 'Не длиннее 16 букв';
  if (!/^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё -]*$/.test(s)) return 'Только буквы, пробел и дефис';
  // склеиваем, заменяем похожие латинские буквы на русские — чтобы не обходили фильтр пробелами и «латиницей»
  const flat = s.toLowerCase().replace(/[\s-]/g, '')
    .replace(/a/g, 'а').replace(/e/g, 'е').replace(/o/g, 'о').replace(/p/g, 'р').replace(/c/g, 'с').replace(/x/g, 'х').replace(/y/g, 'у');
  if (BAD.some((w) => flat.includes(w) || s.toLowerCase().replace(/[\s-]/g, '').includes(w))) return 'Такую кличку нельзя';
  return null;
}
