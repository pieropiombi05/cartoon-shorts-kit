// Extra painted textures in the same flat-with-dark-seams style as lib/paint.ts: sand, dirt, plaster, wood boards,
// marble, adobe blocks, cloth banners, painted signs. All cached by key (ctex), sRGB, repeat-wrapped.
import { ctex, jit } from "./lib/paint";

type G = CanvasRenderingContext2D;
const U = (r: () => number, a: number, b: number) => a + (b - a) * r();
const blot = (g: G, x: number, y: number, rad: number, rgb: string, a: number) => {
  const gr = g.createRadialGradient(x, y, 0, x, y, rad);
  gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr; g.fillRect(x - rad, y - rad, 2 * rad, 2 * rad);
};

/** sand / desert floor: warm, soft dunes of colour, fine grains, a few pebbles. 1024 px tile (use ~4 m) */
export const sand = (base = "#e8c98f") => ctex("sand" + base, 1024, 1024, (g, r) => {
  g.fillStyle = base; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 40; i++) blot(g, U(r, 0, 1024), U(r, 0, 1024), U(r, 80, 220), r() > 0.5 ? "255,240,210" : "160,110,60", 0.12);
  for (let i = 0; i < 9000; i++) { g.fillStyle = r() > 0.5 ? "rgba(255,245,220,.35)" : "rgba(150,105,60,.25)"; g.fillRect(U(r, 0, 1024), U(r, 0, 1024), 2, 2); }
  for (let i = 0; i < 26; i++) { const x = U(r, 0, 1024), y = U(r, 0, 1024), s = U(r, 4, 9); g.fillStyle = jit(r, "#b39a77"); g.strokeStyle = "rgba(60,40,30,.6)"; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, s, s * 0.7, r(), 0, 7); g.fill(); g.stroke(); }
});

/** packed dirt / path */
export const dirt = (base = "#b88d5f") => ctex("dirt" + base, 1024, 1024, (g, r) => {
  g.fillStyle = base; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 50; i++) blot(g, U(r, 0, 1024), U(r, 0, 1024), U(r, 60, 180), r() > 0.5 ? "255,230,200" : "90,60,35", 0.13);
  for (let i = 0; i < 60; i++) { const x = U(r, 0, 1024), y = U(r, 0, 1024), s = U(r, 5, 12); g.fillStyle = jit(r, "#9c7a58"); g.strokeStyle = "rgba(50,35,25,.7)"; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y, s, s * 0.6, r(), 0, 7); g.fill(); g.stroke(); }
});

/** plaster / stucco wall in any colour, with soft blotches and a darker plinth band at the bottom of the tile */
export const plaster = (col: string) => ctex("plaster" + col, 1024, 1024, (g, r) => {
  g.fillStyle = col; g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 30; i++) blot(g, U(r, 0, 1024), U(r, 0, 1024), U(r, 60, 200), r() > 0.5 ? "255,255,255" : "110,80,60", r() > 0.5 ? 0.08 : 0.06);
  for (let i = 0; i < 5; i++) {
    let x = U(r, 0, 1024), y = U(r, 0, 800);
    g.strokeStyle = "rgba(110,90,70,.35)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 5; k++) { x += U(r, -12, 12); y += U(r, 8, 20); g.lineTo(x, y); }
    g.stroke();
  }
});

/** wooden boards running along u (planks for floors, walls, tables, crates) */
export const boards = (col = "#b07a48", n = 8) => ctex("boards" + col + n, 1024, 1024, (g, r) => {
  const h = 1024 / n;
  for (let i = 0; i < n; i++) {
    g.fillStyle = jit(r, col, 0.08); g.fillRect(0, i * h, 1024, h);
    for (let k = 0; k < 14; k++) { g.strokeStyle = "rgba(80,45,25,.18)"; g.lineWidth = 2; const y = i * h + U(r, 6, h - 6); g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(300, y + U(r, -4, 4), 700, y + U(r, -4, 4), 1024, y); g.stroke(); }
    g.fillStyle = "rgba(255,235,210,.18)"; g.fillRect(0, i * h + 3, 1024, 3);
    g.fillStyle = "rgba(35,20,15,.85)"; g.fillRect(0, i * h + h - 4, 1024, 4);
    const cut = U(r, 100, 900); g.fillRect(cut, i * h, 4, h);
    for (const x of [cut - 20, cut + 24]) { g.fillStyle = "rgba(40,30,25,.7)"; g.beginPath(); g.arc(x, i * h + h / 2, 3.5, 0, 7); g.fill(); }
  }
});

