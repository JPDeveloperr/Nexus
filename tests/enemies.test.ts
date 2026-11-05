import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { EnemySystem, ENEMY_STATS } from "../src/enemies";
import { Temple } from "../src/visuals";
test("all archetypes attack, projectiles and shockwaves advance, coordination and collisions remain bounded", () => {
  const scene = new T.Scene(),
    temple = new Temple(),
    player = new T.Vector3(0, 0, 0),
    system = new EnemySystem(scene, temple.obstacles, 7341, 6);
  system.reset(player);
  assert.ok(system.spawn("archer", player));
  assert.ok(system.spawn("brute", player));
  const attacks = new Set<string>();
  let shots = 0,
    shocks = 0,
    damage = 0;
  for (let i = 0; i < 1800; i++) {
    system.update({
      dt: 1 / 60,
      time: i / 60,
      player,
      damage: (n) => {
        damage += n;
        return true;
      },
      event: (name, data) => {
        if (name === "enemyAttack") attacks.add(String(data.kind));
      },
    });
    shots = Math.max(shots, system.projectiles.filter((p) => p.live).length);
    shocks = Math.max(shocks, system.snapshot().shocks.length);
    const active = system.alive;
    assert.ok(active.length <= 6);
    assert.ok(
      active.filter((e) => e.state === "windup" || e.state === "attack")
        .length <= 2,
    );
    for (const e of active) {
      const p = e.body.root.position,
        r = ENEMY_STATS[e.kind].radius;
      assert.ok(Math.hypot(p.x, p.z) <= 14.3 - r + 1e-6);
      for (const o of temple.obstacles)
        assert.ok(Math.hypot(p.x - o.x, p.z - o.z) >= r + o.radius - 0.03);
    }
  }
  assert.deepEqual([...attacks].sort(), [
    "archer",
    "brute",
    "raider",
    "sentinel",
  ]);
  assert.ok(shots > 0);
  assert.ok(shocks > 0);
  assert.ok(damage > 0);
  assert.equal(system.projectiles.length, 24);
});
test("strong attacks interrupt archer, brute recovery is vulnerable, death returns actors to pool", () => {
  const system = new EnemySystem(new T.Scene(), [], 1, 6),
    player = new T.Vector3();
  system.reset(player);
  system.spawn("archer", player);
  system.spawn("brute", player);
  const archer = system.enemies.find(
    (e) => e.kind === "archer" && e.state === "spawn",
  )!;
  archer.state = "windup";
  system.hit(archer, 10, false, 0, player);
  assert.equal(archer.state, "windup");
  system.hit(archer, 20, true, 0.3, player);
  assert.equal(archer.state, "hurt");
  const brute = system.enemies.find((e) => e.kind === "brute")!;
  brute.state = "chase";
  const armored = system.hit(brute, 34, false, 0, player);
  brute.state = "recover";
  const exposed = system.hit(brute, 34, false, 0, player);
  assert.ok(exposed > armored * 1.5);
  brute.state = "chase";
  system.hit(brute, 1000, true, 1, player);
  assert.equal(brute.state, "dead");
  for (let i = 0; i < 80; i++)
    system.update({
      dt: 1 / 60,
      time: i / 60,
      player,
      damage: () => false,
      event: () => {},
    });
  assert.equal(brute.state, "inactive");
  assert.equal(brute.body.root.visible, false);
  system.reset(player);
  assert.equal(system.aliveCount, 4);
  assert.equal(system.director.wave, 0);
  assert.equal(system.projectiles.filter((p) => p.live).length, 0);
});
