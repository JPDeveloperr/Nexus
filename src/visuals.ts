import * as T from "three";
import { cutPose, CUT } from "./combat";
import { seededRandom, type Obstacle } from "./mechanics";

const metal = new T.MeshStandardMaterial({
  color: 0x465568,
  metalness: 0.5,
  roughness: 0.38,
});
const edge = new T.MeshStandardMaterial({
  color: 0x8b7970,
  metalness: 0.72,
  roughness: 0.48,
});
const dark = new T.MeshStandardMaterial({ color: 0x101722, roughness: 0.7 });
const cyan = new T.MeshStandardMaterial({
  color: 0x88faff,
  emissive: 0x21d8ef,
  emissiveIntensity: 2.3,
  roughness: 0.25,
});
const red = new T.MeshStandardMaterial({
  color: 0xff7474,
  emissive: 0xf52c55,
  emissiveIntensity: 2,
});
const gold = new T.MeshStandardMaterial({
  color: 0xa29370,
  metalness: 0.8,
  roughness: 0.4,
});
const stone = new T.MeshStandardMaterial({
  color: 0x3c4351,
  roughness: 0.85,
  metalness: 0.17,
});
const stoneLight = new T.MeshStandardMaterial({
  color: 0x606673,
  roughness: 0.8,
  metalness: 0.18,
});
const rock = new T.MeshStandardMaterial({ color: 0x171e30, roughness: 0.94 });
export function mesh(
  g: T.BufferGeometry,
  m: T.Material,
  parent: T.Object3D,
  x = 0,
  y = 0,
  z = 0,
) {
  if (
    [
      "BoxGeometry",
      "CylinderGeometry",
      "SphereGeometry",
      "ConeGeometry",
      "OctahedronGeometry",
      "IcosahedronGeometry",
    ].includes(g.type)
  ) {
    const key =
      g.type +
      JSON.stringify(
        (g as T.BufferGeometry & { parameters: unknown }).parameters,
      );
    const cached = geometryCache.get(key);
    if (cached) {
      g.dispose();
      g = cached;
    } else geometryCache.set(key, g);
  }
  const o = new T.Mesh(g, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
function box(
  parent: T.Object3D,
  m: T.Material,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
) {
  return mesh(new T.BoxGeometry(w, h, d), m, parent, x, y, z);
}
function ring(
  parent: T.Object3D,
  radius: number,
  width: number,
  material: T.Material,
  y = 0.04,
) {
  const r = mesh(
    new T.RingGeometry(radius - width / 2, radius + width / 2, 128),
    material,
    parent,
    0,
    y,
    0,
  );
  r.rotation.x = -Math.PI / 2;
  return r;
}
// Share immutable armour geometry across pooled actors; cloth remains per-character.
const geometryCache = new Map<string, T.BufferGeometry>();
// A tapered, faceted armour shell. Elliptical profiles avoid box-built limbs.
function shell(
  parent: T.Object3D,
  m: T.Material,
  r1: number,
  r2: number,
  h: number,
  x = 0,
  y = 0,
  z = 0,
) {
  const o = mesh(new T.CylinderGeometry(r1, r2, h, 6), m, parent, x, y, z);
  o.scale.z = 0.68;
  return o;
}
export class Warrior {
  root = new T.Group();
  torso = new T.Group();
  head = new T.Group();
  leftArm = new T.Group();
  rightArm = new T.Group();
  leftLeg = new T.Group();
  rightLeg = new T.Group();
  leftForearm = new T.Group();
  rightForearm = new T.Group();
  sword = new T.Group();
  private gait = 0;
  private movementBlend = 0;
  blade: T.Mesh;
  bladeCore: T.Mesh;
  cape: T.Mesh;
  aura: T.Mesh;
  constructor(public corrupted = false) {
    const glow = corrupted ? red : cyan;
    shell(this.root, dark, 0.31, 0.3, 0.38, 0, 1.02, 0);
    this.root.add(this.torso);
    this.torso.position.y = 1.35;
    shell(this.torso, metal, 0.49, 0.32, 0.66, 0, 0.03, 0);
    for (let i = 0; i < 3; i++) {
      const p = shell(
        this.torso,
        metal,
        0.42 - i * 0.035,
        0.39 - i * 0.035,
        0.17,
        0,
        -0.16 + i * 0.16,
        0.11,
      );
      p.rotation.z = (i % 2 ? 1 : -1) * 0.025;
    }
    const insignia = mesh(
      new T.OctahedronGeometry(0.14),
      glow,
      this.torso,
      0,
      0.15,
      0.35,
    );
    insignia.scale.set(0.55, 1.3, 0.22);
    for (const side of [-1, 1]) {
      const trim = box(
        this.torso,
        edge,
        side * 0.27,
        0.12,
        0.28,
        0.045,
        0.47,
        0.055,
      );
      trim.rotation.z = -side * 0.25;
    }
    this.torso.add(this.head);
    this.head.position.y = 0.62;
    shell(this.head, metal, 0.22, 0.28, 0.43);
    const crown = mesh(
      new T.ConeGeometry(0.24, 0.27, 5),
      metal,
      this.head,
      0,
      0.31,
      -0.035,
    );
    crown.scale.z = 0.8;
    const visor = box(this.head, glow, 0, 0.04, 0.187, 0.36, 0.045, 0.06);
    visor.rotation.z = -0.06;
    shell(this.head, dark, 0.15, 0.2, 0.17, 0, -0.22, 0);
    for (const [limb, sign] of [
      [this.leftArm, -1],
      [this.rightArm, 1],
    ] as const) {
      this.torso.add(limb);
      limb.position.set(sign * 0.52, 0.17, 0);
      const pauldron = mesh(
        new T.SphereGeometry(0.32, 5, 3),
        metal,
        limb,
        0,
        0.02,
        0,
      );
      pauldron.scale.set(1.22, 0.75, 1);
      const flange = mesh(
        new T.ConeGeometry(0.16, 0.4, 4),
        edge,
        limb,
        sign * 0.16,
        0.12,
        -0.025,
      );
      flange.rotation.z = -sign * 0.65;
      shell(limb, dark, 0.16, 0.13, 0.47, 0, -0.3, 0);
      const elbow = sign === 1 ? this.rightForearm : this.leftForearm;
      limb.add(elbow);
      elbow.position.y = -0.4;
      shell(elbow, metal, 0.2, 0.13, 0.37, 0, -0.15, 0.015);
      mesh(new T.SphereGeometry(0.13, 6, 5), edge, elbow, 0, -0.37, 0.03);
    }
    for (const [limb, sign] of [
      [this.leftLeg, -1],
      [this.rightLeg, 1],
    ] as const) {
      this.root.add(limb);
      limb.position.set(sign * 0.21, 0.96, 0);
      shell(limb, metal, 0.22, 0.17, 0.43, 0, -0.2, 0);
      mesh(new T.OctahedronGeometry(0.21), edge, limb, 0, -0.43, 0.055);
      shell(limb, metal, 0.18, 0.13, 0.38, 0, -0.63, 0);
      const foot = shell(limb, dark, 0.16, 0.22, 0.17, 0, -0.86, 0.09);
      foot.scale.z = 1.25;
    }
    // Sword silhouette is an extruded, bevelled profile attached to the hand.
    const sword = this.sword;
    this.rightForearm.add(sword);
    sword.position.set(0, -0.39, 0.05);
    sword.rotation.x = -Math.PI / 2;
    shell(sword, dark, 0.055, 0.055, 0.3, 0, -0.04, 0);
    box(sword, edge, 0, 0.13, 0, 0.58, 0.09, 0.14);
    const shape = new T.Shape();
    shape.moveTo(-0.13, 0.18);
    shape.lineTo(-0.15, 1.15);
    shape.lineTo(0, 1.62);
    shape.lineTo(0.15, 1.15);
    shape.lineTo(0.13, 0.18);
    shape.closePath();
    this.blade = mesh(
      new T.ExtrudeGeometry(shape, {
        depth: 0.045,
        bevelEnabled: true,
        bevelSegments: 1,
        steps: 1,
        bevelSize: 0.025,
        bevelThickness: 0.02,
      }),
      new T.MeshStandardMaterial({
        color: corrupted ? 0xe68e9b : 0x9edce5,
        emissive: corrupted ? 0x8b132d : 0x167787,
        emissiveIntensity: 0.6,
        metalness: 0.55,
        roughness: 0.3,
      }),
      sword,
      0,
      0,
      -0.02,
    );
    this.bladeCore = box(
      sword,
      glow.clone(),
      0,
      0.79,
      0.055,
      0.045,
      1.09,
      0.035,
    );
    // Cloth surface with a scalloped hem, deformed every frame.
    const cloth = new T.PlaneGeometry(0.93, 1.29, 8, 10);
    cloth.translate(0, -0.645, 0);
    this.cape = mesh(
      cloth,
      new T.MeshStandardMaterial({
        color: corrupted ? 0x581c33 : 0x153c53,
        side: T.DoubleSide,
        roughness: 0.92,
      }),
      this.torso,
      0,
      0.3,
      -0.3,
    );
    this.cape.rotation.x = 0.2;
    this.aura = ring(
      this.root,
      0.7,
      0.025,
      new T.MeshBasicMaterial({
        color: corrupted ? 0xef566a : 0x62e9ec,
        transparent: true,
        opacity: 0.4,
      }),
      0.025,
    );
  }
  bladeSample() {
    this.root.updateWorldMatrix(true, true);
    return {
      base: this.sword.localToWorld(new T.Vector3(0, 0.24, 0.025)),
      tip: this.sword.localToWorld(new T.Vector3(0, 1.62, 0.025)),
    };
  }
  animate(
    t: number,
    speed: number,
    attack: number,
    hurt: number,
    dead = false,
    dt = 1 / 60,
    action?: {
      elapsed: number;
      profile: { windup: number; activeEnd: number; duration: number };
      charge: number;
      heavy: boolean;
      dodge: number;
    },
  ) {
    this.gait += speed * dt * 2.5;
    this.movementBlend +=
      (Math.min(1, speed / 4.5) - this.movementBlend) *
      (1 - Math.exp(-15 * dt));
    const stride = this.corrupted ? Math.sin(t * 10) : Math.sin(this.gait),
      run = this.corrupted ? Math.min(1, speed / 4.5) : this.movementBlend;
    this.leftArm.rotation.set(0, 0, 0);
    this.rightArm.rotation.set(0, 0, 0);
    this.leftForearm.rotation.set(0, 0, 0);
    this.rightForearm.rotation.set(0, 0, 0);
    this.sword.rotation.set(-Math.PI / 2, 0, 0);
    this.torso.rotation.x = -run * 0.07;
    this.torso.position.y =
      1.35 + Math.sin(t * 2) * 0.018 + Math.abs(stride) * 0.045 * run;
    this.leftLeg.rotation.x = stride * 0.65 * run;
    this.rightLeg.rotation.x = -stride * 0.65 * run;
    this.leftArm.rotation.x = -stride * 0.45 * run - 0.12;
    this.rightArm.rotation.x = stride * 0.38 * run - 0.18;
    this.rightArm.rotation.z = -0.08;
    this.torso.rotation.y = 0;
    if (attack > 0 && this.corrupted) {
      const p = attack / 0.52;
      this.torso.rotation.y = Math.sin(p * Math.PI * 2) * 0.65;
      this.rightArm.rotation.x = -1.3 - Math.sin(p * Math.PI) * 0.5;
      this.rightArm.rotation.z = -0.8 + Math.sin(p * Math.PI * 1.7) * 1.7;
    }
    if (!this.corrupted && (attack > 0 || (action?.charge || 0) > 0)) {
      const pose =
          (action?.charge || 0) > 0
            ? cutPose(CUT.windup * 0.98)
            : cutPose(
                action?.elapsed ?? CUT.duration - attack,
                action?.profile,
              ),
        blend = pose.blend;
      this.torso.rotation.y = pose.torso;
      this.rightArm.rotation.x = T.MathUtils.lerp(
        this.rightArm.rotation.x,
        -1.25,
        blend,
      );
      this.rightArm.rotation.z = T.MathUtils.lerp(-0.08, -0.72, blend);
      this.rightForearm.rotation.x = -0.45 * blend;
      this.root.updateWorldMatrix(true, true);
      const desired = new T.Vector3(
        Math.sin(pose.sweep * (action?.heavy ? 1.18 : 1)),
        0.06,
        Math.cos(pose.sweep * (action?.heavy ? 1.18 : 1)),
      ).normalize();
      const rootQ = this.root.getWorldQuaternion(new T.Quaternion());
      const worldQ = rootQ.multiply(
        new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), desired),
      );
      const localQ = this.rightForearm
        .getWorldQuaternion(new T.Quaternion())
        .invert()
        .multiply(worldQ);
      this.sword.quaternion.slerp(localQ, blend);
      this.root.updateWorldMatrix(true, true);
      // Two-link support arm IK: shoulder and elbow follow the actual sword grip.
      const grip = this.torso.worldToLocal(
        this.sword.localToWorld(new T.Vector3(0, -0.02, 0)),
      );
      const shoulder = this.leftArm.position.clone(),
        toGrip = grip.sub(shoulder);
      const distance = Math.min(0.765, Math.max(0.05, toGrip.length())),
        direction = toGrip.normalize();
      const along =
        (0.4 * 0.4 - 0.39 * 0.39 + distance * distance) / (2 * distance);
      const pole = new T.Vector3(-1, -0.2, 0.5);
      pole.addScaledVector(direction, -pole.dot(direction)).normalize();
      const elbow = direction
        .clone()
        .multiplyScalar(along)
        .addScaledVector(
          pole,
          Math.sqrt(Math.max(0, 0.4 * 0.4 - along * along)),
        );
      const upperQ = new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, -1, 0),
        elbow.clone().normalize(),
      );
      this.leftArm.quaternion.slerp(upperQ, blend);
      const lower = direction
        .multiplyScalar(distance)
        .sub(elbow)
        .normalize()
        .applyQuaternion(this.leftArm.quaternion.clone().invert());
      this.leftForearm.quaternion.slerp(
        new T.Quaternion().setFromUnitVectors(new T.Vector3(0, -1, 0), lower),
        blend,
      );
    }
    (this.blade.material as T.MeshStandardMaterial).emissiveIntensity =
      !this.corrupted && attack > 0
        ? 0.6 +
          cutPose(action?.elapsed ?? CUT.duration - attack, action?.profile)
            .blend *
            1.8
        : 0.6;
    if (!this.corrupted) {
      const power = action?.charge || (action?.heavy ? 1 : 0);
      const material = this.blade.material as T.MeshStandardMaterial,
        core = this.bladeCore.material as T.MeshStandardMaterial;
      const redMix = Math.min(1, power * 4);
      material.color.set(0x9edce5).lerp(new T.Color(0xe71339), redMix);
      material.emissive.set(0x167787).lerp(new T.Color(0xff1239), redMix);
      if (power > 0)
        material.emissiveIntensity =
          0.8 + power * 3.5 + Math.sin(t * 24) * power * 0.35;
      core.color.set(power > 0 ? 0xff4161 : 0x88faff);
      core.emissive.set(power > 0 ? 0xff1538 : 0x21d8ef);
      core.emissiveIntensity = 2.3 + power * 4;
      if ((action?.dodge ?? -1) >= 0) {
        this.torso.rotation.x = -0.65;
        this.torso.position.y -= 0.22;
        this.leftLeg.rotation.x = -0.8;
        this.rightLeg.rotation.x = 0.9;
      }
    }
    this.torso.rotation.z = hurt > 0 ? Math.sin(hurt * 35) * 0.14 : 0;
    this.root.rotation.z = dead
      ? Math.min(1.4, this.root.rotation.z + 0.05)
      : 0;
    const a = this.cape.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const y = a.getY(i),
        x = a.getX(i);
      a.setZ(
        i,
        Math.pow(-y / 1.3, 1.3) *
          (-0.2 -
            run * 0.48 +
            Math.sin(t * 4 + x * 4 + y * 3) * (0.08 + run * 0.08)),
      );
    }
    a.needsUpdate = true;
    this.cape.geometry.computeVertexNormals();
  }
}
export class Temple {
  root = new T.Group();
  obstacles: Obstacle[] = [];
  crystals: T.Group[] = [];
  debris: T.Mesh[] = [];
  particles: T.Points;
  portal: T.Mesh;
  random: () => number;
  constructor(public seed = 7341) {
    this.random = seededRandom(seed);
    const r = this.random;
    // The island has an intact stone rim and an irregular faceted underside.
    mesh(
      new T.CylinderGeometry(15, 15.2, 0.8, 64),
      stone,
      this.root,
      0,
      -0.43,
      0,
    );
    mesh(
      new T.CylinderGeometry(15.1, 10, 3.6, 13, 3),
      rock,
      this.root,
      0,
      -2.6,
      0,
    );
    mesh(new T.ConeGeometry(10, 6, 9), rock, this.root, 0, -6, 0).rotation.z =
      Math.PI;
    const tileGeo = new T.BoxGeometry(0.99, 0.14, 0.99);
    const tiles = new T.InstancedMesh(
      tileGeo,
      new T.MeshStandardMaterial({
        color: 0x555c69,
        roughness: 0.85,
        metalness: 0.2,
      }),
      800,
    );
    const dummy = new T.Object3D();
    let count = 0;
    for (let x = -14; x <= 14; x++)
      for (let z = -14; z <= 14; z++)
        if (Math.hypot(x, z) < 14.6) {
          dummy.position.set(x, (r() - 0.5) * 0.025 - 0.05, z);
          dummy.rotation.y = 0;
          dummy.updateMatrix();
          tiles.setMatrixAt(count, dummy.matrix);
          tiles.setColorAt(
            count++,
            new T.Color().setHSL(0.61, 0.09, 0.22 + r() * 0.095),
          );
        }
    tiles.count = count;
    tiles.receiveShadow = true;
    this.root.add(tiles);
    for (const radius of [3.3, 3.5, 8.8, 9, 14.7])
      ring(this.root, radius, 0.035, radius < 4 ? edge : gold, 0.035);
    ring(
      this.root,
      3.05,
      0.022,
      new T.MeshBasicMaterial({ color: 0x459eac }),
      0.04,
    );
    // Radial inlays and a central engraved dimensional sigil.
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const rune = box(
        this.root,
        gold,
        Math.sin(a) * 3.4,
        0.045,
        Math.cos(a) * 3.4,
        0.13,
        0.03,
        0.35,
      );
      rune.rotation.y = a;
      const line = box(
        this.root,
        edge,
        Math.sin(a) * 11.8,
        0.027,
        Math.cos(a) * 11.8,
        0.035,
        0.025,
        5,
      );
      line.rotation.y = a;
    }
    for (let i = 0; i < 3; i++) {
      const square = ring(this.root, 1.5 + i * 0.25, 0.025, edge, 0.04);
      square.geometry.dispose();
      square.geometry = new T.RingGeometry(1.5 + i * 0.25, 1.53 + i * 0.25, 4);
      square.rotation.z = (i * Math.PI) / 4;
    }
    // Ruin colonnade stays outside the central combat space.
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2,
        x = Math.sin(a) * 12.8,
        z = Math.cos(a) * 12.8;
      if (z > 8 && Math.abs(x) < 6) continue;
      const h = 3.2 + r() * 3.7;
      this.column(x, z, h, a);
      this.obstacles.push({ x, z, radius: 0.92 });
      if (i % 2 === 0) this.crystal(x * 0.82, z * 0.82, 0.8 + r() * 0.4);
    }
    // Monumental gate and broad ceremonial stair beyond the northern edge.
    for (let step = 0; step < 7; step++)
      box(
        this.root,
        stoneLight,
        0,
        step * 0.21,
        -12.7 - step * 0.6,
        6.8 - step * 0.12,
        0.3,
        1.1,
      );
    for (const side of [-1, 1]) {
      this.column(side * 3.9, -16.4, 8, 0);
      box(this.root, gold, side * 3.9, 4, -16.4, 0.1, 6, 0.92);
      for (let i = 0; i < 4; i++) {
        const a = ((i / 3) * Math.PI) / 2;
        const p = box(
          this.root,
          stoneLight,
          side * (3.9 - Math.sin(a) * 2),
          7.4 + Math.cos(a) * 1.8,
          -16.4,
          1.25,
          1.35,
          1.5,
        );
        p.rotation.z = side * a * 0.7;
      }
    }
    box(this.root, stoneLight, 0, 9.3, -16.4, 3.5, 1, 1.7);
    const portalGeometry = new T.PlaneGeometry(5.5, 7);
    this.portal = mesh(
      portalGeometry,
      new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { time: { value: 0 } },
        vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
        fragmentShader: `varying vec2 vUv; uniform float time; void main(){vec2 p=vUv-.5; float rim=pow(max(0.,1.-length(p*vec2(2.,1.8))),2.);float strands=pow(.5+.5*sin(p.x*45.+sin(p.y*16.+time)*2.),8.);vec3 c=mix(vec3(.12,.15,.4),vec3(.13,.9,1.),strands); gl_FragColor=vec4(c,rim*(.3+strands*.5));}`,
      }),
      this.root,
      0,
      4.4,
      -16.25,
    );
    for (let i = 0; i < 32; i++) {
      const a = r() * Math.PI * 2,
        dist = 19 + r() * 25;
      const island = mesh(
        new T.IcosahedronGeometry(1, 0),
        rock,
        this.root,
        Math.sin(a) * dist,
        -4 - r() * 15,
        Math.cos(a) * dist,
      );
      island.scale.set(1 + r() * 3, 1 + r() * 4, 1 + r() * 3);
      island.rotation.set(r(), r(), r());
      this.debris.push(island);
      if (i < 8) {
        const ruin = mesh(
          new T.CylinderGeometry(0.7, 0.8, 4, 6),
          stone,
          island,
          0,
          1.2,
          0,
        );
        ruin.scale.set(0.4, 0.6, 0.4);
      }
    }
    const positions = new Float32Array(250 * 3);
    for (let i = 0; i < 250; i++) {
      positions[i * 3] = (r() - 0.5) * 60;
      positions[i * 3 + 1] = r() * 14 - 2;
      positions[i * 3 + 2] = (r() - 0.5) * 60;
    }
    const pg = new T.BufferGeometry();
    pg.setAttribute("position", new T.BufferAttribute(positions, 3));
    this.particles = new T.Points(
      pg,
      new T.PointsMaterial({
        color: 0x83dbe4,
        size: 0.045,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
    this.root.add(this.particles);
  }
  column(x: number, z: number, h: number, a: number) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = a;
    this.root.add(g);
    box(g, stone, 0, 0.15, 0, 1.8, 0.3, 1.8);
    box(g, edge, 0, 0.34, 0, 1.5, 0.09, 1.5);
    mesh(
      new T.CylinderGeometry(0.55, 0.72, h, 8),
      stoneLight,
      g,
      0,
      h / 2 + 0.4,
      0,
    );
    for (let j = 0; j < 4; j++) {
      const angle = (j * Math.PI) / 2;
      box(
        g,
        stone,
        Math.sin(angle) * 0.48,
        h / 2 + 0.4,
        Math.cos(angle) * 0.48,
        0.16,
        h - 0.3,
        0.16,
      );
    }
    box(g, stone, 0, h + 0.45, 0, 1.5, 0.35, 1.5);
    box(g, edge, 0, h + 0.65, 0, 1.65, 0.1, 1.65);
  }
  crystal(x: number, z: number, size: number) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    this.root.add(g);
    mesh(new T.CylinderGeometry(0.65, 0.9, 0.5, 6), dark, g, 0, 0.2, 0);
    for (let i = 0; i < 3; i++) {
      const c = mesh(
        new T.OctahedronGeometry(0.45, 0),
        cyan,
        g,
        (i - 1) * 0.27,
        1 + (i === 1 ? 0.3 : 0),
        0,
      );
      c.scale.set(0.65, size * (i === 1 ? 2.8 : 1.6), 0.7);
      c.rotation.z = (i - 1) * -0.3;
    }
    const light = new T.PointLight(0x31cfe5, 9, 7, 2);
    light.position.y = 1.5;
    g.add(light);
    this.crystals.push(g);
    this.obstacles.push({ x, z, radius: 0.85 });
  }
  update(t: number) {
    (this.portal.material as T.ShaderMaterial).uniforms.time.value = t;
    this.particles.rotation.y = t * 0.008;
    for (let i = 0; i < this.debris.length; i++)
      this.debris[i].rotation.y += 0.0003 * (i % 2 ? 1 : -1);
  }
}
