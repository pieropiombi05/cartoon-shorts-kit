// Set dressing: ready-made inked props, whole dressed walls and floor clutter, plus props that move by themselves.
// Why: the reference channel's frames are dressed edge to edge (shelves, bottles, frames, clocks, lamps, crates, plants,
// extras) and empty blocks are only ~14 % of a frame; our videos had 19-27 % and read as cheap and static.
// Everything is built once in build(w). Animated props register themselves; call tickProps(f) at the top of frame().
// Sizes are metres; characters are 2.16 m tall, so a bar counter is ~1.2 m, a door 2.6 m, a table 0.95 m.
import * as THREE from "three";
import { box, cyl, sphere, mat, pivot, V3 } from "./build";
import { ctex } from "./lib/paint";

type P = THREE.Object3D;
const H = (a: number, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const pick = <T,>(arr: T[], r: number) => arr[Math.floor(r * arr.length) % arr.length];
const BOTTLE = ["#2f6b3a", "#6b3a1f", "#8a5a1c", "#2b4a7a", "#7a2230", "#c9a227", "#3c3c3c"];
const LABEL = ["#f1e6c8", "#e8d29a", "#ffffff", "#e9c46a", "#f4a261"];
const WOOD = ["#7a4a2a", "#8b5a33", "#6a3d22", "#9a6b3e"];
const BRIGHT = ["#e63946", "#f4a261", "#2a9d8f", "#457b9d", "#e9c46a", "#8d5fd3", "#ff7aa2", "#5bc0eb"];

// ---------------- animated props ----------------
const LIFE: ((f: number) => void)[] = [];
/** call once at the top of frame(f): spins fans, ticks clocks, swings lamps and pendulums, flickers flames */
export const tickProps = (f: number) => { for (const fn of LIFE) fn(f); };
/** register your own: animate(f => mesh.rotation.z = Math.sin(f * 0.1)) */
export const animate = (fn: (f: number) => void) => LIFE.push(fn);

// ---------------- small props ----------------
export const bottle = (p: P, at: V3, s = 1, seed = 1) => {
  const g = pivot(p, at), c = pick(BOTTLE, H(seed, 1)), h = (0.32 + 0.12 * H(seed, 2)) * s, r = 0.055 * s;
  cyl(g, r, r, h * 0.62, [0, 0, 0], c, { seg: 12 });
  cyl(g, r * 0.35, r, h * 0.16, [0, h * 0.62, 0], c, { seg: 12 });
  cyl(g, r * 0.32, r * 0.32, h * 0.22, [0, h * 0.78, 0], c, { seg: 10 });
  if (H(seed, 3) < 0.8) cyl(g, r * 1.02, r * 1.02, h * 0.22, [0, h * 0.18, 0], pick(LABEL, H(seed, 4)), { seg: 12, shadow: false });
  return g;
};
export const glass = (p: P, at: V3, s = 1, fill = "#d98f2b") => {
  const g = pivot(p, at);
  cyl(g, 0.05 * s, 0.045 * s, 0.11 * s, [0, 0, 0], "#d8eef2", { seg: 12 });
  cyl(g, 0.046 * s, 0.042 * s, 0.06 * s, [0, 0.005, 0], fill, { seg: 12, shadow: false });
  return g;
};
export const mug = (p: P, at: V3, s = 1, col = "#f1e6c8") => { const g = pivot(p, at); cyl(g, 0.06 * s, 0.06 * s, 0.13 * s, [0, 0, 0], col, { seg: 14 }); return g; };
export const books = (p: P, at: V3, n = 6, seed = 1, rotY = 0) => {
  const g = pivot(p, at); g.rotation.y = rotY; let x = 0;
  for (let i = 0; i < n; i++) { const w = 0.05 + 0.04 * H(seed, i), h = 0.24 + 0.12 * H(seed, i + 20); box(g, [w, h, 0.2], [x + w / 2, 0, 0], pick(BRIGHT, H(seed, i + 40)), { shadow: false }); x += w + 0.004; }
  return g;
};
export const barrel = (p: P, at: V3, s = 1, seed = 1) => {
  const g = pivot(p, at), c = pick(WOOD, H(seed, 5));
  cyl(g, 0.36 * s, 0.32 * s, 0.5 * s, [0, 0, 0], c); cyl(g, 0.32 * s, 0.36 * s, 0.5 * s, [0, 0.5 * s, 0], c);
  for (const y of [0.12, 0.5, 0.88]) cyl(g, 0.365 * s, 0.365 * s, 0.05 * s, [0, (y - 0.025) * s, 0], "#3a3a40", { shadow: false });
  return g;
};
export const crate = (p: P, at: V3, s = 1, seed = 1) => {
  const g = pivot(p, at); g.rotation.y = (H(seed, 6) - 0.5) * 0.6; const c = pick(WOOD, H(seed, 7));
  box(g, [0.6 * s, 0.5 * s, 0.6 * s], [0, 0, 0], c);
  box(g, [0.62 * s, 0.07 * s, 0.62 * s], [0, 0.22 * s, 0], "#5a3518", { shadow: false });
  return g;
};
export const sack = (p: P, at: V3, s = 1) => { const g = pivot(p, at); sphere(g, 0.3 * s, [0, 0.26 * s, 0], "#c8a46a", { sy: 1.25 }); return g; };
export const stool = (p: P, at: V3, s = 1) => {
  const g = pivot(p, at); cyl(g, 0.24 * s, 0.24 * s, 0.07 * s, [0, 0.85 * s, 0], "#8b1e1e");
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; cyl(g, 0.025 * s, 0.025 * s, 0.85 * s, [Math.cos(a) * 0.15 * s, 0, Math.sin(a) * 0.15 * s], "#2b2b30", { seg: 8 }); }
  return g;
};
export const chair = (p: P, at: V3, rotY = 0, s = 1, col = "#7a4a2a") => {
  const g = pivot(p, at); g.rotation.y = rotY;
  box(g, [0.5 * s, 0.06 * s, 0.5 * s], [0, 0.55 * s, 0], col); box(g, [0.5 * s, 0.6 * s, 0.06 * s], [0, 0.6 * s, -0.22 * s], col);
  for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) box(g, [0.05 * s, 0.55 * s, 0.05 * s], [x * s, 0, z * s], col);
  return g;
};
export const table = (p: P, at: V3, round = true, s = 1, col = "#6a3d22") => {
  const g = pivot(p, at);
  if (round) { cyl(g, 0.55 * s, 0.55 * s, 0.06 * s, [0, 0.95 * s, 0], col); cyl(g, 0.06 * s, 0.06 * s, 0.95 * s, [0, 0, 0], "#2b2b30", { seg: 10 }); cyl(g, 0.3 * s, 0.3 * s, 0.04 * s, [0, 0, 0], "#2b2b30"); }
  else { box(g, [1.3 * s, 0.07 * s, 0.8 * s], [0, 0.95 * s, 0], col); for (const [x, z] of [[-0.58, -0.33], [0.58, -0.33], [-0.58, 0.33], [0.58, 0.33]]) box(g, [0.07 * s, 0.95 * s, 0.07 * s], [x * s, 0, z * s], col); }
  return g;
};
export const plant = (p: P, at: V3, s = 1, seed = 1) => {
  const g = pivot(p, at); cyl(g, 0.2 * s, 0.15 * s, 0.35 * s, [0, 0, 0], pick(["#c4622d", "#e9c46a", "#457b9d"], H(seed, 8)));
  for (let i = 0; i < 5; i++) sphere(g, (0.18 + 0.08 * H(seed, i)) * s, [(H(seed, i + 9) - 0.5) * 0.3 * s, (0.5 + 0.3 * H(seed, i + 19)) * s, (H(seed, i + 29) - 0.5) * 0.3 * s], pick(["#3f8f3a", "#4fa84a", "#2f7a35"], H(seed, i + 39)));
  const sway = g.children.slice(1); animate((f) => sway.forEach((m, i) => (m.rotation.z = 0.04 * Math.sin(f * 0.05 + i))));
  return g;
};

