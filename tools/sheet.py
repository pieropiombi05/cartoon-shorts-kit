#!/usr/bin/env python3
"""Contact sheet of rendered stills with frame numbers and times.
Usage: python3 tools/sheet.py <dir of fNNNN.jpg> <out.jpg> [--cols 6] [--w 270]
"""
import sys, glob, os, argparse
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("src"); ap.add_argument("out")
ap.add_argument("--cols", type=int, default=6); ap.add_argument("--w", type=int, default=270)
a = ap.parse_args()
files = sorted(glob.glob(os.path.join(a.src, "f*.jpg")))
if not files: sys.exit("no frames in " + a.src)
w = a.w; h = int(w * 16 / 9); bar = 24
cols = min(a.cols, len(files)); rows = (len(files) + cols - 1) // cols
sheet = Image.new("RGB", (cols * w, rows * (h + bar)), (18, 18, 22))
try: font = ImageFont.truetype("DejaVuSans-Bold.ttf", 15)
except Exception: font = ImageFont.load_default()
d = ImageDraw.Draw(sheet)
for i, f in enumerate(files):
    n = int(os.path.basename(f)[1:5])
    x, y = (i % cols) * w, (i // cols) * (h + bar)
    sheet.paste(Image.open(f).convert("RGB").resize((w, h), Image.LANCZOS), (x, y + bar))
    d.text((x + 6, y + 4), f"f{n}  {n / 30:.1f}s", fill=(235, 235, 235), font=font)
sheet.save(a.out, quality=90)
print(a.out, f"{len(files)} stills")
