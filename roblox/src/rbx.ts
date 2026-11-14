// Roblox-style cast for the kit: real R15 bodies (exported from Roblox Studio) dressed by code, with our own
// rounded Roblox heads, hair, accessories and simple classic faces (black dot eyes, line mouths, white open grins).
// Characters are real 3D meshes in the world (not cards): build them once in build(), pose them every frame in frame().
//
//   import { rbxInit, rbxChar, HERO, CAST, randomOutfit } from "@kit/rbx/rbx";
//   build(w):  rbxInit(w); w.refs.hero = rbxChar(w.root, HERO);
//   frame(f):  w.refs.hero.set({ at: [0,0,0], face: 0, pose: "relax", expr: "smile", blink: blinkAt(f, 1), talk: 0 });
//
// Units: studs = metres in the kit (a character is ~5.3 tall: legs 2, torso 2, head 1.2). Roblox faces -Z; `face` is
// the yaw in degrees in the kit's convention (0 = facing +Z, toward a camera placed on +Z).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { NOINK } from "../lib/ink";
import { RIG_MASC } from "./rig_masc";
import { RIG_FEM } from "./rig_fem";

export type V3 = [number, number, number];
export type HairStyle = "spiky" | "short" | "long" | "bun" | "cap" | "bald" | "ponytail";
export type Acc = "goggles" | "glasses" | "bow" | "moustache" | "beard" | "headband";
export type Outfit = {
  body?: "masc" | "fem";
  skin?: string;
  top: string;                 // shirt colour (UpperTorso)
  topStyle?: "tshirt" | "long" | "tank" | "dress";
  sleeve?: string;             // upper-arm colour (default = top)
  pad?: string;                // shoulder cap colour (top 20 % of the upper arm)
  vneck?: boolean;
  strap?: string;              // diagonal bandolier
  bottom: string;              // pants / shorts / skirt colour
  bottomStyle?: "pants" | "shorts" | "skirt";
  belt?: string;
  wrist?: string;              // wristbands
  socks?: string;
  shoes: string;
  sole?: string;
  hair: HairStyle;
  hairColor: string;
  hairTip?: string;            // two-tone spike tips (spiky only)
  cap?: string;                // cap colour (hair: "cap")
  acc?: Acc[];
  accColor?: string;           // bow / headband colour
  lashes?: boolean;            // female faces
  scale?: number;              // 0.8 = kid next to adults, 1 = default
  goggle?: { leather: string; brass: string };
};

// ---------------- the user's protagonist (Minecraft skin -> Roblox, "Aclarado" palette) ----------------
export const HERO: Outfit = {
  body: "masc", skin: "#ffd9cf",
  top: "#3b4352", topStyle: "tshirt", sleeve: "#c27a46", pad: "#f0f0f0", vneck: true, strap: "#8a5530",
  bottom: "#4a5266", bottomStyle: "pants", belt: "#5a3820", wrist: "#6a3a22", shoes: "#b5733f", sole: "#f6f6f6",
  hair: "spiky", hairColor: "#2e211b", hairTip: "#7a5440", acc: ["goggles"], goggle: { leather: "#8a5530", brass: "#d9a441" },
};
// recurring cast (edit freely; keep them stable across videos)
export const CAST: Record<string, Outfit> = {
  mom: { body: "fem", skin: "#f6cbb0", top: "#d9607a", topStyle: "long", bottom: "#3f4a6b", shoes: "#5a3a2a", hair: "long", hairColor: "#6b3a22", lashes: true },
  dad: { body: "masc", skin: "#f1c4a6", top: "#3f7a5a", topStyle: "tshirt", bottom: "#2f3442", belt: "#3a2a1a", shoes: "#3a2a1a", hair: "short", hairColor: "#3a2a20", acc: ["moustache"] },
  friend: { body: "masc", skin: "#c98d64", top: "#e3a32a", topStyle: "tshirt", bottom: "#3b5b9a", bottomStyle: "shorts", socks: "#f2f2f2", shoes: "#e04a3a", sole: "#f6f6f6", hair: "cap", hairColor: "#1e1612", cap: "#d63a3a", scale: 0.95 },
  sister: { body: "fem", skin: "#ffd9cf", top: "#7fc7e8", topStyle: "tshirt", bottom: "#f08bb0", bottomStyle: "skirt", socks: "#ffffff", shoes: "#f08bb0", hair: "ponytail", hairColor: "#2e211b", acc: ["bow"], accColor: "#f08bb0", lashes: true, scale: 0.82 },
  grandpa: { body: "masc", skin: "#f3c9b2", top: "#8a6d4e", topStyle: "long", bottom: "#5b5f6b", shoes: "#3a2a1a", hair: "bald", hairColor: "#e6e6e6", acc: ["glasses", "moustache"] },
  grandma: { body: "fem", skin: "#f3c9b2", top: "#9b7fc4", topStyle: "long", bottom: "#6b5a8a", bottomStyle: "skirt", shoes: "#4a3a3a", hair: "bun", hairColor: "#dcdcdc", acc: ["glasses"], lashes: true },
  teacher: { body: "fem", skin: "#e8b08c", top: "#f2f2f2", topStyle: "long", bottom: "#2f3a52", bottomStyle: "skirt", shoes: "#2a2a2a", hair: "bun", hairColor: "#3a2416", acc: ["glasses"], lashes: true },
  bully: { body: "masc", skin: "#f1c4a6", top: "#c0392b", topStyle: "tank", bottom: "#2b2b30", belt: "#1e1e1e", shoes: "#1e1e1e", sole: "#d9d9d9", hair: "short", hairColor: "#c8902e", scale: 1.08 },
};

// ---------------- init (environment light for metal/glass, once per engine) ----------------
let ENV_DONE = false;
export const rbxInit = (w: { scene: THREE.Scene; renderer: THREE.WebGLRenderer }, envIntensity = 0.35) => {
  if (ENV_DONE) return; ENV_DONE = true;
  // characters live on the NOINK layer (no ink lines); the sun's shadow camera must see that layer or they cast no shadow
  const sun = (w as any).sun as THREE.DirectionalLight | undefined;
  if (sun) sun.shadow.camera.layers.enable(NOINK);
  const pm = new THREE.PMREMGenerator(w.renderer);
  w.scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  (w.scene as any).environmentIntensity = envIntensity;
};

// ---------------- rigs (parsed once, cloned per character) ----------------
const RIGS: Record<string, Promise<THREE.Object3D>> = {};
const loadRig = (k: "masc" | "fem") => RIGS[k] ??= new Promise((res, rej) => {
  new GLTFLoader().parse(JSON.stringify(k === "fem" ? RIG_FEM : RIG_MASC), "", (g) => {
    const rig = g.scene.getObjectByName("Rig")!;
    rig.traverse((o) => { if (o.name.endsWith("_Att") || o.name.endsWith("_attachments")) o.visible = false; });
    rig.position.set(0, 0, 0); rig.updateMatrixWorld(true);
    res(rig);
  }, rej);
});
/** call (await) once in build() before rbxChar if build() is async; rbxChar also works sync after this */
export const rbxLoad = async () => { const [m, f] = await Promise.all([loadRig("masc"), loadRig("fem")]); LOADED.masc = m; LOADED.fem = f; };
const LOADED: Record<string, THREE.Object3D> = {};

