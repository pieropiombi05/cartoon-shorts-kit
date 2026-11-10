#!/usr/bin/env python3
"""QA of a finished short, every frame: frozen spans, black / white frames, pops (one-frame jumps that aren't planned),
camera motion stats against the measured reference, loudness, the loop seam (first vs last frame) and a contact sheet
every 2 s. Per-frame checks adapted from mromidev/claude-animated-shorts templates/scripts/short_qa.py (MIT).
Usage: python3 tools/qa.py out/video.mp4 out/qa_sheet.jpg [planned.json]
  planned.json (optional): {"flash": [[a, b], ...], "cuts": [f, ...], "xfade": [[a, b], ...]} frames to ignore for pops/white
Exit code 0 always; read the printed verdict lines (OK / FIX / NOTE).
"""
import sys, subprocess, re, os, tempfile
import numpy as np
from PIL import Image

src, sheet = sys.argv[1], sys.argv[2]
import json
meta = json.load(open(sys.argv[3])) if len(sys.argv) > 3 and os.path.exists(sys.argv[3]) else {}
planned = set()
for a, b in meta.get("flash", []) + meta.get("xfade", []): planned.update(range(a - 1, b + 2))
for c in meta.get("cuts", []): planned.update((c - 1, c, c + 1))
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
# per-frame: luma, frame-to-frame difference, pops, white frames, holds
W, H = 90, 160
raw = subprocess.run(["ffmpeg", "-v", "error", "-i", src, "-vf", f"scale={W}:{H}:flags=area", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
Fr = np.frombuffer(raw, np.uint8).reshape(-1, H, W, 3).astype(np.int16)
n = len(Fr)
luma = (Fr.astype(np.float32) / 255 @ np.array([0.2126, 0.7152, 0.0722], np.float32)).reshape(n, -1).mean(1)
diff = np.abs(np.diff(Fr, axis=0)).mean(axis=(1, 2, 3))
med = np.array([np.median(diff[max(0, i - 8):i + 9]) for i in range(len(diff))])
pops = [i + 1 for i in range(len(diff)) if diff[i] > 3 * med[i] + 1.0 and (i + 1) not in planned]
white = [i for i in range(n) if luma[i] > 0.93 and i not in planned]
held = float((diff < 0.3).mean() * 100)
print(("NOTE" if pops else "OK ") + f"  pops (one-frame jumps, cuts included unless listed in planned.json): {pops[:30] or 'none'}")
print(("FIX" if white else "OK ") + f"  unplanned white frames: {white[:20] or 'none'}")
print(f"INFO motion: mean frame diff {diff.mean():.2f}, near-still frames {held:.0f} % (reference: ~10 % dead still, 65 % moving)")
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
