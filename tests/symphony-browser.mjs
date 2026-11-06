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
  results = [],
  evidence = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});
await page.addInitScript(() => {
  const now = performance.now.bind(performance);
  let stamp = 0,
    queue = [];
  Object.defineProperty(performance, "now", { value: () => stamp || now() });
  window.requestAnimationFrame = (cb) => {
    queue.push(cb);
    return queue.length;
  };
  window.tickFrames = (n = 1, ms = 1000 / 60) => {
    if (!stamp) stamp = now();
    // Coalesce rendering only; the game's accumulator still executes every 60 Hz physics step.
    // Keep each render below the documented 500 ms catch-up cap.
    let remaining = n * ms;
    while (remaining > 1e-8) {
      const delta = Math.min(400, remaining);
      stamp += delta;
      remaining -= delta;
      const q = queue;
      queue = [];
      q.forEach((cb) => cb(stamp));
    }
  };
  const pads = [];
  Object.defineProperty(navigator, "getGamepads", { value: () => pads });
  window.pad = (label, button, pressed) => {
    if (!pads[0]) {
      pads[0] = {
        index: 0,
        id: label,
        connected: true,
        mapping: "standard",
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          pressed: false,
          value: 0,
        })),
      };
      const e = new Event("gamepadconnected");
      Object.defineProperty(e, "gamepad", { value: pads[0] });
      dispatchEvent(e);
    }
    pads[0].id = label;
    pads[0].buttons[button] = { pressed, value: pressed ? 1 : 0 };
  };
});
const tick = (n = 1, ms = 1000 / 60) =>
  page.evaluate(([n, ms]) => window.tickFrames(n, ms), [n, ms]);
const snap = () => page.evaluate(() => window.__nexus.snapshot());
const basic = () =>
  page.evaluate(() => document.querySelector("#attack-button").click());
const screenshot = async (name) => {
  await page.screenshot({ path: `docs/1.3/screenshots/${name}.png` });
  evidence.push({ name, snapshot: await snap() });
};
const spread = () =>
  page.evaluate(() => {
    const w = window.__nexus;
    w.place(0, 5);
    w.face(Math.PI);
    for (const e of w.snapshot().enemies)
      if (!["inactive", "dead"].includes(e.state)) {
        const a = (e.id * Math.PI) / 4;
        w.placeEnemy(e.id, Math.sin(a) * 10, Math.cos(a) * 10);
      }
  });
