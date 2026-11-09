// World-building helpers: two-tone materials, boxes with constant texel density, simple architecture and nature,
// cloud billboards. Everything casts and receives shadows unless told otherwise. Units are metres, y is up.
import * as THREE from "three";
import { twoTone } from "./lib/shade";
import { roofHD, facadeHD, cloudHD, CLOUD_DAY, CLOUD_GOLD } from "./lib/paint";
import { NOINK } from "./lib/ink";

export type V3 = [number, number, number];
type MatIn = string | THREE.Texture | THREE.Material;

const matCache = new Map<string, THREE.MeshLambertMaterial>();
/** two-tone toon material from a colour (hex) or a texture. Cached for colours. */
export const mat = (m: MatIn, opts: { side?: THREE.Side; tint?: string } = {}): THREE.Material => {
  if (m instanceof THREE.Material) return m;
  if (typeof m === "string") {
    const k = m + (opts.side ?? 0);
    let x = matCache.get(k);
    if (!x) { x = twoTone(new THREE.MeshLambertMaterial({ color: m, side: opts.side ?? THREE.FrontSide })); matCache.set(k, x); }
    return x;
  }
  return twoTone(new THREE.MeshLambertMaterial({ map: m, color: opts.tint ?? "#ffffff", side: opts.side ?? THREE.FrontSide }));
};

const finish = (o: THREE.Mesh, parent: THREE.Object3D, at: V3, rotY = 0, shadow = true) => {
  o.position.set(...at); o.rotation.y = rotY;
  o.castShadow = shadow; o.receiveShadow = true;
  parent.add(o);
  return o;
};

/** box (w x h x d) standing on `at` (at = centre of the bottom face). `tile` = metres per texture repeat: the UVs are
 *  scaled per face so a texture keeps the same size on every face (constant texel density). */
export const box = (parent: THREE.Object3D, size: V3, at: V3, m: MatIn, o: { rotY?: number; tile?: number; shadow?: boolean } = {}) => {
  const [w, h, d] = size, g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  if (o.tile) {
    const uv = g.attributes.uv as THREE.BufferAttribute;
    const dims: [number, number][] = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
    for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * dims[f][0] / o.tile, uv.getY(i) * dims[f][1] / o.tile);
    }
  }
  return finish(new THREE.Mesh(g, mat(m)), parent, at, o.rotY, o.shadow ?? true);
};

/** vertical cylinder standing on `at` */
export const cyl = (parent: THREE.Object3D, rTop: number, rBot: number, h: number, at: V3, m: MatIn, o: { seg?: number; rotY?: number; shadow?: boolean } = {}) => {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 20); g.translate(0, h / 2, 0);
  return finish(new THREE.Mesh(g, mat(m)), parent, at, o.rotY, o.shadow ?? true);
};
export const cone = (parent: THREE.Object3D, r: number, h: number, at: V3, m: MatIn, seg = 16) => cyl(parent, 0, r, h, at, m, { seg });
export const sphere = (parent: THREE.Object3D, r: number, at: V3, m: MatIn, o: { sy?: number; seg?: number } = {}) => {
  const g = new THREE.SphereGeometry(r, o.seg ?? 24, Math.round((o.seg ?? 24) * 0.66));
  const s = finish(new THREE.Mesh(g, mat(m)), parent, at);
  s.scale.y = o.sy ?? 1;
  return s;
};

/** flat ground plane (size x size) at height y, texture repeated every `tile` metres */
export const ground = (parent: THREE.Object3D, size: number, m: THREE.Texture | string, tile = 4, at: V3 = [0, 0, 0]) => {
  const g = new THREE.PlaneGeometry(size, size); g.rotateX(-Math.PI / 2);
  if (typeof m !== "string") { const t = m.clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(size / tile, size / tile); t.needsUpdate = true; m = t; }
  const o = new THREE.Mesh(g, mat(m)); o.position.set(...at); o.receiveShadow = true; parent.add(o);
  return o;
};

/** simple house: painted facade on the front (+z), plain walls elsewhere, pitched tiled roof */
export const house = (parent: THREE.Object3D, o: { at: V3; w: number; h: number; d: number; rotY?: number; wall: string; shutter?: string; roof?: string; door?: boolean; timber?: boolean; brick?: boolean; flat?: boolean; seed?: string }) => {
  const grp = new THREE.Group(); grp.position.set(...o.at); grp.rotation.y = o.rotY ?? 0; parent.add(grp);
  const front = facadeHD(`${o.seed ?? ""}${o.w}x${o.h}${o.wall}`, o.w, o.h, { wall: o.wall, shutter: o.shutter ?? "#3b6e8c", door: o.door ?? true, timber: o.timber, brick: o.brick });
  const side = mat(o.wall), fm = mat(front);
  const g = new THREE.BoxGeometry(o.w, o.h, o.d); g.translate(0, o.h / 2, 0);
  const walls = new THREE.Mesh(g, [side, side, side, side, fm, side]);
  walls.castShadow = walls.receiveShadow = true; grp.add(walls);
  if (!o.flat) {
    const rh = Math.min(o.w, o.d) * 0.38, rm = mat(roofHD(o.roof ?? "#b8573a"));
    const shape = new THREE.Shape(); shape.moveTo(-o.d / 2 - 0.3, 0); shape.lineTo(0, rh); shape.lineTo(o.d / 2 + 0.3, 0); shape.lineTo(-o.d / 2 - 0.3, 0);
    const rg = new THREE.ExtrudeGeometry(shape, { depth: o.w + 0.5, bevelEnabled: false });
    rg.translate(0, 0, -(o.w + 0.5) / 2); rg.rotateY(Math.PI / 2);
    const roof = new THREE.Mesh(rg, [mat(o.wall), rm]); // extrude groups: 0 = caps, 1 = sides+top
    roof.position.y = o.h; roof.castShadow = roof.receiveShadow = true; grp.add(roof);
  } else {
    const cap = new THREE.Mesh(new THREE.BoxGeometry(o.w + 0.2, 0.25, o.d + 0.2), mat("#8a7a66")); cap.position.y = o.h + 0.12; cap.castShadow = true; grp.add(cap);
  }
  return grp;
};

