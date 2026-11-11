// Background extras that keep doing things on their own: chatting (mouths move), drinking, laughing, cheering,
// pointing, working with a hammer, walking back and forth. A bar, a court, an office or a street is never empty and
// never frozen. Pure functions of f; put the returned cards into FrameState.cards next to the main characters.
import * as THREE from "three";
import type { V3 } from "./build";
import type { Outfit } from "./lib/toon";
import { charCard, CardPlace } from "./cards";
import { idle, blinkAt, walk, hash, smooth, snap, prog } from "./motion";

export type Act = "chat" | "sip" | "laugh" | "cheer" | "point" | "work" | "walk" | "react";
export type Extra = { at: V3; act: Act; seed: number; to?: V3; outfit?: Outfit; scale?: number; facing?: -1 | 0 | 1; mirror?: boolean; look?: number };

/** ground height under (x, z): casts a ray down onto the world (cards are on the NOINK layer and are ignored).
 *  Extras placed at y = 0 on sand, hills or a raised square float or sink: snap them. */
const ray = new THREE.Raycaster();
export const groundY = (root: THREE.Object3D, x: number, z: number, fallback = 0): number => {
  ray.set(new THREE.Vector3(x, 60, z), new THREE.Vector3(0, -1, 0)); ray.layers.set(0);
  const hit = ray.intersectObject(root, true).find((h) => (h.object as THREE.Mesh).isMesh && h.face && h.face.normal.y > -0.2);
  return hit ? hit.point.y : fallback;
};
/** snap every extra (and its walk target) to the ground. Call once in build() after the world exists. */
export const snapExtras = (root: THREE.Object3D, list: Extra[]) => list.forEach((e) => {
  e.at = [e.at[0], groundY(root, e.at[0], e.at[2], e.at[1]), e.at[2]];
  if (e.to) e.to = [e.to[0], groundY(root, e.to[0], e.to[2], e.to[1]), e.to[2]];
});

/** ready-made groups that interact, instead of people standing alone facing the camera:
 *  chat2 (two facing each other), chat3 (three in a ring), queue (a line toward `toward`), audience (rows watching
 *  `toward`, reacting), workers (hammering around a point). `at` is the group centre on the floor. */
export const group = (kind: "chat2" | "chat3" | "queue" | "audience" | "workers", at: V3, seed = 1, n = 5, toward?: V3): Extra[] => {
  const E = (dx: number, dz: number, act: Act, facing: -1 | 0 | 1, k: number): Extra => ({ at: [at[0] + dx, at[1], at[2] + dz], act, seed: seed * 100 + k, facing, look: facing * 0.8 });
  if (kind === "chat2") return [E(-0.45, 0, "chat", 1, 1), E(0.45, 0.05, "react", -1, 2)];
  if (kind === "chat3") return [E(-0.55, 0, "chat", 1, 1), E(0.55, 0, "laugh", -1, 2), E(0, -0.5, "react", 0, 3)];
  if (kind === "workers") return Array.from({ length: n }, (_, k) => E((k - (n - 1) / 2) * 0.8, (k % 2) * 0.4, "work", (k % 2 ? -1 : 1) as -1 | 1, k));
  const tw = toward ?? [at[0], at[1], at[2] - 5], dx = tw[0] - at[0], dz = tw[2] - at[2], L = Math.hypot(dx, dz) || 1, fx = dx / L, fz = dz / L;
  const face = (Math.abs(fx) < 0.3 ? 0 : fx > 0 ? 1 : -1) as -1 | 0 | 1;
  if (kind === "queue") return Array.from({ length: n }, (_, k) => E(-fx * k * 0.75, -fz * k * 0.75, k === 0 ? "point" : k % 2 ? "chat" : "sip", face, k));
  // audience: rows of 3 across the facing direction, all reacting to what they watch
  return Array.from({ length: n }, (_, k) => { const row = Math.floor(k / 3), col = (k % 3) - 1; return E(-fz * col * 0.7 - fx * row * 0.8, fx * col * 0.7 - fz * row * 0.8, (["react", "cheer", "point", "laugh"] as Act[])[k % 4], face, k); });
};

const JACKETS = ["#c0392b", "#2f6fb0", "#3a8f4f", "#8d5fd3", "#e67e22", "#16a085", "#7f8c8d", "#d35480", "#b8860b", "#34495e"];
const PANTS = ["#2c3e50", "#4a3b2a", "#3b3b48", "#1f3a5f", "#5a4636"];
const HATS = [null, null, "cap", "hair", "hair", "tophat", "bonnet"];
const SKIN = ["#f6d7b0", "#e8b98a", "#c68c5a", "#8d5a3b", "#f2c9a0"];
const pk = <T,>(a: T[], r: number) => a[Math.floor(r * a.length) % a.length];

