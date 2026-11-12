// Page entry: builds the story's world once, then exposes renderFrame(f) for tools/render.mjs.
import * as THREE from "three";
import { Engine } from "./engine";
import * as story from "@story";

const params = new URLSearchParams(location.search);
const scale = Number(params.get("scale") ?? "1");
const canvas = document.getElementById("c") as HTMLCanvasElement;
const W = Math.round(1080 * scale), H = Math.round(1920 * scale);
canvas.width = W; canvas.height = H;
const flag = (k: string) => (params.has(k) ? params.get(k) !== "0" : undefined);
const eng = new Engine(canvas, W, H, {
  msaa: params.has("msaa") ? Number(params.get("msaa")) : undefined, shadow: params.has("shadow") ? Number(params.get("shadow")) : undefined,
  ink: flag("ink"), lens: flag("lens"), bloom: flag("bloom"),
});
(async () => {
  await story.build(eng);
  (window as any).eng = eng;   // for debugging in the page
  (window as any).TOTAL = story.TOTAL;
  // every frame is composited onto a 2D canvas so dissolves can mix two rendered states
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const g = out.getContext("2d")!;
  (window as any).renderFrame = (f: number) => {
    const s = story.frame(f, eng);
    if (s.dissolve && s.dissolve.t < 1) {
      eng.render(f, s.dissolve.from); g.globalAlpha = 1; g.drawImage(canvas, 0, 0);
      eng.render(f, s); g.globalAlpha = Math.max(0, s.dissolve.t); g.drawImage(canvas, 0, 0); g.globalAlpha = 1;
    } else {
      eng.render(f, s); g.globalAlpha = 1; g.drawImage(canvas, 0, 0);
      // whip motion blur: average copies shifted along the move (equal weights via 1/(i+1) alpha)
      const b = (s.cam.blur ?? 0) * W;
      if (Math.abs(b) > 2) { const n = Math.min(24, Math.ceil(Math.abs(b) / 6) + 4); for (let i = 1; i < n; i++) { g.globalAlpha = 1 / (i + 1); g.drawImage(canvas, b * (i / (n - 1) - 0.5), 0); } g.globalAlpha = 1; }
    }
    return true;
  };
  // ---- lint: geometry checks per frame without rendering (tools/lint.mjs) ----
  const lcam = new THREE.PerspectiveCamera(40, W / H, 0.1, 1500), ray = new THREE.Raycaster();
  ray.layers.set(0);   // world only: cards, fx, sky and clouds live on the NOINK layer
  const V = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
  const firstHit = (from: THREE.Vector3, to: THREE.Vector3) => {
    const d = to.clone().sub(from), len = d.length(); ray.set(from, d.normalize()); ray.far = len;
    const h = ray.intersectObject(eng.root, true).find((x) => (x.object as THREE.Mesh).isMesh && (x.object as any).visible !== false);
    return h ? { d: h.distance, len, name: h.object.name || h.object.parent?.name || ((h.object as THREE.Mesh).geometry?.type ?? "") + "@" + h.point.toArray().map((v) => v.toFixed(1)).join(","), y: h.point.y } : null;
  };
  (window as any).lintFrame = (f: number, deep: boolean) => {
    const s = story.frame(f, eng), c = s.cam;
    eng.root.updateMatrixWorld(true);   // no render happens here, so world matrices must be refreshed for raycasts
    lcam.position.set(c.pos[0], c.pos[1], c.pos[2]); lcam.up.set(0, 1, 0); lcam.lookAt(c.look[0], c.look[1], c.look[2]);
    lcam.rotateZ(THREE.MathUtils.degToRad(c.roll ?? 0)); lcam.fov = c.fov; lcam.updateProjectionMatrix(); lcam.updateMatrixWorld();
    const P = (v: THREE.Vector3) => { const q = v.clone().project(lcam); return [+q.x.toFixed(3), +q.y.toFixed(3), +q.z.toFixed(4)]; };
    const chars = [];
    for (const cd of s.cards) {
      if (!cd.key.startsWith("char|")) continue;
      const parts = cd.key.split("|"), id = parts[2] + ":" + parts[1].slice(0, 60), sc = cd.scale ?? 1, a = cd.at;
      const right = new THREE.Vector3().setFromMatrixColumn(lcam.matrixWorld, 0).setY(0).normalize();
      const head = V([a[0], a[1] + 1.65 * sc, a[2]]), chest = V([a[0], a[1] + 1.05 * sc, a[2]]), feet = V([a[0], a[1] + 0.05, a[2]]);
      const r: any = { id, head: P(head), chest: P(chest), feet: P(feet), hl: P(head.clone().addScaledVector(right, -0.38 * sc)), hr: P(head.clone().addScaledVector(right, 0.38 * sc)) };
      if (deep) {
        const cp = lcam.position;
        const hh = firstHit(cp, head), hc = firstHit(cp, chest);
        r.occHead = hh && hh.d < hh.len - 0.25 ? hh.name || "object" : null;
        r.occChest = hc && hc.d < hc.len - 0.25 ? hc.name || "object" : null;
        const down = firstHit(V([a[0], a[1] + 1.2 * sc, a[2]]), V([a[0], a[1] - 3, a[2]]));
        r.inside = down && down.y > a[1] + 0.2 && down.y < a[1] + 1.15 * sc ? down.name || "object" : null;   // a counter/table top crossing the body
        r.floating = !cd.noBlob && down && !r.inside && down.y < a[1] - 0.12 ? +(a[1] - down.y).toFixed(2) : 0;
      }
      chars.push(r);
    }
    return { f, cam: c, chars };
  };
  (window as any).capture = (q: number) => out.toDataURL("image/jpeg", q);
  (window as any).ready = true;
})().catch((e) => { (window as any).buildError = String(e && e.stack || e); console.error(e); });
