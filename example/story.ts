// Example story: a busy old bar. It shows the measured "never static, never empty" toolkit:
// - props.ts: dressWall / shelf / scatter fill the set edge to edge; clocks tick, lamps swing, fans spin (tickProps)
// - crowd.ts: background extras that chat, sip, laugh, point and walk on their own clocks
// - motion.ts: acting() makes the hero move on every phrase and word; idle() breathes; camFromKeys drifts in holds and
//   keeps every move under ~18 px/f
// - ambient.ts: dust in the light, smoke, light pools
// Copy it to your project as story.ts and replace the world, the cast and the camera keys. The older outdoor example
// is example/baker.ts.
import type { Engine, FrameState } from "@kit/engine";
import { box, ground, mat, V3 } from "@kit/build";
import { camFromKeys, CamKey, idle, blinkAt, acting, prog, back, FPS, Phrase } from "@kit/motion";
import { motes, lightPool } from "@kit/ambient";
import { charCard, CardPlace, FxPlace } from "@kit/cards";
import { dressWall, shelf, bottle, glass, stool, table, lamp, fan, scatter, frame as picture, tickProps } from "@kit/props";
import { extras, Extra } from "@kit/crowd";
import { Outfit, fxStars } from "@kit/lib/toon";
import { boards, plaster } from "@kit/paint2";

// In a real project these come from the voice:  import T from "./work/timing.json";  TOTAL = T.frames; PH = T.phrases
export const TOTAL = 7 * FPS;
const PH: Phrase[] = [0, 45, 90, 135].map((f0, i) => ({ i, text: "", f0, f1: f0 + 40, words: [0, 12, 24].map((d) => ({ w: "word", f: f0 + d })) }));

const BARMAN: Outfit = { jacket: "#f2efe6", pants: "#2b2b30", boots: "#2b2120", hat: "hair", hair: "#2b1d14", moustache: "#2b1d14", build: "stout" };
const HERO: Outfit = { jacket: "#1f3a7a", pants: "#1f2340", boots: "#2b2120", hat: "hair", hair: "#2b1d14", buttons: "#e9c46a" };

let CROWD: Extra[] = [];
export function build(w: Engine) {
  const R = w.root;
  ground(R, 60, boards("#8b5a33", 6), 2);
  box(R, [14, 4.6, 0.2], [0, 0, -4.2], plaster("#c96f4a"), { tile: 2 });                 // back wall
  box(R, [0.2, 4.6, 9], [-7, 0, 0.3], plaster("#b8603e"), { tile: 2 });                   // left wall
  box(R, [0.2, 4.6, 9], [7, 0, 0.3], plaster("#b8603e"), { tile: 2 });                    // right wall
  box(R, [14, 0.6, 0.15], [0, 0, -4.05], "#5a3518");                                       // wainscot
  dressWall(R, [-6.6, 0, -4.05], [6.6, 0, -4.05], "bar", 4);                               // shelves, frames, clock: edge to edge
  // the counter, loaded
  box(R, [6, 1.2, 0.9], [0, 0, -2.5], boards("#6a3d22", 3), { tile: 1 });
  box(R, [6.3, 0.08, 1.1], [0, 1.2, -2.5], "#3b2414");
  for (let i = 0; i < 14; i++) { const at: V3 = [-2.8 + i * 0.42, 1.24, -2.35 - 0.2 * Math.sin(i * 1.7)]; if (i % 3) bottle(R, at, 1, i + 20); else glass(R, at); }
  for (let i = 0; i < 5; i++) stool(R, [-2.4 + i * 1.2, 0, -1.7]);
  for (const x of [-2, 0, 2]) lamp(R, [x, 4.6, -2.4], 1.4, ["#2a9d8f", "#e76f51", "#e9c46a"][(x + 2) / 2], x + 5);
  fan(R, [3.6, 4.6, -0.2]);
  // side walls dressed too, and tables with chairs on the floor
  shelf(R, [-6.85, 0.9, -1.2], 2.2, 2, "mixed", 8, Math.PI / 2); picture(R, [-6.88, 1.6, 1.4], 0.8, 1, 9, Math.PI / 2);
  shelf(R, [6.85, 0.9, -1.2], 2.2, 2, "bottles", 11, -Math.PI / 2); picture(R, [6.88, 1.7, 1.2], 0.9, 1.1, 12, -Math.PI / 2);
  for (const at of [[-4.2, 0, -0.4], [4.2, 0, 0.2], [-4.6, 0, 2.4]] as V3[]) table(R, at);
  scatter(R, [-6.5, 0, -3.8], [-3.6, 0, -3.0], 3, ["barrel", "crate"], 3);
  scatter(R, [3.6, 0, -3.8], [6.5, 0, -3.0], 3, ["barrel", "crate", "plant"], 5);
  // extras around the tables and along the room
  // 9:16 frames are narrow (about +-1.7 m wide at 8 m): put extras IN DEPTH along the camera axis, not off to the sides
  CROWD = [
    { at: [-1.7, 0, -1.6], act: "sip", seed: 11 },  { at: [-0.6, 0, -1.6], act: "chat", seed: 12, mirror: true },   // at the counter
    { at: [2.1, 0, -1.6], act: "laugh", seed: 13 },
    { at: [-0.4, 0, -3.6], act: "chat", seed: 14, scale: 0.95 },  { at: [1.9, 0, -3.6], act: "react", seed: 15, mirror: true, scale: 0.95 },   // behind the bar
    { at: [-1.1, 0, -3.5], act: "point", seed: 16, scale: 0.95 },                                                     // second barman
    { at: [-3.4, 0, -0.5], to: [-0.6, 0, -0.5], act: "walk", seed: 17 },                                               // someone crossing behind
  ];
  void mat;
}

