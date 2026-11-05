import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const b = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--enable-unsafe-swiftshader",
    "--use-gl=angle",
    "--use-angle=swiftshader",
  ],
});
const p = await b.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
p.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await p.addInitScript(() => {
  const nativeNow = performance.now.bind(performance);
  let stamp = 0,
    queue = [];
  Object.defineProperty(performance, "now", {
    value: () => stamp || nativeNow(),
  });
  window.requestAnimationFrame = (cb) => {
    queue.push(cb);
    return queue.length;
  };
  window.tick = (n = 1) => {
    if (!stamp) stamp = nativeNow();
    for (let i = 0; i < n; i++) {
      stamp += 1000 / 60;
      const callbacks = queue;
      queue = [];
      callbacks.forEach((cb) => cb(stamp));
    }
  };
});
try {
  await p.goto(process.env.NEXUS_URL || "http://127.0.0.1:5173/?test=1");
  await p.waitForFunction(() => window.__nexus);
  await p.selectOption("#quality", "low");
  await p.locator("#start").click({ force: true });
  await p.evaluate(() => {
    tick();
    const w = window.__nexus;
    w.place(0, 5);
    w.face(Math.PI);
    for (const e of w.snapshot().enemies)
      if (!["inactive", "dead"].includes(e.state))
        w.placeEnemy(e.id, Math.sin(e.id) * 11, Math.cos(e.id) * 11);
    w.inspect(2.5);
    document.querySelector("#interface").style.visibility = "hidden";
  });
  const start = await p.evaluate(() => window.__nexus.snapshot());
  await p.keyboard.press("Space");
  await p.evaluate(() => tick(2));
  await p.screenshot({ path: "docs/1.2/screenshots/phantom-01-start.png" });
  await p.evaluate(() => tick(5));
  assert.ok(
    (await p.evaluate(() => window.__nexus.snapshot())).action.invulnerable,
  );
  await p.screenshot({
    path: "docs/1.2/screenshots/phantom-02-displacement.png",
  });
  await p.evaluate(() => tick(15));
  const end = await p.evaluate(() => window.__nexus.snapshot());
  assert.equal(end.action.invulnerable, false);
  assert.ok(
    Math.hypot(end.player.x - start.player.x, end.player.z - start.player.z) >
      2,
  );
  await p.screenshot({ path: "docs/1.2/screenshots/phantom-03-recovery.png" });
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/1.2/dodge-visual.json",
    JSON.stringify(
      {
        results: [
          "spectral wind shader renders without errors",
          "start/displacement/recovery sequence",
          "finite invulnerability and continuous displacement",
        ],
        errors,
      },
      null,
      2,
    ),
  );
  console.log("PASS final spectral wind and dodge sequence");
} finally {
  await b.close();
}
