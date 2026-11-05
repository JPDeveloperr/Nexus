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

import { FixedStepClock } from "../src/timing";
import { keyboardCode } from "../src/input";
test("fixed steps preserve elapsed wall time at 4 FPS instead of discarding 80%", () => {
  const clock = new FixedStepClock();
  let seconds = 0;
  for (let i = 0; i < 8; i++) clock.advance(0.25, (dt) => (seconds += dt));
  assert.ok(Math.abs(seconds - 2) < 1e-8);
});
test("fixed clock bounds long suspension, resets pending time and never runs a giant step", () => {
  const clock = new FixedStepClock();
  let steps = 0;
  clock.advance(100, (dt) => {
    assert.ok(dt <= 1 / 60);
    steps++;
  });
  assert.equal(steps, 30);
  clock.advance(0.005, () => assert.fail());
  clock.reset();
  assert.equal(
    clock.advance(0.012, () => assert.fail()),
    0,
  );
});
test("keyboard falls back to key when browser omits physical code", () => {
  assert.equal(keyboardCode({ key: "W", code: "" }), "KeyW");
  assert.equal(keyboardCode({ key: "z", code: "KeyW" }), "KeyW");
});

import { radialDeadzone } from "../src/input";
test("analogue radial deadzone eliminates drift, scales proportionally and caps diagonals", () => {
  assert.deepEqual(radialDeadzone(0.08, 0.07, 0.18), { x: 0, y: 0 });
  const half = radialDeadzone(0.5, 0, 0.18);
  assert.ok(half.x > 0.3 && half.x < 0.5);
  assert.equal(half.y, 0);
  const full = radialDeadzone(1, 1, 0.18);
  assert.ok(Math.abs(Math.hypot(full.x, full.y) - 1) < 1e-9);
  assert.deepEqual(radialDeadzone(NaN, Infinity, 0.18), { x: 0, y: 0 });
});

import { cutPose, CUT, sweptBladeHits } from "../src/combat";
test("cut has anticipation, active sweep and smooth recovery", () => {
  assert.equal(cutPose(0.025).phase, "anticipation");
  assert.equal(cutPose(0.1).phase, "execution");
  assert.equal(cutPose(0.22).phase, "recovery");
  assert.equal(cutPose(0).blend, 0);
  assert.equal(cutPose(CUT.duration).blend, 0);
  assert.ok(
    Math.abs(
      cutPose(CUT.windup - 1e-6).torso - cutPose(CUT.windup + 1e-6).torso,
    ) < 1e-4,
  );
  assert.ok(
    Math.abs(
      cutPose(CUT.activeEnd - 1e-6).torso - cutPose(CUT.activeEnd + 1e-6).torso,
    ) < 1e-4,
  );
});
test("swept blade hits interior crossed between samples, excludes rear and handles stationary blade", () => {
  const a = { base: { x: 0, z: 0 }, tip: { x: -2, z: 2 } },
    b = { base: { x: 0, z: 0 }, tip: { x: 2, z: 2 } };
  assert.ok(sweptBladeHits(a, b, { x: 0, z: 1.5 }, 0.1));
  assert.ok(!sweptBladeHits(a, b, { x: 0, z: -2 }, 0.6));
  assert.ok(sweptBladeHits(a, a, { x: -1, z: 1 }, 0.1));
  assert.ok(!sweptBladeHits(a, a, { x: 4, z: 4 }, 0.1));
});

