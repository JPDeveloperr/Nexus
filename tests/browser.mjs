import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [],
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.status() >= 400) console.log("HTTP", r.status(), r.url());
});
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
const snapshot = () => page.evaluate(() => window.__nexus.snapshot());
async function simWait(seconds) {
  const start = (await snapshot()).time;
  await page.waitForFunction(
    (t) =>
      window.__nexus.snapshot().time >= t ||
      !["playing", "menu"].includes(window.__nexus.snapshot().mode),
    start + seconds,
    { timeout: 120000 },
  );
}
async function pass(name, fn) {
  await fn();
  results.push(name);
  console.log("PASS", name);
}
await mkdir("docs/screenshots", { recursive: true });
try {
  await page.goto(process.env.NEXUS_URL || "http://127.0.0.1:5173/?test=1");
  await page.waitForFunction(
    () => window.__nexus?.snapshot().frames.length > 4,
    { timeout: 120000 },
  );
  await pass("WebGL scene renders real geometry", async () => {
    const s = await snapshot();
    assert.ok(s.geometries > 200);
    assert.ok(s.triangles > 1000);
    assert.equal(s.mode, "menu");
  });
  await page.screenshot({ path: "docs/screenshots/01-menu.png" });
  await page.setViewportSize({ width: 960, height: 600 });
  await page.selectOption("#quality", "low");
  await page.click("#start");
  await pass("Start and keyboard movement", async () => {
    const a = await snapshot();
    await page.keyboard.down("KeyD");
    await simWait(0.7);
    await page.keyboard.up("KeyD");
    const b = await snapshot();
    assert.ok(Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z) > 1);
    assert.equal(b.mode, "playing");
  });
  await pass("Enemy detection and pursuit", async () => {
    await simWait(0.6);
    const s = await snapshot();
    assert.ok(s.enemies.some((e) => e.state !== "patrol"));
  });
  await pass("Arena collision stops movement at the abyss", async () => {
    await page.evaluate(() => window.__nexus.place(13, 0));
    await page.keyboard.down("KeyD");
    await simWait(1.6);
    await page.keyboard.up("KeyD");
    const s = await snapshot();
    assert.ok(Math.hypot(s.player.x, s.player.z) <= 13.821);
  });
  await pass("Mouse aiming and basic strike damage", async () => {
    const s = await snapshot(),
      e = s.enemies[0];
    await page.evaluate((e) => window.__nexus.place(e.x, e.z + 2.4), e);
    const point = await page.evaluate(
      (e) => window.__nexus.project(e.x, 0, e.z),
      e,
    );
    await page.mouse.move(point.x, point.y);
    await simWait(0.1);
    await page.mouse.click(point.x, point.y);
    await simWait(0.4);
    const b = await snapshot();
    assert.ok(b.enemies[0].hp < 100);
    assert.ok(b.energy < 100);
  });
  await pass("Attack cooldown prevents click spam", async () => {
    await simWait(0.3);
    await page.keyboard.press("KeyJ");
    const a = await snapshot();
    for (let i = 0; i < 4; i++) await page.keyboard.press("KeyJ");
    const b = await snapshot();
    assert.ok(b.energy >= a.energy - 1);
  });
  await pass("Sentinel telegraph and damage to Kaeron", async () => {
    const s = await snapshot(),
      e = s.enemies.find((e) => e.hp > 0);
    await page.evaluate((e) => window.__nexus.place(e.x, e.z + 1.6), e);
    const hp = (await snapshot()).health;
    await page.waitForFunction(
      (h) => window.__nexus.snapshot().health < h,
      hp,
      { timeout: 120000 },
    );
  });
  // Restore an overview camera position through gameplay, not a fabricated render.
  await page.evaluate(() => window.__nexus.place(0, 4));
  await simWait(0.7);
  await page.screenshot({ path: "docs/screenshots/02-gameplay.png" });
  await pass("Pause freezes simulation and resumes", async () => {
    await page.keyboard.press("Escape");
    const a = await snapshot();
    await page.waitForTimeout(800);
    const b = await snapshot();
    assert.equal(a.mode, "paused");
    assert.equal(b.time, a.time);
    assert.deepEqual(b.player, a.player);
    assert.deepEqual(b.camera, a.camera);
    await page.evaluate(() => {
      window.__nexus.inspect(2.8);
      document.querySelector("#interface").style.display = "none";
    });
    await page.waitForTimeout(800);
    await page.screenshot({
      path: "docs/screenshots/05-character-inspection.png",
    });
    await page.evaluate(() => {
      window.__nexus.inspect(1);
      document.querySelector("#interface").style.display = "";
    });
    await page.click("#resume");
    assert.equal((await snapshot()).mode, "playing");
  });
  // Deterministic initial placement only; all damage uses real keyboard attacks and frame updates.
  await pass("Enemy death and victory objective", async () => {
    for (let n = 0; n < 30; n++) {
      const s = await snapshot();
      if (s.mode === "victory") break;
      assert.notEqual(s.mode, "defeat");
      const e = s.enemies.find((e) => e.hp > 0);
      if (!e) break;
      await page.evaluate((e) => {
        window.__nexus.place(e.x, e.z + 2.1);
        window.__nexus.face(Math.PI);
      }, e);
      if (s.energy < 20) {
        await page.evaluate(() => window.__nexus.place(0, 12));
        await simWait(1.4);
        continue;
      }
      await page.keyboard.press("KeyJ");
      await simWait(0.6).catch(async (err) => {
        if ((await snapshot()).mode !== "victory") throw err;
      });
    }
    const s = await snapshot();
    assert.equal(s.kills, 3);
    assert.equal(s.mode, "victory");
  });
  await page.screenshot({ path: "docs/screenshots/03-victory.png" });
  await pass("Checkpoint restart restores health and sentinels", async () => {
    await page.click("#resume");
    const s = await snapshot();
    assert.equal(s.health, 100);
    assert.equal(s.kills, 0);
    assert.ok(s.enemies.every((e) => e.hp === 100));
  });
  await pass("Defeat and recovery", async () => {
    await page.waitForFunction(
      () => window.__nexus.snapshot().mode === "defeat",
      null,
      { timeout: 240000 },
    );
    await page.screenshot({ path: "docs/screenshots/04-defeat.png" });
    await page.click("#resume");
    assert.equal((await snapshot()).health, 100);
  });
  await pass(
    "Camera stays finite and has a stable isometric offset",
    async () => {
      const s = await snapshot();
      assert.ok(s.camera.every(Number.isFinite));
      assert.ok(s.camera[1] === 26);
    },
  );
  await page.keyboard.press("Escape");
  await pass("No browser errors", async () => assert.deepEqual(errors, []));
  const metrics = await snapshot();
  await writeFile(
    "docs/browser-results.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        renderer: "Chromium / ANGLE SwiftShader (software)",
        viewport: "1280x800 menu; 960x600 gameplay",
        quality: "medium menu; low gameplay",
        results,
        errors,
        metrics,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  await page.screenshot({ path: "docs/screenshots/test-failure.png" });
  await writeFile(
    "docs/browser-results.json",
    JSON.stringify(
      { results, errors, failure: String(error), snapshot: await snapshot() },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