// ---------------- head geometry (rounded cylinder, face mapped by arc length) ----------------
const R = 0.62, HH = 0.6, RC = 0.22;
const headProfile = (r = R, hh = HH, rc = RC) => {
  const pts: THREE.Vector2[] = [];
  const push = (x: number, y: number) => pts.push(new THREE.Vector2(Math.max(0.0001, x), y));
  for (let i = 0; i <= 6; i++) push((r - rc) * i / 6, -hh);
  for (let i = 1; i <= 10; i++) { const t = -Math.PI / 2 + Math.PI / 2 * i / 10; push(r - rc + Math.cos(t) * rc, -hh + rc + Math.sin(t) * rc); }
  for (let i = 1; i <= 12; i++) push(r, -hh + rc + (2 * hh - 2 * rc) * i / 12);
  for (let i = 1; i <= 10; i++) { const t = Math.PI / 2 * i / 10; push(r - rc + Math.cos(t) * rc, hh - rc + Math.sin(t) * rc); }
  for (let i = 1; i <= 6; i++) push((r - rc) * (1 - i / 6), hh);
  const acc = [0]; for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  return { pts, acc, L: acc[acc.length - 1] };
};
const HP = headProfile();
const headGeo = (() => {
  const g = new THREE.LatheGeometry(HP.pts, 64, Math.PI, Math.PI * 2);
  const uv = g.attributes.uv as THREE.BufferAttribute, np = HP.pts.length;
  for (let i = 0; i <= 64; i++) for (let j = 0; j < np; j++) uv.setY(i * np + j, HP.acc[j] / HP.L);
  g.computeVertexNormals(); return g;
})();
const sideV0 = ((R - RC) + Math.PI / 2 * RC) / HP.L;
const vOfY = (y: number) => sideV0 + (y - (-HH + RC)) / HP.L;
const uOfX = (x: number) => 0.5 + x / (2 * Math.PI * R);

// ---------------- faces: classic Roblox style ----------------
export type Expr = "smile" | "grin" | "happy" | "neutral" | "shock" | "sad" | "angry" | "determined" | "scared" | "smug" | "cry" | "sleep";
export const EXPRS: Expr[] = ["smile", "grin", "happy", "neutral", "shock", "sad", "angry", "determined", "scared", "smug", "cry", "sleep"];
const faceCache = new Map<string, THREE.CanvasTexture>();
/** mouth: 0 closed, 1 open (talking); blink: 0 open .. 1 closed */
export const faceTex = (expr: Expr, skin: string, lashes = false, mouth = 0, blink = 0) => {
  const m = mouth > 0.6 ? 2 : mouth > 0.25 ? 1 : 0, b = blink > 0.5 ? 1 : 0;
  const key = [expr, skin, lashes ? 1 : 0, m, b].join("|");
  let t = faceCache.get(key); if (t) return t;
  const c = document.createElement("canvas"); c.width = 1024; c.height = 512; const g = c.getContext("2d")!;
  g.fillStyle = skin; g.fillRect(0, 0, 1024, 512);
  const X = (x: number) => uOfX(x) * 1024, Y = (y: number) => (1 - vOfY(y)) * 512;
  const sxu = 1024 / (2 * Math.PI * R), syu = 512 / HP.L, INK = "#141010";
  const ell = (x: number, y: number, rx: number, ry: number, fill: string) => { g.beginPath(); g.ellipse(X(x), Y(y), rx * sxu, ry * syu, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
  const ring = (x: number, y: number, rx: number, ry: number, w: number) => { g.beginPath(); g.ellipse(X(x), Y(y), rx * sxu, ry * syu, 0, 0, Math.PI * 2); g.lineWidth = w; g.strokeStyle = INK; g.stroke(); };
  const path = (pts: number[][], w: number, fill: string | null = null) => { g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))); if (fill) { g.closePath(); g.fillStyle = fill; g.fill(); } if (w) { g.lineWidth = w; g.strokeStyle = INK; g.lineCap = "round"; g.lineJoin = "round"; g.stroke(); } };
  const quad = (a: number[], ctl: number[], bb: number[], w: number) => { g.beginPath(); g.moveTo(X(a[0]), Y(a[1])); g.quadraticCurveTo(X(ctl[0]), Y(ctl[1]), X(bb[0]), Y(bb[1])); g.lineWidth = w; g.strokeStyle = INK; g.lineCap = "round"; g.stroke(); };
  const ex = 0.17, ey = 0.04;
  const lash = (s: number, up = 0.085) => { if (!lashes) return; const x = s * ex; path([[x + s * 0.035, ey + up - 0.01], [x + s * 0.085, ey + up + 0.035]], 7); path([[x + s * 0.045, ey + up - 0.035], [x + s * 0.095, ey + up - 0.01]], 7); };
  const dots = () => { for (const s of [-1, 1]) { if (b) quad([s * ex - 0.055, ey], [s * ex, ey - 0.02], [s * ex + 0.055, ey], 8); else ell(s * ex, ey, 0.054, 0.086, INK); lash(s); } };
  const closedHappy = () => { for (const s of [-1, 1]) { quad([s * ex - 0.06, ey - 0.02], [s * ex, ey + 0.07], [s * ex + 0.06, ey - 0.02], 9); lash(s, 0.04); } };
  const brow = (s: number, inner: number, outer: number, w = 10) => path([[s * 0.1, inner], [s * 0.26, outer]], w);
  const grin = (w = 0.15, d = 0.12, y = -0.16, tongue = false) => {
    g.beginPath(); g.moveTo(X(-w), Y(y)); g.lineTo(X(w), Y(y)); g.quadraticCurveTo(X(w * 0.95), Y(y - d * 1.25), X(0), Y(y - d * 1.25)); g.quadraticCurveTo(X(-w * 0.95), Y(y - d * 1.25), X(-w), Y(y)); g.closePath();
    g.fillStyle = "#ffffff"; g.fill(); g.lineWidth = 7; g.strokeStyle = INK; g.lineJoin = "round"; g.stroke();
    if (tongue) ell(0, y - d * 0.95, w * 0.45, d * 0.22, "#e8707a");
  };
  const talkMouth = (k: number) => { if (k === 1) ell(0, -0.2, 0.06, 0.04, INK); else { ell(0, -0.21, 0.075, 0.075, INK); ell(0, -0.25, 0.045, 0.025, "#e8707a"); } };
  const mouthOr = (draw: () => void) => (m ? talkMouth(m) : draw());
  switch (expr) {
    case "neutral": dots(); mouthOr(() => path([[-0.07, -0.21], [0.07, -0.21]], 7)); break;
    case "happy": if (b) dots(); else closedHappy(); m ? talkMouth(2) : grin(0.15, 0.12, -0.16, true); break;
    case "grin": dots(); m ? talkMouth(2) : grin(0.16, 0.12, -0.16); break;
    case "shock": case "scared":
      for (const s of [-1, 1]) { if (b) { quad([s * ex - 0.06, ey], [s * ex, ey - 0.02], [s * ex + 0.06, ey], 8); continue; } ell(s * ex, ey, 0.075, 0.1, "#ffffff"); ring(s * ex, ey, 0.075, 0.1, 6); ell(s * ex, ey, 0.022, 0.032, INK); lash(s, 0.1); }
      if (expr === "scared") { brow(-1, 0.2, 0.15, 9); brow(1, 0.2, 0.15, 9); path([[-0.09, -0.23], [-0.045, -0.2], [0, -0.23], [0.045, -0.2], [0.09, -0.23]], 6); }
      else { brow(-1, 0.21, 0.23, 8); brow(1, 0.21, 0.23, 8); m ? talkMouth(2) : ell(0, -0.22, 0.04, 0.055, INK); }
      break;
    case "sad": case "cry":
      dots(); brow(-1, 0.18, 0.13, 9); brow(1, 0.18, 0.13, 9);
      mouthOr(() => quad([-0.07, -0.23], [0, -0.18], [0.07, -0.23], 7));
      ell(-0.17, -0.07, 0.022, 0.04, "#8fd3ff"); if (expr === "cry") { ell(0.17, -0.09, 0.02, 0.05, "#8fd3ff"); ell(-0.17, -0.16, 0.018, 0.035, "#8fd3ff"); }
      break;
    case "angry": dots(); brow(-1, 0.12, 0.19, 12); brow(1, 0.12, 0.19, 12); mouthOr(() => quad([-0.08, -0.24], [0, -0.18], [0.08, -0.24], 8)); break;
    case "determined": dots(); brow(-1, 0.13, 0.17, 10); brow(1, 0.13, 0.17, 10); mouthOr(() => quad([-0.06, -0.2], [0.03, -0.23], [0.09, -0.18], 7)); break;
    case "smug": dots(); brow(-1, 0.16, 0.18, 9); brow(1, 0.2, 0.15, 9); mouthOr(() => quad([-0.04, -0.2], [0.05, -0.22], [0.1, -0.15], 7)); break;
    case "sleep": for (const s of [-1, 1]) quad([s * ex - 0.055, ey], [s * ex, ey - 0.03], [s * ex + 0.055, ey], 8); path([[-0.04, -0.21], [0.04, -0.21]], 6); break;
    default: dots(); mouthOr(() => quad([-0.09, -0.17], [0, -0.25], [0.09, -0.17], 7));
  }
  t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  faceCache.set(key, t); return t;
};

