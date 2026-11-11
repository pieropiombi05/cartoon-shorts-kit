// Ambient life: things that keep moving while the camera holds, so no shot is ever a still picture.
// Measured on 19 Ricks Clips shorts: when the camera is quiet, ~5 % of the pixels still change every frame
// (characters, effects, weather, background life) and only ~4 % of quiet frames are truly still.
// Every helper returns FxPlace[] to push into FrameState.fx. Each particle is its own small card with a FIXED key,
// so the drawing is cached and only positions change: cheap even with 60+ particles.
// All are pure functions of f (loop-safe when `period` divides TOTAL).
import type { FxPlace, V3 } from "./cards";
import { hash } from "./motion";
import type { Pen } from "./lib/toon";

type Box = { min: V3; max: V3 };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const frac = (x: number) => x - Math.floor(x);

/** floating motes (dust in sunlight, pollen, embers, snow): slow drift + bob. col e.g. "rgba(255,240,200,.9)" */
export const motes = (f: number, box: Box, n = 30, seed = 1, col = "rgba(255,244,214,0.85)", size = 0.02, rise = 0.15): FxPlace[] => {
  size = Math.min(size, 0.03);   // bigger motes read as bubbles or bugs (seen in the "Earth without dust" short)
  const out: FxPlace[] = [];
  const dy = box.max[1] - box.min[1];
  for (let i = 0; i < n; i++) {
    const hx = hash(i, seed), hy = hash(i + 50, seed), hz = hash(i + 99, seed), ph = hash(i + 7, seed) * 6.28;
    const y = box.min[1] + dy * frac(hy + (f / 30) * rise / dy * (0.6 + hx));
    out.push({
      key: "mote" + col, cw: 64, ch: 64, soft: true,
      draw: (p: Pen) => { p.ell(32, 32, 16, 16, col.replace(/[\d.]+\)$/, "0.25)"), 0); p.ell(32, 32, 10, 10, col, 0); },
      at: [lerp(box.min[0], box.max[0], hx) + 0.15 * Math.sin(f * 0.03 + ph), y, lerp(box.min[2], box.max[2], hz) + 0.1 * Math.cos(f * 0.025 + ph)],
      w: size * (0.7 + hz), h: size * (0.7 + hz),
    });
  }
  return out;
};

/** rain: thin fast streaks falling through a box in FRONT of the scene (not stuck on walls). Pair with splashes() on the
 *  ground, puddle()s and a darker grade. Never draw rain as big teardrop sprites spread over walls: it reads as wallpaper
 *  and flickers (seen in "Earth without dust"). */
export const rain = (f: number, box: Box, n = 60, seed = 3, col = "rgba(200,225,255,0.55)", speed = 0.6): FxPlace[] => {
  const out: FxPlace[] = [];
  const dy = box.max[1] - box.min[1];
  for (let i = 0; i < n; i++) {
    const hx = hash(i, seed), hy = hash(i + 50, seed), hz = hash(i + 99, seed);
    const y = box.max[1] - dy * frac(hy + (f * speed) / dy);
    out.push({
      key: "rain" + col, cw: 16, ch: 128, soft: true,
      draw: (p: Pen) => p.poly([[6, 0], [10, 0], [10, 128], [6, 128]], col, 0),
      at: [lerp(box.min[0], box.max[0], hx), y, lerp(box.min[2], box.max[2], hz)], w: 0.015, h: 0.35, rot: 0.18,
    });
  }
  return out;
};

/** falling leaves / petals / paper bits that tumble (rotation changes every frame). */
export const leaves = (f: number, box: Box, n = 10, seed = 5, col = "#e0a03a", speed = 0.012): FxPlace[] => {
  const out: FxPlace[] = [];
  const dy = box.max[1] - box.min[1];
  for (let i = 0; i < n; i++) {
    const hx = hash(i, seed), hy = hash(i + 50, seed), hz = hash(i + 99, seed), ph = hash(i + 3, seed) * 6.28;
    const y = box.max[1] - dy * frac(hy + (f * speed) / dy * (0.7 + hz));
    out.push({
      key: "leaf" + col, cw: 96, ch: 64,
      draw: (p: Pen) => { p.ell(48, 32, 38, 20, col, 6); p.stroke([[14, 32], [82, 32]], 4); },
      at: [lerp(box.min[0], box.max[0], hx) + 0.35 * Math.sin(f * 0.05 + ph), y, lerp(box.min[2], box.max[2], hz)],
      w: 0.12, h: 0.08, rot: Math.sin(f * 0.12 + ph) * 1.2,
    });
  }
  return out;
};

