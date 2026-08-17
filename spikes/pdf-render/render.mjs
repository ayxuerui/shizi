// Spike 2.7: render sample.html (LXGW WenKai Lite, CJK text) to PDF via
// headless Chromium, to de-risk the future print pipeline. Run with:
//   node spikes/pdf-render/render.mjs
// Requires `playwright` — installed ad hoc via `npx playwright`, not a
// project dependency (this is throwaway spike tooling).
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const inputPath = path.join(dir, "sample.html");
const outputPath = path.join(dir, "output.pdf");

// Use the system-installed Chromium (this sandbox lacks apt access to fetch
// Playwright's own bundled browser + its full dependency set). Section 9's
// real print pipeline will pin an explicit Chromium version in CI instead.
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium-browser" });
const page = await browser.newPage();
await page.goto(`file://${inputPath}`);
await page.waitForTimeout(200); // let the @font-face load before printing
await page.pdf({
  path: outputPath,
  format: "A4",
  printBackground: true,
});
await browser.close();

console.log(`Wrote ${outputPath}`);