// ---------------- materials ----------------
const matCache = new Map<string, THREE.MeshStandardMaterial>();
export const plastic = (c: string, rough = 0.62, metal = 0) => {
  const k = c + rough + metal; let m = matCache.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }); matCache.set(k, m); }
  return m;
};
const shadowed = <T extends THREE.Object3D>(o: T) => { o.traverse((x: any) => { if (x.isMesh) { x.castShadow = true; x.receiveShadow = true; } }); return o; };

// ---------------- hair & accessories ----------------
const capOf = (r = R + 0.05, hh = HH + 0.07, rc = RC + 0.05, cut = 0.3) => {
  const cp = headProfile(r, hh, rc); const pts = cp.pts.filter((p) => p.y >= cut); pts.unshift(new THREE.Vector2(r, cut));
  return new THREE.LatheGeometry(pts, 64);
};
const backPanel = (bottom: number, top = 0.32, r = R + 0.05, openFront = 0.8) =>
  new THREE.LatheGeometry([new THREE.Vector2(r, bottom), new THREE.Vector2(r, top)], 48, (Math.PI * openFront) / 2, Math.PI * 2 - Math.PI * openFront);

const buildHair = (o: Outfit) => {
  const grp = new THREE.Group();
  const hm = plastic(o.hairColor, 0.45), tm = plastic(o.hairTip ?? o.hairColor, 0.45);
  const add = (m: THREE.Mesh) => { grp.add(m); return m; };
  const back = (bottom: number) => { const m = add(new THREE.Mesh(backPanel(bottom), hm.clone())); (m.material as THREE.Material).side = THREE.DoubleSide; };
  const locks = (len = 0.4, y = 0.1) => { for (const s of [-1, 1]) { const m = add(new THREE.Mesh(new THREE.BoxGeometry(0.1, len, 0.24), hm)); m.position.set(s * (R + 0.02), y, 0.24); m.rotation.y = s * 0.5; } };
  const bang = (x: number, w: number, h: number, rz: number, y = 0.42) => {
    const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0.03, -h); sh.closePath();
    const m = add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.015, bevelSegments: 2 }), hm));
    m.position.set(x, y, R - 0.02); m.rotation.z = rz;
  };
  const spike = (x: number, y: number, z: number, r: number, h: number, rx: number, rz: number, ry = 0, flat = 0.6) => {
    const s = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r, h * 0.68, 8), hm); base.position.y = h * 0.34; s.add(base);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(r * 0.38, h * 0.36, 8), tm); tip.position.y = h * 0.86; s.add(tip);
    s.scale.set(1, 1, flat); s.position.set(x, y, z); s.rotation.set(rx, ry, rz); grp.add(s);
  };
  const top = HH + 0.02;
  if (o.hair !== "bald") add(new THREE.Mesh(capOf(), hm));
  switch (o.hair) {
    case "spiky":
      back(-0.45); locks();
      spike(0.02, top, 0.12, 0.34, 0.66, -0.55, -0.15, 0, 0.7); spike(-0.3, top - 0.03, 0.08, 0.3, 0.56, -0.45, 0.45, 0.3); spike(0.32, top - 0.03, 0.05, 0.3, 0.6, -0.5, -0.6, -0.3);
      spike(0.0, top - 0.02, -0.25, 0.32, 0.6, -1.05, 0.05, 0, 0.7); spike(-0.33, top - 0.08, -0.3, 0.28, 0.5, -1.15, 0.55, 0.4); spike(0.34, top - 0.08, -0.3, 0.28, 0.52, -1.15, -0.55, -0.4);
      spike(0.0, top - 0.25, -0.5, 0.3, 0.45, -1.6, 0.0, 0, 0.7); spike(-0.05, top - 0.02, 0.36, 0.32, 0.62, 0.35, -0.75, 0.2, 0.55); spike(0.22, top - 0.04, 0.34, 0.26, 0.5, 0.2, -1.05, 0.2, 0.55);
      bang(-0.33, 0.26, 0.15, -0.35); bang(-0.1, 0.26, 0.13, -0.3); bang(0.33, 0.24, 0.12, 0.3);
      break;
    case "short": case "cap":
      back(-0.3); locks(0.32, 0.12);
      bang(-0.3, 0.3, 0.12, -0.25); bang(-0.02, 0.32, 0.13, -0.15); bang(0.28, 0.3, 0.11, 0.2);
      if (o.hair === "cap") {
        const cm = plastic(o.cap ?? "#d63a3a", 0.55);
        const dome = add(new THREE.Mesh(capOf(R + 0.09, HH + 0.1, RC + 0.07, 0.28), cm)); dome.position.y = 0.02;
        const visor = add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.05, 0.5), cm)); visor.position.set(0, 0.36, R + 0.25); visor.rotation.x = 0.12;
      }
      break;
    case "long": case "ponytail": case "bun": {
      const long = o.hair === "long";
      const bm = add(new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(R + 0.12, long ? -1.25 : -0.35), new THREE.Vector2(R + 0.07, 0.32)], 48, (Math.PI * 0.72) / 2, Math.PI * 2 - Math.PI * 0.72), hm.clone()));
      (bm.material as THREE.Material).side = THREE.DoubleSide;
      if (long) for (const s of [-1, 1]) { const m = add(new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 0.3), hm)); m.position.set(s * (R + 0.03), -0.25, 0.3); m.rotation.y = s * 0.35; }
      else locks(0.4, 0.08);
      const sh = new THREE.Shape(); sh.moveTo(-0.55, 0); sh.lineTo(0.5, 0); sh.quadraticCurveTo(0.1, -0.05, -0.55, -0.2); sh.closePath();
      const fr = add(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }), hm)); fr.position.set(0, 0.47, R - 0.02);
      if (o.hair === "ponytail") { const p = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.7, 6, 12), hm)); p.position.set(0, 0.1, -R - 0.18); p.rotation.x = 0.35; }
      if (o.hair === "bun") { const p = add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 20, 14), hm)); p.position.set(0, HH + 0.12, -0.25); }
      break;
    }
    case "bald": for (const s of [-1, 1]) { const m = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.5), hm)); m.position.set(s * (R + 0.01), 0.05, -0.15); } break;
  }
  // accessories
  for (const a of o.acc ?? []) {
    if (a === "goggles") {
      const gl = o.goggle ?? { leather: "#8a5530", brass: "#d9a441" };
      const leather = plastic(gl.leather, 0.75), brass = plastic(gl.brass, 0.28, 0.85);
      const glass = new THREE.MeshPhysicalMaterial({ color: "#9fe9ea", roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.05, emissive: "#1d6f75", emissiveIntensity: 0.35 });
      const sy = 0.47;
      const band = add(new THREE.Mesh(new THREE.CylinderGeometry(R + 0.1, R + 0.1, 0.15, 64, 1, true), leather.clone())); (band.material as THREE.Material).side = THREE.DoubleSide; band.position.y = sy;
      for (const dy of [0.05, -0.05]) { const st = add(new THREE.Mesh(new THREE.TorusGeometry(R + 0.103, 0.006, 4, 96), plastic("#f0d9a8"))); st.rotation.x = Math.PI / 2; st.position.y = sy + dy; }
      for (const s of [-1, 1]) { const bk = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.17, 0.12), brass)); bk.position.set(s * (R + 0.11), sy, -0.05); }
      const gog = new THREE.Group();
      for (const s of [-1, 1]) {
        const cup = new THREE.Group();
        const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.17, 40), leather); shell.rotation.x = Math.PI / 2; cup.add(shell);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.035, 16, 48), brass); ring.position.z = 0.09; cup.add(ring);
        const lens = new THREE.Mesh(new THREE.SphereGeometry(0.16, 40, 20, 0, Math.PI * 2, 0, 0.62), glass); lens.rotation.x = Math.PI / 2; lens.scale.set(1, 0.65, 1); cup.add(lens);
        const gl1 = new THREE.Mesh(new THREE.CircleGeometry(0.035, 12), new THREE.MeshBasicMaterial({ color: "#ffffff" })); gl1.position.set(-0.05, 0.05, 0.11); cup.add(gl1);
        for (let k = 0; k < 6; k++) { const an = (k / 6) * Math.PI * 2 + 0.3; const rv = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), brass); rv.position.set(Math.cos(an) * 0.155, Math.sin(an) * 0.155, 0.12); cup.add(rv); }
        cup.position.set(s * 0.2, 0, 0); gog.add(cup);
      }
      const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.022, 10, 20, Math.PI), brass); bridge.position.set(0, 0.03, 0.02); gog.add(bridge);
      gog.position.set(0, sy + 0.05, R + 0.12); gog.rotation.x = -0.32; grp.add(gog);
    }
    if (a === "glasses") {
      const fm = plastic("#1a1a1a", 0.4);
      for (const s of [-1, 1]) { const r = add(new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.018, 8, 32), fm)); r.position.set(s * 0.17, 0.04, R + 0.03); }
      const br = add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.025), fm)); br.position.set(0, 0.06, R + 0.03);
      for (const s of [-1, 1]) { const arm = add(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.6), fm)); arm.position.set(s * (R + 0.01), 0.06, 0.32); }
    }
    if (a === "bow") {
      const bm = plastic(o.accColor ?? "#e86a8a", 0.5);
      for (const s of [-1, 1]) { const wng = add(new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.26, 4), bm)); wng.rotation.z = (s * Math.PI) / 2; wng.position.set(0.32 + s * 0.13, HH + 0.08, 0.2); }
      const k = add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), bm)); k.position.set(0.32, HH + 0.08, 0.2);
    }
    if (a === "headband") { const hb = add(new THREE.Mesh(new THREE.CylinderGeometry(R + 0.07, R + 0.07, 0.09, 64, 1, true), plastic(o.accColor ?? "#e04a3a"))); (hb.material as THREE.Material).side = THREE.DoubleSide; hb.position.y = 0.36; }
    if (a === "moustache") { const mm = add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.07, 0.05), plastic(o.hairColor, 0.5))); mm.position.set(0, -0.12, R + 0.01); }
    if (a === "beard") { const bd = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.3, 0.4), plastic(o.hairColor, 0.5))); bd.position.set(0, -0.42, R - 0.12); }
  }
  return shadowed(grp);
};

