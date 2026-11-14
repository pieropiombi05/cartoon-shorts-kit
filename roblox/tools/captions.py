#!/usr/bin/env python3
"""Word-by-word burned-in captions (the Roblox-shorts look): one word at a time, centred at ~60 % of the height,
white bold with a black outline and shadow, a tiny pop-in. Onomatopoeia (BOOM, SPLAT, POOF...) and words the script
writes in CAPITALS or with "!" show bigger.

Usage (from the project folder):  python3 tools/captions.py [work/timing.json] [work/captions.ass]
Then finish_rbx.sh burns work/captions.ass into the video with ffmpeg (libass) using fonts/ (Poppins Bold).
"""
import json, re, sys

src = sys.argv[1] if len(sys.argv) > 1 else "work/timing.json"
dst = sys.argv[2] if len(sys.argv) > 2 else "work/captions.ass"
T = json.load(open(src))
FPS = T.get("fps", 30)
END = T["frames"] / FPS
SOUNDS = {"boom", "crash", "splat", "snip", "ding", "poof", "whoosh", "bang", "pop", "knock", "crack", "click", "splash", "zap",
          "thud", "wham", "tink", "crunch", "smash", "slam", "beep", "ring", "roar", "swoosh", "pow", "kaboom", "snap", "drip", "creak"}

words = []
for p in T["phrases"]:
    ws = p.get("words") or []
    for w in ws:
        t = w["f"] / FPS if "f" in w else w["t"]
        words.append({"raw": w["w"], "t": t, "pend": p["t1"]})
words.sort(key=lambda w: w["t"])

def clean(s):
    return re.sub(r"^[\"'“”‘’(\[]+|[\"'“”‘’)\],.;:?…]+$", "", s.strip())

def ts(t):
    t = max(0.0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"

lines = []
words = [w for w in words if clean(w["raw"]) and not clean(w["raw"]).startswith("[")]
starts = [max(0.0, w["t"] - 0.03) for w in words]
for i, w in enumerate(words):
    txt = clean(w["raw"])
    nxt = starts[i + 1] if i + 1 < len(words) else END
    end = min(nxt, w["pend"] + 0.25, w["t"] + 1.2)
    end = max(min(end, nxt), starts[i] + 0.05)
    base = txt.strip("!").lower()
    loud = base in SOUNDS or txt.endswith("!") or (txt.isupper() and len(txt) > 1)
    show = txt.upper().strip("!") + "!" if base in SOUNDS else txt.strip("!").lower() if not loud else txt.upper()
    size = 160 if loud else 118
    pop = r"{\fscx78\fscy78\t(0,80,\fscx104\fscy104)\t(80,140,\fscx100\fscy100)}"
    lines.append(f"Dialogue: 0,{ts(starts[i])},{ts(end)},Word,,0,0,0,,{{\\pos(540,1180)\\fs{size}}}{pop}{show}")

head = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Word,Poppins,118,&H00FFFFFF,&H00FFFFFF,&H00101010,&H90000000,-1,0,0,0,100,100,0,0,1,9,6,5,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
open(dst, "w").write(head + "\n".join(lines) + "\n")
print(f"captions: {len(lines)} words -> {dst}")