async function reset(wave = 1) {
  await page.evaluate((w) => window.__nexus.scenario(w), wave);
  await spread();
  await tick(4, 100);
}
async function pass(name, fn) {
  if (process.env.NEXUS_CASE && !new RegExp(process.env.NEXUS_CASE).test(name))
    return;
  await fn();
  results.push(name);
  console.log("PASS", name);
}
try {
  await page.goto(
    process.env.NEXUS_URL || "http://127.0.0.1:5173/?test=1&diagnostics=1",
  );
  await page.waitForFunction(() => window.__nexus);
  await page.selectOption("#quality", "low");
  await page.locator("#start").click();
  await reset();
  await page.evaluate(() => {
    window.__nexus.inspect(3);
    document.querySelector("#interface").style.visibility = "hidden";
  });
  await pass(
    "Three distinct combo strikes from mouse input, buffering once, idle reset and movement recovery",
    async () => {
      // Pointer input dispatched on the real game canvas without changing aim.
      const click = () =>
        page.evaluate(() =>
          document
            .querySelector("#game canvas")
            .dispatchEvent(
              new PointerEvent("pointerdown", { button: 0, bubbles: true }),
            ),
        );
      await click();
      await tick(6);
      assert.equal((await snap()).action.combo, 0);
      await screenshot("combo-01-swift");
      await click();
      await tick(9);
      assert.equal((await snap()).action.combo, 1);
      await tick(4);
      await screenshot("combo-02-reverse");
      await click();
      await tick(12);
      assert.equal((await snap()).action.combo, 2);
      await tick(5);
      await screenshot("combo-03-crescent");
      await tick(8, 100);
      assert.equal((await snap()).action.kind, "idle");
      const before = await snap();
      await page.keyboard.down("KeyD");
      await tick(4, 100);
      await page.keyboard.up("KeyD");
      assert.ok(
        Math.hypot(
          (await snap()).player.x - before.player.x,
          (await snap()).player.z - before.player.z,
        ) > 1,
      );
      await click();
      await tick(1);
      assert.equal((await snap()).action.combo, 0);
      await tick(4, 100);
    },
  );
  await pass("Recovery dodge cancels buffered combo", async () => {
    await reset();
    await basic();
    await tick(6);
    await basic();
    await tick(4);
    await page.keyboard.press("Space");
    await tick(1);
    assert.equal((await snap()).action.kind, "dodge");
    await tick(5, 100);
    assert.equal((await snap()).attackSequence, 1);
  });
  await pass(
    "Progressive red charge and finite wave with real ranged damage",
    async () => {
      await reset();
      await page.keyboard.down("KeyJ");
      await tick(10);
      const early = (await snap()).bladeColor;
      await screenshot("charge-01-early");
      await tick(4, 100);
      await screenshot("charge-02-tension");
      await tick(8, 100);
      const s = await snap();
      assert.equal(s.action.charge, 1.2);
      assert.notEqual(s.bladeColor, early);
      await screenshot("charge-03-maximum");
      await page.evaluate(() => {
        window.__nexus.placeEnemy(0, 0, 0.1);
        window.__nexus.face(Math.PI);
      });
      await page.keyboard.up("KeyJ");
      await tick(10);
      assert.equal((await snap()).crimsonWaves.length, 1);
      await screenshot("wave-01-launch");
      await tick(5);
      await screenshot("wave-02-travel");
      await tick(9, 100);
      const after = await snap();
      assert.ok(
        after.combatEvents.some((e) => e.kind === "waveHit" && e.target === 0),
        JSON.stringify(after.combatEvents),
      );
      assert.equal(after.crimsonWaves.length, 0);
      const events = after.combatEvents.filter(
        (e) => ["hit", "waveHit"].includes(e.kind) && e.target === 0,
      );
      assert.equal(events.length, 1);
    },
  );
  await pass(
    "Real lethal melee damage yields articulated impact, collapse, ground contact, rest and removal",
    async () => {
      await reset();
      // Two full charges kill a sentinel. Only actor positions are prepared; HP and damage are real.
      for (let attack = 0; attack < 2; attack++) {
        await spread();
        await page.keyboard.down("KeyJ");
        await tick(13, 100);
        await page.evaluate(() => {
          window.__nexus.place(0, 5);
          window.__nexus.face(Math.PI);
          window.__nexus.placeEnemy(0, 0, 3);
        });
        await page.keyboard.up("KeyJ");
        if (attack === 0) {
          await tick(8, 100);
          const events = (await snap()).combatEvents.filter(
            (e) => ["hit", "waveHit"].includes(e.kind) && e.target === 0,
          );
          assert.equal(
            events.length,
            1,
            "melee and wave must not stack on a nearby enemy",
          );
          continue;
        }
        let s;
        for (let i = 0; i < 18; i++) {
          await tick(1);
          s = await snap();
          if (s.enemies[0].state === "dead") break;
        }
        assert.equal(s.enemies[0].state, "dead");
        await screenshot("death-01-impact");
        await tick(1, 180);
        await screenshot("death-02-balance");
        await tick(1, 350);
        await screenshot("death-03-fall");
        await tick(1, 400);
        await screenshot("death-04-contact");
        await tick(1, 350);
        await screenshot("death-05-rest");
        s = await snap();
        assert.equal(s.enemies[0].state, "dead");
        assert.ok(s.enemies[0].floor >= 0.0249);
        await tick(4, 100);
        assert.equal((await snap()).enemies[0].state, "dead");
        await tick(12, 100);
        assert.equal((await snap()).enemies[0].state, "inactive");
      }
    },
  );
  await pass(
    "Xbox X/Y/B and PlayStation Square/Triangle/Circle via standard Gamepad API",
    async () => {
      for (const label of [
        "Xbox Wireless Controller",
        "Sony DualSense Wireless Controller",
      ]) {
        await reset();
        const button = async (i, on) => {
          await page.evaluate(
            ([l, i, on]) => window.pad(l, i, on),
            [label, i, on],
          );
          await page.waitForTimeout(25);
        };
        await button(2, true);
        await tick(6);
        await button(2, false);
        await tick(1);
        assert.equal((await snap()).action.combo, 0);
        await button(2, true);
        await tick(8);
        await button(2, false);
        await tick(1);
        assert.equal((await snap()).action.combo, 1);
        await tick(4);
        await button(2, true);
        await tick(10);
        await button(2, false);
        await tick(1);
        assert.equal((await snap()).action.combo, 2);
        await tick(5, 100);
        await button(3, true);
        await tick(4, 100);
        assert.equal((await snap()).action.kind, "charging");
        await button(3, false);
        await tick(1);
        assert.ok((await snap()).action.heavy);
        await tick(8, 100);
        await button(1, true);
        await tick(1);
        await button(1, false);
        assert.equal((await snap()).action.kind, "dodge");
        await tick(5, 100);
      }
    },
  );
  await pass(
    "Visual variants: backward, lateral, heavy knee collapse and floating loss of lift",
    async () => {
      for (const [kind, wave, side] of [
        ["sentinel", 1, false],
        ["raider", 1, true],
        ["brute", 3, false],
        ["archer", 2, false],
      ]) {
        await reset(wave);
        const id = (await snap()).enemies.find(
          (e) => e.kind === kind && e.state !== "inactive",
        ).id;
        let dead = false;
        for (let strike = 0; strike < 8 && !dead; strike++) {
          await spread();
          await page.keyboard.down("KeyJ");
          await tick(3, 450);
          await page.evaluate(
            ([id, side]) => {
              const w = window.__nexus;
              w.place(0, 2.15);
              w.face(Math.PI);
              w.placeEnemy(id, 0, 0);
              w.faceEnemy(id, side ? Math.PI / 2 : 0);
            },
            [id, side],
          );
          await page.keyboard.up("KeyJ");
          for (let i = 0; i < 8; i++) {
            // Keep the side-impact fixture oriented: live AI otherwise turns to face the attacker.
            if (side)
              await page.evaluate(
                (id) => window.__nexus.faceEnemy(id, Math.PI / 2),
                id,
              );
            await tick(1, 50);
            const s = await snap();
            if (s.enemies[id].state === "dead") {
              dead = true;
              break;
            }
          }
          if (!dead) await tick(2, 400);
        }
        assert.ok(dead, kind + " must die through real damage");
        const death = (await snap()).enemies[id];
        assert.equal(
          death.deathVariant,
          kind === "archer"
            ? "floating"
            : kind === "brute"
              ? "heavy"
              : side
                ? "side"
                : "back",
        );
        await screenshot(`${kind}-death-01-impact`);
        await tick(1, 250);
        await screenshot(`${kind}-death-02-knees`);
        await tick(1, 450);
        await screenshot(`${kind}-death-03-fall`);
        await tick(1, 500);
        await screenshot(`${kind}-death-04-rest`);
        assert.ok((await snap()).enemies[id].floor >= 0.0249);
        await tick(4, 450);
        assert.equal((await snap()).enemies[id].state, "inactive");
      }
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    process.env.NEXUS_CASE
      ? "docs/1.3/visual-results.json"
      : "docs/1.3/browser-results.json",
    JSON.stringify({ results, errors, evidence }, null, 2),
  );
} catch (e) {
  await page.screenshot({ path: "docs/1.3/screenshots/failure.png" });
  console.error(JSON.stringify(await snap()));
  throw e;
} finally {
  await browser.close();
}