// ---------------- poses (R15 joints, radians, rig space: +x on an arm joint = arm forward) ----------------
export type Pose = Partial<Record<string, [number, number, number]>> & { _drop?: number };
export const POSES: Record<string, Pose> = {
  stand: {},
  relax: { LeftUpperArm: [0, 0, -0.1], RightUpperArm: [0, 0, 0.1], LeftLowerArm: [0.25, 0, 0], RightLowerArm: [0.25, 0, 0], LeftUpperLeg: [0, 0, -0.03], RightUpperLeg: [0, 0, 0.03] },
  wave: { LeftUpperArm: [0, 0, -0.1], RightUpperArm: [0, 0, 2.75], LeftLowerArm: [0.25, 0, 0] },
  point: { LeftUpperArm: [0, 0, -0.1], RightUpperArm: [1.45, 0, 0.1], RightLowerArm: [0.1, 0, 0], LeftLowerArm: [0.25, 0, 0] },
  cheer: { LeftUpperArm: [0, 0, -2.7], RightUpperArm: [0, 0, 2.7], LeftLowerArm: [0, 0, -0.3], RightLowerArm: [0, 0, 0.3] },
  shock: { LeftUpperArm: [0.4, 0, -0.9], RightUpperArm: [0.4, 0, 0.9], LeftLowerArm: [1.1, 0, 0], RightLowerArm: [1.1, 0, 0], LeftUpperLeg: [0, 0, -0.08], RightUpperLeg: [0, 0, 0.08] },
  scared: { LeftUpperArm: [1.0, 0, -0.3], RightUpperArm: [1.0, 0, 0.3], LeftLowerArm: [1.4, 0, 0.2], RightLowerArm: [1.4, 0, -0.2], LeftUpperLeg: [0.15, 0, 0], RightLowerLeg: [-0.3, 0, 0], RightUpperLeg: [0.3, 0, 0] },
  think: { LeftUpperArm: [0.5, 0, -0.1], LeftLowerArm: [1.9, 0, 0.3], RightUpperArm: [0.6, 0, 0.15], RightLowerArm: [1.4, 0, -0.6] },
  armsCrossed: { LeftUpperArm: [0.45, 0, -0.05], RightUpperArm: [0.45, 0, 0.05], LeftLowerArm: [1.5, 0, 0.9], RightLowerArm: [1.5, 0, -0.9] },
  reach: { RightUpperArm: [1.6, 0, 0.0], LeftUpperArm: [1.6, 0, 0.0], RightLowerArm: [0.1, 0, 0], LeftLowerArm: [0.1, 0, 0], LeftUpperLeg: [0.3, 0, 0], LeftLowerLeg: [-0.3, 0, 0] },
  sit: { LeftUpperLeg: [1.57, 0, -0.05], RightUpperLeg: [1.57, 0, 0.05], LeftLowerLeg: [-1.57, 0, 0], RightLowerLeg: [-1.57, 0, 0], LeftUpperArm: [0.3, 0, -0.05], RightUpperArm: [0.3, 0, 0.05], LeftLowerArm: [0.6, 0, 0], RightLowerArm: [0.6, 0, 0], _drop: 0.95 },
};
/** walking / running cycle: phase 0..1 per two steps (motion.walk().phase), amp 1 = walk, 1.6 = run */
export const walkPose = (phase: number, amp = 1): Pose => {
  const s = Math.sin(phase * Math.PI * 2), c = Math.cos(phase * Math.PI * 2);
  const L = 0.5 * amp, A = 0.45 * amp;
  return {
    LeftUpperLeg: [L * s, 0, -0.02], RightUpperLeg: [-L * s, 0, 0.02],
    LeftLowerLeg: [-0.7 * amp * Math.max(0, -c), 0, 0], RightLowerLeg: [-0.7 * amp * Math.max(0, c), 0, 0],
    LeftUpperArm: [-A * s, 0, -0.08], RightUpperArm: [A * s, 0, 0.08], LeftLowerArm: [0.35 * amp, 0, 0], RightLowerArm: [0.35 * amp, 0, 0],
    UpperTorso: [0.05 * amp * (amp > 1.2 ? 2 : 1), 0, 0],
    _drop: -0.06 * amp * Math.abs(c),
  };
};
/** blend two poses (t 0..1) */
export const mixPose = (a: Pose, b: Pose, t: number): Pose => {
  const out: Pose = {}, keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (k === "_drop") { out._drop = (a._drop ?? 0) * (1 - t) + (b._drop ?? 0) * t; continue; }
    const p = (a as any)[k] ?? [0, 0, 0], q = (b as any)[k] ?? [0, 0, 0];
    (out as any)[k] = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
  }
  return out;
};
const snapE = (t: number) => { t = Math.max(0, Math.min(1, t)); return 1 - Math.pow(1 - t, 5); };
/** pose timeline: keys [{f, pose}] -> the pose at frame f; each change SNAPS in over `dur` frames (default 6) then holds */
export const poseAt = (f: number, keys: { f: number; pose: string | Pose; dur?: number }[]): Pose => {
  const P = (p: string | Pose) => (typeof p === "string" ? POSES[p] ?? {} : p);
  let cur: Pose = P(keys[0]?.pose ?? "relax");
  for (let i = 1; i < keys.length; i++) {
    const k = keys[i]; if (f < k.f) break;
    cur = mixPose(cur, P(k.pose), snapE((f - k.f) / (k.dur ?? 6)));
  }
  return cur;
};
/** tiny breathing so holds are never dead still (arms only, no sway: the kit's rule against trembling) */
export const breathe = (f: number, seed = 1): Pose => {
  const t = f / 30, b = Math.sin(t * 2.1 + seed * 1.7) * 0.025;
  return { LeftUpperArm: [0, 0, -b], RightUpperArm: [0, 0, b], UpperTorso: [b * 0.4, 0, 0] };
};
const addPose = (a: Pose, b: Pose): Pose => {
  const out: any = { ...a };
  for (const [k, v] of Object.entries(b)) { if (k === "_drop") { out._drop = (a._drop ?? 0) + (v as any); continue; } const p = (a as any)[k] ?? [0, 0, 0]; out[k] = [p[0] + (v as any)[0], p[1] + (v as any)[1], p[2] + (v as any)[2]]; }
  return out;
};