/** cypress / pine / round tree */
export const tree = (parent: THREE.Object3D, at: V3, kind: "cypress" | "pine" | "round" | "palm" = "round", s = 1) => {
  const grp = new THREE.Group(); grp.position.set(...at); grp.scale.setScalar(s); parent.add(grp);
  const trunk = mat("#6b4a32");
  if (kind === "cypress") { cyl(grp, 0.1, 0.14, 1.2, [0, 0, 0], trunk); const c = sphere(grp, 0.9, [0, 3.2, 0], "#3f7a3a"); c.scale.set(1, 2.6, 1); }
  else if (kind === "pine") { cyl(grp, 0.12, 0.18, 1.4, [0, 0, 0], trunk); cone(grp, 1.6, 2.4, [0, 1.2, 0], "#2f6b45"); cone(grp, 1.25, 2.0, [0, 2.4, 0], "#367a4c"); cone(grp, 0.85, 1.6, [0, 3.5, 0], "#3d8653"); }
  else if (kind === "palm") {
    cyl(grp, 0.12, 0.2, 4.2, [0, 0, 0], trunk);
    for (let i = 0; i < 7; i++) { const l = box(grp, [0.35, 0.06, 2.2], [0, 4.2, 0], "#4f9a3f", { rotY: (i / 7) * Math.PI * 2, shadow: true }); l.geometry.translate(0, 0, 1.0); l.rotation.x = 0.35; }
  } else { cyl(grp, 0.12, 0.18, 1.6, [0, 0, 0], trunk); sphere(grp, 1.3, [0, 2.6, 0], "#4f9a3f"); sphere(grp, 0.9, [0.7, 2.2, 0.3], "#5aa846"); }
  return grp;
};

/** low hills (half-buried spheres) in a ring at distance `r` around `centre` */
export const hills = (parent: THREE.Object3D, centre: V3, r: number, n = 8, col = "#6fae4a", seed = 1) => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed, rr = r * (0.9 + 0.25 * Math.sin(i * 7.3 + seed)), s = r * (0.18 + 0.08 * Math.cos(i * 3.1 + seed));
    const h = sphere(parent, s, [centre[0] + Math.cos(a) * rr, -s * 0.55, centre[2] + Math.sin(a) * rr], col, { seg: 20 });
    h.castShadow = false;
  }
};
/** distant mountains (cones with snow caps) */
export const mountains = (parent: THREE.Object3D, centre: V3, r: number, n = 7, col = "#8b8fb0", snow = true, seed = 2) => {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + seed, h = r * (0.16 + 0.07 * Math.sin(i * 5.1 + seed)), b = h * 1.4;
    const x = centre[0] + Math.cos(a) * r, z = centre[2] + Math.sin(a) * r;
    const m = cone(parent, b, h, [x, -2, z], col, 7); m.castShadow = false;
    if (snow) { const c = cone(parent, b * 0.3, h * 0.3, [x, -2 + h * 0.7, z], "#f4f6fb", 7); c.castShadow = false; }
  }
};

/** painted cloud billboards high in the sky (NOINK, no fog). Returns them so the story can drift them. */
export const clouds = (parent: THREE.Object3D, centre: V3, n = 8, dist = 300, height = 70, golden = false) => {
  const out: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const map = cloudHD(i % 4, golden ? CLOUD_GOLD : CLOUD_DAY);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, fog: false, color: new THREE.Color(1.1, 1.1, 1.1) }));
    const a = (i / n) * Math.PI * 2 + 0.4, d = dist * (0.85 + 0.3 * ((i * 37) % 10) / 10), w = dist * (0.35 + 0.12 * (i % 3));
    m.position.set(centre[0] + Math.cos(a) * d, height + (i % 3) * height * 0.25, centre[2] + Math.sin(a) * d);
    m.scale.set(w, w / 2, 1); m.lookAt(centre[0], m.position.y, centre[2]);
    m.layers.set(NOINK); m.renderOrder = -0.8; parent.add(m); out.push(m);
  }
  return out;
};

/** flat painted sign (text texture) on a board, front facing +z of its rotation */
export const sign = (parent: THREE.Object3D, tex: THREE.Texture, at: V3, w: number, h: number, rotY = 0, posts = true) => {
  const grp = new THREE.Group(); grp.position.set(...at); grp.rotation.y = rotY; parent.add(grp);
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.08), [mat("#6b4a32"), mat("#6b4a32"), mat("#6b4a32"), mat("#6b4a32"), mat(tex), mat("#6b4a32")]);
  board.position.y = posts ? 1.2 + h / 2 : h / 2; board.castShadow = board.receiveShadow = true; grp.add(board);
  if (posts) for (const x of [-w * 0.4, w * 0.4]) box(grp, [0.1, 1.2 + h * 0.8, 0.1], [x, 0, -0.06], "#6b4a32");
  return grp;
};

/** a pivoted group: children rotate around `pivot` (doors, falling walls, levers). Set .rotation on the returned group. */
export const pivot = (parent: THREE.Object3D, at: V3) => { const g = new THREE.Group(); g.position.set(...at); parent.add(g); return g; };
