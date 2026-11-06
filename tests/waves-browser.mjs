import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
const errors = [],
  results = [],
  waveHistory = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.addInitScript(() => {
  const nativeNow=performance.now.bind(performance);
  let queue = [],
    stamp = 0;
  Object.defineProperty(performance,"now",{value:()=>stamp||nativeNow()});
  window.requestAnimationFrame = (cb) => {
    queue.push(cb);
    return queue.length;
  };
  window.tickFrames = (n = 1, ms = 50) => {
    if (!stamp) stamp = nativeNow();
    for (let i = 0; i < n; i++) {
      stamp += ms;
      const callbacks = queue;
      queue = [];
      callbacks.forEach((cb) => cb(stamp));
    }
  };
});
const tick = (n) => page.evaluate((n) => window.tickFrames(n), n),
  snap = () => page.evaluate(() => window.__nexus.snapshot());
async function pass(name, fn) {
  await fn();
  results.push(name);
  console.log("PASS", name);
}
async function spread() {
  await page.evaluate(() => {
    const w = window.__nexus;
    w.place(0, 0);
    for (const e of w.snapshot().enemies)
      if (!["dead", "inactive"].includes(e.state)) {
        const a = (e.id * Math.PI * 2) / 8;
        w.placeEnemy(e.id, Math.sin(a) * 9, Math.cos(a) * 9);
      }
  });
}
try {
  await page.goto(
    process.env.NEXUS_URL || "http://127.0.0.1:5173/?test=1&diagnostics=1",
  );
  await page.waitForFunction(() => window.__nexus);
  await page.selectOption("#quality", "low");
  await page.locator("#start").click({ force: true });
  await tick(18);
  await pass(
    "Initial wave has three sentinels and one raider, valid spawns",
    async () => {
      const s = await snap(),
        alive = s.enemies.filter(
          (e) => !["dead", "inactive"].includes(e.state),
        );
      assert.equal(alive.length, 4);
      assert.equal(alive.filter((e) => e.kind === "sentinel").length, 3);
      assert.equal(alive.filter((e) => e.kind === "raider").length, 1);
      assert.ok(
        alive.every(
          (e) => Math.hypot(e.x - s.player.x, e.z - s.player.z) > 2.5,
        ),
      );
    },
  );
  const kinds = new Set(),
    patterns = new Set();
  let peak = 0,
    shots = 0,
    shocks = 0;
  await pass(
    "Four waves progress through real sword damage and finish in victory",
    async () => {
      for (let iteration = 0; iteration < 210; iteration++) {
        let s = await snap();
        assert.notEqual(
          s.mode,
          "defeat",
          JSON.stringify({ iteration, health: s.health, world: s.world }),
        );
        peak = Math.max(peak, s.world.alive);
        assert.ok(s.world.alive <= s.world.limit);
        if (!waveHistory.some((w) => w.wave === s.world.wave)) {
          waveHistory.push({
            wave: s.world.wave,
            alive: s.world.alive,
            pending: s.world.pending,
          });
          console.log("WAVE", s.world.wave, s.world.alive, s.world.pending);
        }
        for (const e of s.enemies)
          if (!["inactive", "dead"].includes(e.state)) kinds.add(e.kind);
        for (const e of s.combatEvents)
          if (e.kind === "enemyAttack") patterns.add(e.kind + ":" + e.id);
        shots = Math.max(shots, s.world.projectiles.length);
        shocks = Math.max(shocks, s.world.shocks.length);
        if (s.mode === "victory") break;
        if (s.world.waveState === "intermission") {
          await spread();
          await tick(64);
          continue;
        }
        const target = s.enemies.find(
          (e) => !["inactive", "dead", "spawn"].includes(e.state),
        );
        if (!target) {
          await tick(15);
          continue;
        }
        // Prepare contact geometry only. HP, damage, energy, AI and wave state are never edited.
        await page.evaluate((target) => {
          const w = window.__nexus;
          w.place(0, 2.15);
          w.face(Math.PI);
          for (const e of w.snapshot().enemies)
            if (!["dead", "inactive"].includes(e.state)) {
              if (e.id === target.id) w.placeEnemy(e.id, 0, 0);
              else {
                const a = (e.id * Math.PI * 2) / 8;
                w.placeEnemy(e.id, Math.sin(a) * 10, Math.cos(a) * 10);
              }
            }
        }, target);
        if (
          s.world.wave >= 3 &&
          !waveHistory.find((w) => w.wave === s.world.wave).screenshot
        ) {
          await page.screenshot({
            path: `docs/1.3/regression/screenshots/wave-${s.world.wave}.png`,
          });
          waveHistory.find((w) => w.wave === s.world.wave).screenshot = true;
        }
        if (
          s.world.shocks.length &&
          s.action.cooldown === 0 &&
          s.energy >= 18
        ) {
          await page.keyboard.down("KeyS");
          await page.keyboard.press("Space");
          await tick(8);
          await page.keyboard.up("KeyS");
        }
        await page.locator("#attack-button").click({ force: true });
        await tick(8);
        s = await snap();
        if (s.energy < 10) {
          await spread();
          await tick(36);
        }
      }
      const s = await snap();
      assert.equal(
        s.mode,
        "victory",
        JSON.stringify({ health: s.health, kills: s.kills, world: s.world }),
      );
      assert.equal(s.kills, 21);
      assert.equal(s.world.wave, 4);
      assert.equal(s.world.pending, 0);
      assert.deepEqual([...kinds].sort(), [
        "archer",
        "brute",
        "raider",
        "sentinel",
      ]);
      assert.equal(peak, 6);
    },
  );
  await page.screenshot({
    path: "docs/1.3/regression/screenshots/four-waves-victory.png",
  });
  await pass(
    "Restart restores first wave, health/energy, charge, dodge and hazard pools",
    async () => {
      await page.locator("#resume").click({ force: true });
      await tick(1);
      const s = await snap();
      assert.equal(s.health, 100);
      assert.ok(s.energy === 100);
      assert.equal(s.world.wave, 1);
      assert.equal(s.world.alive, 4);
      assert.equal(s.world.projectiles.length, 0);
      assert.equal(s.world.shocks.length, 0);
      assert.equal(s.action.cooldown, 0);
      assert.equal(s.kills, 0);
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/1.3/regression/waves-browser.json",
    JSON.stringify(
      {
        results,
        errors,
        waveHistory,
        peak,
        kinds: [...kinds],
        shots,
        shocks,
        method:
          "Controlled RAF and player/enemy position fixtures; real input, hitboxes, damage, HP, AI and wave transitions",
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  await writeFile(
    "docs/1.3/regression/waves-failure.json",
    JSON.stringify(
      { results, errors, waveHistory, error: String(e), state: await snap() },
      null,
      2,
    ),
  );
  await page.screenshot({ path: "docs/1.3/regression/screenshots/waves-failure.png" });
  throw e;
} finally {
  await browser.close();
}
