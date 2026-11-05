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
  window.tickFrames = (n = 1, ms = 1000 / 60) => {
    if (!stamp) stamp = nativeNow();
    for (let i = 0; i < n; i++) {
      stamp += ms;
      const callbacks = queue;
      queue = [];
      callbacks.forEach((cb) => cb(stamp));
    }
  };
});
const tick = (n, ms = 1000 / 60) =>
  page.evaluate(([n, ms]) => window.tickFrames(n, ms), [n, ms]);
const snap = () => page.evaluate(() => window.__nexus.snapshot());
async function pass(name, fn) {
  await fn();
  results.push(name);
  console.log("PASS", name);
}
async function reset() {
  await page.locator("#pause").click({ force: true });
  await page.locator("#menu-button").click({ force: true });
  await page.locator("#start").click({ force: true });
  await tick(1);
}
async function isolate() {
  await page.evaluate(() => {
    const w = window.__nexus;
    w.place(0, 5);
    w.face(Math.PI);
    for (const e of w.snapshot().enemies)
      if (!["inactive", "dead"].includes(e.state)) {
        const angle = (e.id * Math.PI * 2) / 8;
        w.placeEnemy(e.id, Math.sin(angle) * 10, Math.cos(angle) * 10);
      }
  });
}
async function basic() {
  await page.locator("#attack-button").click({ force: true });
}
try {
  await page.goto(
    process.env.NEXUS_URL || "http://127.0.0.1:5173/?test=1&diagnostics=1",
  );
  await page.waitForFunction(() => window.__nexus);
  await page.selectOption("#quality", "low");
  await page.locator("#start").click({ force: true });
  await tick(1);
  await isolate();
  await pass("Basic is 260ms, buffered, and returns to movement", async () => {
    await basic();
    await tick(1);
    const a = await snap();
    assert.equal(a.action.kind, "strike");
    await tick(17);
    let b = await snap();
    assert.equal(b.action.kind, "idle");
    assert.ok(b.time - a.time < 0.32);
    await page.keyboard.down("KeyD");
    await tick(25);
    await page.keyboard.up("KeyD");
    b = await snap();
    assert.ok(Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z) > 1);
  });
  await isolate();
  await pass(
    "Crimson charge visibly changes blade, caps at 1200ms and releases once",
    async () => {
      const original = (await snap()).bladeColor;
      await page.evaluate(() => {
        window.__nexus.inspect(2.8);
        document.querySelector("#interface").style.visibility = "hidden";
      });
      await page.keyboard.down("KeyJ");
      await tick(10);
      const early = await snap();
      assert.equal(early.action.kind, "charging");
      assert.notEqual(early.bladeColor, original);
      await page.screenshot({
        path: "docs/1.2/screenshots/charge-01-early.png",
      });
      await tick(26);
      const middle = await snap();
      await page.screenshot({
        path: "docs/1.2/screenshots/charge-02-middle.png",
      });
      await tick(44);
      const maximum = await snap();
      assert.equal(maximum.action.charge, 1.2);
      assert.ok(
        ((maximum.bladeColor >> 16) & 255) >
          ((maximum.bladeColor >> 8) & 255) * 3,
      );
      await page.screenshot({
        path: "docs/1.2/screenshots/charge-03-maximum.png",
      });
      await page.keyboard.up("KeyJ");
      await tick(7);
      let released = await snap();
      assert.equal(released.action.kind, "strike");
      assert.equal(released.action.heavy, true);
      assert.equal(released.action.power, 1);
      await page.screenshot({
        path: "docs/1.2/screenshots/crimson-04-release.png",
      });
      await tick(38);
      released = await snap();
      assert.equal(released.action.kind, "idle");
      assert.equal(released.action.charge, 0);
      await page.evaluate(() => {
        window.__nexus.inspect(1);
        document.querySelector("#interface").style.visibility = "";
      });
    },
  );
  await pass(
    "Too-short charge and pause/focus cancel without release",
    async () => {
      await page.keyboard.down("KeyJ");
      await tick(3);
      await page.keyboard.up("KeyJ");
      await tick(2);
      let s = await snap();
      assert.equal(s.action.kind, "idle");
      await page.keyboard.down("KeyJ");
      await tick(20);
      await page.keyboard.press("Escape");
      await tick(1);
      s = await snap();
      const sequence = s.attackSequence;
      assert.equal(s.mode, "paused");
      assert.equal(s.action.kind, "idle");
      await page.keyboard.up("KeyJ");
      await page.locator("#resume").click({ force: true });
      await tick(2);
      assert.equal((await snap()).attackSequence, sequence);
      await page.keyboard.down("KeyJ");
      await tick(10);
      await page.evaluate(() => dispatchEvent(new Event("blur")));
      assert.equal((await snap()).mode, "paused");
      assert.equal((await snap()).action.kind, "idle");
      await page.keyboard.up("KeyJ");
      await page.locator("#resume").click({ force: true });
      await tick(2);
    },
  );
  await reset();
  await isolate();
  await pass(
    "Dodge eight directions, no-input facing, bounded invulnerability/cooldown",
    async () => {
      const directions = [
        ["KeyW"],
        ["KeyA"],
        ["KeyS"],
        ["KeyD"],
        ["KeyW", "KeyA"],
        ["KeyW", "KeyD"],
        ["KeyS", "KeyA"],
        ["KeyS", "KeyD"],
        [],
      ];
      for (const keys of directions) {
        await page.evaluate(() => {
          window.__nexus.place(0, 5);
          window.__nexus.face(Math.PI);
        });
        await tick(35);
        for (const key of keys) await page.keyboard.down(key);
        const a = await snap();
        await page.keyboard.press("Space");
        await tick(6);
        const middle = await snap();
        assert.equal(middle.action.kind, "dodge");
        assert.equal(middle.action.invulnerable, true);
        await page.keyboard.press("Space");
        await tick(14);
        let b = await snap();
        assert.equal(b.action.invulnerable, false);
        assert.notEqual(b.action.kind, "dodge");
        assert.ok(
          Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z) > 1.5,
        );
        for (const key of keys) await page.keyboard.up(key);
      }
    },
  );
  await reset();
  await isolate();
  await pass(
    "Dodge collision with column and edge; afterimages are rendered",
    async () => {
      await page.evaluate(() => {
        window.__nexus.place(13, 0);
        window.__nexus.face(Math.PI / 2);
      });
      await page.keyboard.press("Space");
      await tick(6);
      await page.screenshot({
        path: "docs/1.2/screenshots/dodge-01-displacement.png",
      });
      await tick(16);
      let s = await snap();
      assert.ok(Math.hypot(s.player.x, s.player.z) <= 13.82001);
      await tick(20);
      await page.evaluate(() => {
        window.__nexus.place(0, -10);
        window.__nexus.face(Math.PI);
        window.__nexus.inspect(2);
      });
      await page.keyboard.press("Space");
      for (let i = 0; i < 20; i++) {
        await tick(1);
        s = await snap();
        assert.ok(Math.hypot(s.player.x, s.player.z + 12.8) >= 1.38);
      }
      await page.screenshot({
        path: "docs/1.2/screenshots/dodge-02-column.png",
      });
      await page.evaluate(() => window.__nexus.inspect(1));
    },
  );
  await reset();
  await isolate();
  await reset();
  await isolate();
  await pass(
    "Dodge renders a coherent start, displacement and recovery sequence",
    async () => {
      await page.evaluate(() => {
        window.__nexus.place(0, 5);
        window.__nexus.face(Math.PI);
        window.__nexus.inspect(2.5);
        document.querySelector("#interface").style.visibility = "hidden";
      });
      await page.keyboard.press("Space");
      await tick(2);
      await page.screenshot({
        path: "docs/1.2/screenshots/phantom-01-start.png",
      });
      await tick(5);
      assert.equal((await snap()).action.invulnerable, true);
      await page.screenshot({
        path: "docs/1.2/screenshots/phantom-02-displacement.png",
      });
      await tick(15);
      assert.equal((await snap()).action.invulnerable, false);
      await page.screenshot({
        path: "docs/1.2/screenshots/phantom-03-recovery.png",
      });
      await page.evaluate(() => {
        window.__nexus.inspect(1);
        document.querySelector("#interface").style.visibility = "";
      });
    },
  );
  await pass(
    "Blade hitbox and heavy damage scale through real attacks",
    async () => {
      await tick(45);
      await page.evaluate(() => {
        window.__nexus.place(0, 5);
        window.__nexus.face(Math.PI);
        window.__nexus.placeEnemy(0, 0, 3);
      });
      await basic();
      await tick(20);
      let s = await snap();
      assert.ok(s.enemies[0].hp < 100);
      const basicHit = s.combatEvents.find((e) => e.kind === "hit");
      assert.equal(basicHit.heavy, false);
      assert.ok(basicHit.elapsed >= 0.05 && basicHit.elapsed <= 0.16);
      // New match for each charge keeps damage comparison independent of prior hits.
      const damage = [];
      for (const frames of [18, 76]) {
        await reset();
        await isolate();
        await tick(45);
        await page.keyboard.down("KeyJ");
        await tick(frames);
        await page.evaluate(() => {
          window.__nexus.place(0, 5);
          window.__nexus.face(Math.PI);
          window.__nexus.placeEnemy(0, 0, 3);
        });
        await page.keyboard.up("KeyJ");
        await tick(40);
        s = await snap();
        const hit = s.combatEvents.find((e) => e.kind === "hit" && e.heavy);
        assert.ok(hit, JSON.stringify(s));
        damage.push(hit.damage);
      }
      assert.ok(damage[1] > damage[0] * 1.5);
      assert.ok(damage[1] <= 85.001);
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/1.2/combat-browser.json",
    JSON.stringify(
      {
        results,
        errors,
        clock: "Controlled RAF, real input/rendering/physics/damage",
        final: await snap(),
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  await page.screenshot({ path: "docs/1.2/screenshots/test-failure.png" });
  await writeFile(
    "docs/1.2/combat-failure.json",
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
