// Example story: a baker in a small square notices his bread rising in the sun. Shows the whole story API:
// build() makes the world once; frame(f) returns the camera, light, lens and characters for frame f.
// Copy this file to your project as story.ts and replace the world, the cast and the camera keys.
import * as THREE from "three";
import type { Engine, FrameState } from "@kit/engine";
import { box, cyl, ground, house, tree, hills, mountains, clouds, sign, mat, V3 } from "@kit/build";
import { camFromKeys, CamKey, idle, blinkAt, prog, smooth, back, FPS } from "@kit/motion";
import { charCard, CardPlace, FxPlace } from "@kit/cards";
import { Outfit, fxPuff, fxStars } from "@kit/lib/toon";
import { cobbleHD } from "@kit/lib/paint";
import { boards, signTex } from "@kit/paint2";

// In a real project TOTAL comes from the voice:  import T from "./work/timing.json";  export const TOTAL = T.frames;
export const TOTAL = 6 * FPS;

const BAKER: Outfit = { jacket: "#f2efe6", pants: "#3b3f52", boots: "#4a3426", hat: "cap", cap: "#f7f4ee", moustache: "#5a3b2a", build: "stout" };
const KID: Outfit = { jacket: "#e2643c", pants: "#3b5b9a", boots: "#4a3426", hat: "hair", hair: "#3a2a20", build: "kid" };

export function build(w: Engine) {
  const R = w.root;
  ground(R, 400, cobbleHD(), 6);
  // the square: bakery + neighbours in a row, a table with bread, a sign
  house(R, { at: [0, 0, -6], w: 7, h: 6, d: 5, wall: "#e9c88a", shutter: "#3b6e8c", roof: "#b8573a", seed: "bakery" });
  house(R, { at: [-7.6, 0, -6.4], w: 6, h: 7.5, d: 5, wall: "#c86f4c", shutter: "#2f5f6a", roof: "#8f4a36", seed: "n1" });
  house(R, { at: [7.4, 0, -6.2], w: 6, h: 6.6, d: 5, wall: "#a9c3d9", shutter: "#7a3b3b", roof: "#b8573a", seed: "n2" });
  const table = box(R, [2.2, 0.08, 0.9], [0.6, 0.9, -2.2], boards("#b07a48", 4), { tile: 1.2 });
  for (const [x, z] of [[-0.4, -2.55], [1.6, -2.55], [-0.4, -1.85], [1.6, -1.85]] as const) box(R, [0.08, 0.9, 0.08], [x, 0, z], "#7a5232");
  const loaves = new THREE.Group(); loaves.position.set(0.6, 0.98, -2.2); R.add(loaves);
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 10), mat("#d9954a")); l.scale.set(1.4, 0.7, 1); l.position.set(-0.6 + i * 0.4, 0.08, 0); l.castShadow = true; loaves.add(l); }
  sign(R, signTex("BAKERY"), [0, 3.3, -3.45], 3, 0.9, 0, false);
  tree(R, [-4.5, 0, -1], "round"); tree(R, [5, 0, -1.5], "cypress");
  cyl(R, 0.5, 0.6, 0.8, [4.2, 0, -3.0], "#9c8b74"); // a barrel, out of the camera path
  hills(R, [0, 0, 0], 140, 9); mountains(R, [0, 0, 0], 320, 7);
  clouds(R, [0, 0, 0], 9, 380, 80);
  w.refs.loaves = loaves; void table;
}

// camera: one continuous set, calm moves between stations, a hold creeps slowly
const KEYS: CamKey[] = [
  { f: 0, pos: [-0.8, 1.45, 1.0], look: [-0.8, 1.3, -2.0], fov: 40 },            // baker MCU beside his table
  { f: 75, dur: 36, pos: [-0.2, 1.3, 3.2], look: [-0.2, 1.1, -1.4], fov: 42 },     // pull back: two-shot with the kid
  { f: 140, dur: 30, pos: [1.3, 1.4, -0.9], look: [0.8, 1.0, -2.2], fov: 38 },     // push in to the bread
];

export function frame(f: number, w: Engine): FrameState {
  const cam = camFromKeys(KEYS, f, [{ f: 150, amp: 0.03 }]);
  const rise = smooth(prog(f, 120, 160));
  w.refs.loaves.children.forEach((l: THREE.Mesh, i: number) => { l.scale.y = 0.7 + 0.5 * back(prog(f, 120 + i * 6, 150 + i * 6)); });
  const a = idle(f, 1), b = idle(f, 2);
  const cards: CardPlace[] = [
    charCard({ outfit: BAKER, seed: 3, at: [-0.9, 0, -2.0], expr: f < 120 ? "smile" : "shock", tilt: a.tilt, headTilt: a.headTilt, blink: blinkAt(f, 1), wave: f > 40 && f < 70 ? 0.5 + 0.5 * Math.sin(f * 0.5) : undefined }),
    charCard({ outfit: KID, seed: 5, at: [0.3, 0, -0.9], expr: f < 120 ? "neutral" : "grin", tilt: b.tilt, headTilt: b.headTilt, blink: blinkAt(f, 2), look: -0.6 }),
  ];
  const fx: FxPlace[] = [];
  if (f >= 150 && f < 168) fx.push({ key: "puff" + Math.round(prog(f, 150, 168) * 12), cw: 300, ch: 300, draw: (p) => fxPuff(p, prog(f, 150, 168)), at: [0.6, 1.25, -2.2], w: 1.2, h: 1.2, soft: true });
  if (f >= 152) fx.push({ key: "stars" + (Math.floor(f / 3) % 6), cw: 420, ch: 210, draw: (p) => fxStars(p, (f % 18) / 18), at: [-0.9, 2.6, -2.0], w: 0.9, h: 0.45 });
  void rise;
  const v3 = (x: V3) => x;
  return {
    cam, light: "day", sunRef: { pos: v3(KEYS[0].pos), look: v3(KEYS[0].look) },
    dof: { cInf: f < 75 ? 12 : f > 140 ? 13 : 0, focus: f < 75 ? [-0.9, 1.7, -2.0] : f > 140 ? [0.8, 1.0, -2.2] : undefined },
    cards, fx, flash: f >= 150 && f < 154 ? [0.8, 0.5, 0.3, 0.1][f - 150] : 0,
  };
}
