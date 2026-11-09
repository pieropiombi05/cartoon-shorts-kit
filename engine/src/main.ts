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
  (window as any).renderFrame = (f: number) => { eng.render(f, story.frame(f, eng)); return true; };
  (window as any).ready = true;
})().catch((e) => { (window as any).buildError = String(e && e.stack || e); console.error(e); });
