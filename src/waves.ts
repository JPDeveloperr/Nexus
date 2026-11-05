import {
  ARENA_RADIUS,
  seededRandom,
  type Point,
  type Obstacle,
} from "./mechanics";
export type Archetype = "sentinel" | "raider" | "archer" | "brute";
export const WAVES: readonly Archetype[][] = [
  ["sentinel", "sentinel", "sentinel", "raider"],
  ["sentinel", "sentinel", "raider", "raider", "archer"],
  ["raider", "raider", "archer", "archer", "brute"],
  ["sentinel", "sentinel", "raider", "raider", "archer", "archer", "brute"],
];
export class WaveDirector {
  wave = 0;
  pending: Archetype[] = [];
  state: "idle" | "active" | "intermission" | "completed" = "idle";
  timer = 0;
  constructor(public limit = 6) {
    this.limit = Math.max(1, Math.min(8, Math.floor(limit) || 6));
  }
  reset(wave = 0) {
    this.wave = Math.max(0, Math.min(3, Math.floor(wave)));
    this.pending = [...WAVES[this.wave]];
    this.state = "active";
    this.timer = 0;
  }
  update(dt: number, alive: number, spawn: (kind: Archetype) => boolean) {
    if (this.state === "active") {
      while (this.pending.length && alive < this.limit) {
        if (!spawn(this.pending[0])) break;
        this.pending.shift();
        alive++;
      }
      if (!this.pending.length && alive === 0) {
        this.state =
          this.wave === WAVES.length - 1 ? "completed" : "intermission";
        this.timer = 3;
      }
    } else if (this.state === "intermission") {
      this.timer = Math.max(0, this.timer - dt);
      if (this.timer === 0) {
        this.wave++;
        this.pending = [...WAVES[this.wave]];
        this.state = "active";
      }
    }
  }
}
export function findSpawn(
  seed: number,
  player: Point,
  obstacles: Obstacle[],
  occupied: Obstacle[],
  radius: number,
): Point | null {
  const random = seededRandom(seed);
  const valid = (p: Point) =>
    Math.hypot(p.x, p.z) < ARENA_RADIUS - radius - 0.2 &&
    Math.hypot(p.x - player.x, p.z - player.z) > 3.4 + radius &&
    obstacles
      .concat(occupied)
      .every(
        (o) => Math.hypot(p.x - o.x, p.z - o.z) > radius + o.radius + 0.25,
      );
  for (let i = 0; i < 48; i++) {
    const a = random() * Math.PI * 2,
      d = 6 + random() * 5;
    const p = { x: Math.sin(a) * d, z: Math.cos(a) * d };
    if (valid(p)) return p;
  }
  for (let z = -10; z <= 10; z += 2)
    for (let x = -10; x <= 10; x += 2) {
      const p = { x, z };
      if (valid(p)) return p;
    }
  return null;
}
export function segmentHitsCircle(
  a: Point,
  b: Point,
  p: Point,
  radius: number,
) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    length = dx * dx + dz * dz;
  const t =
    length > 1e-9
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length))
      : 0;
  return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z) <= radius;
}
