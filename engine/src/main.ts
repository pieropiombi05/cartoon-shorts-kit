// Page entry: builds the story's world once, then exposes renderFrame(f) for tools/render.mjs.
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
  (window as any).capture = (q: number) => out.toDataURL("image/jpeg", q);
  (window as any).ready = true;
})().catch((e) => { (window as any).buildError = String(e && e.stack || e); console.error(e); });
