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
/** snap: most of the move lands in the first frames, then it settles (reference style: a pose is reached in ~4-5 f) */
export const snap = (t: number) => { t = clamp01(t); return 1 - Math.pow(1 - t, 5); };
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
/** breathing sway (degrees) + a slow head drift. Measured on the reference: with the camera quiet ~5 % of the pixels
 *  still change every frame and only ~4 % of those frames are fully still, so characters are never statues.
 *  Add acting() on top for the beats. amp 0 = fully still (only for a deliberate freeze). */
export const idle = (f: number, seed = 1, amp = 1) => {
  const t = f / FPS;
  return { tilt: amp * (0.9 * Math.sin(t * 1.6 + seed * 2.1) + 0.5 * noise1(t * 0.7, seed)), headTilt: amp * 1.6 * noise1(t * 0.8, seed + 9) };
};

/** automatic acting from the narration timeline (work/timing.json phrases): the character moves on EVERY phrase and
 *  bobs on stressed words, so a shot is never a still picture while the voice talks.
 *  On each phrase start: a 3-frame anticipation dip, then a gesture that SNAPS in (~85 % in 4 frames) picked by seed (arm raise, lean, hop, head turn),
 *  held through the phrase and relaxed at its end. Word bobs: a 2-3 deg head nod decaying over 6 frames.
 *  Returns {tilt, headTilt, wave, hop}: add tilt/headTilt to idle(), pass wave, and add hop (metres) to the card's y. */
