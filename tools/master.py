#!/usr/bin/env python3
"""Final loudness: one linear gain to the target integrated loudness (default -14 LUFS), then a look-ahead peak
true-peak limiter at -1.5 dBTP. Nothing else touches the balance set by mix.py.
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
# true-peak limiter: per-sample gain from the 4x oversampled peak envelope (AAC encoding adds inter-sample overs, so a
# plain sample clip at -1 dBFS still decoded above 0 dBFS), 5 ms look-ahead, 60 ms release, ceiling -1.5 dBTP
from scipy.signal import resample_poly
ceil = 10 ** (-1.5 / 20)
up = np.abs(resample_poly(x, 4, 1, axis=1)).max(axis=0)   # x is (channels, samples)
env = up[: len(up) // 4 * 4].reshape(-1, 4).max(axis=1)
env = np.pad(env, (0, x.shape[1] - len(env)), mode="edge")
g = np.minimum(1.0, ceil / np.maximum(env, 1e-9))
la = int(0.005 * SR)
g = minimum_filter1d(g, 2 * la + 1)
g = np.minimum(g, uniform_filter1d(minimum_filter1d(g, int(0.06 * SR)), int(0.06 * SR)))
g = uniform_filter1d(g, la)
y = np.clip(x * g[None, :], -ceil, ceil)
write_wav(a.dst, y)
print(f"{os.path.basename(a.src)}: {li:.1f} LUFS -> {integrated(y):.1f} LUFS, peak {20 * np.log10(np.abs(y).max()):.1f} dBFS")