// ---------------- wall props ----------------
/** painted picture (random simple landscape / portrait / poster) in a frame, hung on a wall facing +z (rotY to turn) */
export const frame = (p: P, at: V3, w = 0.7, h = 0.9, seed = 1, rotY = 0) => {
  const kind = Math.floor(H(seed, 10) * 3);
  const tex = ctex("art" + seed + kind, 256, 320, (g, r) => {
    const sky = pick(["#f6c28b", "#9ad0ec", "#f4a6b8", "#c3e88d"], r());
    g.fillStyle = sky; g.fillRect(0, 0, 256, 320);
    if (kind === 0) { g.fillStyle = "#4f8a3c"; g.beginPath(); g.moveTo(0, 220); g.quadraticCurveTo(128, 120, 256, 230); g.lineTo(256, 320); g.lineTo(0, 320); g.fill(); g.fillStyle = "#ffe08a"; g.beginPath(); g.arc(180, 80, 30, 0, 7); g.fill(); }
    else if (kind === 1) { g.fillStyle = "#f1d7b8"; g.beginPath(); g.arc(128, 130, 70, 0, 7); g.fill(); g.lineWidth = 8; g.strokeStyle = "#2b1d14"; g.stroke(); g.fillStyle = pick(BRIGHT, r()); g.fillRect(48, 210, 160, 110); g.fillStyle = "#2b1d14"; g.fillRect(100, 115, 12, 12); g.fillRect(146, 115, 12, 12); }
    else { g.fillStyle = pick(BRIGHT, r()); g.fillRect(20, 20, 216, 280); g.fillStyle = "#fff"; g.font = "900 70px DejaVu Sans"; g.textAlign = "center"; g.fillText(pick(["★", "♥", "☀", "♣"], r()), 128, 150); g.fillRect(50, 210, 156, 18); g.fillRect(70, 245, 116, 14); }
  });
  const g = pivot(p, at); g.rotation.y = rotY;
  box(g, [w + 0.08, h + 0.08, 0.05], [0, -0.04, 0], "#5a3518", { shadow: false });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat(tex)); m.position.set(0, h / 2 - 0.04, 0.03); g.add(m);
  return g;
};
/** wall clock with a ticking second hand and a moving minute hand */
export const clock = (p: P, at: V3, r = 0.3, rotY = 0) => {
  const g = pivot(p, at); g.rotation.y = rotY;
  const face = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.06, 32), [mat("#2b2b30"), mat("#fdf6e3"), mat("#2b2b30")]);
  face.rotation.x = Math.PI / 2; g.add(face);
  const mk = (len: number, wdt: number, col: string) => { const piv = new THREE.Group(); piv.position.z = 0.04; g.add(piv); const b = new THREE.Mesh(new THREE.BoxGeometry(wdt, len, 0.01), mat(col)); b.position.y = len / 2; piv.add(b); return piv; };
  const mh = mk(r * 0.8, 0.03, "#2b2b30"), sh = mk(r * 0.85, 0.012, "#c0392b");
  animate((f) => { sh.rotation.z = -Math.floor(f / 30) * (Math.PI / 30); mh.rotation.z = -f * 0.002; });
  return g;
};
/** hanging lamp (cord + shade + warm glow) that swings slowly */
export const lamp = (p: P, at: V3, drop = 1.2, col = "#2a9d8f", seed = 1) => {
  const g = pivot(p, at);
  cyl(g, 0.01, 0.01, drop, [0, -drop, 0], "#222", { seg: 6, shadow: false });
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.25, 20, 1, true), mat(col, { side: THREE.DoubleSide })); shade.position.y = -drop; g.add(shade);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), new THREE.MeshBasicMaterial({ color: "#fff4c2" })); bulb.position.y = -drop - 0.1; g.add(bulb);
  const light = new THREE.PointLight("#ffd89a", 3, 6, 1.6); light.position.y = -drop - 0.2; g.add(light);
  const ph = H(seed, 11) * 6;
  animate((f) => { g.rotation.z = 0.05 * Math.sin(f * 0.07 + ph); g.rotation.x = 0.03 * Math.sin(f * 0.05 + ph); });
  return g;
};
/** ceiling fan, spinning */
export const fan = (p: P, at: V3, r = 0.8) => {
  const g = pivot(p, at); cyl(g, 0.02, 0.02, 0.4, [0, -0.4, 0], "#222", { shadow: false });
  const hub = new THREE.Group(); hub.position.y = -0.45; g.add(hub);
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(r, 0.02, 0.16), mat("#6a3d22")); b.position.x = r / 2; const arm = new THREE.Group(); arm.rotation.y = (i * Math.PI) / 2; arm.add(b); hub.add(arm); }
  animate((f) => (hub.rotation.y = f * 0.25));
  return g;
};
/** candle with a flickering flame */
export const candle = (p: P, at: V3, s = 1) => {
  const g = pivot(p, at); cyl(g, 0.04 * s, 0.04 * s, 0.22 * s, [0, 0, 0], "#fdf6e3", { seg: 10 });
  const fl = new THREE.Mesh(new THREE.SphereGeometry(0.035 * s, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffcf5a" })); fl.position.y = 0.27 * s; g.add(fl);
  animate((f) => { const k = 1 + 0.25 * Math.sin(f * 1.7) * Math.sin(f * 0.63); fl.scale.set(1, 1.3 * k, 1); });
  return g;
};

/** string of little pennant flags between two points, sagging, fluttering */
export const bunting = (p: P, a: V3, b: V3, n = 14, sag = 0.35, seed = 1) => {
  const flags: THREE.Mesh[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, at: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t];
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute([-0.12, 0, 0, 0.12, 0, 0, 0, -0.28, 0], 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat(pick(BRIGHT, H(seed, i)), { side: THREE.DoubleSide })); m.position.set(...at); p.add(m); flags.push(m);
  }
  animate((f) => flags.forEach((m, i) => (m.rotation.x = 0.25 * Math.sin(f * 0.12 + i * 0.7))));
};

// ---------------- shelves and whole walls ----------------
/** wall shelf unit (w wide, h tall) filled with bottles, books, jars or a mix. Faces +z; rotY to turn. */
export const shelf = (p: P, at: V3, w = 2, h = 2, fill: "bottles" | "books" | "jars" | "mixed" = "mixed", seed = 1, rotY = 0) => {
  const g = pivot(p, at); g.rotation.y = rotY; const c = pick(WOOD, H(seed, 12)), rows = Math.max(2, Math.round(h / 0.5));
  box(g, [w, h, 0.05], [0, 0, -0.18], "#4a2c18");
  for (let i = 0; i <= rows; i++) box(g, [w, 0.05, 0.38], [0, (i * h) / rows, 0], c);
  box(g, [0.06, h, 0.38], [-w / 2, 0, 0], c); box(g, [0.06, h, 0.38], [w / 2, 0, 0], c);
  for (let i = 0; i < rows; i++) {
    const y = (i * h) / rows + 0.025; let x = -w / 2 + 0.1, k = 0;
    while (x < w / 2 - 0.12) {
      const r = H(seed * 13 + i, k++), kind = fill === "mixed" ? pick(["bottles", "books", "jars"], H(seed + i, k + 99)) : fill;
      if (kind === "books") { const n = 3 + Math.floor(r * 4); books(g, [x, y, 0], n, seed * 7 + i * 3 + k); x += n * 0.085 + 0.06; }
      else if (kind === "jars") { cyl(g, 0.08, 0.08, 0.18 + 0.08 * r, [x + 0.08, y, 0], pick(["#e9c46a", "#f4a261", "#a8dadc", "#c3e88d"], r), { seg: 12 }); x += 0.2; }
      else { bottle(g, [x + 0.06, y, 0], 0.9 + 0.3 * r, seed * 31 + i * 7 + k); x += 0.14 + 0.05 * r; }
    }
  }
  return g;
};
/** dress a whole wall: a strip from `a` to `b` (floor points along the wall, objects face the wall's front = +z of the
 *  strip when rotY 0). Kind picks the mix. Fills it edge to edge: shelves, frames, clock, lamp, posters, plants. */
export const dressWall = (p: P, a: V3, b: V3, kind: "bar" | "home" | "office" | "lab" | "shop" | "palace", seed = 1, rotY = 0) => {
  const g = pivot(p, a); g.rotation.y = rotY; const L = Math.hypot(b[0] - a[0], b[2] - a[2]); let x = 0.3, i = 0;
  const plan: Record<string, string[]> = {
    bar: ["shelf:bottles", "frame", "shelf:bottles", "clock", "shelf:mixed", "frame"],
    home: ["frame", "shelf:books", "frame", "clock", "plant", "frame"],
    office: ["shelf:books", "frame", "clock", "shelf:mixed", "plant"],
    lab: ["shelf:jars", "shelf:jars", "clock", "shelf:mixed", "frame"],
    shop: ["shelf:mixed", "shelf:jars", "shelf:bottles", "frame"],
    palace: ["frame", "frame", "candle", "frame", "frame"],
  };
  // upper row: frames / posters between 2.9 and 4 m so the wall above the shelves is never a bare block
  for (let u = 0.5, j = 0; u < L - 0.6; j++) { const w = 0.55 + 0.35 * H(seed, j + 300); frame(g, [u + w / 2, 3.0 + 0.3 * H(seed, j + 310), 0.03], w, w * (0.8 + 0.5 * H(seed, j + 320)), seed * 9 + j + 100); u += w + 0.35 + 0.5 * H(seed, j + 330); }
  bunting(g, [0, 4.3, 0.15], [L, 4.3, 0.15], Math.round(L * 2.2), 0.45, seed);
  while (x < L - 0.4) {
    const it = plan[kind][i % plan[kind].length], r = H(seed, i + 50); i++;
    if (it.startsWith("shelf")) { const w = 1.4 + 0.8 * r; if (x + w > L) break; shelf(g, [x + w / 2, 0.9, 0.2], w, 1.8, it.split(":")[1] as any, seed * 3 + i); x += w + 0.15; }
    else if (it === "frame") { const w = 0.6 + 0.3 * r; frame(g, [x + w / 2, 1.4 + 0.4 * H(seed, i), 0.03], w, w * 1.25, seed * 5 + i); x += w + 0.3; }
    else if (it === "clock") { clock(g, [x + 0.3, 2.3, 0.05], 0.28); x += 0.75; }
    else if (it === "plant") { plant(g, [x + 0.3, 0, 0.3], 1, seed + i); x += 0.75; }
    else if (it === "candle") { candle(g, [x + 0.2, 1.3, 0.1], 1.3); x += 0.5; }
  }
  return g;
};
/** floor clutter in a rectangle: crates, barrels, sacks, plants, stools, chairs. Keeps a clear radius around `keepClear`
 *  points (where characters stand and where the camera looks). */
export const scatter = (p: P, min: V3, max: V3, n = 8, kinds: ("crate" | "barrel" | "sack" | "plant" | "stool" | "chair" | "table")[] = ["crate", "barrel", "sack", "plant"], seed = 1, keepClear: V3[] = [], clear = 1.2) => {
  let placed = 0;
  for (let k = 0; k < n * 6 && placed < n; k++) {
    const at: V3 = [min[0] + (max[0] - min[0]) * H(seed, k), min[1], min[2] + (max[2] - min[2]) * H(seed, k + 500)];
    if (keepClear.some((c) => Math.hypot(c[0] - at[0], c[2] - at[2]) < clear)) continue;
    const kind = pick(kinds, H(seed, k + 900)), s = 0.85 + 0.3 * H(seed, k + 1300);
    if (kind === "crate") { crate(p, at, s, seed + k); if (H(seed, k + 7) < 0.4) crate(p, [at[0], at[1] + 0.5 * s, at[2]], s * 0.8, seed + k + 1); }
    else if (kind === "barrel") barrel(p, at, s, seed + k);
    else if (kind === "sack") sack(p, at, s);
    else if (kind === "plant") plant(p, at, s, seed + k);
    else if (kind === "stool") stool(p, at, s);
    else if (kind === "chair") chair(p, at, H(seed, k + 3) * 6.28, s);
    else table(p, at, true, s);
    placed++;
  }
};
