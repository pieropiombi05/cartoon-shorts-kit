#!/usr/bin/env python3
"""Every-frame motion / colour / detail stats of a vertical short, the same method used to measure the reference
channel (docs/reference/ricks-20.md). Lets you compare a render against the reference numbers.

Usage: python3 tools/framestats.py video.mp4 [--json out.json]

Per frame at 90x160 grey (the caption band 58-80 % of the height is ignored for motion):
- camera: global shift (SAD search +-6 px, sub-pixel) and zoom (left/right + top/bottom halves), speed in px/frame at
  720 wide (translation + |zoom| x 734 px, like the reference reports)
- local motion: share of pixels that still change (> 18 grey levels) after compensating the camera shift and zoom,
  measured on quiet-camera frames: that is animation inside the scene (characters, effects, objects)
- cuts / flashes / whips, shot lengths, colour (luma, saturation, warmth R-B), detail (gradient, flat-block share)
"""
import sys, json, subprocess, argparse
import numpy as np

ap = argparse.ArgumentParser(); ap.add_argument("video"); ap.add_argument("--json")
a = ap.parse_args()
GW, GH, CW, CH = 90, 160, 45, 80
def frames(w, h, fmt):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", a.video, "-vf", f"scale={w}:{h}:flags=bilinear", "-f", "rawvideo", "-pix_fmt", fmt, "-"], capture_output=True).stdout
    c = 1 if fmt == "gray" else 3
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w, c) if c == 3 else np.frombuffer(raw, np.uint8).reshape(-1, h, w)
G = frames(GW, GH, "gray").astype(np.float32); C = frames(CW, CH, "rgb24").astype(np.float32)
n = min(len(G), len(C))
fps = 30.0
rows = np.array([not (GH * 0.58 <= y < GH * 0.80) for y in range(GH)])

def best(A, B, x0, x1, y0, y1, R):
    ys = np.arange(y0, y1); ys = ys[rows[ys]]
    best_s, bx, by, grid = 1e9, 0, 0, {}
    for dy in range(-R, R + 1):
        yy = ys[(ys + dy >= 0) & (ys + dy < GH)]
        for dx in range(-R, R + 1):
            xa = np.arange(max(x0, -dx), min(x1, GW - dx))
            if len(xa) == 0 or len(yy) == 0: grid[(dx, dy)] = 999; continue
            s = np.abs(A[np.ix_(yy, xa)] - B[np.ix_(yy + dy, xa + dx)]).mean()
            grid[(dx, dy)] = s
            if s < best_s: best_s, bx, by = s, dx, dy
    def sub(p, q, r):
        den = p - 2 * q + r
        return 0.5 * (p - r) / den if den > 0 else 0
    fx = sub(grid.get((bx - 1, by), best_s), best_s, grid.get((bx + 1, by), best_s)) if (bx - 1, by) in grid and (bx + 1, by) in grid else 0
    fy = sub(grid.get((bx, by - 1), best_s), best_s, grid.get((bx, by + 1), best_s)) if (bx, by - 1) in grid and (bx, by + 1) in grid else 0
    return bx + np.clip(fx, -.5, .5), by + np.clip(fy, -.5, .5), best_s, abs(bx) == R or abs(by) == R

