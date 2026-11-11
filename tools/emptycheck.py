#!/usr/bin/env python3
"""Empty-space check for look-check stills: finds big flat, featureless areas (plain sky, bare wall, empty floor, a giant
cropped face) that make a frame read as empty. Calibrated on 40 frames of 8 Ricks Clips shorts with this exact metric:
flat median 27 % (p75 34 %), largest empty area median 10 % (p75 17 %). Our whisky short: flat median 51 %.

Usage: python3 tools/emptycheck.py stills/a            (every .jpg/.png in the folder)
Per still: flat % (8x8 blocks with almost no detail), the largest connected flat area %, and FIX when the frame has
more than 40 % flat or a single flat area over 25 % of the frame. The caption band is NOT excluded (there are none).
"""
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage

d = sys.argv[1]
fs = sorted(f for f in os.listdir(d) if f.lower().endswith((".jpg", ".png")))
bad = 0
for f in fs:
    g = np.asarray(Image.open(os.path.join(d, f)).convert("L").resize((180, 320)), np.float32)
    B = g[: 320 // 8 * 8, : 180 // 8 * 8].reshape(40, 8, 22, 8).swapaxes(1, 2)
    flat = (B.std(axis=(2, 3)) < 3.0) & (np.abs(np.diff(B, axis=3)).mean(axis=(2, 3)) < 1.6)
    lab, n = ndimage.label(flat)
    big = max((np.sum(lab == i) for i in range(1, n + 1)), default=0) / flat.size
    fp = flat.mean()
    fix = fp > 0.40 or big > 0.25
    bad += fix
    print(f"{f:16s} flat {fp * 100:4.0f} %  largest empty area {big * 100:4.0f} %  {'FIX: fill it (props, extras, a wall, a lower horizon) or reframe' if fix else 'ok'}")
print(f"{bad} of {len(fs)} stills need more in the frame (reference: flat ~27 %, largest area ~10 %)")
