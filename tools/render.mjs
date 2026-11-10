// Render frames of the project's story with headless Chromium (CPU WebGL via SwiftShader).
// Usage (from the project folder):
//   node tools/render.mjs frames "0-1799"          full frames -> frames/f0000.jpg ...
//   node tools/render.mjs stills/a "5,40,120"      selected frames -> stills/a/f0005.jpg ...
// Env: SCALE=0.5 (half-size test renders), Q=0.95 (jpeg quality), RESUME=1 (skip frames already on disk).
// Prints progress and seconds per frame; exits non-zero on any page error.
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const [outDir, spec] = process.argv.slice(2);
if (!outDir || !spec) { console.error('usage: node tools/render.mjs <outDir> "<a-b | f1,f2,...>"'); process.exit(1); }
const SCALE = Number(process.env.SCALE ?? "1"), Q = Number(process.env.Q ?? "0.95"), RESUME = process.env.RESUME === "1";
// extra page params for tests: OPTS="msaa=2&lens=0" (msaa, shadow, ink, lens, bloom)
const OPTS = process.env.OPTS ? "&" + process.env.OPTS : "";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  const g = execSync("npm root -g").toString().trim();
  ({ chromium } = await import(pathToFileURL(resolve(g, "playwright/index.mjs")).href));
}

const frames = [];
for (const part of spec.split(",")) {
  const m = part.trim().match(/^(\d+)-(\d+)$/);
  if (m) for (let f = +m[1]; f <= +m[2]; f++) frames.push(f);
  else if (part.trim()) frames.push(+part.trim());
}
mkdirSync(outDir, { recursive: true });
const name = (f) => resolve(outDir, `f${String(f).padStart(4, "0")}.jpg`);
const todo = RESUME ? frames.filter((f) => !existsSync(name(f))) : frames;
if (!todo.length) { console.log("nothing to render"); process.exit(0); }

const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle", "--disable-gpu-sandbox"],
});
const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
let failed = null;
page.on("pageerror", (e) => { failed = String(e); console.error("PAGE ERROR", e); });
page.on("console", (m) => { if (m.type() === "error") console.error("console:", m.text()); });
await page.goto(pathToFileURL(resolve("web/index.html")).href + `?scale=${SCALE}${OPTS}`);
await page.waitForFunction(() => window.ready || window.buildError, null, { timeout: 180000 });
const be = await page.evaluate(() => window.buildError);
if (be) { console.error("BUILD ERROR in story.build():\n" + be); process.exit(2); }
const total = await page.evaluate(() => window.TOTAL);
console.log(`rendering ${todo.length} frames (story TOTAL ${total}) at ${Math.round(1080 * SCALE)}x${Math.round(1920 * SCALE)}`);

const t0 = Date.now();
let n = 0;
for (const f of todo) {
  const url = await page.evaluate(([f, q]) => { window.renderFrame(f); return window.capture ? window.capture(q) : document.getElementById("c").toDataURL("image/jpeg", q); }, [f, Q]);
  if (failed) { console.error(`failed at frame ${f}`); await browser.close(); process.exit(3); }
  writeFileSync(name(f), Buffer.from(url.split(",")[1], "base64"));
  n++;
  if (n === 1 || n % 10 === 0 || n === todo.length) {
    const spf = (Date.now() - t0) / 1000 / n, left = (todo.length - n) * spf;
    console.log(`${n}/${todo.length}  f${f}  ${spf.toFixed(2)} s/frame  ~${Math.round(left / 60)} min left`);
  }
}
await browser.close();
console.log("done");