/** a random but deterministic everyday outfit for seed */
export const randomOutfit = (seed: number, o: Partial<Outfit> = {}): Outfit => {
  const hat = pk(HATS, hash(seed, 1));
  return {
    jacket: pk(JACKETS, hash(seed, 2)), pants: pk(PANTS, hash(seed, 3)), boots: "#2b2120", hat, skin: pk(SKIN, hash(seed, 4)),
    hair: pk(["#3b2a1e", "#1e1a18", "#8a5a2b", "#c9a227", "#6b6b6b"], hash(seed, 5)), cap: pk(JACKETS, hash(seed, 6)),
    moustache: hash(seed, 7) < 0.25 ? "#3b2a1e" : undefined, build: hash(seed, 8) < 0.25 ? "stout" : "adult",
    dress: hat === "bonnet" ? pk(JACKETS, hash(seed, 9)) : undefined, ...o,
  } as Outfit;
};

/** n extras spread over a floor rectangle, each with a random act (or one of `acts`). Keeps clear of `keepClear`. */
export const crowdSpots = (min: V3, max: V3, n: number, seed = 1, acts: Act[] = ["chat", "chat", "sip", "laugh", "react", "point"], keepClear: V3[] = [], clear = 1.0): Extra[] => {
  const out: Extra[] = [];
  for (let k = 0; k < n * 8 && out.length < n; k++) {
    const at: V3 = [min[0] + (max[0] - min[0]) * hash(seed, k), min[1], min[2] + (max[2] - min[2]) * hash(seed, k + 300)];
    if (keepClear.some((c) => Math.hypot(c[0] - at[0], c[2] - at[2]) < clear) || out.some((e) => Math.hypot(e.at[0] - at[0], e.at[2] - at[2]) < 0.7)) continue;
    out.push({ at, act: pk(acts, hash(seed, k + 600)), seed: seed * 100 + k, mirror: hash(seed, k + 900) < 0.5 });
  }
  return out;
};

/** cards for the extras at frame f. Every act cycles on its own clock (2-5 s), offset by seed, so the crowd never syncs. */
export const extras = (f: number, list: Extra[]): CardPlace[] => list.map((e) => {
  const s = e.seed, o = e.outfit ?? randomOutfit(s), id = idle(f, s, 1.2), per = Math.round(45 + 60 * hash(s, 11));
  const t = ((f + Math.floor(hash(s, 12) * per)) % per) / per;   // 0..1 within this extra's own cycle
  let at = e.at, mode: any = "stand", phase = 0, wave = 0, talk = 0, expr: any = "neutral", tilt = id.tilt, headTilt = id.headTilt, prop: any = null, facing = e.facing ?? 0;
  switch (e.act) {
    case "chat": tilt += t < 0.55 ? 3 * Math.sin(f * 0.18 + s) : 0; talk = t < 0.55 && Math.floor(f / 3) % 3 !== 0 ? 0.4 + 0.5 * hash(Math.floor(f / 3), s) : 0; headTilt += t < 0.55 ? 4 * Math.sin(f * 0.25) : 0; expr = t < 0.55 ? "smile" : "neutral"; break;
    case "sip": wave = t > 0.45 && t < 0.85 ? snap(prog(t, 0.45, 0.53)) * (1 - snap(prog(t, 0.78, 0.85))) * 0.9 : 0; headTilt += wave * 8; expr = t > 0.62 && t < 0.83 ? "smile_closed" : "neutral"; break;
    case "laugh": expr = t < 0.6 ? "laugh" : "grin"; tilt += t < 0.6 ? 7 * Math.sin(f * 0.9) : 0; headTilt += t < 0.6 ? -6 : 0; break;
    case "cheer": wave = t < 0.6 ? 0.6 + 0.4 * Math.abs(Math.sin(f * 0.35)) : 0.1; expr = t < 0.6 ? "grin" : "smile"; break;
    case "point": wave = t < 0.5 ? 0.9 : 0; expr = t < 0.5 ? "shock" : "nervous"; break;
    case "react": expr = t < 0.3 ? "shock" : t < 0.65 ? "laugh" : "smile"; headTilt += t < 0.3 ? 9 : 0; tilt += t >= 0.3 && t < 0.65 ? 6 * Math.sin(f * 0.8) : 0; wave = t < 0.3 ? 0.7 : 0; break;
    case "work": prop = ["hammer", 0.5 + 0.5 * Math.sin(f * 0.45 + s)]; expr = "stern"; break;
    case "walk": if (e.to) { const loop = Math.round(150 + 120 * hash(s, 13)), k = (f + Math.floor(hash(s, 14) * loop)) % loop, back = k > loop / 2;
      const w = walk(back ? k - loop / 2 : k, 0, loop / 2, Math.hypot(e.to[0] - e.at[0], e.to[2] - e.at[2]));
      const u = w.d / Math.max(0.01, Math.hypot(e.to[0] - e.at[0], e.to[2] - e.at[2])), v = back ? 1 - u : u;
      at = [e.at[0] + (e.to[0] - e.at[0]) * v, e.at[1], e.at[2] + (e.to[2] - e.at[2]) * v]; mode = w.moving ? "stroll" : "stand"; phase = w.phase;
      facing = ((e.to[0] - e.at[0]) * (back ? -1 : 1) > 0 ? 1 : -1) as any; } break;
  }
  return charCard({ outfit: o, at, seed: s, expr, mode, phase, wave, talk, tilt, headTilt, prop, facing, look: e.look, blink: blinkAt(f, s), scale: e.scale, mirror: e.mirror });
});