// ---------------- the character ----------------
const JOINTS = ["UpperTorso", "LeftUpperArm", "RightUpperArm", "LeftLowerArm", "RightLowerArm", "LeftHand", "RightHand", "LeftUpperLeg", "RightUpperLeg", "LeftLowerLeg", "RightLowerLeg", "LeftFoot", "RightFoot"];
export type CharState = {
  at: V3; face?: number;            // yaw degrees (0 = facing +Z)
  pose?: string | Pose;             // named pose or joint map (use poseAt / walkPose / mixPose)
  expr?: Expr; blink?: number; talk?: number;
  look?: number;                    // head yaw degrees (+ = toward the character's left)
  nod?: number;                     // head pitch degrees (+ = down)
  tilt?: number;                    // whole-body lean degrees (sideways)
  lean?: number;                    // whole-body lean degrees (forward)
  scale?: number; visible?: boolean;
  f?: number; breathe?: number;     // pass f to get a tiny breathing motion in holds; breathe = seed (0 = off)
};
export type RbxChar = { root: THREE.Group; outfit: Outfit; set: (s: CharState) => void; joint: (n: string) => THREE.Object3D | undefined; headTop: () => number };

export const rbxChar = (parent: THREE.Object3D, o: Outfit): RbxChar => {
  const kind = o.body === "fem" ? "fem" : "masc";
  const src = LOADED[kind]; if (!src) throw new Error("rbx: call `await rbxLoad()` at the start of build() (make build async)");
  const rig = src.clone(true);
  const skin = o.skin ?? "#ffd9cf";
  const root = new THREE.Group(); root.name = "rbx";
  const holder = new THREE.Group(); holder.rotation.y = Math.PI; holder.add(rig); root.add(holder);
  rig.updateMatrixWorld(true);
  // part meshes
  const geos: Record<string, THREE.Mesh> = {};
  rig.traverse((x: any) => { if (!x.isMesh || !x.visible) return; const nm = (x.name.endsWith("_Geo") ? x.name : x.parent?.name || "").replace("_Geo", ""); if (nm) geos[nm] = x; });
  const bb = new THREE.Box3(); for (const g of Object.values(geos)) bb.expandByObject(g);
  rig.position.y = -bb.min.y; rig.updateMatrixWorld(true);
  const st = o.topStyle ?? "tshirt", bs = o.bottomStyle ?? "pants";
  const colorOf = (nm: string) => {
    if (nm === "UpperTorso") return o.top;
    if (nm === "LowerTorso") return st === "dress" ? o.top : o.bottom;
    if (nm.endsWith("UpperArm")) return st === "long" || (st === "tshirt" && o.pad) ? o.sleeve ?? o.top : skin;
    if (nm.endsWith("LowerArm")) return st === "long" ? o.sleeve ?? o.top : skin;
    if (nm.endsWith("Hand")) return skin;
    if (nm.endsWith("UpperLeg")) return bs === "pants" && st !== "dress" ? o.bottom : bs === "shorts" ? o.bottom : skin;
    if (nm.endsWith("LowerLeg")) return bs === "pants" && st !== "dress" ? o.bottom : skin;
    if (nm.endsWith("Foot")) return o.shoes;
    return "#a3a2a5";
  };
  for (const [nm, g] of Object.entries(geos)) { g.material = plastic(colorOf(nm)); g.castShadow = true; g.receiveShadow = true; }
  // overlay glued to a part, built in its joint node's space from the mesh's local bbox
  const over = (nm: string, color: string, grow = 0.04, y0 = 0, y1 = 1, rough = 0.62) => {
    const g = geos[nm]; if (!g) return null;
    const geoObj = g.name.endsWith("_Geo") ? g : (g.parent as THREE.Object3D), node = geoObj.parent as THREE.Object3D;
    g.geometry.computeBoundingBox();
    const box = g.geometry.boundingBox!.clone().applyMatrix4(g.matrix);
    if (geoObj !== g) box.applyMatrix4(geoObj.matrix);
    const sz = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const me = new THREE.Mesh(new THREE.BoxGeometry(sz.x + grow, sz.y * (y1 - y0), sz.z + grow), plastic(color, rough));
    me.position.set(c.x, box.min.y + sz.y * (y0 + y1) / 2, c.z); me.castShadow = true; node.add(me);
    return { me, box, node };
  };
  const ut = over("UpperTorso", o.top, 0, 0, 0.001)!; ut.me.visible = false;
  const usz = ut.box.getSize(new THREE.Vector3()), uc = ut.box.getCenter(new THREE.Vector3());
  if (o.strap) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.26, usz.y * 1.45, usz.z + 0.06), plastic(o.strap)); s.position.set(uc.x + 0.05, uc.y + 0.02, uc.z); s.rotation.z = -0.72; s.castShadow = true; ut.node.add(s); }
  if (o.vneck) { const v = new THREE.Mesh(new THREE.CircleGeometry(0.28, 3), plastic(skin)); v.rotation.set(0, Math.PI, -Math.PI / 2); v.position.set(uc.x - 0.02, ut.box.max.y - 0.2, ut.box.min.z - 0.031); ut.node.add(v); }
  if (o.belt) over("LowerTorso", o.belt, 0.05, 0.45, 1.0);
  for (const side of ["Left", "Right"]) {
    if (o.pad) over(side + "UpperArm", o.pad, 0.05, 0.8, 1.0);
    if (o.wrist) over(side + "LowerArm", o.wrist, 0.06, 0.0, 0.3);
    if (o.sole) over(side + "Foot", o.sole, 0.06, 0.0, 0.45);
    if (o.socks) over(side + "LowerLeg", o.socks, 0.04, 0.0, 0.45);
    if (st === "tshirt" && !o.pad) over(side + "UpperArm", o.sleeve ?? o.top, 0.04, 0.5, 1.0);
  }
  if (bs === "skirt" || st === "dress") {
    const lt = over("LowerTorso", o.bottom, 0, 0, 0.001)!; lt.me.visible = false;
    const top = lt.box.max.y, bot = lt.box.min.y - 0.65, w = lt.box.max.x - lt.box.min.x, d = lt.box.max.z - lt.box.min.z;
    const g = new THREE.BoxGeometry(1, 1, 1), pp = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pp.count; i++) { const k = pp.getY(i) < 0 ? 1.22 : 1; pp.setX(i, pp.getX(i) * k); pp.setZ(i, pp.getZ(i) * k); }
    g.computeVertexNormals();
    const sk = new THREE.Mesh(g, plastic(st === "dress" ? o.top : o.bottom)); sk.scale.set(w + 0.08, top - bot, d + 0.08);
    sk.position.set((lt.box.max.x + lt.box.min.x) / 2, (top + bot) / 2, (lt.box.max.z + lt.box.min.z) / 2); sk.castShadow = true; lt.node.add(sk);
  }
  // head on a neck pivot under UpperTorso
  const neck = new THREE.Group(); neck.position.set(0, ut.box.max.y, 0); ut.node.add(neck);
  const head = new THREE.Group(); head.rotation.y = Math.PI; head.position.y = HH + 0.02; neck.add(head);
  const faceMat = new THREE.MeshStandardMaterial({ map: faceTex("smile", skin, !!o.lashes), roughness: 0.6 });
  const headMesh = new THREE.Mesh(headGeo, faceMat); headMesh.castShadow = true; headMesh.receiveShadow = true; head.add(headMesh);
  head.add(buildHair(o));
  // characters have no ink lines (Roblox look): keep them off the ink pass
  root.traverse((x) => x.layers.set(NOINK));
  shadowed(root);
  parent.add(root);
  const joints: Record<string, THREE.Object3D> = {};
  for (const n of JOINTS) { const j = rig.getObjectByName(n); if (j) { joints[n] = j; (j as any).userData.rest = j.rotation.clone(); } }
  const baseY = rig.position.y;
  const set = (s: CharState) => {
    root.visible = s.visible !== false;
    const sc = s.scale ?? o.scale ?? 1;
    root.position.set(s.at[0], s.at[1], s.at[2]); root.scale.setScalar(sc);
    root.rotation.set(THREE.MathUtils.degToRad(s.lean ?? 0), THREE.MathUtils.degToRad(s.face ?? 0), THREE.MathUtils.degToRad(s.tilt ?? 0), "YXZ");
    let pose: Pose = typeof s.pose === "string" ? POSES[s.pose] ?? {} : s.pose ?? POSES.relax;
    if (s.f !== undefined && (s.breathe ?? 1) !== 0) pose = addPose(pose, breathe(s.f, s.breathe ?? 1));
    for (const [n, j] of Object.entries(joints)) { const r = (pose as any)[n], rest = (j as any).userData.rest as THREE.Euler; j.rotation.set(rest.x + (r?.[0] ?? 0), rest.y + (r?.[1] ?? 0), rest.z + (r?.[2] ?? 0)); }
    rig.position.y = baseY - (pose._drop ?? 0);
    neck.rotation.set(THREE.MathUtils.degToRad(s.nod ?? 0) * -1, THREE.MathUtils.degToRad(s.look ?? 0), 0);
    faceMat.map = faceTex(s.expr ?? "smile", skin, !!o.lashes, s.talk ?? 0, s.blink ?? 0);
  };
  set({ at: [0, 0, 0] });
  const headTop = () => { root.updateMatrixWorld(true); return new THREE.Box3().setFromObject(head).max.y; };
  return { root, outfit: o, set, joint: (n) => joints[n], headTop };
};

