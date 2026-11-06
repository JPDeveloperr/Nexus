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
const p = await b.newPage({ viewport: { width: 640, height: 480 } });
const errors = [];
p.on("pageerror", (e) => errors.push(e.message));
await p.addInitScript(() => {
  let queue = [],
    stamp = 0;
  window.requestAnimationFrame = (cb) => {
    queue.push(cb);
    return queue.length;
  };
  window.tick = () => {
    stamp = Math.max(stamp, performance.now());
    stamp += 1000 / 60;
    const callbacks = queue;
    queue = [];
    callbacks.forEach((cb) => cb(stamp));
  };
  const pads = [];
  Object.defineProperty(navigator, "getGamepads", { value: () => pads });
  window.pad = {
    connect: () =>
      (pads[0] = {
        index: 0,
        id: "queue mock",
        connected: true,
        mapping: "standard",
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          value: 0,
          pressed: false,
        })),
      }),
    button: (i, v) => (pads[0].buttons[i] = { value: v ? 1 : 0, pressed: v }),
    axes: (a) => (pads[0].axes = a),
    disconnect: () => (pads[0] = null),
  };
});
try {
  await p.goto(process.env.NEXUS_URL || "http://127.0.0.1:5173/?test=1");
  await p.waitForFunction(() => window.__nexus);
  await p.selectOption("#quality", "low");
  await p.locator("#start").click({ force: true });
  await p.evaluate(() => tick());
  await p.evaluate(() => pad.connect());
  await p.evaluate(() => pad.button(2, true));
  await p.waitForTimeout(40);
  await p.evaluate(() => pad.button(2, false));
  await p.waitForTimeout(40);
  assert.equal(
    (await p.evaluate(() => window.__nexus.snapshot())).attackSequence,
    0,
  );
  await p.evaluate(() => tick());
  assert.equal(
    (await p.evaluate(() => window.__nexus.snapshot())).attackSequence,
    1,
  );
  await p.waitForTimeout(650);
  await p.evaluate(() => tick());
  await p.waitForTimeout(50);
  await p.evaluate(() => tick());
  await p.evaluate(() => pad.button(3, true));
  await p.waitForTimeout(350);
  await p.evaluate(() => pad.button(3, false));
  await p.waitForTimeout(40);
  await p.evaluate(() => tick());
  let s = await p.evaluate(() => window.__nexus.snapshot());
  assert.equal(s.action.kind, "strike");
  assert.ok(s.action.heavy);
  assert.ok(
    s.action.power > 0.2 && s.action.power < 0.5,
    JSON.stringify(s.action),
  );
  await p.waitForTimeout(650);
  await p.evaluate(() => tick());
  await p.waitForTimeout(60);
  await p.evaluate(() => tick());
  await p.keyboard.down("KeyJ");
  await p.waitForTimeout(30);
  await p.evaluate(() => tick());
  assert.equal(
    (await p.evaluate(() => window.__nexus.snapshot())).action.kind,
    "charging",
  );
  await p.evaluate(() => {
    pad.button(3, true);
    pad.axes([0.6, 0, 0, 0]);
  });
  await p.waitForTimeout(30);
  await p.evaluate(() => tick());
  await p.keyboard.up("KeyJ");
  await p.waitForTimeout(30);
  await p.evaluate(() => tick());
  assert.equal(
    (await p.evaluate(() => window.__nexus.snapshot())).action.kind,
    "charging",
  );
  await p.evaluate(() => pad.disconnect());
  await p.waitForTimeout(30);
  await p.evaluate(() => tick());
  assert.equal(
    (await p.evaluate(() => window.__nexus.snapshot())).action.kind,
    "idle",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/1.3/regression/input-queue.json",
    JSON.stringify(
      {
        results: [
          "basic press/release between rendered frames preserved",
          "350ms charged press/release between frames preserves power",
          "old keyboard release cannot fire gamepad charge",
          "disconnect cancels charge",
        ],
        errors,
        pollHz: 120,
        physicalGamepads: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS input queue across rendered frames and input-source release ownership",
  );
} finally {
  await b.close();
}
