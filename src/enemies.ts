import * as T from "three";
import { Warrior } from "./visuals";
import { DeathMotion, DEATH_DURATION } from "./death-motion";
import { createEnemyBody, type EnemyBody } from "./enemy-visuals";
import {
  WaveDirector,
  findSpawn,
  segmentHitsCircle,
  type Archetype,
} from "./waves";
import {
  moveCircle,
  dampAngle,
  insideStrike,
  type Obstacle,
} from "./mechanics";
export const ENEMY_STATS = {
  sentinel: {
    hp: 100,
    speed: 1.85,
    radius: 0.5,
    damage: 14,
    windup: 0.8,
    attack: 0.52,
    recovery: 0.9,
    range: 2.8,
  },
  raider: {
    hp: 76,
    speed: 3.2,
    radius: 0.43,
    damage: 9,
    windup: 0.44,
    attack: 0.34,
    recovery: 0.65,
    range: 2.6,
  },
  archer: {
    hp: 80,
    speed: 2.1,
    radius: 0.48,
    damage: 12,
    windup: 0.95,
    attack: 0.35,
    recovery: 1.25,
    range: 11,
  },
  brute: {
    hp: 260,
    speed: 1,
    radius: 0.85,
    damage: 30,
    windup: 1.1,
    attack: 0.65,
    recovery: 1.6,
    range: 5.2,
  },
} as const;
export type EnemyState =
  | "inactive"
  | "spawn"
  | "chase"
  | "windup"
  | "attack"
  | "recover"
  | "hurt"
  | "dead";
