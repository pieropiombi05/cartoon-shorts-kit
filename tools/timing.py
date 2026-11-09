#!/usr/bin/env python3
"""Phrase and word timings for the voiceover, so the picture can be timed to the words.

Usage: python3 tools/timing.py voice.mp3 script.txt --out work
Writes work/phrases.json: [{"i", "text", "t0", "t1", "f0", "f1", "words": [{"w", "t", "f"}]}] and prints a table.

With faster-whisper or whisper installed it uses real word timestamps. Otherwise (the usual case) it splits the script
into phrases at punctuation, finds the pauses in the voice (silence detection), and places phrase boundaries by
syllable count over the speaking time, snapping each boundary to a nearby pause (sentence ends strongly, commas
weakly). Words inside a phrase are spread by syllables. Claude cannot hear: check that pauses fall at sentence ends.
"""
import sys, os, re, json, argparse, subprocess

ap = argparse.ArgumentParser(); ap.add_argument("voice"); ap.add_argument("script"); ap.add_argument("--out", default="work")
ap.add_argument("--fps", type=int, default=30); ap.add_argument("--db", type=float, default=-35.0); ap.add_argument("--min-pause", type=float, default=0.18)
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
FPS = a.fps
text = open(a.script).read().strip()
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", a.voice], capture_output=True, text=True).stdout)

def syl(w):
    w = re.sub(r"[^a-z]", "", w.lower())
    if not w: return 1 if re.search(r"\d", w) else 0
    v = re.findall(r"[aeiouy]+", w); n = len(v)
    if w.endswith("e") and n > 1 and not w.endswith(("le", "ee")): n -= 1
    return max(1, n)

# phrases: split after . ! ? ; : , — (keep the punctuation)
parts = [p.strip() for p in re.split(r"(?<=[.!?;:,—])\s+|(?<=[.!?,][\"”'])\s+|\s+(?=—)", text) if p.strip()]
phr = [{"text": p, "end": ("sent" if re.search(r"[.!?]['\"”]?$", p) else "comma"), "words": p.split()} for p in parts]
for p in phr: p["syl"] = sum(syl(w) for w in p["words"])

def try_whisper():
    try:
        from faster_whisper import WhisperModel
        segs, _ = WhisperModel("base.en", compute_type="int8").transcribe(a.voice, word_timestamps=True)
        return [(w.word.strip(), w.start, w.end) for s in segs for w in s.words]
    except Exception:
        try:
            import whisper
            r = whisper.load_model("base.en").transcribe(a.voice, word_timestamps=True)
            return [(w["word"].strip(), w["start"], w["end"]) for s in r["segments"] for w in s["words"]]
        except Exception:
            return None

words = try_whisper()
out = []
if words:
    k = 0
    for i, p in enumerate(phr):
        ws = []
        for w in p["words"]:
            if k < len(words): ws.append({"w": w, "t": words[k][1]}); k += 1
            else: ws.append({"w": w, "t": dur})
        t0 = ws[0]["t"]; t1 = words[min(k, len(words)) - 1][2] if k else dur
        out.append({"i": i, "text": p["text"], "t0": t0, "t1": t1, "words": ws})
    method = "whisper word timestamps"
