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

import { FixedStepClock } from '../src/timing';
import { keyboardCode } from '../src/input';
test('fixed steps preserve elapsed wall time at 4 FPS instead of discarding 80%',()=>{
 const clock=new FixedStepClock();let seconds=0;
 for(let i=0;i<8;i++)clock.advance(.25,dt=>seconds+=dt);
 assert.ok(Math.abs(seconds-2)<1e-8);
});
test('fixed clock bounds long suspension, resets pending time and never runs a giant step',()=>{
 const clock=new FixedStepClock();let steps=0;
 clock.advance(100,dt=>{assert.ok(dt<=1/60);steps++;});assert.equal(steps,30);
 clock.advance(.005,()=>assert.fail());clock.reset();assert.equal(clock.advance(.012,()=>assert.fail()),0);
});
test('keyboard falls back to key when browser omits physical code',()=>{
 assert.equal(keyboardCode({key:'W',code:''}),'KeyW');assert.equal(keyboardCode({key:'z',code:'KeyW'}),'KeyW');
});

import { radialDeadzone } from '../src/input';
test('analogue radial deadzone eliminates drift, scales proportionally and caps diagonals',()=>{
 assert.deepEqual(radialDeadzone(.08,.07,.18),{x:0,y:0});
 const half=radialDeadzone(.5,0,.18);assert.ok(half.x>.3&&half.x<.5);assert.equal(half.y,0);
 const full=radialDeadzone(1,1,.18);assert.ok(Math.abs(Math.hypot(full.x,full.y)-1)<1e-9);
 assert.deepEqual(radialDeadzone(NaN,Infinity,.18),{x:0,y:0});
});