const KEYS: CamKey[] = [
  { f: 0, pos: [0.4, 1.9, 0.6], look: [0.2, 1.6, -2.4], fov: 40 },               // hook: the barman with the bottle, close
  { f: 70, dur: 40, pos: [0, 2.6, 6.2], look: [0, 1.4, -2.0], fov: 44 },          // pull back: the whole busy bar
  { f: 140, dur: 36, pos: [1.7, 1.75, 1.6], look: [0.7, 1.45, -2.2], fov: 40 },     // push in to the hero at the counter (medium, not a giant face)
  { f: 160, cut: true, whipCut: 1, pos: [-1.1, 2.2, 3.2], look: [-1.3, 1.5, -3.0], fov: 40 },   // whip cut to the other end of the bar
];

export function frame(f: number, w: Engine): FrameState {
  tickProps(f);                                                     // clocks, lamps, fan
  const cam = camFromKeys(KEYS, f);
  const a = idle(f, 1), act = acting(f, PH, 1);                     // the barman acts on every phrase
  const b = idle(f, 2), act2 = acting(f, PH, 2, 0.6);               // the hero reacts, smaller
  const cards: CardPlace[] = [
    charCard({ outfit: BARMAN, seed: 3, at: [0, act.hop, -3.1], expr: f < 90 ? "grin" : "smile", tilt: a.tilt + act.tilt, headTilt: a.headTilt + act.headTilt, wave: act.wave, blink: blinkAt(f, 1) }),
    charCard({ outfit: HERO, seed: 5, at: [1.0, act2.hop, -1.5], expr: f < 110 ? "neutral" : "shock", tilt: b.tilt + act2.tilt, headTilt: b.headTilt + act2.headTilt, wave: act2.wave, blink: blinkAt(f, 2), look: -0.5 }),
    ...extras(f, CROWD),
  ];
  const fx: FxPlace[] = [
    ...motes(f, { min: [-4, 0.8, -3.5], max: [4, 3.8, 1] }, 30, 1),
    lightPool([0.4, 0.02, -0.9], 2.6, 1.4, "rgba(255,214,140,0.16)", { flat: true, skew: 0.3 }),
  ];
  if (f >= 110) fx.push({ key: "stars" + (Math.floor(f / 3) % 6), cw: 420, ch: 210, draw: (p) => fxStars(p, (f % 18) / 18), at: [1.0, 2.7, -1.5], w: 0.8, h: 0.4 });
  void prog; void back;
  return {
    cam, light: "interior", sunRef: { pos: KEYS[0].pos, look: KEYS[0].look },
    dof: { cInf: f < 60 ? 10 : 0, focus: [0, 1.7, -3.1] }, cards, fx,
  };
}
