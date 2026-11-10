// Timing and motion helpers. Everything is a pure function of the frame number, so any frame can be rendered alone
// (render ranges, RESUME) and always looks the same.
export type V3 = [number, number, number];
export const FPS = 30;

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
/** 0..1 progress of f between frames a and b, clamped */
export const prog = (f: number, a: number, b: number) => clamp01((f - a) / Math.max(1e-6, b - a));
export const smooth = (t: number) => { t = clamp01(t); return t * t * (3 - 2 * t); };
export const smoother = (t: number) => { t = clamp01(t); return t * t * t * (t * (6 * t - 15) + 10); };
export const easeOut = (t: number) => { t = clamp01(t); return 1 - Math.pow(1 - t, 3); };
export const easeIn = (t: number) => { t = clamp01(t); return t * t * t; };
/** overshoot then settle (anticipation-free pop) */
export const back = (t: number, s = 1.7) => { t = clamp01(t) - 1; return t * t * ((s + 1) * t + s) + 1; };
/** damped spring 0 -> 1 */
export const spring = (t: number, k = 9, d = 4.5) => { t = Math.max(0, t); return 1 - Math.exp(-d * t) * Math.cos(k * t); };
/** deterministic hash noise in [0, 1) */
export const hash = (a: number, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
/** smooth 1D noise in [-1, 1] */
export const noise1 = (t: number, seed = 0) => {
  const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i, seed) * 2 - 1, hash(i + 1, seed) * 2 - 1, u);
};

// ---------------- characters ----------------
/** very small breathing sway (degrees). The measured reference has NO idle motion in holds: life comes from acting beats
 *  (expression swaps, head turns, gestures landing 0-3 f before their word) and from the camera's slow push-in.
 *  Keep this tiny (amp 1) or pass amp 0 for fully still characters. */
export const idle = (f: number, seed = 1, amp = 1) => {
  const t = f / FPS;
  return { tilt: amp * (0.35 * Math.sin(t * 1.3 + seed * 2.1) + 0.2 * noise1(t * 0.5, seed)), headTilt: amp * 0.6 * noise1(t * 0.6, seed + 9) };
};
/** blink: returns 0 (open) .. 1 (closed) lid amount; blinks every 0.5-2.3 s for 4 frames */
export const blinkAt = (f: number, seed = 1) => {
  let t = hash(seed, 3) * 30, n = 0;
  while (t < f && n < 4000) { const next = t + Math.round((0.5 + 1.8 * hash(seed, n)) * FPS); if (f < next && f >= t && f < t + 4) break; t = next; n++; }
  const k = f - t;
  return k >= 0 && k < 4 ? [0.6, 1, 1, 0.5][k] : 0;
};
/** walking: distance covered and step phase (0..1 per two steps) for a walk from frame a to b over `dist` metres */
export const walk = (f: number, a: number, b: number, dist: number, stride = 0.8) => {
  // constant speed with a short ease at both ends (10 % of the walk each)
  const t = prog(f, a, b), e = 0.1;
  const u = t < e ? (t * t) / (2 * e) / (1 - e) : t > 1 - e ? 1 - ((1 - t) * (1 - t)) / (2 * e) / (1 - e) : (t - e / 2) / (1 - e);
  const d = dist * u;
  return { d: Math.min(dist, d), phase: (d / (2 * stride)) % 1, moving: f > a && f < b };
};