export const acting = (f: number, phrases: Phrase[], seed = 1, amp = 1) => {
  let tilt = 0, headTilt = 0, wave = 0, hop = 0;
  for (const p of phrases) {
    if (f < p.f0 - 4 || f > p.f1 + 10) continue;
    const kind = Math.floor(hash(p.i + 1, seed) * 4), dir = hash(p.i + 7, seed) < 0.5 ? -1 : 1;
    // snap: ~85 % of the pose lands in 4 frames, then it holds; the release snaps back the same way
    const inn = snap(prog(f, p.f0 - 1, p.f0 + 8)), out = 1 - snap(prog(f, p.f1 - 1, p.f1 + 8)), on = inn * out;
    const ant = f >= p.f0 - 4 && f < p.f0 - 1 ? -1 : 0;   // anticipation dip
    hop += ant * 0.012;
    if (kind === 0) wave = Math.max(wave, 0.75 * on);                 // arm gesture
    else if (kind === 1) tilt += dir * 7 * on;                         // lean in
    else if (kind === 2) hop += 0.12 * Math.max(0, Math.sin(Math.PI * Math.sqrt(prog(f, p.f0, p.f0 + 9))));   // small hop, fast up
    else headTilt += dir * 11 * on;                                     // head turn/tilt
    for (const w of p.words ?? []) { const k = f - w.f; if (k >= 0 && k < 6) headTilt += dir * 4 * (k < 2 ? 1 : (6 - k) / 4) * (w.w.length > 4 ? 1 : 0.5); }
  }
  return { tilt: tilt * amp, headTilt: headTilt * amp, wave: Math.min(1, wave * amp), hop: hop * amp };
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
/** blur: horizontal motion blur for this frame, signed fraction of the frame width (set by whip cuts) */
export type Cam = { pos: V3; look: V3; fov: number; roll: number; blur?: number };
export type CamKey = {
  /** frame where the camera ARRIVES at this key (the move into it ends here) */
  f: number;
  pos: V3; look: V3; fov?: number; roll?: number;
  /** length of the move into this key, frames (default 24). It is raised automatically (moveFrames) so the peak stays
   *  under ~18 px/f at 720 wide (reference median peak 20; our jerky videos had 32-50). Start the move earlier
   *  (place keys further apart) rather than forcing it short. 0 or cut = hard cut at f */
  dur?: number; cut?: boolean;
  /** "glide" smootherstep (default), "out" ease-out (reveals), "in" ease-in */
  ease?: "glide" | "out" | "in";
  /** via points for a curved move into this key (Catmull-Rom) */
  via?: V3[];
  /** slow push-in while holding on this key: fraction of the distance to `look` per second (default 0.06; 0.1 for a deliberate push on a punch line; 0 = locked) */
  creep?: number;
  /** sideways slide while holding, 1 = default (~1.5 px/f), 0 = none */
  drift?: number;
  /** whip cut INTO this key (use with cut: true): the outgoing shot whips sideways for 6 f (accelerating), the cut hides
   *  in the blur, and this shot whips in and stops dead within 5 f. 1 = whip to the right, -1 = left. The reference
   *  channel uses ~5 per video, for place and time changes. */
  whipCut?: 1 | -1;
  /** allow a fast move (the length is NOT raised to keep the peak under ~18 px/f): one per video at most */
  whip?: boolean;
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
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
/** hold: slow push-in (creep) + slow sideways slide (drift) so the camera never stops dead (reference: holds are only
 *  ~7 % of frames; between moves the camera keeps drifting at ~1-2 px/f) */
const crept = (k: CamKey, held: number, idx: number): { pos: V3; look: V3 } => {
  const sec = held / FPS, c = Math.min(0.35, (k.creep ?? 0.06) * sec);
  const pos = lerp3(k.pos, k.look, c);
  const d = sub(k.look, k.pos), dist = len(d) || 1;
  const side: V3 = [-d[2] / dist, 0, d[0] / dist];               // horizontal axis across the view
  const dir = hash(idx + 3, k.f) < 0.5 ? -1 : 1;
  const s = (k.drift ?? 1) * dir * Math.min(0.12, 0.022 * sec) * dist;   // ~1.5 px/f at 720 wide, capped
  return { pos: [pos[0] + side[0] * s, pos[1], pos[2] + side[2] * s], look: [k.look[0] + side[0] * s * 0.7, k.look[1], k.look[2] + side[2] * s * 0.7] };
};
/** frames a move needs so its peak speed stays under `peak` px/frame at 720 wide (smootherstep peak = 1.875 x px / dur) */
export const moveFrames = (a: CamKey, b: CamKey, peak = 18) => {
  const d = sub(a.look, a.pos), dist = Math.max(0.5, (len(d) + len(sub(b.look, b.pos))) / 2), dn = len(d) || 1;
  const hfov = 2 * Math.atan(Math.tan(((a.fov ?? 40) * Math.PI) / 360) * 0.5625), W = 2 * dist * Math.tan(hfov / 2);
  const dp = sub(b.pos, a.pos), ax = (dp[0] * d[0] + dp[1] * d[1] + dp[2] * d[2]) / dn;
  const lat = Math.sqrt(Math.max(0, len(dp) ** 2 - ax * ax)), dl = len(sub(b.look, a.look));
  const px = (720 * (lat + dl) / 2) / W + (360 * Math.abs(ax)) / dist + 720 * Math.abs((b.fov ?? 40) - (a.fov ?? 40)) / (a.fov ?? 40) / 2;
  return Math.ceil((1.875 * px) / peak);
};
/** camera at frame f from a key list (sorted by f). Holds creep and drift; moves glide with their length raised so the
 *  peak never exceeds ~18 px/f (no jerky whips) unless the key says whip: true; kicks add decaying flip shakes. */
/** camera energy. 0 = calm glides (moves stretched so the peak stays under ~18 px/f). 1 (default) = reference-like:
 *  moves peak up to ~28 px/f with an early-peaking ease (quick start, clean landing), and the camera steps on the voice:
 *  pass the timing phrases and every phrase start gets a quick 6-frame reframe (push-in, side nudge, or pull-out,
 *  alternating). Reference channel: ~29 short camera moves per 10 s, median 6 frames, median peak ~20 px/f.
 *  2 = hyper (punches twice as big, every phrase and every 2nd stressed word). */
export type CamOpts = { phrases?: Phrase[]; energy?: number };
export const camFromKeys = (keys: CamKey[], f: number, kicks: { f: number; amp?: number }[] = [], opt: CamOpts = {}): Cam => {
  const energy = opt.energy ?? 1;
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].f <= f) i++;
  const k = keys[i], nx = keys[i + 1];
  let pos: V3, look: V3, fov = k.fov ?? 40, roll = k.roll ?? 0;
  let dur = nx ? (nx.cut ? 0 : nx.dur ?? 24) : 0;
  if (nx && dur > 0 && !nx.whip) dur = Math.min(Math.max(dur, moveFrames(k, nx, energy >= 1 ? 28 : 18)), Math.max(dur, nx.f - k.f));
  if (nx && dur > 0 && f > nx.f - dur) {
    const raw = (f - (nx.f - dur)) / dur;
    // energy >= 1: the speed peaks at ~35 % of the move (quick start, long clean landing) instead of the middle
    const t = nx.ease === "out" ? easeOut(raw) : nx.ease === "in" ? easeIn(raw) : energy >= 1 ? smoother(Math.pow(raw, 0.62)) : smoother(raw);
    // the move starts from where the hold had drifted to
    const st = crept(k, Math.max(0, nx.f - dur - k.f), i);
    pos = along([st.pos, ...(nx.via ?? []), nx.pos], t);
    look = lerp3(st.look, nx.look, t);
    fov = lerp(k.fov ?? 40, nx.fov ?? 40, t); roll = lerp(k.roll ?? 0, nx.roll ?? 0, t);
  } else { const st = crept(k, f - k.f, i); pos = st.pos; look = st.look; }
  // beat punches: a quick reframe on every phrase start (and stressed words at energy 2), holding until the next one
  if (opt.phrases && energy > 0) {
    const ph = opt.phrases.filter((p) => p.f0 <= f && p.f0 > k.f);   // only phrases since this key: each shot starts clean
    const beats: number[] = [];
    for (const p of ph) { beats.push(p.f0); if (energy >= 2) (p.words ?? []).forEach((w, j) => { if (j % 2 === 1 && w.f <= f && w.f > p.f0 + 6) beats.push(w.f); }); }
    beats.sort((a, b) => a - b);
    const d = sub(look, pos), dist = len(d) || 1, side: V3 = [-d[2] / dist, 0, d[0] / dist], amp = energy >= 2 ? 1.8 : 1;
    let push = 0, nud = 0, prevPush = 0, prevNud = 0;
    beats.forEach((b, j) => {
      const kind = j % 3, dir = hash(j, b) < 0.5 ? -1 : 1, t = easeOut(prog(f, b, b + 7));   // cubic: firm start, no jolt
      prevPush = push; prevNud = nud;
      if (kind === 0) push = prevPush + 0.06 * amp; else if (kind === 1) nud = prevNud + dir * 0.022 * amp; else push = prevPush - 0.04 * amp;
      push = lerp(prevPush, push, t); nud = lerp(prevNud, nud, t);
    });
    const pz = Math.max(-0.1, Math.min(0.3, push));
    pos = [pos[0] + d[0] * pz + side[0] * nud * dist, pos[1] + d[1] * pz, pos[2] + d[2] * pz + side[2] * nud * dist];
    look = [look[0] + side[0] * nud * dist, look[1], look[2] + side[2] * nud * dist];
  }
  // whip cut: yaw the look around the camera, with motion blur from the angular speed
  const yawAt = (ff: number) => {
    const A = 38;   // degrees swept on each side of the cut
    if (nx?.whipCut && ff >= nx.f - 6 && ff < nx.f) { const t = (ff - (nx.f - 6) + 1) / 6; return nx.whipCut * A * t * t * t; }
    if (k.whipCut && ff >= k.f && ff < k.f + 5) { const t = (ff - k.f + 1) / 5; return -k.whipCut * A * Math.pow(1 - t, 4); }
    return 0;
  };
  const yaw = yawAt(f);
  let blur = 0;
  if (yaw !== 0) {
    const a = THREE_DEG * yaw, dx = look[0] - pos[0], dz = look[2] - pos[2];
    look = [pos[0] + dx * Math.cos(a) + dz * Math.sin(a), look[1], pos[2] - dx * Math.sin(a) + dz * Math.cos(a)];
    const hfov = 2 * Math.atan(Math.tan((fov * Math.PI) / 360) * 0.5625) / THREE_DEG;
    const speed = Math.abs(yaw - yawAt(f - 1)) > Math.abs(yawAt(f + 1) - yaw) ? yaw - yawAt(f - 1) : yawAt(f + 1) - yaw;
    blur = Math.max(-0.35, Math.min(0.35, (-speed / hfov) * 0.6));   // 0.6 = shutter, fraction of the frame width
  }
  for (const kk of kicks) {
    const n = f - kk.f;
    if (n >= 0 && n < 7) { const a = (kk.amp ?? 0.06) * (1 - n / 7) * (n % 2 ? -1 : 1); pos = [pos[0] + a, pos[1] + a * 0.6, pos[2]]; look = [look[0] + a, look[1] + a * 0.6, look[2]]; }
  }
  return { pos, look, fov, roll, blur };
};
const THREE_DEG = Math.PI / 180;

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
