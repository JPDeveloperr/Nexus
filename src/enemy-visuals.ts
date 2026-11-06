import * as T from "three";
import { Warrior, mesh } from "./visuals";
import type { Archetype } from "./waves";
export interface EnemyBody {
  root: T.Group;
  animate(
    t: number,
    speed: number,
    attack: number,
    hurt: number,
    dead?: boolean,
  ): void;
}
const obsidian = new T.MeshStandardMaterial({
  color: 0x211f31,
  metalness: 0.48,
  roughness: 0.7,
  flatShading: true,
});
const stone = new T.MeshStandardMaterial({
  color: 0x636275,
  metalness: 0.3,
  roughness: 0.8,
  flatShading: true,
});
const scarlet = new T.MeshStandardMaterial({
  color: 0xeb3452,
  emissive: 0x960d2e,
  emissiveIntensity: 1.3,
  metalness: 0.5,
  roughness: 0.3,
});
const violet = new T.MeshStandardMaterial({
  color: 0xcd8aff,
  emissive: 0x8138f0,
  emissiveIntensity: 2,
});
class Raider extends Warrior {
  constructor() {
    super(true);
    this.root.scale.set(0.84, 1.02, 0.84);
    this.cape.scale.set(0.65, 0.65, 1);
    for (let i = 0; i < 3; i++) {
      const fin = mesh(
        new T.ConeGeometry(0.1, 0.55 - i * 0.09, 3),
        scarlet,
        this.head,
        (i - 1) * 0.1,
        0.43,
        -0.06,
      );
      fin.rotation.x = -0.3;
    }
    const dagger = new T.Group();
    this.leftForearm.add(dagger);
    dagger.position.set(0, -0.38, 0);
    dagger.rotation.x = -Math.PI / 2;
    mesh(new T.ConeGeometry(0.12, 0.95, 3), scarlet, dagger, 0, 0.35, 0);
    mesh(new T.TorusGeometry(0.13, 0.04, 4, 8), obsidian, dagger, 0, -0.06, 0);
  }
  animate(t: number, s: number, a: number, h: number, d = false) {
    super.animate(t * 1.35, s, a, h, d);
    if (!d) {
      this.torso.rotation.x = -0.15;
      this.leftArm.rotation.x -= 0.4;
    }
  }
}
class Brute extends Warrior {
  hammer: T.Group;
  constructor() {
    super(true);
    this.root.scale.set(1.55, 1.48, 1.4);
    this.sword.visible = false;
    this.cape.visible = false;
    for (const side of [-1, 1]) {
      const plate = mesh(
        new T.DodecahedronGeometry(0.4, 0),
        stone,
        this.torso,
        side * 0.57,
        0.18,
        0,
      );
      plate.scale.set(1.25, 0.8, 1.1);
      for (let i = 0; i < 2; i++) {
        const spike = mesh(
          new T.ConeGeometry(0.13, 0.55, 4),
          obsidian,
          plate,
          side * 0.15,
          0.22,
          i * 0.25 - 0.1,
        );
        spike.rotation.z = -side * 0.4;
      }
    }
    mesh(
      new T.OctahedronGeometry(0.43),
      obsidian,
      this.torso,
      0,
      0.04,
      0.2,
    ).scale.set(1, 1.1, 0.5);
    mesh(new T.OctahedronGeometry(0.17), violet, this.torso, 0, 0.14, 0.43);
    this.hammer = new T.Group();
    this.rightForearm.add(this.hammer);
    this.hammer.position.y = -0.38;
    this.hammer.rotation.x = -Math.PI / 2;
    mesh(
      new T.CylinderGeometry(0.045, 0.055, 1.2, 6),
      obsidian,
      this.hammer,
      0,
      0.3,
      0,
    );
    const head = mesh(
      new T.DodecahedronGeometry(0.48),
      stone,
      this.hammer,
      0,
      0.94,
      0,
    );
    head.scale.set(1.4, 0.75, 0.9);
    for (const side of [-1, 1])
      mesh(
        new T.OctahedronGeometry(0.16),
        violet,
        this.hammer,
        side * 0.46,
        0.94,
        0,
      );
  }
  animate(t: number, s: number, a: number, h: number, d = false) {
    super.animate(t * 0.65, s, a, h, d);
    if (a > 0) {
      this.rightArm.rotation.x =
        -2.4 + Math.sin(((0.52 - a) / 0.52) * Math.PI) * 2.4;
      this.torso.rotation.x = 0.2;
    }
  }
}
class Archer implements EnemyBody {
  root = new T.Group();
  core: T.Mesh;
  shards: T.Mesh[] = [];
  bow: T.Group;
  constructor() {
    const hood = mesh(
      new T.ConeGeometry(0.55, 0.9, 5),
      obsidian,
      this.root,
      0,
      2.05,
      0,
    );
    hood.rotation.x = 0.12;
    this.core = mesh(
      new T.OctahedronGeometry(0.28),
      violet,
      this.root,
      0,
      1.5,
      0.13,
    );
    const cloak = mesh(
      new T.ConeGeometry(0.72, 1.3, 7, 1, true),
      new T.MeshStandardMaterial({
        color: 0x271a42,
        side: T.DoubleSide,
        roughness: 0.8,
      }),
      this.root,
      0,
      1.02,
      0,
    );
    cloak.rotation.z = Math.PI;
    for (let i = 0; i < 5; i++) {
      const shard = mesh(new T.OctahedronGeometry(0.19), obsidian, this.root);
      shard.scale.set(0.6, 1.6, 0.6);
      this.shards.push(shard);
    }
    this.bow = new T.Group();
    this.root.add(this.bow);
    this.bow.position.set(0.55, 1.35, 0.35);
    const points = [
      new T.Vector3(0, -0.75, 0),
      new T.Vector3(0.4, -0.35, 0.05),
      new T.Vector3(0.48, 0, 0.07),
      new T.Vector3(0.4, 0.35, 0.05),
      new T.Vector3(0, 0.75, 0),
    ];
    mesh(
      new T.TubeGeometry(new T.CatmullRomCurve3(points), 20, 0.06, 5, false),
      violet,
      this.bow,
    );
    mesh(new T.CylinderGeometry(0.012, 0.012, 1.5, 4), scarlet, this.bow);
    mesh(
      new T.ConeGeometry(0.09, 0.6, 4),
      violet,
      this.bow,
      0,
      0,
      0.2,
    ).rotation.x = Math.PI / 2;
  }
  animate(t: number, s: number, a: number, h: number, d = false) {
    this.core.rotation.y = t * 1.5;
    this.core.position.y = 1.5 + Math.sin(t * 3) * 0.08;
    this.shards.forEach((o, i) => {
      const angle = (i * Math.PI * 2) / 5 + t * 0.45;
      o.position.set(
        Math.sin(angle) * 0.52,
        0.55 + Math.cos(t * 2 + i) * 0.12,
        Math.cos(angle) * 0.42,
      );
      o.rotation.y = t;
    });
    this.bow.rotation.x =
      a > 0 ? Math.sin(a * 10) * 0.3 : Math.sin(t * 2) * 0.04;
    this.root.rotation.z = h > 0 ? Math.sin(h * 30) * 0.15 : 0;
    // DeathMotion owns loss of lift, fragment spread and floor contact.
  }
}
export function createEnemyBody(kind: Archetype): EnemyBody {
  return kind === "archer"
    ? new Archer()
    : kind === "brute"
      ? new Brute()
      : kind === "raider"
        ? new Raider()
        : new Warrior(true);
}