F = []
yy, xx = np.mgrid[0:GH, 0:GW]
inner = (yy >= 10) & (yy < GH - 10) & (xx >= 10) & (xx < GW - 10) & rows[yy]
for i in range(n):
    g, c = G[i], C[i]
    lum = (0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]) / 255
    mx, mn = c.max(-1), c.min(-1)
    S = np.where(mx > 15, (mx - mn) / np.maximum(mx, 1), 0).mean()
    gr = (np.abs(g[1:-1, 2:] - g[1:-1, :-2]) + np.abs(g[2:, 1:-1] - g[:-2, 1:-1]))[rows[1:-1]].mean()
    blocks = [g[by:by + 10, bx:bx + 10].std() for by in range(0, GH - 9, 10) if rows[by + 5] for bx in range(0, GW - 9, 10)]
    f = dict(L=float(lum.mean()), Ls=float(lum.std()), p5=float(np.percentile(lum, 5)), p95=float(np.percentile(lum, 95)), S=float(S),
             warm=float(((c[..., 0] - c[..., 2]) / 255).mean()), grad=float(gr), flat=float(np.mean(np.array(blocks) < 4)))
    if i > 0:
        A = G[i - 1]
        mad = float(np.abs(g - A)[rows].mean())
        dx, dy, s, edge = best(A, g, 8, GW - 8, 8, GH - 8, 6)
        l = best(A, g, 4, GW // 2, 8, GH - 8, 4); r = best(A, g, GW // 2, GW - 4, 8, GH - 8, 4)
        t = best(A, g, 8, GW - 8, 6, int(GH * .45), 4); b = best(A, g, 8, GW - 8, int(GH * .82), GH - 4, 4)
        zoom = ((r[0] - l[0]) / (GW / 2) + (b[1] - t[1]) / (GH * 0.6)) / 2
        xb = np.rint(GW / 2 + (xx - GW / 2) * (1 + zoom) + dx).astype(int); yb = np.rint(GH / 2 + (yy - GH / 2) * (1 + zoom) + dy).astype(int)
        ok = inner & (xb >= 0) & (xb < GW) & (yb >= 0) & (yb < GH)
        e = np.abs(A[ok] - g[yb[ok], xb[ok]])
        f.update(mad=mad, dx=dx * 8, dy=dy * 8, zoom=zoom, speed=float(np.hypot(dx, dy) * 8 + abs(zoom) * 734), res2=float((e > 18).mean()),
                 res=float((e > 18).mean()), edge=bool(edge))
    F.append(f)

med = lambda v: float(np.median(v)) if len(v) else 0.0
ev = []
for i in range(1, n):
    f = F[i]; lj = abs(F[i]["L"] - F[i - 1]["L"])
    if f["res"] > 0.38 and f["mad"] > 16: ev.append((i, "cut"))
    elif lj > 0.12 and f["L"] > 0.75: ev.append((i, "flash"))
    elif f["edge"] and f["speed"] > 40: ev.append((i, "whip"))
trans = []
for i, k in ev:
    if trans and i - trans[-1][2] <= 2 and trans[-1][0] == k: trans[-1][2] = i
    else: trans.append([k, i, i])
cut = set()
for k, x, y in trans:
    if k == "cut": cut.update(range(x - 1, y + 2))
ok = [i for i in range(1, n) if i not in cut]
sp = np.array([F[i]["speed"] for i in ok])
Sarr = np.array([0 if (i == 0 or i in cut) else F[i]["speed"] for i in range(n)])
bursts, k = [], 1
while k < n - 1:
    if Sarr[k] >= 6 and Sarr[k] >= Sarr[k - 1] and Sarr[k] >= Sarr[k + 1]:
        pk = Sarr[k]; x = y = k
        while x > 1 and Sarr[x - 1] > pk * .1 and Sarr[x - 1] <= Sarr[x] + 1: x -= 1
        while y < n - 1 and Sarr[y + 1] > pk * .1 and Sarr[y + 1] <= Sarr[y] + 1: y += 1
        bursts.append((pk, y - x + 1)); k = y + 1
    else: k += 1
quiet = [F[i] for i in ok if F[i]["speed"] < 1.5]
dur = n / fps
edges = [0] + [t[1] for t in trans if t[0] == "cut"] + [n]
out = dict(video=a.video, dur=round(dur, 2), frames=n, nCuts=sum(1 for t in trans if t[0] == "cut"), transitions=[f"{t[0]}@{t[1]}" + (f"-{t[2]}" if t[2] > t[1] else "") for t in trans],
           shotSec=[round((edges[i] - edges[i - 1]) / fps, 1) for i in range(1, len(edges))],
           cam=dict(holdPct=round(float((sp < .3).mean() * 100)), driftPct=round(float(((sp >= .3) & (sp < 2)).mean() * 100)), movePct=round(float((sp >= 2).mean() * 100)),
                    medSpeed=round(med(sp), 1), p90Speed=round(float(np.percentile(sp, 90)), 1), movesPer10s=round(len(bursts) / dur * 10, 1),
                    medPeak=round(med([b[0] for b in bursts]), 1), medLen=med([b[1] for b in bursts])),
           local2=dict(quietFramesPct=round(len(quiet) / max(1, len(ok)) * 100), quietResPct=round(float(np.mean([f["res2"] for f in quiet])) * 100, 2) if quiet else 0,
                       quietActivePct=round(float(np.mean([f["res2"] > .005 for f in quiet])) * 100) if quiet else 0,
                       quietStillPct=round(float(np.mean([f["res2"] < .002 for f in quiet])) * 100) if quiet else 0),
           color=dict(L=round(med([f["L"] for f in F]), 3), Lstd=round(med([f["Ls"] for f in F]), 3), p5=round(med([f["p5"] for f in F]), 3), p95=round(med([f["p95"] for f in F]), 3),
                      S=round(med([f["S"] for f in F]), 3), warm=round(med([f["warm"] for f in F]), 3)),
           detail=dict(grad=round(med([f["grad"] for f in F]), 2), flatPct=round(med([f["flat"] for f in F]) * 100)))
# reference targets: medians (p25-p75) of 19 Ricks Clips shorts, docs/reference/ricks-20.md
REF = [("in-scene motion when camera is quiet (quietResPct)", out["local2"]["quietResPct"], 4.86, 3.0, "more"),
       ("fully still quiet frames (quietStillPct)", out["local2"]["quietStillPct"], 4, 15, "less"),
       ("detail / texture (grad)", out["detail"]["grad"], 34.9, 28.9, "more"),
       ("flat empty blocks % (flatPct)", out["detail"]["flatPct"], 14, 16, "less"),
       ("shadow depth p5 (lower = deeper)", out["color"]["p5"], 0.148, 0.19, "less"),
       ("saturation (S)", out["color"]["S"], 0.418, 0.36, "more"),
       ("camera move peak px/f (medPeak)", out["cam"]["medPeak"], 20.4, 28, "less")]
out["vsReference"] = {}
for name, v, med_, lim, want in REF:
    bad = (v < lim) if want == "more" else (v > lim)
    out["vsReference"][name] = f"{v} (ref {med_}, limit {lim}) " + ("FIX" if bad else "ok")
out["vsReference"]["white flashes"] = "reference uses none"
print(json.dumps(out, indent=1))
if a.json: json.dump(dict(summary=out, perframe=F), open(a.json, "w"), default=float)