// ---------------- extras: random outfits (deterministic by seed) ----------------
const pick = <T,>(a: T[], h: number) => a[Math.floor(h * a.length) % a.length];
const hsh = (a: number, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
export const randomOutfit = (seed: number, opt: { body?: "masc" | "fem"; kid?: boolean } = {}): Outfit => {
  const h = (k: number) => hsh(seed, k);
  const body = opt.body ?? (h(1) < 0.5 ? "masc" : "fem");
  const skins = ["#ffd9cf", "#f6cbb0", "#e8b08c", "#c98d64", "#9a6544", "#6b4430"];
  const tops = ["#e04a3a", "#3a7bd5", "#2fa36b", "#f2c230", "#8e5cc2", "#f08bb0", "#f2f2f2", "#3b4352", "#e88a2a", "#1fa3a3"];
  const bottoms = ["#2f3a52", "#3b5b9a", "#2b2b30", "#5b5f6b", "#7a5a3a", "#1f4f8a"];
  const hairC = ["#1e1612", "#3a2416", "#6b3a22", "#c8902e", "#e6c27a", "#8a3a22", "#d0d0d0"];
  const fem = body === "fem";
  return {
    body, skin: pick(skins, h(2)), top: pick(tops, h(3)), topStyle: pick(["tshirt", "tshirt", "long", "tank"] as const, h(4)),
    bottom: pick(bottoms, h(5)), bottomStyle: fem ? pick(["pants", "skirt", "shorts"] as const, h(6)) : pick(["pants", "pants", "shorts"] as const, h(6)),
    shoes: pick(["#2a2a2a", "#f2f2f2", "#7a4a2a", "#e04a3a", "#3a7bd5"], h(7)), sole: h(8) < 0.5 ? "#f2f2f2" : undefined,
    hair: fem ? pick(["long", "ponytail", "bun", "long"] as const, h(9)) : pick(["short", "short", "cap", "spiky", "bald"] as const, h(9)),
    hairColor: pick(hairC, h(10)), cap: pick(tops, h(11)), lashes: fem, acc: h(12) < 0.15 ? ["glasses"] : [],
    scale: opt.kid ? 0.8 : 0.95 + h(13) * 0.1,
  };
};

// ---------------- Roblox-style world helpers (standard materials, no painted look) ----------------
const texCache = new Map<string, THREE.CanvasTexture>();
const canvasTex = (key: string, draw: (g: CanvasRenderingContext2D, s: number) => void, size = 256) => {
  let t = texCache.get(key); if (t) return t;
  const c = document.createElement("canvas"); c.width = c.height = size; draw(c.getContext("2d")!, size);
  t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  texCache.set(key, t); return t;
};
const noiseFill = (g: CanvasRenderingContext2D, s: number, base: string, amp: number, n = 2200) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) { const v = Math.random() < 0.5 ? 0 : 255; g.fillStyle = `rgba(${v},${v},${v},${Math.random() * amp})`; g.fillRect(Math.random() * s, Math.random() * s, 2, 2); }
};
export type RbxMaterial = "plastic" | "smooth" | "wood" | "planks" | "brick" | "concrete" | "grass" | "sand" | "metal" | "neon" | "glass" | "fabric" | "studs" | "tile";
const kindTex = (kind: RbxMaterial) => {
  switch (kind) {
    case "wood": return canvasTex("wood", (g, s) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, s, s); for (let y = 0; y < s; y += 3) { g.fillStyle = `rgba(80,50,20,${0.05 + 0.08 * Math.abs(Math.sin(y * 0.11))})`; g.fillRect(0, y, s, 2); } });
    case "planks": return canvasTex("planks", (g, s) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, s, s); for (let y = 0; y < s; y += s / 4) { g.fillStyle = "rgba(60,35,15,0.35)"; g.fillRect(0, y, s, 3); const o = (y / (s / 4)) % 2 ? s / 2 : 0; g.fillRect(o, y, 3, s / 4); for (let k = 0; k < 6; k++) { g.fillStyle = "rgba(80,50,20,0.06)"; g.fillRect(0, y + 6 + k * 9, s, 2); } } });
    case "brick": return canvasTex("brick", (g, s) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, s, s); const bh = s / 8; for (let r = 0; r < 8; r++) { const o = r % 2 ? s / 8 : 0; for (let x = -s / 4; x < s; x += s / 4) { g.fillStyle = `rgba(0,0,0,${0.03 + Math.random() * 0.07})`; g.fillRect(x + o + 2, r * bh + 2, s / 4 - 4, bh - 4); } g.fillStyle = "rgba(255,255,255,0.55)"; g.fillRect(0, r * bh, s, 2); } });
    case "concrete": return canvasTex("concrete", (g, s) => noiseFill(g, s, "#ffffff", 0.08, 5000));
    case "grass": return canvasTex("grass", (g, s) => { noiseFill(g, s, "#ffffff", 0.12, 6000); for (let i = 0; i < 400; i++) { g.strokeStyle = "rgba(0,60,0,0.12)"; g.beginPath(); const x = Math.random() * s, y = Math.random() * s; g.moveTo(x, y); g.lineTo(x + Math.random() * 3 - 1.5, y - 5); g.stroke(); } });
    case "sand": return canvasTex("sand", (g, s) => noiseFill(g, s, "#ffffff", 0.1, 8000));
    case "fabric": return canvasTex("fabric", (g, s) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, s, s); for (let i = 0; i < s; i += 4) { g.fillStyle = "rgba(0,0,0,0.05)"; g.fillRect(i, 0, 1, s); g.fillRect(0, i, s, 1); } });
    case "tile": return canvasTex("tile", (g, s) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, s, s); g.fillStyle = "rgba(0,0,0,0.18)"; for (let i = 0; i <= s; i += s / 4) { g.fillRect(i - 1, 0, 3, s); g.fillRect(0, i - 1, s, 3); } });
    case "studs": return canvasTex("studs", (g, s) => { g.fillStyle = "#ffffff"; g.fillRect(0, 0, s, s); const n = 4, st = s / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const cx = (i + 0.5) * st, cy = (j + 0.5) * st; g.fillStyle = "rgba(0,0,0,0.14)"; g.beginPath(); g.arc(cx + 2, cy + 3, st * 0.3, 0, 7); g.fill(); g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.arc(cx - 1, cy - 1, st * 0.28, 0, 7); g.fill(); } });
    default: return null;
  }
};
const partMatCache = new Map<string, THREE.Material>();
/** Roblox-like material: colour + kind. tile = studs per texture repeat. */
export const rbxMat = (color: string, kind: RbxMaterial = "plastic") => {
  const k = color + kind; let m = partMatCache.get(k); if (m) return m;
  if (kind === "neon") m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.4 });
  else if (kind === "glass") m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.05, transmission: 0, transparent: true, opacity: 0.45, clearcoat: 1 });
  else if (kind === "metal") m = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.8 });
  else m = new THREE.MeshStandardMaterial({ color, map: kindTex(kind), roughness: kind === "smooth" ? 0.35 : kind === "plastic" || kind === "studs" ? 0.55 : 0.85 });
  partMatCache.set(k, m); return m;
};
/** a Roblox Part: box standing on `at` (bottom centre), texture repeating every `tile` studs */
export const part = (parent: THREE.Object3D, size: V3, at: V3, color: string, o: { kind?: RbxMaterial; rotY?: number; tile?: number; shadow?: boolean } = {}) => {
  const [w, h, d] = size, g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
  const tile = o.tile ?? (o.kind === "brick" ? 4 : o.kind === "planks" ? 4 : o.kind === "studs" ? 4 : 8);
  const uv = g.attributes.uv as THREE.BufferAttribute, dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile); }
  const m = new THREE.Mesh(g, rbxMat(color, o.kind ?? "plastic")); m.position.set(...at); m.rotation.y = o.rotY ?? 0;
  m.castShadow = o.shadow ?? true; m.receiveShadow = true; parent.add(m); return m;
};
export const cylPart = (parent: THREE.Object3D, r: number, h: number, at: V3, color: string, kind: RbxMaterial = "plastic") => {
  const g = new THREE.CylinderGeometry(r, r, h, 24); g.translate(0, h / 2, 0);
  const m = new THREE.Mesh(g, rbxMat(color, kind)); m.position.set(...at); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
};
export const ballPart = (parent: THREE.Object3D, r: number, at: V3, color: string, kind: RbxMaterial = "plastic") => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), rbxMat(color, kind)); m.position.set(...at); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
};
/** wedge (ramp/roof half): rises along +z */
export const wedge = (parent: THREE.Object3D, size: V3, at: V3, color: string, o: { kind?: RbxMaterial; rotY?: number } = {}) => {
  const [w, h, d] = size, s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(d / 2, h); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(w / 2, 0, 0);
  const m = new THREE.Mesh(g, rbxMat(color, o.kind ?? "plastic")); m.position.set(...at); m.rotation.y = o.rotY ?? 0; m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
};
/** baseplate: big flat ground */
export const baseplate = (parent: THREE.Object3D, size = 400, color = "#5fa84a", kind: RbxMaterial = "grass", tile = 16) =>
  part(parent, [size, 1, size], [0, -1, 0], color, { kind, tile, shadow: false });
