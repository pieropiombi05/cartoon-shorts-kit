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
export const motes = (f: number, box: Box, n = 30, seed = 1, col = "rgba(255,244,214,0.85)", size = 0.035, rise = 0.15): FxPlace[] => {
  const out: FxPlace[] = [];
  const dy = box.max[1] - box.min[1];
  for (let i = 0; i < n; i++) {
    const hx = hash(i, seed), hy = hash(i + 50, seed), hz = hash(i + 99, seed), ph = hash(i + 7, seed) * 6.28;
    const y = box.min[1] + dy * frac(hy + (f / 30) * rise / dy * (0.6 + hx));
    out.push({
      key: "mote" + col, cw: 64, ch: 64, soft: true,
      draw: (p: Pen) => { p.ell(32, 32, 22, 22, col.replace(/[\d.]+\)$/, "0.35)"), 0); p.ell(32, 32, 11, 11, col, 0); },
      at: [lerp(box.min[0], box.max[0], hx) + 0.15 * Math.sin(f * 0.03 + ph), y, lerp(box.min[2], box.max[2], hz) + 0.1 * Math.cos(f * 0.025 + ph)],
      w: size * (0.7 + hz), h: size * (0.7 + hz),
    });
  }
  return out;
};

/** rain streaks falling through a box (fast, slanted). Pair with a darker grade and splashes for a storm. */
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

/** rising smoke / steam puffs from a point (chimney, cup, engine). Loops every `period` frames. */
export const smoke = (f: number, at: V3, n = 6, seed = 11, col = "#e9e4ea", period = 90, height = 2.2, size = 0.5): FxPlace[] => {
  const out: FxPlace[] = [];
  for (let i = 0; i < n; i++) {
    const t = frac(f / period + i / n), s = size * (0.4 + 1.2 * t);
    out.push({
      key: "smoke" + col + Math.min(4, Math.floor(t * 5)), cw: 160, ch: 160, soft: true,
      draw: (p: Pen) => { const a = 1 - Math.min(4, Math.floor(t * 5)) / 5; p.ell(80, 80, 70, 64, col.startsWith("#") ? hexA(col, 0.25 + 0.6 * a) : col, 0); },
      at: [at[0] + 0.3 * Math.sin(t * 5 + hash(i, seed) * 6), at[1] + height * t, at[2]], w: s, h: s,
    });
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

const hexA = (hex: string, a: number) => {
  const v = parseInt(hex.slice(1), 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a.toFixed(2)})`;
};
