export type Point = { x: number; z: number };
export type Obstacle = Point & { radius: number };
export const ARENA_RADIUS = 14.3;
export const PLAYER_RADIUS = 0.48;
export const ATTACK = {
  duration: 0.52,
  impact: 0.2,
  reach: 3.1,
  damage: 34,
  arc: 1.45,
  cost: 18,
};
export function seededRandom(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function moveCircle(
  from: Point,
  delta: Point,
  radius: number,
  obstacles: Obstacle[],
): Point {
  // Substeps prevent tunnelling during slow frames. Each circle slides along walls.
  const steps = Math.max(
    1,
    Math.ceil(Math.hypot(delta.x, delta.z) / (radius * 0.5)),
  );
  const p = { ...from };
  for (let i = 0; i < steps; i++) {
    p.x += delta.x / steps;
    p.z += delta.z / steps;
    for (let iteration = 0; iteration < 3; iteration++) {
      const length = Math.hypot(p.x, p.z),
        limit = ARENA_RADIUS - radius;
      if (length > limit) {
        p.x *= limit / length;
        p.z *= limit / length;
      }
      for (const o of obstacles) {
        const dx = p.x - o.x,
          dz = p.z - o.z;
        const distance = Math.hypot(dx, dz),
          minimum = radius + o.radius;
        if (distance < minimum) {
          const nx = distance > 0.0001 ? dx / distance : 1;
          const nz = distance > 0.0001 ? dz / distance : 0;
          p.x = o.x + nx * minimum;
          p.z = o.z + nz * minimum;
        }
      }
    }
  }
  // Obstacle projection can push outward at the rim; containment is invariant.
  const length = Math.hypot(p.x, p.z),
    limit = ARENA_RADIUS - radius;
  if (length > limit) {
    p.x *= limit / length;
    p.z *= limit / length;
  }
  return p;
}
export function insideStrike(
  origin: Point,
  facing: number,
  target: Point,
  reach = ATTACK.reach,
) {
  const dx = target.x - origin.x,
    dz = target.z - origin.z;
  const distance = Math.hypot(dx, dz);
  if (distance > reach || distance < 0.00001) return distance < 0.00001;
  return (
    (Math.sin(facing) * dx + Math.cos(facing) * dz) / distance >=
    Math.cos(ATTACK.arc)
  );
}
export function dampAngle(
  current: number,
  target: number,
  speed: number,
  dt: number,
) {
  const difference = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + difference * (1 - Math.exp(-speed * dt));
}
