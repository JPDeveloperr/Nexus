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
  results = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.addInitScript(() => {
  const pads = [];
  Object.defineProperty(navigator, "getGamepads", { value: () => pads });
  window.mockPads = {
    connect: (index, mapping = "standard") => {
      pads[index] = {
        index,
        id: `Simulated ${index} (${mapping})`,
        connected: true,
        mapping,
        axes: [0, 0, 0, 0],
        buttons: Array.from({ length: 17 }, () => ({
          value: 0,
          pressed: false,
        })),
      };
      const e = new Event("gamepadconnected");
      Object.defineProperty(e, "gamepad", { value: pads[index] });
      dispatchEvent(e);
    },
    axes: (index, axes) => {
      pads[index].axes = axes;
    },
    button: (index, i, pressed) => {
      pads[index].buttons[i] = { value: pressed ? 1 : 0, pressed };
    },
    disconnect: (index) => {
      const p = pads[index];
      pads[index] = null;
      const e = new Event("gamepaddisconnected");
      Object.defineProperty(e, "gamepad", { value: p });
      dispatchEvent(e);
    },
  };
});
const snap = () => page.evaluate(() => window.__nexus.snapshot());
const settle = () => page.waitForTimeout(550);
async function button(i, index = 0) {
  await page.evaluate(
    ([i, index]) => window.mockPads.button(index, i, true),
    [i, index],
  );
  await settle();
  await page.evaluate(
    ([i, index]) => window.mockPads.button(index, i, false),
    [i, index],
  );
  await settle();
}
async function pass(name, fn) {
  await fn();
  results.push(name);
  console.log("PASS", name);
}
try {
  await page.goto(process.env.NEXUS_URL || "http://127.0.0.1:5173/?test=1");
  await page.waitForFunction(() => window.__nexus);
  await page.selectOption("#quality", "low");
  await page.locator(".brand").focus();
  await pass("Connection and controller-only start", async () => {
    await page.evaluate(() => window.mockPads.connect(0));
    await button(0);
    await page.waitForFunction(
      () => window.__nexus.snapshot().mode === "playing",
      null,
      { timeout: 10000 },
    );
    assert.equal((await snap()).mode, "playing");
    assert.equal((await snap()).input.pads, 1);
  });
  await pass("Radial deadzone prevents drift", async () => {
    await page.evaluate(() => {
      window.__nexus.place(0, 8);
      window.mockPads.axes(0, [0.08, -0.07, 0, 0]);
    });
    const a = await snap();
    await page.waitForTimeout(1000);
    const b = await snap();
    assert.ok(
      Math.hypot(a.player.x - b.player.x, a.player.z - b.player.z) < 0.03,
    );
  });
  let full = 0;
  await pass("Full and proportional analogue movement", async () => {
    await page.evaluate(() => {
      window.__nexus.place(0, 5);
      window.mockPads.axes(0, [1, 0, 0, 0]);
    });
    const a = await snap();
    await page.waitForTimeout(1000);
    const b = await snap();
    full = Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z);
    assert.ok(full > 2.8);
    await page.evaluate(() => {
      window.__nexus.place(0, 5);
      window.mockPads.axes(0, [0.5, 0, 0, 0]);
    });
    const c = await snap();
    await page.waitForTimeout(1000);
    const d = await snap();
    const partial = Math.hypot(
      d.player.x - c.player.x,
      d.player.z - c.player.z,
    );
    assert.ok(partial > 0.5 && partial < full * 0.75);
    await page.evaluate(() => window.mockPads.axes(0, [0, 0, 0, 0]));
    await settle();
  });
  await pass("Right stick aims independently", async () => {
    await page.evaluate(() => window.mockPads.axes(0, [0, 0, 1, 0]));
    await settle();
    const s = await snap();
    assert.ok(Math.abs(s.player.facing - 2.1815) < 0.15);
    await page.evaluate(() => window.mockPads.axes(0, [0, 0, 0, 0]));
  });
  await pass(
    "Controller attack is edge-triggered, not repeated while held",
    async () => {
      const sequence = (await snap()).attackSequence;
      await page.evaluate(() => {
        window.__nexus.place(0, 10);
        window.mockPads.button(0, 2, true);
      });
      await settle();
      const a = await snap();
      assert.equal(a.attackSequence, sequence + 1);
      await page.waitForTimeout(1600);
      const b = await snap();
      assert.equal(b.attack, 0);
      assert.equal(b.attackSequence, sequence + 1);
      assert.ok(b.energy >= a.energy);
      await page.evaluate(() => window.mockPads.button(0, 2, false));
      await settle();
    },
  );
  await pass("Switch keyboard to gamepad without restart", async () => {
    await page.keyboard.down("KeyA");
    await settle();
    assert.equal((await snap()).input.source, "keyboard");
    await page.keyboard.up("KeyA");
    await page.evaluate(() => window.mockPads.axes(0, [0.8, 0, 0, 0]));
    await settle();
    assert.equal((await snap()).input.source, "gamepad");
    await page.evaluate(() => window.mockPads.axes(0, [0, 0, 0, 0]));
  });
  await pass(
    "Multiple controllers choose active device and disconnect stops motion",
    async () => {
      await page.evaluate(() => {
        window.mockPads.connect(1);
        window.mockPads.axes(1, [0.6, 0, 0, 0]);
      });
      await settle();
      assert.equal((await snap()).input.gamepad, 1);
      await page.evaluate(() => window.mockPads.disconnect(1));
      await page.waitForTimeout(1000);
      assert.equal((await snap()).input.gamepad, 0);
      const a = await snap();
      await settle();
      const b = await snap();
      assert.ok(
        Math.hypot(b.player.x - a.player.x, b.player.z - a.player.z) < 0.03,
      );
    },
  );
  await pass("Unmapped controller is safely ignored", async () => {
    await page.evaluate(() => {
      window.mockPads.connect(2, "");
      window.mockPads.axes(2, [1, 1, 1, 1]);
    });
    await settle();
    const s = await snap();
    assert.equal(s.input.unsupported, 1);
    assert.notEqual(s.input.gamepad, 2);
    await page.evaluate(() => window.mockPads.disconnect(2));
  });
  await pass("Controller pause, navigation, resume and restart", async () => {
    await button(9);
    assert.equal((await snap()).mode, "paused");
    await button(9);
    assert.equal((await snap()).mode, "playing");
    await button(9);
    await button(13);
    await button(0);
    assert.equal((await snap()).mode, "menu");
    await page.evaluate(() => window.mockPads.button(0, 0, true));
    await page.waitForFunction(
      () => window.__nexus.snapshot().mode === "playing",
    );
    assert.equal((await snap()).health, 100);
    await page.evaluate(() => window.mockPads.button(0, 0, false));
  });
  await pass(
    "Y/Triangle charges, release strikes once, B/Circle dodges and A stays menu-only",
    async () => {
      await page.evaluate(() => {
        window.__nexus.place(0, 5);
        for (const e of window.__nexus.snapshot().enemies)
          if (!["inactive", "dead"].includes(e.state))
            window.__nexus.placeEnemy(
              e.id,
              Math.sin(e.id) * 10,
              Math.cos(e.id) * 10,
            );
        window.mockPads.button(0, 3, true);
      });
      await page.waitForTimeout(750);
      let s = await snap();
      assert.equal(s.action.kind, "charging");
      assert.ok(s.action.charge > 0.4);
      assert.notEqual(s.bladeColor, 0x9edce5);
      await page.evaluate(() => window.mockPads.button(0, 3, false));
      await page.waitForFunction(
        () => window.__nexus.snapshot().action.kind === "strike",
      );
      const sequence = (await snap()).attackSequence;
      await page.waitForTimeout(900);
      assert.equal((await snap()).attackSequence, sequence);
      await page.evaluate(() => window.mockPads.button(0, 1, true));
      await page.waitForFunction(
        () => window.__nexus.snapshot().action.kind === "dodge",
      );
      s = await snap();
      assert.equal(s.input.gamepad, 0);
      await page.evaluate(() => window.mockPads.button(0, 1, false));
      await page.waitForTimeout(650);
      assert.equal((await snap()).action.invulnerable, false);
      await button(0);
      assert.notEqual((await snap()).action.kind, "dodge");
    },
  );
  await pass(
    "Disconnect while Y held cancels charge rather than firing",
    async () => {
      await page.evaluate(() => {
        window.__nexus.place(0, 5);
        for (const e of window.__nexus.snapshot().enemies)
          if (!["inactive", "dead"].includes(e.state))
            window.__nexus.placeEnemy(
              e.id,
              Math.sin(e.id) * 10,
              Math.cos(e.id) * 10,
            );
        window.mockPads.button(0, 3, true);
      });
      await page.waitForTimeout(450);
      assert.equal((await snap()).action.kind, "charging");
      const sequence = (await snap()).attackSequence;
      await page.evaluate(() => window.mockPads.disconnect(0));
      await settle();
      assert.equal((await snap()).action.kind, "idle");
      assert.equal((await snap()).attackSequence, sequence);
    },
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "docs/1.2/controller-results.json",
    JSON.stringify(
      {
        results,
        errors,
        physicalDevicesTested: false,
        mock: "navigator.getGamepads with standard buttons/axes and connection events",
      },
      null,
      2,
    ),
  );
} catch (e) {
  console.error(e);
  console.log(await snap());
  throw e;
} finally {
  await browser.close();
}
