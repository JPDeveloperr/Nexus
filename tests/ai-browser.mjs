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
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.addInitScript(() => {
  const nativeNow = performance.now.bind(performance);
  let queue = [],
    stamp = 0;
  Object.defineProperty(performance, "now", {
    value: () => stamp || nativeNow(),
  });
  window.requestAnimationFrame = (cb) => {
    queue.push(cb);
    return queue.length;
  };
  window.tickFrames = (n = 1) => {
    if (!stamp) stamp = nativeNow();
    for (let i = 0; i < n; i++) {
      stamp += 50;
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
async function fixture(wave, kind, range) {
  await page.evaluate(
    ([wave, kind, range]) => {
      const w = window.__nexus;
      w.scenario(wave);
      w.place(0, range);
      let focused = false;
      for (const e of w.snapshot().enemies)
        if (!["inactive", "dead"].includes(e.state)) {
          if (e.kind === kind && !focused) {
            w.placeEnemy(e.id, 0, 0);
            focused = true;
          } else {
            const a = (e.id * Math.PI * 2) / 8;
            w.placeEnemy(e.id, Math.sin(a) * 11, Math.cos(a) * 11);
          }
        }
    },
    [wave, kind, range],
  );
  await tick(15);
}
try {
  await page.goto(
    process.env.NEXUS_URL || "http://127.0.0.1:5173/?test=1&diagnostics=1",
  );
  await page.waitForFunction(() => window.__nexus);
  await page.selectOption("#quality", "low");
  await page.locator("#start").click({ force: true });
  await tick(1);
  await pass(
    "Crimson Raider pursues, telegraphs and performs a two-hit combo",
    async () => {
      await fixture(1, "raider", 2.3);
      for (let i = 0; i < 100; i++) {
        await tick(1);
        const s = await snap(),
          attacks = s.combatEvents.filter(
            (e) =>
              e.kind === "enemyAttack" && e.kind !== undefined && e.id === 3,
          );
        if (attacks.length >= 2) break;
      }
      const s = await snap();
      assert.ok(
        s.combatEvents.filter((e) => e.kind === "enemyAttack" && e.id === 3)
          .length >= 2,
      );
      assert.ok(s.combatEvents.some((e) => e.kind === "enemyWindup"));
    },
  );
  await pass(
    "Void Archer keeps distance, renders and hits with a moving projectile",
    async () => {
      await fixture(2, "archer", 7);
      let observed = false;
      for (let i = 0; i < 60; i++) {
        await tick(1);
        const s = await snap();
        if (s.world.projectiles.length) {
          observed = true;
          await page.screenshot({
            path: "docs/1.2/screenshots/void-archer-projectile.png",
          });
        }
        if (
          s.combatEvents.some(
            (e) => e.kind === "receivedDamage" && e.source === "projectile",
          )
        )
          break;
      }
      const s = await snap();
      assert.ok(observed);
      assert.ok(
        s.combatEvents.some((e) => e.kind === "enemyAttack" && e.id === 5),
      );
      assert.ok(
        s.combatEvents.some(
          (e) => e.kind === "receivedDamage" && e.source === "projectile",
        ),
      );
      const a = s.enemies.find((e) => e.id === 5);
      assert.ok(Math.hypot(a.x - s.player.x, a.z - s.player.z) > 4);
    },
  );
  await pass(
    "Brute slam shockwave is evaded only during the dodge window",
    async () => {
      await fixture(3, "brute", 3);
      let saw = false;
      for (let i = 0; i < 80; i++) {
        await tick(1);
        const s = await snap();
        if (s.world.shocks.some((w) => w.radius > 1.15 && w.radius < 1.8)) {
          saw = true;
          await page.screenshot({
            path: "docs/1.2/screenshots/obsidian-brute-slam.png",
          });
          break;
        }
      }
      assert.ok(saw);
      await page.keyboard.down("KeyD");
      await page.keyboard.press("Space");
      await tick(5);
      await page.keyboard.up("KeyD");
      const s = await snap();
      assert.ok(
        s.combatEvents.some(
          (e) => e.kind === "evade" && e.source === "shockwave",
        ),
        JSON.stringify(s),
      );
      await page.screenshot({
        path: "docs/1.2/screenshots/phantom-shockwave-evade.png",
      });
      await tick(8);
      assert.equal((await snap()).action.invulnerable, false);
    },
  );
  await pass(
    "Death cancels held charge; restart restores the wave system",
    async () => {
      await fixture(1, "sentinel", 1.9);
      let sawChargeCancel = false;
      for (let i = 0; i < 160; i++) {
        let s = await snap();
        if (s.mode === "defeat") break;
        if (s.action.kind === "idle") {
          await page.keyboard.up("KeyJ");
          await page.keyboard.down("KeyJ");
        }
        // Keep a real stationary target in range of an existing sentinel; damage is always from AI.
        await page.evaluate(() => {
          window.__nexus.place(0, 2);
          window.__nexus.placeEnemy(0, 0, 0);
        });
        await tick(5);
        s = await snap();
        sawChargeCancel ||= s.combatEvents.some(
          (e) => e.kind === "chargeCancel" && e.reason === "damage",
        );
      }
      let s = await snap();
      assert.equal(s.mode, "defeat");
      assert.equal(s.action.kind, "idle");
      assert.ok(sawChargeCancel);
      await page.keyboard.up("KeyJ");
      await page.locator("#resume").click({ force: true });
      await tick(1);
      s = await snap();
      assert.equal(s.health, 100);
      assert.equal(s.world.wave, 1);
      assert.equal(s.action.invulnerable, false);
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/1.2/ai-browser.json",
    JSON.stringify(
      {
        results,
        errors,
        fixture:
          "Opt-in starting-wave selector and positions; real AI, projectile collision, invulnerability and damage",
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  await writeFile(
    "docs/1.2/ai-failure.json",
    JSON.stringify(
      { results, errors, error: String(e), state: await snap() },
      null,
      2,
    ),
  );
  throw e;
} finally {
  await browser.close();
}
