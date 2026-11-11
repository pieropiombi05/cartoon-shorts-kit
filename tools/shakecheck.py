#!/usr/bin/env python3
"""Shake and flicker check: finds the two things that make a short look buggy.

1. SWAY / SHAKE: the camera wobbling back and forth (frame-to-frame shift that keeps reversing direction), e.g. a
   sine "heat shake" or noise added to the camera. Kicks of up to 7 frames on an impact are fine; anything that keeps
   wobbling for 1 s or more is flagged. ("Earth without dust": +-15 px per frame, ~4 reversals per second, 23-29 s.)
2. FLICKER / POPS: pixels that change for exactly one frame and come back (things popping in and out, particles
   re-randomised every frame, a puddle outline redrawn each frame). Flagged when a frame pops over 5 %, or 5+ frames
   pop over 3.5 % within a second (clean renders with fast moves over thin ink lines stay around 2-3 %).
   ("Earth without dust": rain drops on walls, up to 18 % of the frame at 34.9 s.)
Whip cuts and hard cuts are recognised and skipped.

Usage: python3 tools/shakecheck.py out/<slug>.mp4      (works on any mp4, also a stills/life clip)
"""
import sys, subprocess
import numpy as np
from numpy.fft import fft2, ifft2
from scipy.ndimage import median_filter

W, H = 180, 320
f = sys.argv[1]
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-vf", f"scale={W}:{H}", "-f", "rawvideo", "-pix_fmt", "gray", "-"], capture_output=True).stdout
G = np.frombuffer(raw, np.uint8).reshape(-1, H, W).astype(np.float32)
n = len(G)
if n < 10: sys.exit("too few frames")
win = np.outer(np.hanning(H), np.hanning(W))
F = [fft2((g - g.mean()) * win) for g in G]
dx = np.zeros(n - 1); conf = np.zeros(n - 1)
for i in range(n - 1):
    R = F[i] * np.conj(F[i + 1]); R /= np.abs(R) + 1e-6
    r = np.real(ifft2(R)); y, x = np.unravel_index(np.argmax(r), r.shape)
    x = x if x < W / 2 else x - W
    c, m1, p1 = r[y, x % W], r[y, (x - 1) % W], r[y, (x + 1) % W]
    d = m1 - 2 * c + p1
    dx[i] = (x + (0.5 * (m1 - p1) / d if abs(d) > 1e-9 else 0)) * 6   # px at 1080 wide
    conf[i] = r.max()
mad = np.abs(np.diff(G, axis=0)).mean((1, 2))
cut = (conf < 0.08) | (np.abs(dx) > 60) | (mad > 30)           # cuts and whips: the shift is meaningless there
cut = np.convolve(cut.astype(float), np.ones(7), "same") > 0     # and 3 frames either side (whip ramps)
# --- sway: sign reversals of the horizontal shift with real amplitude, inside 1 s windows
rev = np.zeros(n - 1, bool)
for i in range(1, n - 1):
    if cut[i] or cut[i - 1]: continue
    rev[i] = np.sign(dx[i]) != np.sign(dx[i - 1]) and abs(dx[i]) > 2.5 and abs(dx[i - 1]) > 2.5
jit = np.abs(dx - median_filter(dx, 5)); jit[cut] = 0
bad = []
s = 0
while s < n - 1:
    w = slice(s, min(n - 1, s + 30))
    if rev[w].sum() >= 4 and np.sqrt((jit[w] ** 2).mean()) > 2.0: bad.append(s)
    s += 15
def ranges(frames, gap=31):
    out = []
    for fr in frames:
        if out and fr - out[-1][1] <= gap: out[-1][1] = fr + 30
        else: out.append([fr, fr + 30])
    return out
# --- flicker: one-frame pops
a, b, c = G[:-2], G[1:-1], G[2:]
d1, d2 = b - a, c - b
pop = ((np.abs(d1) > 25) & (np.abs(d2) > 25) & (np.sign(d1) != np.sign(d2)) & (np.abs(c - a) < 12)).mean((1, 2))
for i in range(len(pop)):
    if cut[i] or (i + 1 < len(cut) and cut[i + 1]): pop[i] = 0
# a single strong pop (> 4 %) or sustained pops (5+ frames over 2 % within 1 s)
# (thin ink lines crossing pixels during fast camera moves give ~2-3 % on clean renders: that is not a glitch)
dense = np.convolve((pop > 0.035).astype(float), np.ones(30), "same")
flick = [i + 1 for i in range(len(pop)) if pop[i] > 0.05 or (pop[i] > 0.035 and dense[i] >= 5)]
ok = True
for a_, b_ in ranges(bad):
    ok = False; print(f"FIX sway/shake {a_ / 30:5.1f}-{min(n, b_) / 30:5.1f} s: the camera wobbles back and forth (remove continuous shake; kicks only, max 7 frames)")
for a_, b_ in ranges(flick, gap=15):
    ok = False; seg = pop[max(0, a_ - 1):min(len(pop), b_ - 29)]
    print(f"FIX flicker {a_ / 30:5.1f}-{min(n, b_ - 29) / 30:5.1f} s: up to {100 * seg.max():.0f} % of the frame pops for one frame (particles re-randomised, outlines redrawn, objects blinking)")
print("shake/flicker: ok" if ok else "shake/flicker: fix the lines above before delivering")
