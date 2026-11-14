// Roblox example story: a sunny Roblox suburb, the protagonist walks in, a rule sign, his sister reacts, a street wide.
// Shows the whole Roblox API: R15 characters (rbxChar) posed per frame, Roblox parts world, fast cutting camera.
// Units are studs (a character is ~5.3 tall). Copy to story.ts and replace the world, the cast and the camera keys.
import * as THREE from "three";
import type { Engine, FrameState } from "@kit/engine";
import { clouds } from "@kit/build";
import { camFromKeys, CamKey, blinkAt, talkAt, walk, prog, FPS } from "@kit/motion";
import { motes, birds } from "@kit/ambient";
import { rbxInit, rbxLoad, rbxChar, HERO, CAST, randomOutfit, poseAt, walkPose, mixPose, POSES, part, baseplate, rbxHouse, rbxTree, rbxSign, RbxChar } from "@kit/rbx/rbx";

// In a real project TOTAL comes from the voice:  import T from "./work/timing.json";  export const TOTAL = T.frames;
export const TOTAL = 6 * FPS;

export async function build(w: Engine) {
  await rbxLoad(); rbxInit(w as any);
  const R = w.root;
  baseplate(R, 600, "#62b04c", "grass");
  part(R, [400, 0.2, 14], [0, 0, 6], "#3d3f45", { kind: "concrete", tile: 20, shadow: false });            // road
  for (const x of [-40, -20, 0, 20, 40]) part(R, [6, 0.05, 0.6], [x, 0.2, 6], "#f2f2f2", { shadow: false }); // road marks
  part(R, [400, 0.5, 6], [0, 0, -4], "#c9c9c9", { kind: "concrete", tile: 6, shadow: false });             // sidewalk
  const walls = ["#e9d8b8", "#b8d8e9", "#f2c4b0", "#d8e9b8", "#f2e6a0"], roofs = ["#8a3a2a", "#3a4a6a", "#6a3a5a", "#3a6a4a"];
  for (let i = -3; i <= 3; i++) rbxHouse(R, { at: [i * 20, 0, -18], w: 14, h: 9, d: 12, wall: walls[(i + 9) % 5], roof: roofs[(i + 8) % 4] });
  for (let i = -3; i <= 3; i++) rbxTree(R, [i * 20 + 13, 0, -10], i % 2 ? "round" : "pine", 0.9);
  rbxSign(R, "NO RUNNING\nEMERGENCIES ONLY", [7, 0, -6.5], { w: 5, h: 2.8 });
  clouds(R, [0, 0, 0], 9, 380, 90);
  w.refs.hero = rbxChar(R, HERO);
  w.refs.sis = rbxChar(R, CAST.sister);
  w.refs.extras = [0, 1, 2, 3].map((k) => rbxChar(R, randomOutfit(10 + k)));
}

// camera: cuts every ~1.5 s (the Roblox channels measure ~34 cuts per minute), gentle push inside each shot
const KEYS: CamKey[] = [
  { f: 0, pos: [4.5, 3.2, 9.5], look: [-2.5, 3.6, -3.5], fov: 42 },                      // hero walking in, low-ish medium
  { f: 44, dur: 44, pos: [3.2, 3.4, 7.5], look: [-0.5, 3.9, -3.5], fov: 40 },             // slow push, following him
  { f: 45, cut: true, pos: [5.6, 4.6, 9.5], look: [7, 4.7, -6.5], fov: 38 },             // insert: the rule sign
  { f: 89, dur: 44, pos: [6.0, 4.6, 7.8], look: [7, 4.7, -6.5], fov: 38 },
  { f: 90, cut: true, pos: [0.5, 3.8, 9], look: [1.0, 3.9, -3.5], fov: 40 },             // two-shot
  { f: 134, dur: 44, pos: [0.8, 3.9, 7.5], look: [1.0, 4.0, -3.5], fov: 40 },
  { f: 135, cut: true, pos: [-20, 14, 24], look: [0, 3, -6], fov: 45 },                  // street wide
  { f: 179, dur: 44, pos: [-16, 12, 21], look: [0, 3, -6], fov: 45 },
];

const pose = (c: RbxChar, f: number, s: Parameters<RbxChar["set"]>[0]) => c.set({ f, ...s });

export function frame(f: number, w: Engine): FrameState {
  const { hero, sis, extras } = w.refs as { hero: RbxChar; sis: RbxChar; extras: RbxChar[] };
  const cam = camFromKeys(KEYS, f);
  // hero walks along the sidewalk, stops, waves
  const wk = walk(f, 0, 60, 6);
  const stepping = wk.moving ? walkPose(wk.phase, 1) : {};
  const after = poseAt(f, [{ f: 0, pose: "relax" }, { f: 100, pose: "wave" }, { f: 125, pose: "relax" }]);
  pose(hero, f, { at: [-5 + wk.d, 0, -3.5], face: f < 62 ? 90 : 25, pose: wk.moving ? mixPose(POSES.relax, stepping, 1) : after, expr: f < 100 ? "smile" : "happy", blink: blinkAt(f, 1), talk: talkAt(f, [[92, 118]], 3) });
  pose(sis, f, { at: [3.2, 0, -3.0], face: -30, pose: poseAt(f, [{ f: 0, pose: "relax" }, { f: 96, pose: "shock" }]), expr: f < 96 ? "smile" : "shock", blink: blinkAt(f, 2), look: -10 });
  extras.forEach((e, k) => {
    const ew = walk((f + k * 40) % 180, 0, 180, 30);
    e.set({ f, at: [-30 + ew.d + k * 9, 0, k % 2 ? 1.5 : 10], face: 90, pose: walkPose(ew.phase, 1), expr: "smile", blink: blinkAt(f, 5 + k) });
  });
  return {
    cam, light: "day",
    sunRef: { pos: [3.5, 3.6, 6.5], look: [-1.5, 4.0, -3] },
    dof: { cInf: f < 135 ? 8 : 0, focus: f < 45 ? [-5 + wk.d, 4.6, -3.5] : f < 90 ? [7, 4.9, -6.5] : [1, 4.5, -3.3] },
    fx: [...motes(f, { min: [-6, 2, -6], max: [8, 7, 2] }, 18, 1), ...birds(f, [-60, 30, -60], [60, 34, -60], 4, 3, 180)],
  };
}