export type Enemy = {
  death?: DeathMotion;
  id: number;
  kind: Archetype;
  body: EnemyBody;
  hp: number;
  state: EnemyState;
  timer: number;
  hurt: number;
  hit: boolean;
  combo: number;
  decision: number;
  knock: T.Vector2;
  telegraph: T.Mesh;
  beam: T.Mesh;
};
type Context = {
  player: T.Vector3;
  dt: number;
  time: number;
  damage: (amount: number, kind: string) => boolean;
  event: (name: string, data: Record<string, unknown>) => void;
};
export class EnemySystem {
  enemies: Enemy[] = [];
  director: WaveDirector;
  nextAttack = 0;
  spawnSerial = 0;
  projectiles: {
    live: boolean;
    x: number;
    z: number;
    vx: number;
    vz: number;
    life: number;
  }[] = Array.from({ length: 24 }, () => ({
    live: false,
    x: 0,
    z: 0,
    vx: 0,
    vz: 0,
    life: 0,
  }));
  private shots: T.InstancedMesh;
  private dummy = new T.Object3D();
  private shocks: {
    mesh: T.Mesh;
    live: boolean;
    radius: number;
    hit: boolean;
    x: number;
    z: number;
  }[] = [];
  constructor(
    private scene: T.Scene,
    public obstacles: Obstacle[],
    private seed: number,
    limit = 6,
  ) {
    this.director = new WaveDirector(limit);
    const kinds: Archetype[] = [
      "sentinel",
      "sentinel",
      "sentinel",
      "raider",
      "raider",
      "archer",
      "archer",
      "brute",
    ];
    kinds.forEach((kind, id) => {
      const body = createEnemyBody(kind);
      // Independent pooled materials let a corpse fade without fading living actors.
      const materials = new Map<T.Material, T.Material>();
      body.root.traverse((o) => {
        if (o instanceof T.Mesh) {
          const clone = (m: T.Material) => {
            if (!materials.has(m)) materials.set(m, m.clone());
            return materials.get(m)!;
          };
          o.material = Array.isArray(o.material)
            ? o.material.map(clone)
            : clone(o.material);
        }
      });
      scene.add(body.root);
      body.root.visible = false;
      const telegraph = new T.Mesh(
        new T.RingGeometry(0.85, 1, 48),
        new T.MeshBasicMaterial({
          color:
            kind === "archer"
              ? 0xa15fff
              : kind === "brute"
                ? 0xde914e
                : 0xf84565,
          transparent: true,
          opacity: 0.2,
          side: T.DoubleSide,
          depthWrite: false,
        }),
      );
      telegraph.rotation.x = -Math.PI / 2;
      telegraph.visible = false;
      scene.add(telegraph);
      const beam = new T.Mesh(
        new T.BoxGeometry(0.09, 0.012, 10),
        new T.MeshBasicMaterial({
          color: 0xa669f5,
          transparent: true,
          opacity: 0.23,
          depthWrite: false,
        }),
      );
      beam.visible = false;
      scene.add(beam);
      this.enemies.push({
        id,
        kind,
        body,
        hp: 0,
        state: "inactive",
        timer: 0,
        hurt: 0,
        hit: false,
        combo: 0,
        decision: 0,
        knock: new T.Vector2(),
        telegraph,
        beam,
      });
    });
    this.shots = new T.InstancedMesh(
      new T.OctahedronGeometry(0.17),
      new T.MeshBasicMaterial({ color: 0xc27aff }),
      24,
    );
    this.shots.frustumCulled = false;
    scene.add(this.shots);
    for (let i = 0; i < 4; i++) {
      const mesh = new T.Mesh(
        new T.RingGeometry(0.93, 1, 64),
        new T.MeshBasicMaterial({
          color: 0xc795fa,
          transparent: true,
          opacity: 0.7,
          side: T.DoubleSide,
          depthWrite: false,
        }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      this.shocks.push({
        mesh,
        live: false,
        radius: 0,
        hit: false,
        x: 0,
        z: 0,
      });
    }
    this.syncProjectiles();
  }
  get alive() {
    return this.enemies.filter(
      (e) => e.state !== "dead" && e.state !== "inactive",
    );
  }
  get aliveCount() {
    let n = 0;
    for (const e of this.enemies)
      if (e.state !== "dead" && e.state !== "inactive") n++;
    return n;
  }
  blockers(exclude?: Enemy) {
    return this.alive
      .filter((e) => e !== exclude)
      .map((e) => ({
        x: e.body.root.position.x,
        z: e.body.root.position.z,
        radius: ENEMY_STATS[e.kind].radius,
      }));
  }
  reset(player: T.Vector3, wave = 0) {
    this.director.reset(wave);
    this.nextAttack = 0;
    this.spawnSerial = 0;
    for (const e of this.enemies) {
      e.death?.restore();
      e.death = undefined;
      e.state = "inactive";
      e.hp = 0;
      e.timer = 0;
      e.knock.set(0, 0);
      e.body.root.visible = false;
      e.telegraph.visible = e.beam.visible = false;
    }
    this.clearHazards();
    this.director.update(0, 0, (k) => this.spawn(k, player));
  }
  clearHazards() {
    this.projectiles.forEach((p) => (p.live = false));
    this.shocks.forEach((p) => {
      p.live = false;
      p.mesh.visible = false;
    });
    this.syncProjectiles();
  }
  spawn(kind: Archetype, player: T.Vector3) {
    const e = this.enemies.find(
      (e) => e.kind === kind && e.state === "inactive",
    );
    if (!e) return false;
    const point = findSpawn(
      this.seed + this.spawnSerial * 127 + this.director.wave * 991,
      player,
      this.obstacles,
      this.blockers(),
      ENEMY_STATS[kind].radius,
    );
    if (!point) return false;
    this.spawnSerial++;
    e.death?.restore();
    e.death = undefined;
    e.hp = ENEMY_STATS[kind].hp;
    e.state = "spawn";
    e.timer = 0;
    e.hurt = 0;
    e.hit = false;
    e.combo = 0;
    e.knock.set(0, 0);
    e.body.root.position.set(point.x, 0, point.z);
    e.body.root.rotation.set(
      0,
      Math.atan2(player.x - point.x, player.z - point.z),
      0,
    );
    e.body.root.visible = true;
    return true;
  }
  hit(
    e: Enemy,
    damage: number,
    heavy: boolean,
    power: number,
    origin: T.Vector3,
    knockScale = 1,
  ) {
    if (e.state === "inactive" || e.state === "dead" || e.state === "spawn")
      return 0;
    const resistance =
      e.kind === "brute"
        ? e.state === "recover"
          ? 1.15
          : heavy
            ? 1
            : 0.68
        : e.kind === "raider"
          ? 0.95
          : 1;
    const applied = damage * resistance;
    e.hp = Math.max(0, e.hp - applied);
    e.hurt = 0.3;
    const vector = new T.Vector3()
      .subVectors(e.body.root.position, origin)
      .setY(0)
      .normalize();
    e.knock
      .set(vector.x, vector.z)
      .multiplyScalar(
        (knockScale * (heavy ? 6 + power * 4 : 3)) /
          (e.kind === "brute" ? 2.8 : 1),
      );
    if (e.hp === 0) {
      e.state = "dead";
      e.timer = 0;
      e.death = new DeathMotion(
        e.body,
        e.kind,
        vector,
        this.spawnSerial + e.id,
      );
      e.hit = true;
    } else if (heavy || e.kind === "sentinel" || e.kind === "raider") {
      e.state = "hurt";
      e.timer = 0;
    }
    e.telegraph.visible = e.beam.visible = false;
    return applied;
  }
  updateCorpses(dt: number) {
    for (const e of this.enemies)
      if (e.state === "dead") {
        e.timer += dt;
        e.death?.update(e.timer);
        if (e.timer + 1e-9 >= DEATH_DURATION) {
          e.state = "inactive";
          e.body.root.visible = false;
        }
      }
  }
  update(ctx: Context) {
    const { dt, time, player } = ctx;
    for (const e of this.enemies) {
      if (e.state === "inactive") continue;
      const stats = ENEMY_STATS[e.kind],
        p = e.body.root.position;
      e.timer += dt;
      e.hurt = Math.max(0, e.hurt - dt);
      if (e.state === "dead") {
        e.telegraph.visible = e.beam.visible = false;
        e.death?.update(e.timer);
        if (e.timer + 1e-9 >= DEATH_DURATION) {
          e.state = "inactive";
          e.body.root.visible = false;
        }
        continue;
      }
      let speed = 0;
      const distance = Math.hypot(player.x - p.x, player.z - p.z);
      const angle = Math.atan2(player.x - p.x, player.z - p.z);
      const steer = (dx: number, dz: number, s: number) => {
        const length = Math.hypot(dx, dz);
        if (length < 0.001) return;
        const obstacles = this.obstacles.concat(this.blockers(e), [
          { x: player.x, z: player.z, radius: 0.48 },
        ]);
        let next = moveCircle(
          p,
          { x: (dx / length) * s * dt, z: (dz / length) * s * dt },
          stats.radius,
          obstacles,
        );
        if (Math.hypot(next.x - p.x, next.z - p.z) < s * dt * 0.25) {
          const sign = e.id % 2 ? 1 : -1;
          const a = Math.atan2(dx, dz) + sign * 0.8;
          next = moveCircle(
            p,
            { x: Math.sin(a) * s * dt, z: Math.cos(a) * s * dt },
            stats.radius,
            obstacles,
          );
        }
        speed = Math.hypot(next.x - p.x, next.z - p.z) / dt;
        p.x = next.x;
        p.z = next.z;
      };
      if (e.knock.lengthSq() > 0.005) {
        steer(e.knock.x, e.knock.y, e.knock.length());
        e.knock.multiplyScalar(Math.exp(-10 * dt));
      }
      if (e.state === "spawn") {
        e.telegraph.visible = true;
        e.telegraph.position.set(p.x, 0.06, p.z);
        e.telegraph.scale.setScalar(0.9 + e.timer * 0.4);
        if (e.timer > 0.65) {
          e.state = "chase";
          e.timer = 0;
          e.telegraph.visible = false;
        }
      } else if (e.state === "chase") {
        e.body.root.rotation.y = dampAngle(
          e.body.root.rotation.y,
          angle,
          9,
          dt,
        );
        if (e.kind === "archer") {
          if (distance < 5.7)
            steer(p.x - player.x, p.z - player.z, stats.speed);
          else if (distance > 9)
            steer(player.x - p.x, player.z - p.z, stats.speed);
          else if (e.decision > time)
            steer(
              Math.cos(angle) * (e.id % 2 ? 1 : -1),
              -Math.sin(angle) * (e.id % 2 ? 1 : -1),
              0.65,
            );
        } else if (distance > stats.range - 0.5)
          steer(player.x - p.x, player.z - p.z, stats.speed);
        if (time >= e.decision) {
          e.decision = time + 0.12 + (e.id % 3) * 0.02;
          const ready =
            distance < (e.kind === "archer" ? 11 : stats.range - 0.35);
          const busy = this.enemies.filter(
            (other) =>
              other !== e &&
              (other.state === "windup" || other.state === "attack"),
          ).length;
          if (ready && time >= this.nextAttack && busy < 2) {
            e.state = "windup";
            e.timer = 0;
            e.hit = false;
            this.nextAttack = time + 0.38;
            ctx.event("enemyWindup", { id: e.id, kind: e.kind });
          }
        }
      } else if (e.state === "windup") {
        const duration =
          e.kind === "raider" && e.combo > 0 ? 0.28 : stats.windup;
        if (e.timer < duration * 0.6)
          e.body.root.rotation.y = dampAngle(
            e.body.root.rotation.y,
            angle,
            7,
            dt,
          );
        e.telegraph.visible = true;
        e.telegraph.position.set(p.x, 0.06, p.z);
        e.telegraph.scale.setScalar(
          e.kind === "brute" ? stats.range : stats.range * 0.8,
        );
        (e.telegraph.material as T.MeshBasicMaterial).opacity =
          0.12 + 0.25 * Math.min(1, e.timer / duration);
        if (e.kind === "archer") {
          e.beam.visible = true;
          const a = e.body.root.rotation.y;
          e.beam.position.set(
            p.x + Math.sin(a) * 5,
            0.07,
            p.z + Math.cos(a) * 5,
          );
          e.beam.rotation.y = a;
        }
        if (e.timer >= duration) {
          e.state = "attack";
          e.timer = 0;
          e.telegraph.visible = e.beam.visible = false;
        }
      } else if (e.state === "attack") {
        const impact =
          e.kind === "archer" ? 0.08 : e.kind === "brute" ? 0.24 : 0.13;
        if (e.timer >= impact && !e.hit) {
          e.hit = true;
          ctx.event("enemyAttack", { id: e.id, kind: e.kind });
          if (e.kind === "archer") this.fire(e);
          else if (e.kind === "brute") this.slam(e);
          else if (insideStrike(p, e.body.root.rotation.y, player, stats.range))
            ctx.damage(stats.damage, e.kind);
        }
        if (e.timer >= stats.attack) {
          e.state = "recover";
          e.timer = 0;
        }
      } else if (e.state === "recover") {
        if (
          e.kind === "raider" &&
          e.combo === 0 &&
          e.timer > 0.22 &&
          distance < 3 &&
          time >= this.nextAttack &&
          this.enemies.filter(
            (other) =>
              other !== e &&
              (other.state === "windup" || other.state === "attack"),
          ).length < 2
        ) {
          e.combo = 1;
          e.state = "windup";
          e.timer = 0;
          e.hit = false;
          this.nextAttack = time + 0.38;
        } else if (e.timer >= stats.recovery) {
          e.combo = 0;
          e.state = "chase";
          e.timer = 0;
        }
      } else if (e.state === "hurt" && e.timer > 0.34) {
        e.state = "chase";
        e.timer = 0;
      }
      e.body.animate(
        time + e.id,
        speed,
        e.state === "attack" ? 0.52 * (1 - e.timer / stats.attack) : 0,
        e.hurt,
      );
      if (e.hurt > 0 && e.body instanceof Warrior) {
        const local = new T.Vector3(e.knock.x, 0, e.knock.y)
          .normalize()
          .applyAxisAngle(new T.Vector3(0, 1, 0), -e.body.root.rotation.y);
        const recoil = Math.sin(Math.PI * (1 - e.hurt / 0.3)) * 0.28;
        e.body.torso.rotation.x += local.z * recoil;
        e.body.torso.rotation.z -= local.x * recoil;
        e.body.head.rotation.x = -local.z * recoil * 0.65;
        e.body.head.rotation.z = local.x * recoil * 0.5;
        e.body.leftArm.rotation.x -= recoil * 0.6;
        e.body.rightArm.rotation.x -= recoil * 0.6;
      }
    }
    this.updateHazards(ctx);
    const prior = this.director.state;
    this.director.update(dt, this.aliveCount, (k) => this.spawn(k, player));
    if (
      prior !== this.director.state &&
      (this.director.state === "intermission" ||
        this.director.state === "completed")
    )
      this.clearHazards();
  }
  private fire(e: Enemy) {
    const shot = this.projectiles.find((p) => !p.live);
    if (!shot) return;
    const a = e.body.root.rotation.y,
      p = e.body.root.position;
    Object.assign(shot, {
      live: true,
      x: p.x + Math.sin(a) * 0.8,
      z: p.z + Math.cos(a) * 0.8,
      vx: Math.sin(a) * 7.5,
      vz: Math.cos(a) * 7.5,
      life: 3,
    });
  }
  private slam(e: Enemy) {
    const shock = this.shocks.find((p) => !p.live);
    if (!shock) return;
    Object.assign(shock, {
      live: true,
      radius: 0.3,
      hit: false,
      x: e.body.root.position.x,
      z: e.body.root.position.z,
    });
  }
  private updateHazards(ctx: Context) {
    for (const p of this.projectiles)
      if (p.live) {
        const old = { x: p.x, z: p.z };
        p.x += p.vx * ctx.dt;
        p.z += p.vz * ctx.dt;
        p.life -= ctx.dt;
        if (
          p.life <= 0 ||
          Math.hypot(p.x, p.z) > 14.2 ||
          this.obstacles.some((o) =>
            segmentHitsCircle(old, p, o, o.radius + 0.15),
          )
        )
          p.live = false;
        else if (segmentHitsCircle(old, p, ctx.player, 0.64)) {
          p.live = false;
          ctx.damage(12, "projectile");
        }
      }
    for (const s of this.shocks) {
      if (s.live) {
        const previous = s.radius;
        s.radius += 7 * ctx.dt;
        const distance = Math.hypot(ctx.player.x - s.x, ctx.player.z - s.z);
        if (
          !s.hit &&
          distance + 0.48 >= previous &&
          distance - 0.48 <= s.radius &&
          !this.obstacles.some((o) =>
            segmentHitsCircle(s, ctx.player, o, o.radius),
          )
        ) {
          s.hit = true;
          ctx.damage(30, "shockwave");
        }
        if (s.radius > 5.2) s.live = false;
      }
      s.mesh.visible = s.live;
      s.mesh.position.set(s.x, 0.08, s.z);
      s.mesh.scale.setScalar(s.radius);
      (s.mesh.material as T.MeshBasicMaterial).opacity =
        Math.max(0, 1 - s.radius / 5.3) * 0.8;
    }
    this.syncProjectiles();
  }
  private syncProjectiles() {
    this.projectiles.forEach((p, i) => {
      this.dummy.position.set(p.x, 1.25, p.z);
      this.dummy.scale.setScalar(p.live ? 1 : 0);
      this.dummy.rotation.y = p.life * 6;
      this.dummy.updateMatrix();
      this.shots.setMatrixAt(i, this.dummy.matrix);
    });
    this.shots.instanceMatrix.needsUpdate = true;
  }
  snapshot() {
    return {
      wave: this.director.wave + 1,
      waveState: this.director.state,
      pending: this.director.pending.length,
      interval: this.director.timer,
      alive: this.aliveCount,
      limit: this.director.limit,
      projectiles: this.projectiles
        .filter((p) => p.live)
        .map((p) => ({ x: p.x, z: p.z })),
      shocks: this.shocks
        .filter((p) => p.live)
        .map((p) => ({ x: p.x, z: p.z, radius: p.radius })),
      enemies: this.enemies.map((e) => ({
        id: e.id,
        kind: e.kind,
        hp: e.hp,
        state: e.state,
        timer: e.timer,
        deathVariant: e.death?.variant,
        floor: e.death?.floor,
        y: e.body.root.position.y,
        x: e.body.root.position.x,
        z: e.body.root.position.z,
        radius: ENEMY_STATS[e.kind].radius,
      })),
    };
  }
}
