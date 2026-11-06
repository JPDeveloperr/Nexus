import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { PlayerActions } from "../src/actions";
import { COMBO, comboPose } from "../src/combat";
import { CrimsonWaves, firstContact } from "../src/crimson-wave";
import { EnemySystem } from "../src/enemies";
import { Warrior } from "../src/visuals";
import { DEATH_DURATION } from "../src/death-motion";
const advance = (a: PlayerActions, t: number) => {
  for (let s = 0; s < t - 1e-8; s += 1 / 600)
    a.update(Math.min(1 / 600, t - s));
};
test("three distinct strikes, one buffered edge per window, no repeat when idle", () => {
  const a = new PlayerActions();
  a.basic();
  a.update(0);
  for (let i = 0; i < 3; i++) {
    assert.equal(a.combo, i);
    assert.equal(a.profile.duration, [0.22, 0.24, 0.33][i]);
    advance(a, 0.08);
    if (i < 2) {
      assert.ok(a.basic());
      assert.equal(a.basic(), false);
    }
    advance(a, a.profile.duration - 0.08 + 0.001);
  }
  assert.equal(a.kind, "idle");
  advance(a, 1);
  assert.equal(a.sequence, 3);
  assert.ok(
    comboPose(0.1, 0, COMBO[0]).sweep * comboPose(0.1, 1, COMBO[1]).sweep < 0,
  );
  assert.ok(comboPose(0.21, 2, COMBO[2]).height < 0);
});
test("combo inactivity, dodge, charge and cancellation restart from first strike", () => {
  for (const interrupt of ["wait", "dodge", "charge", "cancel"]) {
    const a = new PlayerActions();
    a.basic();
    a.update(0);
    advance(a, 0.23);
    if (interrupt === "wait") advance(a, 0.6);
    if (interrupt === "dodge") {
      a.dodge();
      advance(a, 0.4);
    }
    if (interrupt === "charge") {
      a.startCharge();
      a.cancel();
    }
    if (interrupt === "cancel") a.cancel();
    a.basic();
    a.update(0);
    assert.equal(a.combo, 0, interrupt);
  }
});
test("attack priority: active swing refuses dodge/charge, recovery allows dodge and discards queued edge", () => {
  const a = new PlayerActions();
  a.basic();
  a.update(0);
  advance(a, 0.08);
  a.basic();
  assert.equal(a.startCharge(), false);
  assert.equal(a.dodge(), false);
  advance(a, 0.07);
  assert.ok(a.dodge());
  advance(a, 0.5);
  assert.equal(a.sequence, 1);
  assert.equal(a.kind, "idle");
});
test("charge power is stable under different delta sizes", () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) {
    const a = new PlayerActions();
    a.startCharge();
    for (let t = 0; t < 1.2 - 1e-8; t += dt) a.update(Math.min(dt, 1.2 - t));
    assert.ok(a.releaseCharge());
    assert.ok(Math.abs(a.damage - 85) < 1e-7);
  }
});
test("swept wave hits a distant target once, shares exclusions with melee, expires at 3–5 units", () => {
  for (const power of [0, 1]) {
    const w = new CrimsonWaves(new T.Scene());
    const shared = new Set([1]);
    w.launch({ x: 0, z: 0 }, 0, power, shared);
    const cast = w.casts[0];
    let hits: number[] = [];
    for (let t = 0; t < 2; t += 1 / 30)
      w.update(
        1 / 30,
        [],
        [
          { id: 1, x: 0, z: 1, radius: 0.5 },
          { id: 2, x: 0, z: 2.5, radius: 0.5 },
        ],
        (id) => {
          hits.push(id);
          return true;
        },
      );
    assert.deepEqual(hits, [2]);
    assert.ok(shared.has(2));
    assert.equal(cast.live, false);
    assert.ok(Math.abs(cast.distance - (3 + 2 * power)) < 1e-6);
  }
});
test("wave walls stop damage behind them even with a giant step; arena and pools are bounded", () => {
  const w = new CrimsonWaves(new T.Scene());
  w.launch({ x: 0, z: 0 }, 0, 1, new Set());
  let hits = 0;
  w.update(
    0.5,
    [{ x: 0, z: 2, radius: 0.5 }],
    [{ id: 2, x: 0, z: 4, radius: 0.5 }],
    () => {
      hits++;
      return true;
    },
  );
  assert.equal(hits, 0);
  assert.equal(w.snapshot().length, 0);
  assert.ok(
    firstContact({ x: 0, z: 0 }, { x: 0, z: 10 }, { x: 0, z: 3 }, 1) < 0.3,
  );
  for (let i = 0; i < 4; i++)
    assert.ok(w.launch({ x: 0, z: 13 }, 0, 1, new Set()));
  assert.equal(w.launch({ x: 0, z: 0 }, 0, 1, new Set()), false);
  w.update(0.3, [], [], () => true);
  assert.equal(w.snapshot().length, 0);
  w.reset();
});
test("wave damage rejected during spawn does not consume an enemy hit", () => {
  const w = new CrimsonWaves(new T.Scene());
  const shared = new Set<number>();
  w.launch({ x: 0, z: 0 }, 0, 1, shared);
  w.update(0.01, [], [{ id: 1, x: 0, z: 1, radius: 0.5 }], () => false);
  assert.equal(shared.size, 0);
  w.update(0.01, [], [{ id: 1, x: 0, z: 1, radius: 0.5 }], () => true);
  assert.ok(shared.has(1));
});
for (const [kind, direction, variant] of [
  ["sentinel", [0, 0, 1], "back"],
  ["raider", [1, 0, 0], "side"],
  ["brute", [0, 0, 1], "heavy"],
  ["archer", [0, 0, 1], "floating"],
] as const) {
  test(`articulated ${kind} death: impact direction, floor, no collision or attack, finite fade and pool restore`, () => {
    const system = new EnemySystem(new T.Scene(), [], 42);
    const player = new T.Vector3();
    system.reset(player);
    const e = system.enemies.find((e) => e.kind === kind)!;
    e.state = "chase";
    e.hp = 1;
    e.body.root.visible = true;
    e.body.root.position.set(0, 0, 0);
    e.body.root.rotation.set(0, 0, 0);
    const d = new T.Vector3(...direction);
    system.hit(e, 999, true, 1, d.clone().negate());
    assert.equal(e.death?.variant, variant);
      assert.equal(system.hit(e,999,true,1,player),0,"dead enemies reject further hits");
    assert.ok(!system.alive.includes(e));
    assert.equal(
      system.blockers().some((o) => o.x === 0 && o.z === 0),
      false,
    );
    let damage = 0;
    let poses: number[] = [];
    for (let i = 0; i < Math.ceil(DEATH_DURATION * 60) + 2; i++) {
      system.update({
        dt: 1 / 60,
        time: i / 60,
        player,
        damage: () => {
          damage++;
          return true;
        },
        event: () => {},
      });
      if (e.state === "dead") {
        assert.ok(e.death!.floor >= 0.0249);
        // Recompute the rendered mesh bounds independently of the controller's diagnostic.
        e.body.root.updateWorldMatrix(true, true);
        const bounds = new T.Box3();
        e.body.root.traverse((o) => {
          if (
            o instanceof T.Mesh &&
            !(e.body instanceof Warrior && o === e.body.aura)
          ) {
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            bounds.union(
              o.geometry.boundingBox!.clone().applyMatrix4(o.matrixWorld),
            );
          }
        });
        assert.ok(
          bounds.min.y >= 0.0249,
          `actual geometry crossed floor: ${bounds.min.y}`,
        );
        if (e.timer > 1.2)
          assert.ok(bounds.min.y < 0.026, "resting body must contact floor");
        assert.ok(Number.isFinite(e.body.root.position.y));
        if (e.body instanceof Warrior) poses.push(e.body.leftShin.rotation.x);
        if (i === 80) assert.equal(e.body.root.visible, true);
      }
    }
    if (poses.length) assert.ok(Math.max(...poses) - Math.min(...poses) > 0.4);
    assert.equal(e.state, "inactive");
    assert.equal(e.body.root.visible, false);
    system.reset(player);
    assert.ok(system.enemies.every((e) => e.death === undefined));
  });
}