import { PlayerActions, HEAVY, DODGE, dodgeSpeed } from "../src/actions";
import {
  WaveDirector,
  WAVES,
  findSpawn,
  segmentHitsCircle,
} from "../src/waves";
test("basic attack duration halves 1.1 and permits rapid bounded sequences", () => {
  assert.ok(CUT.duration <= 0.3 && CUT.duration < 0.52 * 0.6);
  const a = new PlayerActions();
  a.basic();
  a.update(1 / 60);
  assert.equal(a.kind, "strike");
  const energy = a.energy;
  for (let i = 0; i < 12; i++) a.update(1 / 60);
  a.basic();
  for (let i = 0; i < 6; i++) a.update(1 / 60);
  assert.equal(a.sequence, 2);
  assert.ok(a.energy < energy);
  for (let i = 0; i < 90; i++) a.update(1 / 60);
  assert.equal(a.kind, "idle");
  assert.equal(a.sequence, 2);
});
test("charge is capped, release scales damage and cost, early release cancels", () => {
  const a = new PlayerActions();
  assert.ok(a.startCharge());
  a.update(0.1);
  assert.equal(a.releaseCharge(), false);
  assert.equal(a.energy, 100);
  a.startCharge();
  a.update(0.3);
  assert.ok(a.releaseCharge());
  const weak = a.damage,
    cost = 100 - a.energy;
  assert.ok(weak > 34 && weak < 85);
  assert.ok(cost >= 18 && cost < 38);
  assert.equal(a.releaseCharge(), false);
  a.reset();
  a.startCharge();
  a.update(100);
  assert.equal(a.charge, 1.2);
  assert.ok(a.releaseCharge());
  assert.equal(a.damage, 85);
  assert.equal(a.energy, 62);
  assert.equal(a.sequence, 1);
  a.update(HEAVY.duration);
  assert.equal(a.kind, "idle");
  assert.equal(a.charge, 0);
});
test("cancel charge restores idle without release damage; energy limits power", () => {
  const a = new PlayerActions();
  a.startCharge();
  a.update(0.9);
  a.cancel();
  assert.equal(a.kind, "idle");
  assert.equal(a.releaseCharge(), false);
  assert.equal(a.energy, 100);
  a.energy = 20;
  a.startCharge();
  a.update(1.2);
  a.releaseCharge();
  assert.ok(a.energy >= 0);
  assert.ok(a.damage < 50);
});
test("dodge has bounded invulnerability, energy cost and cooldown; cancels charge/recovery only", () => {
  const a = new PlayerActions();
  assert.ok(a.dodge());
  assert.equal(a.energy, 82);
  assert.equal(a.invulnerable, false);
  assert.equal(a.dodge(), false);
  a.update(0.08);
  assert.ok(a.invulnerable);
  a.update(0.14);
  assert.equal(a.invulnerable, false);
  a.update(0.1);
  assert.equal(a.kind, "idle");
  assert.equal(a.dodge(), false);
  a.update(0.25);
  assert.ok(a.dodge());
  a.reset();
  a.startCharge();
  a.update(0.3);
  assert.ok(a.dodge());
  assert.equal(a.charge, 0);
  a.reset();
  a.basic();
  a.update(0.01);
  assert.equal(a.dodge(), false);
  a.update(0.18);
  assert.ok(a.dodge());
});
test("dodge integration cannot cross a wall or island edge", () => {
  let p = { x: -4, z: 0 };
  for (let i = 0; i < 18; i++)
    p = moveCircle(p, { x: dodgeSpeed(i / 60) / 60, z: 0 }, 0.48, [
      { x: 0, z: 0, radius: 1 },
    ]);
  assert.ok(p.x <= -1.48 + 1e-8);
  p = { x: 13, z: 0 };
  for (let i = 0; i < 18; i++)
    p = moveCircle(p, { x: dodgeSpeed(i / 60) / 60, z: 0 }, 0.48, []);
  assert.ok(p.x <= 13.82 + 1e-8);
});
test("wave director queues beyond cap, waits for kills and interval, then completes all four", () => {
  const d = new WaveDirector(3);
  let alive = 0,
    spawns = 0;
  const spawn = () => {
    alive++;
    spawns++;
    return true;
  };
  d.reset();
  d.update(0, alive, spawn);
  assert.equal(alive, 3);
  assert.equal(d.pending.length, 1);
  alive--;
  d.update(0.01, alive, spawn);
  assert.equal(alive, 3);
  assert.equal(spawns, 4);
  assert.equal(d.wave, 0);
  for (let wave = 0; wave < 4; wave++) {
    while (d.pending.length) {
      alive = 0;
      d.update(0.01, alive, spawn);
    }
    alive = 0;
    d.update(0.01, alive, spawn);
    if (wave < 3) {
      assert.equal(d.state, "intermission");
      d.update(2.9, 0, spawn);
      assert.equal(d.wave, wave);
      d.update(0.11, 0, spawn);
      assert.equal(d.wave, wave + 1);
      d.update(0.01, 0, spawn);
    }
  }
  assert.equal(d.state, "completed");
  d.reset();
  assert.equal(d.wave, 0);
  assert.deepEqual(d.pending, WAVES[0]);
});
test("spawn search keeps every archetype clear of player, obstacles and peers", () => {
  for (let seed = 0; seed < 50; seed++) {
    const obstacles = [
      { x: 0, z: 8, radius: 1 },
      { x: 6, z: 0, radius: 1 },
    ];
    const occupied: { x: number; z: number; radius: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const radius = i === 5 ? 0.85 : 0.5,
        p = findSpawn(
          seed * 101 + i,
          { x: 1, z: 3 },
          obstacles,
          occupied,
          radius,
        );
      assert.ok(p);
      assert.ok(Math.hypot(p.x - 1, p.z - 3) > 3.4 + radius);
      assert.ok(
        obstacles
          .concat(occupied)
          .every(
            (o) => Math.hypot(p.x - o.x, p.z - o.z) > o.radius + radius + 0.24,
          ),
      );
      occupied.push({ ...p, radius });
    }
  }
});
test("projectile swept collision catches fast crossings and excludes misses", () => {
  assert.ok(
    segmentHitsCircle({ x: -5, z: 0 }, { x: 5, z: 0 }, { x: 0, z: 0 }, 0.5),
  );
  assert.ok(
    !segmentHitsCircle({ x: -5, z: 2 }, { x: 5, z: 2 }, { x: 0, z: 0 }, 0.5),
  );
});
