import test from "node:test";
import assert from "node:assert/strict";
import {
  seededRandom,
  moveCircle,
  insideStrike,
  ARENA_RADIUS,
  PLAYER_RADIUS,
  ATTACK,
  dampAngle,
} from "../src/mechanics";

test("seed produces identical layouts and distinct seeds diverge", () => {
  const a = seededRandom(7341),
    b = seededRandom(7341),
    c = seededRandom(37);
  const sequence = Array.from({ length: 200 }, () => a());
  assert.deepEqual(
    sequence,
    Array.from({ length: 200 }, () => b()),
  );
  assert.notDeepEqual(
    sequence,
    Array.from({ length: 200 }, () => c()),
  );
  assert.ok(sequence.every((n) => n >= 0 && n < 1));
});
test("island edge contains movement even for an unusually large step", () => {
  const p = moveCircle({ x: 0, z: 0 }, { x: 100, z: 100 }, PLAYER_RADIUS, []);
  assert.ok(Math.hypot(p.x, p.z) <= ARENA_RADIUS - PLAYER_RADIUS + 1e-8);
});
test("substeps prevent crossing a column; diagonal movement slides", () => {
  const wall = [{ x: 0, z: 0, radius: 1 }];
  const p = moveCircle({ x: -4, z: 0 }, { x: 8, z: 0 }, 0.5, wall);
  assert.ok(p.x <= -1.5 + 1e-8);
  const q = moveCircle({ x: -2, z: 0 }, { x: 2, z: 2 }, 0.5, wall);
  assert.ok(Math.hypot(q.x, q.z) >= 1.5 - 1e-8);
  assert.ok(q.z > 1);
});
test("zero distance overlap resolves without NaN", () => {
  const p = moveCircle({ x: 0, z: 0 }, { x: 0, z: 0 }, 0.5, [
    { x: 0, z: 0, radius: 1 },
  ]);
  assert.equal(Math.hypot(p.x, p.z), 1.5);
});
test("strike includes enemies in its forward arc, excludes rear and distant targets", () => {
  assert.ok(insideStrike({ x: 0, z: 0 }, 0, { x: 0, z: 2 }));
  assert.ok(!insideStrike({ x: 0, z: 0 }, 0, { x: 0, z: -2 }));
  assert.ok(!insideStrike({ x: 0, z: 0 }, 0, { x: 0, z: ATTACK.reach + 0.01 }));
  assert.ok(insideStrike({ x: 0, z: 0 }, Math.PI / 2, { x: 2, z: 0 }));
  assert.ok(!insideStrike({ x: 0, z: 0 }, 0, { x: 3, z: 0 }));
});
test("angle interpolation takes short route across ±pi", () => {
  const a = dampAngle(Math.PI - 0.01, -Math.PI + 0.01, 10, 0.1);
  assert.ok(a > Math.PI - 0.01 && a < Math.PI + 0.01);
});

test("obstacle projection near the rim cannot push a body into the abyss", () => {
  let p = { x: 13, z: 0 };
  for (let i = 0; i < 100; i++) {
    p = moveCircle(p, { x: 0.12, z: -0.08 }, 0.48, [
      { x: 12.17, z: -3.95, radius: 0.92 },
    ]);
    assert.ok(Math.hypot(p.x, p.z) <= 13.82 + 1e-9);
  }
});
