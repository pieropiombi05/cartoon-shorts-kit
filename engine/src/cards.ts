// Flat cartoon cards (characters, effects, contact blobs) living in the 3D world.
// Every frame the story lists what it wants drawn; the pool keeps one canvas per distinct drawing (key), so an
// unchanged pose costs nothing. Characters are yaw-only billboards lit by cardShade(); effects are unlit cut-outs
// or soft see-through cards; blobs multiply the ground. All of them live on the NOINK layer: they carry their own
// plum outline and must never get the world ink lines.
// Pool / Actor / Fx are adapted from mromidev/claude-animated-shorts templates/bridge/cast.ts (MIT).
import * as THREE from "three";
import { Pen, bodyFront, fxContact, Outfit, Expr, FrontOpts } from "./lib/toon";
import { NOINK } from "./lib/ink";
import { cardShade, blobMaterial, CARD_K } from "./lib/cardshade";

type Entry = { cv: HTMLCanvasElement; tex: THREE.CanvasTexture; w: number; h: number };
export type Req = { key: string; w: number; h: number; k: number; draw: (p: Pen) => void; tex?: THREE.CanvasTexture };
const makeEntry = (w: number, h: number): Entry => {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return { cv, tex, w, h };
};
export class Pool {
  private live = new Map<string, Entry>();
  private free: Entry[] = [];
  private reqs: Req[] = [];
  req(key: string, w: number, h: number, k: number, draw: (p: Pen) => void) {
    const r: Req = { key: `${w}x${h}|${key}`, w, h, k, draw };
    this.reqs.push(r);
    return r;
  }
  flush() {
    const want = new Map<string, Req[]>();
    for (const r of this.reqs) { const l = want.get(r.key); if (l) l.push(r); else want.set(r.key, [r]); }
    for (const [key, e] of this.live) if (!want.has(key)) { this.live.delete(key); this.free.push(e); }
    for (const [key, rs] of want) {
      let e = this.live.get(key);
      if (!e) {
        const r = rs[0], i = this.free.findIndex((x) => x.w === r.w && x.h === r.h);
        e = i >= 0 ? this.free.splice(i, 1)[0] : makeEntry(r.w, r.h);
        const g = e.cv.getContext("2d")!;
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, e.w, e.h); g.setTransform(r.k, 0, 0, r.k, 0, 0);
        r.draw(new Pen(g));
        e.tex.needsUpdate = true;
        this.live.set(key, e);
      }
      for (const r of rs) r.tex = e.tex;
    }
    this.reqs = [];
  }
}

const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 2; return new THREE.CanvasTexture(c); })();
/** metres per design unit: the 600 x 1000 design canvas with soles at y = 975; 1000 units = 2.16 m */
export const SU = 0.00216;
const BODY = (() => { const g = new THREE.PlaneGeometry(600 * SU, 1000 * SU); g.translate(0, (975 - 500) * SU, 0); return g; })();
const CARD = new THREE.PlaneGeometry(1, 1);

