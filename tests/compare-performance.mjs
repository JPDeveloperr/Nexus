import { chromium } from "playwright";
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
const results = [];
try {
  for (const [version, url] of [
    ["1.1", process.env.NEXUS_BASELINE_URL || "http://127.0.0.1:5182/?test=1"],
    [
      "1.2",
      process.env.NEXUS_URL || "http://127.0.0.1:5181/?test=1&diagnostics=1",
    ],
  ]) {
    const page = await browser.newPage({
      viewport: { width: 960, height: 600 },
    });
    await page.goto(url);
    await page.waitForFunction(
      () => window.__nexus?.snapshot().frames.length > 3,
    );
    await page.selectOption("#quality", "low");
    await page.locator("#start").click({ force: true });
    await page.waitForFunction(
      () => window.__nexus.snapshot().frames.length > 8,
    );
    const data = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const samples = [];
          let previous = null;
          const frame = (now) => {
            if (previous !== null) {
              const s = window.__nexus.snapshot();
              samples.push({
                ms: now - previous,
                drawCalls: s.calls,
                geometries: s.geometries,
                activeEnemies:
                  s.world?.alive ?? s.enemies.filter((e) => e.hp > 0).length,
                updateMs: s.updateMs ?? null,
                mode: s.mode,
              });
            }
            previous = now;
            if (samples.length < 20) requestAnimationFrame(frame);
            else {
              const gl = document.querySelector("canvas").getContext("webgl2"),
                ext = gl.getExtension("WEBGL_debug_renderer_info");
              resolve({
                samples,
                renderer: ext
                  ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
                  : gl.getParameter(gl.RENDERER),
              });
            }
          };
          requestAnimationFrame(frame);
        }),
    );
    const average = (key) =>
      data.samples.reduce((a, s) => a + s[key], 0) / data.samples.length;
    results.push({
      version,
      viewport: "960x600",
      quality: "low",
      fps: 1000 / average("ms"),
      meanDrawCalls: average("drawCalls"),
      maxGeometries: Math.max(...data.samples.map((s) => s.geometries)),
      meanUpdateMs: version === "1.2" ? average("updateMs") : null,
      ...data,
    });
    console.log(
      JSON.stringify({
        version,
        fps: results.at(-1).fps,
        drawCalls: results.at(-1).meanDrawCalls,
        geometry: results.at(-1).maxGeometries,
      }),
    );
    await page.close();
  }
  await writeFile(
    "docs/1.2/performance-comparison.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        reference: "1996bde4cb555aec89f150f7ded5b36d0cbe3996",
        method:
          "Sequential software-rendered samples, 20 native RAF intervals after warm-up, initial wave at rest; 1.1 has three enemies and 1.2 has four; not a physical-GPU benchmark or worst-case measurement",
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
