import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
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
  let callbacks = [],
    stamp = 0;
  window.requestAnimationFrame = (cb) => {
    callbacks.push(cb);
    return callbacks.length;
  };
  window.tickFrames = (count = 1) => {
    if (!stamp) stamp = performance.now();
    for (let i = 0; i < count; i++) {
      stamp += 1000 / 60;
      const list = callbacks;
      callbacks = [];
      list.forEach((cb) => cb(stamp));
    }
  };
});
const tick = (n) => page.evaluate((n) => window.tickFrames(n), n);
const snap = () => page.evaluate(() => window.__nexus.snapshot());
async function pass(name, fn) {
  await fn();
  results.push(name);
  console.log("PASS", name);
}
await mkdir("docs/1.1/screenshots", { recursive: true });
try {
  await page.goto(process.env.NEXUS_URL || "http://127.0.0.1:5173/?test=1");
  await page.waitForFunction(() => window.__nexus);
  await page.selectOption("#quality", "low");
  await page.locator("#start").click({ force: true });
  await tick(1);
  await page.evaluate(() => {
    window.__nexus.place(0, 5);
    window.__nexus.face(Math.PI);
    window.__nexus.inspect(2.7);
    document.querySelector("#interface").style.visibility = "hidden";
  });
  const initial = await snap();
  await page.keyboard.press("KeyJ");
  await tick(4);
  let s = await snap();
  await pass("Anticipation has no damage", async () => {
    assert.equal(s.animationPhase, "anticipation");
    assert.equal(s.enemies[0].hp, 100);
  });
  await page.screenshot({
    path: "docs/1.1/screenshots/attack-01-anticipation.png",
  });
  await tick(10);
  const active = await snap();
  await page.screenshot({
    path: "docs/1.1/screenshots/attack-02-execution.png",
  });
  await tick(4);
  await page.screenshot({
    path: "docs/1.1/screenshots/attack-02b-contact.png",
  });
  await tick(7);
  const recovery = await snap();
  await page.screenshot({
    path: "docs/1.1/screenshots/attack-03-recovery.png",
  });
  await pass(
    "Real blade sweep hits once, exclusively during execution",
    async () => {
      assert.equal(
        recovery.enemies[0].hp,
        66,
        JSON.stringify({ active, recovery }),
      );
      const hits = recovery.combatEvents.filter(
        (e) =>
          e.kind === "hit" &&
          e.sequence === recovery.attackSequence &&
          e.target === 0,
      );
      assert.equal(hits.length, 1);
      assert.equal(hits[0].phase, "execution");
      assert.ok(hits[0].elapsed >= 0.12 && hits[0].elapsed <= 0.34);
      assert.equal(recovery.animationPhase, "recovery");
    },
  );
  await pass(
    "Blade trajectory changes and remains attached to the articulated hand",
    async () => {
      const distance = Math.hypot(
        active.blade.tip.x - initial.blade.tip.x,
        active.blade.tip.z - initial.blade.tip.z,
      );
      assert.ok(distance > 0.5);
      for (const sample of [active, recovery])
        assert.ok(
          Math.abs(
            Math.hypot(
              sample.blade.tip.x - sample.blade.base.x,
              sample.blade.tip.y - sample.blade.base.y,
              sample.blade.tip.z - sample.blade.base.z,
            ) - 1.38,
          ) < 0.001,
        );
    },
  );
  await tick(15);
  await page.evaluate(() => {
    document.querySelector("#interface").style.visibility = "";
    window.__nexus.inspect(1);
    window.__nexus.place(0, 10);
  });
  await pass("Late input is buffered into one next attack", async () => {
    const before = (await snap()).attackSequence;
    await page.keyboard.press("KeyJ");
    await tick(23);
    await page.keyboard.press("KeyJ");
    await tick(12);
    assert.equal((await snap()).attackSequence, before + 2);
    await tick(40);
    assert.equal((await snap()).attackSequence, before + 2);
    assert.equal((await snap()).attack, 0);
  });
  await pass(
    "Running into attack, locked facing, then back to movement",
    async () => {
      await page.evaluate(() => window.__nexus.place(0, 5));
      await page.keyboard.down("KeyD");
      await tick(15);
      const run = await snap();
      assert.ok(run.actualSpeed > 3.5);
      await page.keyboard.up("KeyD");
      await page.keyboard.press("KeyJ");
      await tick(3);
      const a = await snap();
      await page.mouse.move(50, 50);
      await tick(3);
      assert.equal((await snap()).player.facing, a.player.facing);
      await page.keyboard.down("KeyD");
      await tick(40);
      await page.keyboard.up("KeyD");
      const b = await snap();
      assert.equal(b.attack, 0);
      assert.ok(
        Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z) > 1,
      );
      assert.ok(b.actualSpeed > 3);
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/1.1/combat-results.json",
    JSON.stringify(
      {
        results,
        errors,
        clock:
          "Controlled requestAnimationFrame at 60Hz; real rendering, input, animation and damage code",
        hitEvents: recovery.combatEvents,
        poses: { initial, active, recovery },
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  await page.screenshot({ path: "docs/1.1/screenshots/combat-failure.png" });
  console.log(await snap());
  throw e;
} finally {
  await browser.close();
}