else:
    log = subprocess.run(["ffmpeg", "-hide_banner", "-i", a.voice, "-af", f"silencedetect=noise={a.db}dB:d={a.min_pause}", "-f", "null", "-"], capture_output=True, text=True).stderr
    st = [float(x) for x in re.findall(r"silence_start: ([\d.]+)", log)]; en = [float(x) for x in re.findall(r"silence_end: ([\d.]+)", log)]
    sil = list(zip(st, en + [dur] * (len(st) - len(en))))
    lead = sil[0][1] if sil and sil[0][0] < 0.05 else 0.0
    tail = sil[-1][0] if sil and sil[-1][1] >= dur - 0.05 else dur
    pauses = [(s, e) for s, e in sil if s > lead + 0.05 and e < tail - 0.05]
    # DP over "anchors": each phrase boundary either sits in one of the detected pauses (monotonic) or is placed by
    # syllables between its neighbouring anchors. Cost: deviation of each stretch's speaking rate from the global rate,
    # plus penalties for sentence ends without a pause (high), commas without a pause (low) and pauses that fall
    # inside a phrase (medium).
    import math
    syls = [p["syl"] for p in phr]; nb = len(phr) - 1
    cs = [0]
    for x in syls: cs.append(cs[-1] + x)
    P = [(lead, lead)] + pauses + [(tail, tail)]             # virtual pauses at start and end
    pd = [e - s for s, e in P]; cpd = [0.0]
    for x in pd: cpd.append(cpd[-1] + x)
    total_speak = (tail - lead) - sum(e - s for s, e in pauses)
    rate0 = cs[-1] / max(0.1, total_speak)
    pen = lambda b: 3.0 if phr[b - 1]["end"] == "sent" else 0.35   # boundary b sits after phrase b-1
    INF = float("inf")
    # state (b, j): boundary b (0 = start, nb+1 = end) anchored at pause j (0 = start, len(P)-1 = end)
    B, J = nb + 2, len(P)
    cost = {(0, 0): 0.0}; back = {}
    for b in range(1, B):
        for j in range(1, J):
            if (b == B - 1) != (j == J - 1): continue
            best, arg = INF, None
            for (b0, j0), c0 in list(cost.items()):
                if b0 >= b or j0 >= j or b - b0 > 8: continue
                syl_seg = cs[b] - cs[b0]
                speak = P[j][0] - P[j0][1] - (cpd[j] - cpd[j0 + 1])
                if speak <= 0.05 or syl_seg <= 0: continue
                c = c0 + syl_seg * 4.0 * math.log((syl_seg / speak) / rate0) ** 2
                c += sum(pen(k) for k in range(b0 + 1, b)) + 1.0 * (j - j0 - 1)
                if c < best: best, arg = c, (b0, j0)
            if arg is not None: cost[(b, j)] = best; back[(b, j)] = arg
    node = (B - 1, J - 1); chain = [node]
    while node != (0, 0): node = back[node]; chain.append(node)
    chain.reverse()
    bt = [None] * B   # (start, end) real time of each boundary
    snapped = [False] * B
    for (b0, j0), (b1, j1) in zip(chain, chain[1:]):
        bt[b0] = P[j0]; bt[b1] = P[j1]; snapped[b0] = snapped[b1] = True
        inner = pauses[j0:j1 - 1]                             # pauses inside this stretch (P index j = pauses[j-1])
        t_a, t_b = P[j0][1], P[j1][0]
        speak = t_b - t_a - sum(e - s for s, e in inner)
        def s2r(x, t=t_a):
            for s_, e_ in inner:
                if t + x <= s_: return t + x
                x -= max(0.0, s_ - t); t = e_
            return t + x
        for k in range(b0 + 1, b1):
            x = s2r(speak * (cs[k] - cs[b0]) / (cs[b1] - cs[b0]))
            bt[k] = (x, x)
    bounds = [(bt[k][0], bt[k][1], snapped[k]) for k in range(1, B - 1)]
    t_prev = lead
    for i, p in enumerate(phr):
        t1 = bounds[i][0] if i < len(bounds) else tail
        ws, acc = [], 0
        for w in p["words"]:
            ws.append({"w": w, "t": round(t_prev + (t1 - t_prev) * acc / max(1, p["syl"]), 3)}); acc += syl(w)
        out.append({"i": i, "text": p["text"], "t0": round(t_prev, 3), "t1": round(t1, 3), "snapped": bounds[i][2] if i < len(bounds) else True, "words": ws})
        t_prev = bounds[i][1] if i < len(bounds) else tail
    method = f"pause snapping ({len(pauses)} pauses, {sum(1 for b in bounds if b[2])}/{len(bounds)} boundaries snapped)"
for o in out:
    o["f0"] = round(o["t0"] * FPS); o["f1"] = round(o["t1"] * FPS)
    for w in o["words"]: w["f"] = round(w["t"] * FPS)
json.dump(out, open(os.path.join(a.out, "phrases.json"), "w"), indent=1)
# timing.json is what story.ts imports: TOTAL = frames, phrase frames for the shot plan
json.dump({"dur": round(dur, 3), "fps": FPS, "frames": round(dur * FPS), "phrases": out}, open(os.path.join(a.out, "timing.json"), "w"), indent=1)
print(f"voice {dur:.2f} s = {round(dur * FPS)} frames | {method}")
for o in out:
    mark = "" if o.get("snapped", True) else "  (no pause found: interpolated)"
    print(f"{o['i']:>3} f{o['f0']:>5}-{o['f1']:<5} {o['t0']:6.2f}-{o['t1']:6.2f}s  {o['text'][:70]}{mark}")
