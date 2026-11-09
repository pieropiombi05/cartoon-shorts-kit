#!/usr/bin/env python3
"""Level-locked mix: voice unchanged, music bed at 50 % of the voice (-6 dB), SFX at 50 % with peaks capped.

Usage: python3 tools/mix.py voice.mp3 work/music.wav work/sfx.wav [--music-db -6] [--sfx-db -6] [--out work]
Writes work/mix.wav (voice + music + sfx) and work/mix_nomusic.wav (voice + sfx), 48 kHz stereo, exactly as long
as the voice. Levels are gated RMS (only where each stem is active), so silence doesn't bend the ratio. No ducking,
no compression: the ratio stays as measured. Prints the measured levels for the QA line.
"""
import sys, os, argparse, subprocess
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio"))
import numpy as np
from dsp import SR, read_wav, write_wav, st

ap = argparse.ArgumentParser()
ap.add_argument("voice"); ap.add_argument("music"); ap.add_argument("sfx")
ap.add_argument("--music-db", type=float, default=-6.0); ap.add_argument("--sfx-db", type=float, default=-6.0)
ap.add_argument("--out", default="work")
a = ap.parse_args()

def load(p):
    if True:  # decode anything (mp3, wav, m4a) to 48 kHz stereo
        tmp = os.path.join(a.out, "_" + os.path.basename(p) + ".48k.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", p, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s24le", tmp], check=True)
        x, _ = read_wav(tmp); os.remove(tmp); return st(x)

def gated_rms(x, gate_db=-35.0, win=0.4):
    m = x.mean(axis=0); n = int(win * SR)
    k = len(m) // n
    if k == 0: return float(np.sqrt((m ** 2).mean()) + 1e-12)
    blocks = np.sqrt((m[: k * n].reshape(k, n) ** 2).mean(axis=1)) + 1e-12
    top = blocks.max()
    act = blocks[20 * np.log10(blocks / top) > gate_db]
    return float(np.sqrt((act ** 2).mean()))

v = load(a.voice); N = v.shape[1]
mu = load(a.music); sx = load(a.sfx)
fit = lambda x: np.pad(x, ((0, 0), (0, max(0, N - x.shape[1]))))[:, :N]
mu, sx = fit(mu), fit(sx)
rv = gated_rms(v)
gm = rv * 10 ** (a.music_db / 20) / gated_rms(mu) if np.abs(mu).max() > 0 else 0.0
mu = mu * gm
if np.abs(sx).max() > 0:
    gs = rv * 10 ** (a.sfx_db / 20) / gated_rms(sx, -30)
    sx = sx * gs
    cap = 0.7 * np.abs(v).max()
    over = np.abs(sx).max(axis=0) / cap
    if over.max() > 1:  # cap peaks: smooth gain reduction only where a hit pokes out (never raises anything)
        g = 1 / np.maximum(1, over)
        k = int(0.02 * SR)
        from scipy.ndimage import minimum_filter1d, uniform_filter1d
        g = uniform_filter1d(minimum_filter1d(g, k), k)
        sx = sx * g[None, :]
db = lambda x: 20 * np.log10(max(1e-12, x))
print(f"voice gated RMS {db(rv):.1f} dBFS | music {db(gated_rms(mu)) - db(rv):+.1f} dB vs voice | sfx {db(gated_rms(sx, -30)) - db(rv):+.1f} dB vs voice, "
      f"sfx peak {np.abs(sx).max() / max(1e-9, np.abs(v).max()):.2f} x voice peak")
os.makedirs(a.out, exist_ok=True)
write_wav(os.path.join(a.out, "mix.wav"), v + mu + sx)
write_wav(os.path.join(a.out, "mix_nomusic.wav"), v + sx)
print("wrote", os.path.join(a.out, "mix.wav"), os.path.join(a.out, "mix_nomusic.wav"))