// ---------------- camera ----------------
export type Cam = { pos: V3; look: V3; fov: number; roll: number };
export type CamKey = {
  /** frame where the camera ARRIVES at this key (the move into it ends here) */
  f: number;
  pos: V3; look: V3; fov?: number; roll?: number;
  /** length of the move into this key, frames (default 24, the measured reference median is ~23 f total, symmetric
   *  ease-in-out). Keep the peak speed <= 25 px/f at 720 wide: smootherstep peak = 1.875 x move_px / dur.
   *  A move that would need > 60 f should be a cut instead. 0 or cut = hard cut at f */
  dur?: number; cut?: boolean;
  /** "glide" smootherstep (default), "out" ease-out (reveals), "in" ease-in */
  ease?: "glide" | "out" | "in";
  /** via points for a curved move into this key (Catmull-Rom) */
  via?: V3[];
  /** slow push-in while holding on this key: fraction of the distance to `look` per second (default 0.042, i.e. the
   *  measured reference median of ~0.14 % per frame; 0.1 for a deliberate push on a punch line; 0 = locked) */
  creep?: number;
};
const cr = (p0: V3, p1: V3, p2: V3, p3: V3, t: number): V3 => {
  const t2 = t * t, t3 = t2 * t;
  return [0, 1, 2].map((i) => 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)) as V3;
};
const along = (pts: V3[], t: number): V3 => {
  if (pts.length === 2) return lerp3(pts[0], pts[1], t);
  const n = pts.length - 1, s = Math.min(n - 1e-6, t * n), i = Math.floor(s), u = s - i;
  return cr(pts[Math.max(0, i - 1)], pts[i], pts[i + 1], pts[Math.min(n, i + 2)], u);
};
const crept = (k: CamKey, held: number): V3 => {
  const c = (k.creep ?? 0.042) * (held / FPS);
  return lerp3(k.pos, k.look, Math.min(0.35, c));
};
/** camera at frame f from a key list (sorted by f). Holds creep; moves glide; kicks add decaying flip shakes. */
export const camFromKeys = (keys: CamKey[], f: number, kicks: { f: number; amp?: number }[] = []): Cam => {
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].f <= f) i++;
  const k = keys[i], nx = keys[i + 1];
  let pos: V3, look: V3, fov = k.fov ?? 40, roll = k.roll ?? 0;
  const dur = nx ? (nx.cut ? 0 : nx.dur ?? 24) : 0;
  if (nx && dur > 0 && f > nx.f - dur) {
    const raw = (f - (nx.f - dur)) / dur, t = nx.ease === "out" ? easeOut(raw) : nx.ease === "in" ? easeIn(raw) : smoother(raw);
    // the move starts from where the creep had got to, and the creep keeps easing out under the move
    const start = crept(k, Math.max(0, nx.f - dur - k.f));
    pos = along([start, ...(nx.via ?? []), nx.pos], t);
    look = lerp3(k.look, nx.look, t);
    fov = lerp(k.fov ?? 40, nx.fov ?? 40, t); roll = lerp(k.roll ?? 0, nx.roll ?? 0, t);
  } else { pos = crept(k, f - k.f); look = k.look; }
  for (const kk of kicks) {
    const n = f - kk.f;
    if (n >= 0 && n < 7) { const a = (kk.amp ?? 0.06) * (1 - n / 7) * (n % 2 ? -1 : 1); pos = [pos[0] + a, pos[1] + a * 0.6, pos[2]]; look = [look[0] + a, look[1] + a * 0.6, look[2]]; }
  }
  return { pos, look, fov, roll };
};

/** the phrase/word timeline written by tools/timing.py, imported by the story: frame of a phrase's start/end */
export type Phrase = { i: number; text: string; f0: number; f1: number; words?: { w: string; f: number }[] };

/** mouth flaps for a character's own line: spans = [startFrame, endFrame] pairs (from timing.json phrases).
 *  Returns 0..1 (0 = closed), changing every 3 frames with a seeded open/half/closed pattern, closed at phrase ends. */
export const talkAt = (f: number, spans: [number, number][], seed = 1): number => {
  for (const [a, b] of spans) {
    if (f < a || f >= b - 2) continue;
    const k = Math.floor((f - a) / 3), h = hash(k * 7.13 + seed * 31.7);
    return h < 0.22 ? 0 : h < 0.55 ? 0.45 : h < 0.85 ? 0.75 : 1;
  }
  return 0;
};
