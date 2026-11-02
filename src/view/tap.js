// Отпускание над объектом не является тапом, если нажатие началось на закрывшемся окне.
// Запоминаем сам указатель: второй палец не должен завершать чужое нажатие.
export function onTap(object, action) {
  const pressed = new Set();
  object.on('pointerdown', (pointer) => pressed.add(pointer));
  object.on('pointerout', (pointer) => pressed.delete(pointer));
  object.on('pointerup', (pointer) => {
    if (!pressed.delete(pointer)) return;
    action(pointer);
  });
  object.once('destroy', () => pressed.clear());
  return object;
}
