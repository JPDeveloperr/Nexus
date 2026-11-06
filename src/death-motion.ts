import * as T from "three";
import { Warrior } from "./visuals";
import type { EnemyBody } from "./enemy-visuals";
import type { Archetype } from "./waves";
const ease = (x: number) => {
  x = T.MathUtils.clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};
export const DEATH_DURATION = 2.8;
/** Captured live pose -> impact -> knee collapse -> gravity fall -> damped rest.
 * Root tilt follows the actual impact in local space, not a fixed global axis.
 * Mesh bounds constrain the entire articulated body above the floor each step.
 */
export class DeathMotion {
  private saved: {
    o: T.Object3D;
    p: T.Vector3;
    q: T.Quaternion;
    s: T.Vector3;
    visible: boolean;
  }[] = [];
  private materials: {
    m: T.Material;
    opacity: number;
    transparent: boolean;
    depthWrite: boolean;
  }[] = [];
  private origin: T.Vector3;
  private yaw: number;
  private axis: T.Vector3;
  private travel: T.Vector3;
  private box = new T.Box3();
  private partBox = new T.Box3();
  private meshes: T.Mesh[] = [];
  floor = 0;
  readonly variant: "back" | "side" | "heavy" | "floating";
  constructor(
    private body: EnemyBody,
    kind: Archetype,
    direction: T.Vector3,
    serial: number,
  ) {
    const root = body.root;
    this.origin = root.position.clone();
    this.yaw = root.rotation.y;
    const local = direction
      .clone()
      .applyAxisAngle(new T.Vector3(0, 1, 0), -this.yaw)
      .normalize();
    this.variant =
      kind === "archer"
        ? "floating"
        : kind === "brute"
          ? "heavy"
          : Math.abs(local.x) > 0.5
            ? "side"
            : "back";
    this.axis = new T.Vector3(local.z, 0, -local.x).normalize();
    if (this.axis.lengthSq() < 0.1) this.axis.set(1, 0, 0);
    this.travel = direction
      .clone()
      .multiplyScalar(kind === "brute" ? 0.2 : 0.45);
    root.traverse((o) => {
      this.saved.push({
        o,
        p: o.position.clone(),
        q: o.quaternion.clone(),
        s: o.scale.clone(),
        visible: o.visible,
      });
      if (o instanceof T.Mesh) {
        this.meshes.push(o);
        for (const m of Array.isArray(o.material) ? o.material : [o.material])
          if (!this.materials.some((x) => x.m === m))
            this.materials.push({
              m,
              opacity: m.opacity,
              transparent: m.transparent,
              depthWrite: m.depthWrite,
            });
      }
    });
    // Small deterministic variation; no randomness tied to render FPS.
    this.travel.multiplyScalar(0.9 + (serial % 3) * 0.1);
    if (body instanceof Warrior) body.aura.visible = false;
  }
  private rotate(
    o: T.Object3D,
    x: number,
    y: number,
    z: number,
    blend: number,
  ) {
    const saved = this.saved.find((s) => s.o === o)!;
    o.quaternion
      .copy(saved.q)
      .slerp(new T.Quaternion().setFromEuler(new T.Euler(x, y, z)), blend);
  }
  update(t: number) {
    const root = this.body.root,
      b = this.body;
    const reaction = ease(t / 0.16),
      collapse = ease((t - 0.12) / 0.4);
    const heavy = this.variant === "heavy";
    // Accelerating fall; a Brute first drops onto bent knees.
    const fall = T.MathUtils.clamp(
      (t - (heavy ? 0.4 : 0.26)) / (heavy ? 0.7 : 0.65),
      0,
      1,
    );
    const angle = 1.48 * fall * fall;
    const settle =
      t > 1.1
        ? Math.sin((t - 1.1) * 17) * Math.exp(-(t - 1.1) * 10) * 0.035
        : 0;
    root.quaternion
      .setFromAxisAngle(new T.Vector3(0, 1, 0), this.yaw)
      .multiply(new T.Quaternion().setFromAxisAngle(this.axis, angle + settle));
    root.position.copy(this.origin).addScaledVector(this.travel, ease(t / 1.1));
    if (b instanceof Warrior) {
      this.rotate(
        b.torso,
        -0.2 * reaction + 0.45 * collapse,
        -this.axis.z * 0.22 * reaction,
        this.axis.x * 0.12 * reaction,
        reaction,
      );
      this.rotate(
        b.head,
        0.24 * reaction,
        -this.axis.z * 0.25,
        -this.axis.z * 0.16,
        ease((t - 0.05) / 0.32),
      );
      this.rotate(b.leftLeg, -0.5 * collapse, 0, -0.18 * collapse, collapse);
      this.rotate(b.rightLeg, -0.32 * collapse, 0, 0.22 * collapse, collapse);
      this.rotate(b.leftShin, (heavy ? 1.5 : 1.1) * collapse, 0, 0, collapse);
      this.rotate(b.rightShin, (heavy ? 1.4 : 0.85) * collapse, 0, 0, collapse);
      this.rotate(
        b.leftArm,
        -0.55 * reaction + 0.8 * fall,
        0,
        -0.45 * collapse,
        ease(t / 0.6),
      );
      this.rotate(
        b.rightArm,
        -0.7 * reaction + 0.9 * fall,
        0,
        0.6 * collapse,
        ease((t - 0.04) / 0.7),
      );
      this.rotate(b.leftForearm, -0.7 * collapse, 0, 0, collapse);
      this.rotate(b.rightForearm, -0.45 * collapse, 0, 0, collapse);
      b.torso.position.y = 1.35 - (heavy ? 0.45 : 0.25) * collapse;
    } else {
      // Floating Archer loses lift; orbiting shards break their formation and settle.
      this.saved.forEach(({ o, p, q }, i) => {
        if (o === root) return;
        o.position.copy(p);
        if (o.parent === root) {
          o.position.x += Math.sin(i * 2.4) * 0.35 * collapse;
          o.position.z += Math.cos(i * 2.4) * 0.35 * collapse;
          o.quaternion
            .copy(q)
            .multiply(
              new T.Quaternion().setFromAxisAngle(
                new T.Vector3(0, 0, 1),
                (i % 2 ? 1 : -1) * 0.6 * collapse,
              ),
            );
        }
      });
    }
    // Tilt around the pelvis while airborne, then resolve contact against ground.
    const pivot = new T.Vector3(0, 0.95, 0).multiply(root.scale);
    const tilt = new T.Quaternion()
      .setFromAxisAngle(new T.Vector3(0, 1, 0), this.yaw)
      .invert()
      .multiply(root.quaternion);
    const shift = pivot
      .clone()
      .sub(pivot.clone().applyQuaternion(tilt))
      .applyAxisAngle(new T.Vector3(0, 1, 0), this.yaw);
    root.position.add(shift);
    root.position.y -= Math.min(2.7, 4.9 * Math.pow(Math.max(0, t - 0.18), 2));
    root.updateWorldMatrix(true, true);
    if (b instanceof Warrior && fall > 0) {
      // Release wrist tension: the weapon settles parallel to the floor instead
      // of propping the corpse up on the sword tip.
      const desired = new T.Quaternion().setFromUnitVectors(
        new T.Vector3(0, 1, 0),
        this.travel.clone().normalize(),
      );
      for (const arm of [b.leftForearm, b.rightForearm])
        for (const weapon of arm.children)
          if (weapon instanceof T.Group) {
            const target = arm
              .getWorldQuaternion(new T.Quaternion())
              .invert()
              .multiply(desired);
            const saved = this.saved.find((s) => s.o === weapon)!;
            weapon.quaternion.copy(saved.q).slerp(target, ease(fall));
          }
      root.updateWorldMatrix(true, true);
    }
    this.box.makeEmpty();
    for (const mesh of this.meshes) {
      if (b instanceof Warrior && mesh === b.aura) continue;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      this.partBox
        .copy(mesh.geometry.boundingBox!)
        .applyMatrix4(mesh.matrixWorld);
      this.box.union(this.partBox);
    }
    root.position.y += Math.max(0, 0.025 - this.box.min.y);
    this.floor = Math.max(0.025, this.box.min.y);
    const opacity = 1 - ease((t - 2.15) / 0.65);
    for (const item of this.materials) {
      item.m.transparent = true;
      item.m.opacity = item.opacity * opacity;
      item.m.depthWrite = opacity > 0.95 && item.depthWrite;
    }
  }
  restore() {
    for (const s of this.saved) {
      s.o.position.copy(s.p);
      s.o.quaternion.copy(s.q);
      s.o.scale.copy(s.s);
      s.o.visible = s.visible;
    }
    for (const s of this.materials) {
      s.m.opacity = s.opacity;
      s.m.transparent = s.transparent;
      s.m.depthWrite = s.depthWrite;
    }
  }
}