/** a small flock crossing the sky: V-shaped birds that flap (two cached drawings). period = frames to cross. */
export const birds = (f: number, from: V3, to: V3, n = 5, seed = 7, period = 240, col = "#2a2230"): FxPlace[] => {
  const out: FxPlace[] = [];
  for (let i = 0; i < n; i++) {
    const t = frac(f / period + hash(i, seed) * 0.08), up = (Math.floor(f / 4 + i) % 2) === 0;
    const off = [(hash(i + 9, seed) - 0.5) * 3, (hash(i + 19, seed) - 0.5) * 1.5, (hash(i + 29, seed) - 0.5) * 2];
    out.push({
      key: "bird" + (up ? "u" : "d") + col, cw: 128, ch: 64,
      draw: (p: Pen) => p.stroke(up ? [[8, 20], [64, 46], [120, 20]] : [[8, 52], [64, 34], [120, 52]], 10, col),
      at: [lerp(from[0], to[0], t) + off[0], lerp(from[1], to[1], t) + off[1], lerp(from[2], to[2], t) + off[2]], w: 0.9, h: 0.45,
    });
  }
  return out;
};

/** rising smoke / steam: opaque cartoon puffs with an ink outline and a shaded underside (no see-through grey circles:
 *  those read as bubbles or bugs). Each puff grows, rises, drifts and pops out at the top. Loops every `period` frames. */
export const smoke = (f: number, at: V3, n = 5, seed = 11, col = "#f2eef2", period = 90, height = 2.2, size = 0.5, shade = "#c9c0d4"): FxPlace[] => {
  const out: FxPlace[] = [];
  for (let i = 0; i < n; i++) {
    const t = frac(f / period + i / n), st = Math.min(5, Math.floor(t * 6));   // 6 cached growth stages
    const s = size * (0.45 + 1.1 * t) * (t > 0.9 ? (1 - t) * 10 : 1);
    if (s <= 0.02) continue;
    out.push({
      key: "puff" + col + shade + (i % 3), cw: 192, ch: 160,
      draw: (p: Pen) => {
        const lobes = [[96, 92, 52], [56, 100, 38], [138, 100, 40], [80, 62, 36], [116, 60, 34]];
        for (const [x, y, r] of lobes) p.ell(x, y, r + 6, r + 6, "#2b1d2b", 0);       // ink outline
        for (const [x, y, r] of lobes) p.ell(x, y, r, r, shade, 0);
        for (const [x, y, r] of lobes) p.ell(x - r * 0.12, y - r * 0.18, r * 0.82, r * 0.78, col, 0);
      },
      at: [at[0] + 0.35 * Math.sin(t * 4 + hash(i, seed) * 6), at[1] + height * t, at[2]], w: s, h: s * 0.83, rot: (hash(i + 5, seed) - 0.5) * 0.6 + t * 0.4,
    });
    void st;
  }
  return out;
};

/** soft light pool: a sun patch from a window on a floor/wall, or a lamp glow. flat = lying on the floor.
 *  Static; animate w/h or alpha via key only when the light itself changes. */
export const lightPool = (at: V3, w: number, h: number, col = "rgba(255,226,140,0.42)", opt: { flat?: boolean; rot?: number; skew?: number; face?: boolean } = {}): FxPlace => ({
  key: "pool" + col + (opt.skew ?? 0), cw: 256, ch: 256, soft: true, flat: opt.flat, rot: opt.rot, face: opt.face ?? false,
  draw: (p: Pen) => { const k = (opt.skew ?? 0) * 128; p.poly([[20 + k, 20], [236 + k, 20], [236 - k, 236], [20 - k, 236]], col, 0); },
  at, w, h,
});

