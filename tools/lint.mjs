// Scene lint: runs story.frame() for every frame WITHOUT rendering (a few minutes for a whole short) and reports the
// geometry bugs viewers notice as "inconsistencies":
//   CUT     a character's head or half the body cut off by the left/right edge of the frame (characters taller than
//           22 % of the frame: far extras at the edges are fine)
//   HIDDEN  a character's head hidden behind world geometry (a wall, a tree, leaves, a sign)
//   INSIDE  a character standing inside an object (a counter or table top crossing the body)
//   FLOAT   a character's feet above the ground (no support under them)
//   POP     a character that appears or disappears on screen with no camera cut (not walking in or out)
// Usage: node tools/lint.mjs            (all frames; deep checks every 2nd frame)
//        node tools/lint.mjs 300-600    (a range)
// Built after "Earth without spiders": the hero stood inside the kitchen counter, was cut by the frame edge in 4 shots,
// hid behind leaves, and signs and cages popped in.
import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch { const g = execSync("npm root -g").toString().trim(); ({ chromium } = await import(pathToFileURL(resolve(g, "playwright/index.mjs")).href)); }

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle", "--disable-gpu-sandbox"] });
const page = await browser.newPage({ viewport: { width: 270, height: 480 } });
page.on("pageerror", (e) => console.error("PAGE ERROR", e));
await page.goto(pathToFileURL(resolve("web/index.html")).href + "?scale=0.25");
await page.waitForFunction(() => window.ready || window.buildError, null, { timeout: 180000 });
const be = await page.evaluate(() => window.buildError);
if (be) { console.error("BUILD ERROR:\n" + be); process.exit(2); }
const total = await page.evaluate(() => window.TOTAL);
let a = 0, b = total - 1;
const m = (process.argv[2] ?? "").match(/^(\d+)-(\d+)$/);
if (m) { a = +m[1]; b = Math.min(total - 1, +m[2]); }

const R = [];
for (let f = a; f <= b; f += 60) {
  const chunk = await page.evaluate(([s, e]) => { const o = []; for (let f = s; f <= e; f++) o.push(window.lintFrame(f, f % 2 === 0)); return o; }, [f, Math.min(b, f + 59)]);
  R.push(...chunk);
}
await browser.close();

// camera cuts: big jump in position or look direction between frames (whip cuts included)
const dirOf = (c) => { const d = [c.look[0] - c.pos[0], c.look[1] - c.pos[1], c.look[2] - c.pos[2]], l = Math.hypot(...d) || 1; return d.map((x) => x / l); };
const cutAt = new Set();
for (let i = 1; i < R.length; i++) {
  const p = R[i - 1].cam, c = R[i].cam, dp = Math.hypot(c.pos[0] - p.pos[0], c.pos[1] - p.pos[1], c.pos[2] - p.pos[2]);
  const d1 = dirOf(p), d2 = dirOf(c), ang = Math.acos(Math.max(-1, Math.min(1, d1[0] * d2[0] + d1[1] * d2[1] + d1[2] * d2[2]))) * 57.3;
  if (dp > 0.6 || ang > 12 || (c.blur ?? 0) !== 0) cutAt.add(R[i].f);
}
const inFrame = (p) => p && p[2] < 1 && Math.abs(p[0]) <= 1 && Math.abs(p[1]) <= 1;
const issues = { CUT: [], HIDDEN: [], INSIDE: [], FLOAT: [], POP: [] };
const add = (k, f, what) => issues[k].push({ f, what });
for (let i = 0; i < R.length; i++) {
  const r = R[i];
  for (const c of r.chars) {
    const headIn = inFrame(c.head), chestX = Math.abs(c.chest[0]);
    const big = Math.abs(c.head[1] - c.feet[1]) / 2 > 0.22;   // 22 %+ of the frame height: a main character, not a far extra
    if (big && headIn && c.head[2] < 1 && (c.hl[0] < -1 || c.hr[0] > 1)) add("CUT", r.f, `${c.id.split(":")[0]} head cut by the frame edge`);
    else if (big && c.chest[2] < 1 && Math.abs(c.chest[1]) < 1 && chestX > 0.82 && chestX < 1.15) add("CUT", r.f, `${c.id.split(":")[0]} half the body out of frame`);
    if (headIn && c.occHead) add("HIDDEN", r.f, `${c.id.split(":")[0]} head behind ${c.occHead}`);
    // a body behind a counter or table with the head visible is normal (barmen, people seated): only heads count
    if (headIn && c.inside) add("INSIDE", r.f, `${c.id.split(":")[0]} standing inside ${c.inside}`);
    if (headIn && c.floating) add("FLOAT", r.f, `${c.id.split(":")[0]} feet ${c.floating} m above the ground`);
  }
  if (i > 0 && !cutAt.has(r.f)) {
    const prev = new Map(R[i - 1].chars.map((c) => [c.id, c])), now = new Map(r.chars.map((c) => [c.id, c]));
    for (const [id, c] of prev) if (inFrame(c.head) && inFrame(c.chest) && !now.has(id)) add("POP", r.f, `${id.split(":")[0]} vanished`);
    for (const [id, c] of now) if (inFrame(c.head) && inFrame(c.chest) && !prev.has(id)) add("POP", r.f, `${id.split(":")[0]} appeared`);
  }
}
// group into frame ranges; geometry issues count only when they last 6+ frames (3 deep samples)
let bad = 0;
for (const [k, list] of Object.entries(issues)) {
  const by = new Map();
  for (const it of list) { if (!by.has(it.what)) by.set(it.what, []); by.get(it.what).push(it.f); }
  for (const [what, fs] of by) {
    fs.sort((x, y) => x - y);
    const ranges = [];
    for (const f of fs) { const last = ranges[ranges.length - 1]; if (last && f - last[1] <= 3) last[1] = f; else ranges.push([f, f]); }
    for (const [s, e] of ranges) {
      if (k !== "POP" && e - s < 5) continue;
      bad++; console.log(`FIX ${k.padEnd(6)} f${s}-${e} (${(s / 30).toFixed(1)}-${(e / 30).toFixed(1)} s): ${what} (char seed)`);
    }
  }
}
console.log(bad ? `lint: ${bad} problem(s): fix them in story.ts before rendering` : `lint: ok (${R.length} frames)`);
