// Трясём смещением, не отменяя твины еды, наматывания джута и раскрытия порций.
export function shakeObjects(tweens, objects, distance, duration) {
  const offset = { x: 0 };
  let previous = 0;
  const apply = () => {
    const delta = offset.x - previous;
    for (const o of objects) if (o.active !== false) o.x += delta;
    previous = offset.x;
  };
  const reset = () => { offset.x = 0; apply(); };
  const tween = tweens.add({ targets: offset, x: distance, duration, yoyo: true, repeat: 1,
    onUpdate: apply, onComplete: reset });
  return () => { tween.stop(); reset(); };
}