export class Actor {
  mesh: THREE.Mesh; mat: THREE.MeshLambertMaterial; dmat: THREE.MeshDepthMaterial; r: Req | null = null;
  constructor(parent: THREE.Object3D) {
    this.mat = cardShade(new THREE.MeshLambertMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide }));
    this.dmat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(BODY, this.mat);
    this.mesh.customDepthMaterial = this.dmat;
    this.mesh.onBeforeRender = (r) => { const rt = r.getRenderTarget(); CARD_K.uPx.value = (rt ? rt.height : r.domElement.height) / 1920; };
    this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.visible = false;
    this.mesh.rotation.order = "YXZ"; this.mesh.renderOrder = 1; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  bind() { const t = this.r?.tex; if (t) { this.mat.map = t; this.dmat.map = t; } }
}
export class Fx {
  mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial; blob: THREE.MeshBasicMaterial; r: Req | null = null;
  kind: "cut" | "soft" | "blob" = "cut";
  constructor(parent: THREE.Object3D) {
    this.mat = new THREE.MeshBasicMaterial({ map: blank, alphaTest: 0.5, side: THREE.DoubleSide });
    this.soft = new THREE.MeshBasicMaterial({ map: blank, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.blob = blobMaterial(blank);
    this.mesh = new THREE.Mesh(CARD, this.mat);
    this.mesh.visible = false; this.mesh.layers.set(NOINK);
    parent.add(this.mesh);
  }
  bind() {
    const t = this.r?.tex;
    if (!t) return;
    if (this.kind === "blob") {
      if (t.generateMipmaps) { t.generateMipmaps = false; t.minFilter = THREE.LinearFilter; t.needsUpdate = true; }
      this.blob.map = t; this.mesh.material = this.blob; this.mesh.renderOrder = 0.5;
    } else if (this.kind === "soft") { this.soft.map = t; this.mesh.material = this.soft; this.mesh.renderOrder = 2; }
    else { this.mat.map = t; this.mesh.material = this.mat; this.mesh.renderOrder = 0; }
  }
}

// ---------------- what a story asks for ----------------
type V3 = [number, number, number];
/** any flat drawing standing in the world, facing the camera (yaw only). Draws on the 600 x 1000 design canvas,
 *  soles at y = 975, unless w/h are given (then a free card w x h metres, anchored at its bottom centre). */
export type CardPlace = {
  key: string; draw: (p: Pen) => void; at: V3; scale?: number; mirror?: boolean; roll?: number;
  /** no contact blob under the feet (flying, sitting on a chair, hidden feet) */
  noBlob?: boolean;
};
/** an effect card (unlit): cw x ch canvas, w x h metres, centred at `at`. flat = lying on the ground. */
export type FxPlace = {
  key: string; cw: number; ch: number; draw: (p: Pen) => void; at: V3; w: number; h: number;
  flat?: boolean; rot?: number; soft?: boolean; face?: boolean;
};

/** a character in the toon.ts style. Everything that changes the drawing goes in the key, rounded. */
export type CharSpec = {
  outfit: Outfit; at: V3; seed?: number; expr?: Expr; mode?: FrontOpts["mode"]; phase?: number; look?: number;
  blink?: boolean | number; tilt?: number; headTilt?: number; wave?: number; facing?: -1 | 0 | 1; prop?: FrontOpts["prop"];
  scale?: number; mirror?: boolean; roll?: number; noBlob?: boolean; lift?: number;
  /** extra drawing on top (props in hand etc.): called after the body with the same Pen */
  extra?: { key: string; draw: (p: Pen) => void };
};
const q = (v: number | undefined, n = 40) => (v === undefined ? "_" : String(Math.round(v * n) / n));
export const charCard = (c: CharSpec, light = (-120 * Math.PI) / 180): CardPlace => {
  const o = c.outfit;
  const key = ["char", JSON.stringify(o), c.seed ?? 1, c.expr ?? "neutral", c.mode ?? "stand", q(c.phase, 24), q(c.look), String(c.blink ?? false),
    q(c.tilt, 4), q(c.headTilt, 4), q(c.wave, 12), c.facing ?? 0, JSON.stringify(c.prop ?? null), q(c.lift, 1), q(light, 8), c.extra?.key ?? ""].join("|");
  return {
    key, at: c.at, scale: c.scale, mirror: c.mirror, roll: c.roll, noBlob: c.noBlob || c.mode === "sit" || c.mode === "fall",
    draw: (p) => {
      bodyFront(p, o, { expr: c.expr, mode: c.mode ?? "stand", phase: c.phase, look: c.look, blink: c.blink, tilt: c.tilt,
        headTilt: c.headTilt, wave: c.wave, facing: c.facing, prop: c.prop ?? null, seed: c.seed ?? 1, light, lift: c.lift });
      c.extra?.draw(p);
    },
  };
};

/** canvas resolution by camera distance (sized so close-ups stay crisp at 1080 x 1920) */
const tier = (d: number): number => (d < 3.5 ? 2 : d < 9 ? 1.2 : d < 22 ? 0.7 : 0.4);

export class Cards {
  pool = new Pool();
  private actors: Actor[] = [];
  private fxs: Fx[] = [];
  private blobKey = "";
  constructor(private root: THREE.Object3D) {}
  private actor(i: number) { while (this.actors.length <= i) this.actors.push(new Actor(this.root)); return this.actors[i]; }
  private fx(i: number) { while (this.fxs.length <= i) this.fxs.push(new Fx(this.root)); return this.fxs[i]; }

  update(cam: THREE.PerspectiveCamera, cards: CardPlace[], effects: FxPlace[], blobCol = "#9a8f8f") {
    const cp = cam.position;
    const used: { a: Actor; c: CardPlace }[] = [];
    const usedFx: { x: Fx; e: FxPlace; kind: Fx["kind"] }[] = [];
    let ai = 0, fi = 0;
    for (const c of cards) {
      const d = Math.hypot(cp.x - c.at[0], cp.y - c.at[1] - 1, cp.z - c.at[2]);
      const k = tier(d / (c.scale ?? 1));
      const a = this.actor(ai++);
      a.r = this.pool.req(c.key, Math.round(600 * k), Math.round(1000 * k), k, c.draw);
      used.push({ a, c });
      if (!c.noBlob) {
        const x = this.fx(fi++);
        x.r = this.pool.req("blob" + blobCol, 128, 128, 1, (p) => fxContact(p, blobCol));
        const s = c.scale ?? 1;
        usedFx.push({ x, kind: "blob", e: { key: "", cw: 128, ch: 128, draw: () => {}, at: [c.at[0], c.at[1] + 0.012, c.at[2]], w: 0.95 * s, h: 0.62 * s, flat: true } });
      }
    }
    for (const e of effects) {
      const x = this.fx(fi++);
      x.r = this.pool.req(e.key, e.cw, e.ch, 1, e.draw);
      usedFx.push({ x, e, kind: e.soft ? "soft" : "cut" });
    }
    this.pool.flush();
    for (const { a, c } of used) {
      a.bind();
      const m = a.mesh, s = c.scale ?? 1;
      m.visible = true;
      m.position.set(c.at[0], c.at[1], c.at[2]);
      m.rotation.set(0, Math.atan2(cp.x - c.at[0], cp.z - c.at[2]), c.roll ?? 0);
      m.scale.set(c.mirror ? -s : s, s, s);
    }
    for (const { x, e, kind } of usedFx) {
      x.kind = kind; x.bind();
      const m = x.mesh;
      m.visible = true;
      m.position.set(e.at[0], e.at[1], e.at[2]);
      if (e.flat) m.rotation.set(-Math.PI / 2, 0, e.rot ?? 0, "XYZ");
      else if (e.face === false) m.rotation.set(0, 0, e.rot ?? 0, "YXZ");
      else m.rotation.set(0, Math.atan2(cp.x - e.at[0], cp.z - e.at[2]), e.rot ?? 0, "YXZ");
      m.scale.set(e.w, e.h, 1);
    }
    for (let i = ai; i < this.actors.length; i++) this.actors[i].mesh.visible = false;
    for (let i = fi; i < this.fxs.length; i++) this.fxs[i].mesh.visible = false;
  }
}