/** god-ray shafts (vertical soft beams) that slowly breathe; for interiors with windows, forests, storms. */
export const shafts = (f: number, at: V3, n = 3, spread = 2, col = "rgba(255,240,200,0.18)", height = 6, rot = -0.35): FxPlace[] => {
  const out: FxPlace[] = [];
  for (let i = 0; i < n; i++) {
    const br = Math.round(2 + 2 * Math.sin(f * 0.02 + i * 1.7)); // 5 cached brightness steps
    out.push({
      key: "shaft" + col + br, cw: 64, ch: 512, soft: true,
      draw: (p: Pen) => p.poly([[18, 0], [46, 0], [64, 512], [0, 512]], col.replace(/[\d.]+\)$/, String(0.06 + br * 0.04) + ")"), 0),
      at: [at[0] + (i - (n - 1) / 2) * spread / Math.max(1, n - 1), at[1], at[2]], w: 0.6 + 0.2 * i, h: height, rot, face: false,
    });
  }
  return out;
};

/** a puddle that stays the same shape (fixed outline) with ripple rings that expand and fade, like drops landing.
 *  Lies flat on the ground. Never animate a puddle by changing its outline every frame: it reads as a glitch. */
export const puddle = (f: number, at: V3, r = 0.8, seed = 21, col = "#7fb6d9"): FxPlace[] => {
  const out: FxPlace[] = [{
    key: "puddle" + col + seed, cw: 256, ch: 160, flat: true, face: false,
    draw: (p: Pen) => { const pts: [number, number][] = []; for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2, k = 0.82 + 0.18 * hash(i, seed); pts.push([128 + Math.cos(a) * 112 * k, 80 + Math.sin(a) * 66 * k]); } p.poly(pts, col, 5); p.ell(100, 64, 40, 10, "rgba(255,255,255,0.55)", 0); },
    at: [at[0], at[1] + 0.015, at[2]], w: r * 2, h: r * 1.25,
  }];
  for (let i = 0; i < 3; i++) {
    const t = frac(f / 40 + i / 3 + hash(i, seed)), st = Math.min(4, Math.floor(t * 5));
    out.push({
      key: "ripple" + st, cw: 128, ch: 80, flat: true, face: false, soft: true,
      draw: (p: Pen) => { const rx = 18 + st * 10, ry = 10 + st * 6, pts: [number, number][] = []; for (let a = 0; a <= 24; a++) pts.push([64 + Math.cos((a / 24) * 6.283) * rx, 40 + Math.sin((a / 24) * 6.283) * ry]); p.stroke(pts, 5 - st * 0.8, "#eaf6ff"); },
      at: [at[0] + (hash(i + 3, seed) - 0.5) * r, at[1] + 0.02, at[2] + (hash(i + 7, seed) - 0.5) * r * 0.6], w: r * 0.6, h: r * 0.38,
    });
  }
  return out;
};

/** splash crowns where rain hits the ground: small 4-frame bursts at seeded spots (cached drawings) */
export const splashes = (f: number, box: Box, n = 12, seed = 31, col = "#cfe6f7"): FxPlace[] => {
  const out: FxPlace[] = [];
  for (let i = 0; i < n; i++) {
    const per = 14 + Math.floor(hash(i, seed) * 10), k = (f + Math.floor(hash(i + 1, seed) * per)) % per;
    if (k > 4) continue;
    const cyc = Math.floor((f + Math.floor(hash(i + 1, seed) * per)) / per);
    out.push({
      key: "splash" + k + col, cw: 96, ch: 64,
      draw: (p: Pen) => { const s = 1 + k * 0.5; for (const a of [-0.9, -0.45, 0, 0.45, 0.9]) p.stroke([[48, 56], [48 + Math.sin(a) * 18 * s, 56 - Math.cos(a) * 16 * s]], 4, col); },
      at: [box.min[0] + (box.max[0] - box.min[0]) * hash(i + cyc * 7, seed + 2), box.min[1], box.min[2] + (box.max[2] - box.min[2]) * hash(i + cyc * 7, seed + 3)], w: 0.22, h: 0.15,
    });
  }
  return out;
};

const hexA = (hex: string, a: number) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a.toFixed(2)})`;
};
