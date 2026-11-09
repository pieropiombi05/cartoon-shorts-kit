#!/usr/bin/env python3
"""QA of a finished short: frozen spans, black frames, loudness, the loop seam (first vs last frame) and a contact
sheet every 2 s. Usage: python3 tools/qa.py out/video.mp4 out/qa_sheet.jpg
Exit code 0 always; read the printed verdict lines (OK / FIX).
"""
import sys, subprocess, re, os, tempfile
import numpy as np
from PIL import Image

src, sheet = sys.argv[1], sys.argv[2]
def run(args): return subprocess.run(args, capture_output=True, text=True).stderr
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", src], capture_output=True, text=True).stdout)
log = run(["ffmpeg", "-hide_banner", "-i", src, "-vf", "freezedetect=n=0.003:d=0.4,blackdetect=d=0.1:pix_th=0.06", "-an", "-f", "null", "-"])
freezes = re.findall(r"freeze_start: ([\d.]+).*?freeze_duration: ([\d.]+)", log, re.S)
blacks = re.findall(r"black_start:([\d.]+) black_end:([\d.]+)", log)
loud = run(["ffmpeg", "-hide_banner", "-i", src, "-af", "ebur128=peak=true", "-f", "null", "-"])
I = re.findall(r"I:\s+(-?[\d.]+) LUFS", loud); TP = re.findall(r"Peak:\s+(-?[\d.]+) dBFS", loud)
print(f"duration {dur:.2f} s")
print(("FIX" if freezes else "OK ") + f"  frozen spans >= 0.4 s: {[(float(a), float(b)) for a, b in freezes] or 'none'}")
print(("FIX" if blacks else "OK ") + f"  black frames: {blacks or 'none'}")
if I: print(("OK " if abs(float(I[-1]) + 14) < 1.5 else "FIX") + f"  loudness {I[-1]} LUFS, true peak {TP[-1] if TP else '?'} dBFS")
# loop seam: first vs last frame (downscaled mean abs difference, 0..255)
td = tempfile.mkdtemp()
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", "scale=108:192", "-frames:v", "1", f"{td}/a.png"])
subprocess.run(["ffmpeg", "-v", "error", "-y", "-sseof", "-0.1", "-i", src, "-vf", "scale=108:192", "-update", "1", f"{td}/b.png"])
A = np.asarray(Image.open(f"{td}/a.png").convert("L"), float); B = np.asarray(Image.open(f"{td}/b.png").convert("L"), float)
d = float(np.abs(A - B).mean())
print(("OK " if d < 12 else "FIX") + f"  loop seam: first vs last frame differ by {d:.1f}/255 (< 12 reads as a seamless loop)")
# sheet: one frame every 2 s
n = max(1, int(dur // 2))
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-vf", f"fps=0.5,scale=216:384,tile={min(n, 10)}x{(n + 9) // 10}", "-frames:v", "1", sheet])
print("sheet", sheet)
