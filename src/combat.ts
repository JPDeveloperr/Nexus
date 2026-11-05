import type { Point } from "./mechanics";
export const CUT = {
  windup: 0.12,
  activeEnd: 0.34,
  duration: 0.52,
  buffer: 0.18,
  hitstop: 0.045,
};
const smooth = (p: number) => {
  p = Math.max(0, Math.min(1, p));
  return p * p * (3 - 2 * p);
};
export function cutPose(elapsed: number) {
  if (elapsed < CUT.windup) {
    const blend = smooth(elapsed / CUT.windup);
    return { phase: "anticipation", blend, torso: -0.65 * blend, sweep: -1.15 };
  }
  if (elapsed < CUT.activeEnd) {
    const p = (elapsed - CUT.windup) / (CUT.activeEnd - CUT.windup);
    const arc = p * p;
    return {
      phase: "execution",
      blend: 1,
      torso: -0.65 + 1.3 * arc,
      sweep: -1.15 + 2.3 * arc,
    };
  }
  const blend =
    1 - smooth((elapsed - CUT.activeEnd) / (CUT.duration - CUT.activeEnd));
  return { phase: "recovery", blend, torso: 0.65 * blend, sweep: 1.15 };
}
export type BladeSample = { base: Point; tip: Point };
function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    l = dx * dx + dz * dz;
  const t =
    l > 1e-10
      ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l))
      : 0;
  return Math.hypot(p.x - a.x - t * dx, p.z - a.z - t * dz);
}
function cross(a: Point, b: Point, p: Point) {
  return (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
}
function triangle(p: Point, a: Point, b: Point, c: Point) {
  if (Math.abs(cross(a, b, c)) < 1e-9) return false;
  const signs = [cross(a, b, p), cross(b, c, p), cross(c, a, p)];
  return signs.every((s) => s >= 0) || signs.every((s) => s <= 0);
}
/** Test the actual swept blade quadrilateral, including its interior, against a body circle. */
export function sweptBladeHits(
  previous: BladeSample,
  current: BladeSample,
  target: Point,
  radius = 0.64,
) {
  const a = previous.base,
    b = previous.tip,
    c = current.tip,
    d = current.base;
  return (
    triangle(target, a, b, c) ||
    triangle(target, a, c, d) ||
    [
      [a, b],
      [b, c],
      [c, d],
      [d, a],
    ].some(([p, q]) => segmentDistance(target, p, q) <= radius)
  );
}
