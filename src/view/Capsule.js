import * as Phaser from 'phaser';

// Капсула из картинки со скруглёнными концами, растягивается по ширине без искажения концов:
// левый конец, середина (узкая полоска из центра картинки, растянута), правый конец.
// Свой «3-slice» вместо NineSlice: тот работает только в WebGL, а этот — и в Canvas.
export class Capsule extends Phaser.GameObjects.Container {
  // height — высота на экране; концы — полукруги, их ширина = половина высоты картинки.
  constructor(scene, x, y, key, height) {
    super(scene, x, y);
    const tex = scene.textures.get(key);
    const src = tex.getSourceImage();
    const cap = Math.floor(src.height / 2);
    const mid = Math.floor(src.width / 2);
    const frame = (name, fx, fw) => {
      if (!tex.has(name)) tex.add(name, 0, fx, 0, fw, src.height);
      return name;
    };
    this.k = height / src.height;
    this.capW = cap * this.k;
    this.left = scene.add.image(0, 0, key, frame('capL', 0, cap)).setOrigin(0, 0.5).setScale(this.k);
    this.mid = scene.add.image(this.capW, 0, key, frame('capM', mid - 1, 2)).setOrigin(0, 0.5);
    this.right = scene.add.image(0, 0, key, frame('capR', src.width - cap, cap)).setOrigin(0, 0.5).setScale(this.k);
    this.add([this.left, this.mid, this.right]);
    scene.add.existing(this);
  }

  // Ширина от левого края (x контейнера); меньше высоты не бывает — тогда это кружок.
  setWidth(w) {
    const m = Math.max(0, w - 2 * this.capW);
    this.mid.setScale(m / 2, this.k).setVisible(m > 0);
    this.right.x = this.capW + m;
    return this;
  }

  setTint(color) {
    this.list.forEach((img) => img.setTint(color));
    return this;
  }
}