/** marble / polished stone floor tiles */
export const marble = (a = "#efe9df", b = "#d9cfc2", tiles = 4) => ctex("marble" + a + b + tiles, 1024, 1024, (g, r) => {
  const s = 1024 / tiles;
  for (let y = 0; y < tiles; y++) for (let x = 0; x < tiles; x++) {
    g.fillStyle = jit(r, (x + y) % 2 ? a : b, 0.04); g.fillRect(x * s, y * s, s, s);
    for (let k = 0; k < 3; k++) { g.strokeStyle = "rgba(150,140,130,.25)"; g.lineWidth = 1.5; g.beginPath(); let px = x * s + U(r, 0, s), py = y * s; g.moveTo(px, py); for (let j = 0; j < 6; j++) { px += U(r, -20, 20); py += s / 6; g.lineTo(px, py); } g.stroke(); }
    g.strokeStyle = "rgba(70,60,55,.6)"; g.lineWidth = 3; g.strokeRect(x * s, y * s, s, s);
  }
});

/** big fitted stone blocks (Inca / Egyptian / castle walls): irregular courses, dark seams, soft bevel light */
export const blocks = (cols = ["#c9b79a", "#bfae90", "#d3c3a6", "#b8a687"], seam = "#4a3a2c", rows = 5) => ctex("blocks" + cols.join() + rows, 1024, 1024, (g, r) => {
  g.fillStyle = seam; g.fillRect(0, 0, 1024, 1024);
  const h = 1024 / rows;
  for (let row = 0; row < rows; row++) {
    let x = -U(r, 0, 120);
    while (x < 1024) {
      const w = U(r, 140, 300), y0 = row * h;
      const pts: [number, number][] = [[x + U(r, 3, 10), y0 + U(r, 3, 10)], [x + w - U(r, 3, 10), y0 + U(r, 3, 10)], [x + w - U(r, 3, 10), y0 + h - U(r, 3, 10)], [x + U(r, 3, 10), y0 + h - U(r, 3, 10)]];
      g.fillStyle = cols[Math.floor(r() * cols.length) % cols.length];
      g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill();
      g.save(); g.clip();
      g.fillStyle = "rgba(255,245,225,.22)"; g.fillRect(x, y0, w, 10);
      g.fillStyle = "rgba(60,40,25,.2)"; g.fillRect(x, y0 + h - 16, w, 16);
      for (let k = 0; k < 4; k++) blot(g, U(r, x, x + w), U(r, y0, y0 + h), U(r, 20, 60), r() > 0.5 ? "255,255,240" : "90,70,50", 0.12);
      g.restore();
      x += w;
    }
  }
});

/** cloth banner: flat colour, stripe border, optional emblem colour */
export const cloth = (col: string, trim = "#f2d36b") => ctex("cloth" + col + trim, 256, 512, (g, r) => {
  g.fillStyle = col; g.fillRect(0, 0, 256, 512);
  g.fillStyle = trim; g.fillRect(0, 0, 256, 18); g.fillRect(0, 494, 256, 18); g.fillRect(0, 0, 14, 512); g.fillRect(242, 0, 14, 512);
  for (let i = 0; i < 6; i++) { g.fillStyle = "rgba(0,0,0,.08)"; g.fillRect(U(r, 20, 230), 0, 6, 512); }
});

/** painted sign board with readable text (never mirrored: the plane's front face shows it the right way round) */
export const signTex = (text: string, bg = "#f4ead0", ink = "#2b1d14", w = 1024, h = 384) => ctex("sign" + text + bg + ink + w + h, w, h, (g) => {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.strokeStyle = ink; g.lineWidth = 14; g.strokeRect(10, 10, w - 20, h - 20);
  g.fillStyle = ink; g.textAlign = "center"; g.textBaseline = "middle";
  const lines = text.split("\n");
  let size = Math.min(h * 0.7 / lines.length, 220);
  g.font = `900 ${size}px "DejaVu Sans", Arial, sans-serif`;
  while (Math.max(...lines.map((l) => g.measureText(l).width)) > w * 0.86 && size > 20) { size -= 6; g.font = `900 ${size}px "DejaVu Sans", Arial, sans-serif`; }
  lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.1));
});
