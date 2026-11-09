#!/usr/bin/env python3
"""Final loudness: one linear gain to the target integrated loudness (default -14 LUFS), then a look-ahead peak
limiter at -1 dBFS. Nothing else touches the balance set by mix.py.
Usage: python3 tools/master.py work/mix.wav work/master.wav [--lufs -14]
"""
import sys, os, argparse
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio"))
import numpy as np
from scipy.ndimage import minimum_filter1d, uniform_filter1d
from dsp import SR, read_wav, write_wav, integrated

ap = argparse.ArgumentParser(); ap.add_argument("src"); ap.add_argument("dst"); ap.add_argument("--lufs", type=float, default=-14.0)
a = ap.parse_args()
x, _ = read_wav(a.src)
li = integrated(x)
x = x * 10 ** ((a.lufs - li) / 20)
ceil = 10 ** (-1 / 20)
peak = np.abs(x).max(axis=0)
g = np.minimum(1.0, ceil / np.maximum(peak, 1e-9))
la = int(0.005 * SR)  # 5 ms look-ahead, smooth release
g = minimum_filter1d(g, 2 * la + 1)
g = uniform_filter1d(g, la)
y = np.clip(x * g[None, :], -ceil, ceil)
write_wav(a.dst, y)
print(f"{os.path.basename(a.src)}: {li:.1f} LUFS -> {integrated(y):.1f} LUFS, peak {20 * np.log10(np.abs(y).max()):.1f} dBFS")
