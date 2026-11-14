#!/usr/bin/env bash
# Finish a Roblox short: word-by-word captions burned in, master both mixes, encode, QA.
# Usage (from the project folder): bash tools/finish_rbx.sh "Title" [voice.wav]
# Env: CAPTIONS=0 skip the burned-in captions · CLEAN=1 also write out/<slug>_clean.mp4 (no captions) ·
#      LOOP_XFADE=N blend the last N frames toward frame 0
# Needs: frames/f0000.jpg.., work/timing.json, work/mix.wav and work/mix_nomusic.wav (from mix.py), fonts/ (setup_rbx.sh).
set -euo pipefail
TITLE="${1:-short}"; VOICE="${2:-voice.wav}"
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-|-$//g')
mkdir -p out work
DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$VOICE")
N=$(python3 -c "print(round($DUR*30))")
HAVE=$(ls frames/f*.jpg | wc -l)
[ "$HAVE" -ge "$N" ] || { echo "only $HAVE of $N frames rendered"; exit 1; }
if [ "${LOOP_XFADE:-0}" -gt 0 ]; then
  python3 - "$N" "$LOOP_XFADE" <<'EOF'
import sys, os, shutil
from PIL import Image
N, K = int(sys.argv[1]), int(sys.argv[2])
os.makedirs("frames/_orig", exist_ok=True)
first = Image.open("frames/f0000.jpg").convert("RGB")
for i in range(K):
    f = N - K + i; p = f"frames/f{f:04d}.jpg"; o = f"frames/_orig/f{f:04d}.jpg"
    if not os.path.exists(o): shutil.copy(p, o)
    t = (i + 1) / (K + 1); t = t * t * (3 - 2 * t)
    Image.blend(Image.open(o).convert("RGB"), first, t).save(p, quality=95)
print(f"loop crossfade on the last {K} frames")
EOF
fi
python3 tools/master.py work/mix.wav work/master.wav
python3 tools/master.py work/mix_nomusic.wav work/master_nomusic.wav
VF="null"
if [ "${CAPTIONS:-1}" != "0" ]; then
  python3 tools/captions.py work/timing.json work/captions.ass
  VF="ass=work/captions.ass:fontsdir=fonts"
fi
ffmpeg -v error -y -framerate 30 -i frames/f%04d.jpg -i work/master.wav \
  -map 0:v -map 1:a -frames:v "$N" -vf "$VF" -c:v libx264 -preset veryfast -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart \
  -metadata title="$TITLE" "out/$SLUG.mp4"
ffmpeg -v error -y -i "out/$SLUG.mp4" -i work/master_nomusic.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart \
  "out/${SLUG}_nomusic.mp4"
if [ "${CLEAN:-0}" = "1" ]; then
  ffmpeg -v error -y -framerate 30 -i frames/f%04d.jpg -i work/master.wav -map 0:v -map 1:a -frames:v "$N" -c:v libx264 -preset veryfast -crf 17 -pix_fmt yuv420p -c:a aac -b:a 192k -ar 48000 -shortest -movflags +faststart "out/${SLUG}_clean.mp4"
  echo "out/${SLUG}_clean.mp4"
fi
python3 tools/qa.py "out/$SLUG.mp4" out/qa_sheet.jpg work/planned.json
echo "out/$SLUG.mp4"
echo "out/${SLUG}_nomusic.mp4"
