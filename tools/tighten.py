#!/usr/bin/env python3
"""Tighten a voiceover's pauses without touching the voice itself (no time-stretch, no pitch change).

Measured on 20 top Ricks Clips shorts (docs/reference/hooks.md): the voice starts ~0.12 s into the video, the hook
sentence runs straight into the next one with no audible pause (9 of 20 have no pause at all in the first 5 s), and the
pace is ~4 words/s in the first 3 s and ~3.7 words/s overall. TTS voiceovers usually start with 0.2-0.5 s of silence and
leave 0.4-0.8 s between sentences, which costs the hook and the retention.

What it does: cuts leading silence to --lead (0.05 s); shortens every internal pause longer than --gap (0.28 s) to --gap,
and in the first --hook-sec (5 s) to --hook-gap (0.12 s); ends with --tail (0.35 s). Each splice gets a 12 ms crossfade.

--tempo speeds the delivery up without changing the pitch (ffmpeg atempo). Up to ~1.12 it still sounds natural; above
that, ask for a faster TTS render instead (ElevenLabs speed 1.15-1.2).

Usage: python3 tools/tighten.py voice.mp3 voice_tight.wav [--gap 0.28] [--hook-gap 0.12] [--tempo 1.0] [--script script.txt]
Then use voice_tight.wav everywhere (timing.py, audio.py --dur, mix.py, finish.sh).
"""
import sys, subprocess, argparse
import numpy as np
from scipy.io import wavfile

ap = argparse.ArgumentParser()
ap.add_argument("inp"); ap.add_argument("out")
ap.add_argument("--gap", type=float, default=0.28); ap.add_argument("--hook-gap", type=float, default=0.12)
ap.add_argument("--hook-sec", type=float, default=5.0); ap.add_argument("--lead", type=float, default=0.05)
ap.add_argument("--tail", type=float, default=0.35); ap.add_argument("--thresh-db", type=float, default=-38)
ap.add_argument("--script")
ap.add_argument("--tempo", type=float, default=1.0, help="speed the voice up without changing pitch (ffmpeg atempo); keep <= 1.12")
a = ap.parse_args()
SR = 48000
af = ["-af", f"atempo={a.tempo:.3f}"] if abs(a.tempo - 1) > 1e-3 else []
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", a.inp, *af, "-ac", "2", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True).stdout
x = np.frombuffer(raw, np.float32).reshape(-1, 2).copy()
if not len(x): sys.exit("could not decode " + a.inp)
hop = int(0.01 * SR); n = len(x) // hop
e = np.sqrt((x[:n * hop].mean(1).reshape(n, hop) ** 2).mean(1))
ref = np.percentile(e[e > 1e-5], 95) if (e > 1e-5).any() else 1
loud = 20 * np.log10(np.maximum(e, 1e-9) / ref) > a.thresh_db
# fill short dips (< 60 ms) inside words so plosives and stops are not treated as pauses
idx = np.flatnonzero(loud)
if not len(idx): sys.exit("no speech found")
for i in range(len(idx) - 1):
    if 1 < idx[i + 1] - idx[i] <= 6: loud[idx[i]:idx[i + 1]] = True
first, last = idx[0], idx[-1] + 1
segs, i = [], first   # speech runs [s, e) in hops
while i < last:
    if loud[i]:
        j = i
        while j < last and loud[j]: j += 1
        segs.append([i, j]); i = j
    else: i += 1
pad = 3   # keep 30 ms of each pause edge (breaths / decays)
out, fade = [], int(0.012 * SR)
def piece(s, e): return x[s * hop:e * hop]
lead = np.zeros((int(a.lead * SR), 2), np.float32); out.append(lead)
t_out = a.lead; before = len(x) / SR * a.tempo
for k, (s, e) in enumerate(segs):
    seg = piece(max(0, s - (pad if k else 1)), e + pad)
    out.append(seg); t_out += len(seg) / SR
    if k + 1 < len(segs):
        g = (segs[k + 1][0] - e - 2 * pad) * hop / SR
        lim = a.hook_gap if t_out < a.hook_sec else a.gap
        keep = max(0.0, min(g, lim))
        if keep > 0: out.append(np.zeros((int(keep * SR), 2), np.float32)); t_out += keep
out.append(np.zeros((int(a.tail * SR), 2), np.float32))
# crossfade-free joins are fine because every cut lands in near-silence; still smooth each boundary
y = np.concatenate(out)
ramp = np.linspace(0, 1, fade, dtype=np.float32)[:, None]
pos = 0
for p in out[:-1]:
    pos += len(p)
    if fade < pos < len(y) - fade:
        y[pos - fade:pos] *= ramp[::-1] * 0.5 + 0.5; y[pos:pos + fade] *= ramp * 0.5 + 0.5
wavfile.write(a.out, SR, np.clip(y, -1, 1))
after = len(y) / SR
msg = f"{a.inp}: {before:.2f} s -> {after:.2f} s (tempo x{a.tempo:.2f}) ({100 * (1 - after / before):.0f} % shorter), speech starts at {a.lead:.2f} s"
if a.script:
    w = len(open(a.script).read().split()); msg += f", pace {w / before:.2f} -> {w / after:.2f} words/s (reference ~3.7, hook ~4)"
print(msg)