/** a simple Roblox suburban house: walls, windows, door, gable roof. Front faces +z (rotate with rotY). */
export const rbxHouse = (parent: THREE.Object3D, o: { at: V3; w?: number; h?: number; d?: number; rotY?: number; wall?: string; roof?: string; trim?: string; door?: string; kind?: RbxMaterial }) => {
  const g = new THREE.Group(); g.position.set(...o.at); g.rotation.y = o.rotY ?? 0; parent.add(g);
  const w = o.w ?? 14, h = o.h ?? 9, d = o.d ?? 12, wall = o.wall ?? "#e9d8b8", roof = o.roof ?? "#8a3a2a", trim = o.trim ?? "#f6f6f6";
  part(g, [w, h, d], [0, 0, 0], wall, { kind: o.kind ?? "planks" });
  part(g, [w + 0.6, 0.6, d + 0.6], [0, h, 0], trim);
  const rh = d * 0.35;
  wedge(g, [w + 1, rh, d / 2 + 0.5], [0, h + 0.6, d / 4 + 0.25], roof, { rotY: Math.PI });
  wedge(g, [w + 1, rh, d / 2 + 0.5], [0, h + 0.6, -d / 4 - 0.25], roof);
  part(g, [2.6, 5, 0.3], [0, 0, d / 2], o.door ?? "#7a4a2a", { kind: "wood" });
  part(g, [0.3, 0.3, 0.3], [0.9, 2.4, d / 2 + 0.25], "#d9a441", { kind: "metal" });
  for (const x of [-w / 2 + 2.6, w / 2 - 2.6]) {
    part(g, [3.2, 3, 0.2], [x, 3.6, d / 2 + 0.02], "#9fd3f0", { kind: "glass" });
    part(g, [3.6, 0.3, 0.4], [x, 3.4, d / 2 + 0.1], trim); part(g, [3.6, 0.3, 0.4], [x, 6.6, d / 2 + 0.1], trim);
  }
  part(g, [5, 0.4, 3], [0, 0, d / 2 + 1.5], "#b8b8b8", { kind: "concrete" });
  return g;
};
/** Roblox tree from parts: "round" (ball crown) or "pine" (stacked blocks) */
export const rbxTree = (parent: THREE.Object3D, at: V3, kind: "round" | "pine" = "round", s = 1, leaf = "#3f9a3a") => {
  const g = new THREE.Group(); g.position.set(...at); g.scale.setScalar(s); parent.add(g);
  cylPart(g, 0.6, 6, [0, 0, 0], "#6b4a2a", "wood");
  if (kind === "round") { ballPart(g, 3.4, [0, 8.2, 0], leaf, "grass"); ballPart(g, 2.4, [1.8, 7, 0.8], leaf, "grass"); ballPart(g, 2.2, [-1.6, 7.4, -0.6], leaf, "grass"); }
  else for (let i = 0; i < 4; i++) part(g, [6 - i * 1.3, 1.6, 6 - i * 1.3], [0, 4 + i * 1.6, 0], leaf, { kind: "grass", rotY: i * 0.4 });
  return g;
};
/** a text sign for diegetic rules: board on two posts (canvas text, readable from +z) */
export const rbxSign = (parent: THREE.Object3D, text: string, at: V3, o: { w?: number; h?: number; rotY?: number; bg?: string; fg?: string; posts?: boolean; icon?: "no" | null } = {}) => {
  const w = o.w ?? 6, h = o.h ?? 3, g = new THREE.Group(); g.position.set(...at); g.rotation.y = o.rotY ?? 0; parent.add(g);
  const c = document.createElement("canvas"); c.width = 1024; c.height = Math.round(1024 * h / w); const x = c.getContext("2d")!;
  x.fillStyle = o.bg ?? "#ffffff"; x.fillRect(0, 0, c.width, c.height); x.strokeStyle = o.fg ?? "#c0392b"; x.lineWidth = 24; x.strokeRect(12, 12, c.width - 24, c.height - 24);
  const lines = text.split("\n"); x.fillStyle = o.fg ?? "#c0392b"; x.textAlign = "center"; x.textBaseline = "middle";
  const fs = Math.min(c.height / (lines.length + 0.6), c.width / Math.max(...lines.map((l) => l.length)) * 1.55); x.font = `900 ${fs}px Arial, sans-serif`;
  lines.forEach((l, i) => x.fillText(l, c.width / 2, c.height / 2 + (i - (lines.length - 1) / 2) * fs * 1.05));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.25), [rbxMat("#e6e6e6"), rbxMat("#e6e6e6"), rbxMat("#e6e6e6"), rbxMat("#e6e6e6"), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 }), rbxMat("#e6e6e6")]);
  const py = o.posts === false ? 0 : 3.2; board.position.y = py + h / 2; board.castShadow = true; g.add(board);
  if (o.posts !== false) for (const s of [-1, 1]) part(g, [0.3, py + h * 0.6, 0.3], [s * (w / 2 - 0.6), 0, -0.2], "#7a7a7a", { kind: "metal" });
  return g;
};
