import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
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
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
  });
  await page.goto(process.env.NEXUS_URL || "http://127.0.0.1:5174/?test=1");
  await page.waitForFunction(
    () => window.__nexus?.snapshot().frames.length >= 8,
    { timeout: 120000 },
  );
  await page.click("#start");
  // Warm shaders before the bounded observation. Use wall time, never simulation delta.
  await page.waitForFunction(
    () => window.__nexus.snapshot().frames.length >= 15,
    { timeout: 120000 },
  );
  const data = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const samples = [];
        let previous = performance.now();
        const sample = (now) => {
          samples.push(now - previous);
          previous = now;
          if (samples.length < 30) requestAnimationFrame(sample);
          else {
            const gl = document.querySelector("canvas").getContext("webgl2");
            const ext = gl.getExtension("WEBGL_debug_renderer_info");
            resolve({
              viewport: { width: innerWidth, height: innerHeight },
              quality: "medium",
              renderer: ext
                ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
                : gl.getParameter(gl.RENDERER),
              samplesMs: samples,
              fps: 1000 / (samples.reduce((a, b) => a + b, 0) / samples.length),
              snapshot: window.__nexus.snapshot(),
            });
          }
        };
        requestAnimationFrame(sample);
      }),
  );
  await writeFile("docs/performance.json", JSON.stringify(data, null, 2));
  console.log(
    JSON.stringify({
      fps: data.fps,
      renderer: data.renderer,
      viewport: data.viewport,
    }),
  );
} finally {
  await browser.close();
}
