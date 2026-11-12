#!/usr/bin/env python3
"""Music bed + SFX stems for a short (own synthesis, numpy + scipy).

Usage (from the project folder):
  python3 tools/audio.py --dur 54.32 --mood quirky --cues work/cues.json [--dip 41.2] [--track music_user.mp3] --out work

Writes work/music.wav and work/sfx.wav (48 kHz stereo, exactly --dur long). Levels against the voice are set later by
mix.py, so stems are just normalised here.

MUSIC: one mood, one 8-bar loop, the whole video. The tempo is nudged (< 8 %) so the video length is a whole number
of bars, and the loop is rendered circularly (reverb tail wrapped), so the end flows back into the start and a Shorts
replay sounds continuous. --dip t: the bed drops 6 dB for one beat at t (the twist). --track: use the user's file
instead (trimmed, faded only at a bar-free crossfade into its own start so the loop also holds).
Moods: quirky (pizzicato + marimba-ish vibes, 104 bpm, major), mysterious (pad + music box, 84 bpm, minor),
epic (low string ostinato + pad + timpani, 90 bpm, minor), calm (soft pad + glock, 80 bpm, major).

SFX cues (work/cues.json): [{"t": 3.2, "kind": "whoosh", "gain": 1.0, "dur": 0.6, "pan": 0.0}, ...]
kinds: whoosh, swoosh, thunk, stamp, ting, sting, rumble, crash, collapse, creak, crack, snap, splash, bubbles, pop,
clink, rattle, step, steps, hammer, thump, birds, crickets, wind, water, flutter, tick, bell.
Unknown kinds are an error (so typos don't silently vanish).
DISABLED (skipped with a warning): crowd, laugh, cheer, applause, oof, whoa, gasp. They are synthesized human voices and
crowd noise, and the user found them horrible ("What If Earth Stopped Spinning", Nov 2026). People reacting is shown in
the picture, not heard.
"""
import sys, os, json, argparse, subprocess
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "audio"))
import numpy as np
from dsp import SR, ns, tt, rng, lp, hp, bp, peq, fades, pan, place, make_ir, convolve_st, write_wav, read_wav, colored, ramp, st
import instruments as I
import sfx_gen as S

ap = argparse.ArgumentParser()
ap.add_argument("--dur", type=float, required=True)
ap.add_argument("--mood", default="quirky", choices=["quirky", "mysterious", "epic", "calm"])
ap.add_argument("--cues", default=None)
ap.add_argument("--dip", type=float, action="append", default=[])
ap.add_argument("--track", default=None)
ap.add_argument("--seed", type=int, default=7)
ap.add_argument("--out", default="work")
a = ap.parse_args()
os.makedirs(a.out, exist_ok=True)
N = ns(a.dur)
F = I.m2f

# ------------------------------------------------------------------ music
NAMES = {"C": 0, "C#": 1, "Db": 1, "D": 2, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "Ab": 8, "A": 9, "Bb": 10, "B": 11}
def chord(name, base=48):
    """'Am' -> midi triad around `base`; 'G7' adds the seventh"""
    root = name[:2] if len(name) > 1 and name[1] in "#b" else name[:1]
    q = name[len(root):]
    r = NAMES[root]
    third = 3 if q.startswith("m") and not q.startswith("maj") else 4
    notes = [r, r + third, r + 7] + ([r + 10] if q.endswith("7") and not q.endswith("maj7") else [])
    lo = base + ((r - base) % 12)
    return [lo + (n - r) for n in notes]

MOODS = {
    "quirky": dict(bpm=104, prog=["C", "Am", "F", "G", "C", "Am", "Dm", "G7"]),
    "calm": dict(bpm=80, prog=["F", "C", "Dm", "Bb", "F", "C", "Bb", "C"]),
    "mysterious": dict(bpm=84, prog=["Am", "F", "C", "G", "Am", "F", "Dm", "E"]),
    "epic": dict(bpm=90, prog=["Dm", "Bb", "F", "C", "Dm", "Bb", "Gm", "A"]),
}

def soft_kick(vel=0.7):
    t = tt(0.35); f = 48 + 70 * np.exp(-t / 0.03)
    return fades(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12) * vel, 0.001, 0.05)
def shaker(vel=0.25, r=None):
    r = r or rng(1); t = tt(0.09)
    return fades(hp(r.standard_normal(len(t)), 5000) * np.exp(-t / 0.025) * vel, 0.002, 0.02)

def render_loop(mood, bpm, r):
    """one 8-bar loop (stereo), dry, plus a reverb send"""
    beat = 60.0 / bpm; bar = 4 * beat; L = ns(8 * bar)
    dry = np.zeros((2, L)); send = np.zeros((2, L))
    def put(x, t, g=1.0, p=0.0, wet=0.25):
        x = st(pan(x, p)) if np.asarray(x).ndim == 1 else np.asarray(x)
        i = ns(t) % L; n = x.shape[1]
        idx = (np.arange(n) + i) % L          # circular: tails wrap to the loop start
        np.add.at(dry, (slice(None), idx), x * g)
        np.add.at(send, (slice(None), idx), x * g * wet)
    prog = MOODS[mood]["prog"]
    for b, name in enumerate(prog):
        t0 = b * bar
        tri = chord(name, 55)                   # mid voicing ~G3..D5
        bass = chord(name, 36)[0]               # root ~C2..B2
        if mood == "quirky":
            for k in (0, 2): put(I.pluck(F(bass + (12 if k == 2 and b % 2 else 0)), 0.8, r, 0.5, 0.35), t0 + k * beat, 0.9, 0.0, 0.1)
            for k in (1, 3):
                for j, n in enumerate(tri): put(I.pluck(F(n + 12), 0.45, r, 0.35, 0.6), t0 + k * beat + j * 0.012, 0.5, -0.3 + 0.3 * j, 0.25)
            for k in range(4): put(soft_kick(0.55 if k in (0, 2) else 0.0), t0 + k * beat, 0.8, 0, 0.0)
            for k in range(8): put(shaker(0.22 if k % 2 else 0.12, r), t0 + k * beat / 2, 0.7, 0.35, 0.05)
            # sparse melody: 3 chord tones, off the voice's way (C5..C6), on the "and" of beats
            if b % 2 == 0 or b == 7:
                mel = [tri[2] + 12, tri[1] + 12, tri[0] + 24] if b % 4 == 0 else [tri[0] + 24, tri[2] + 12, tri[1] + 24]
                for j, n in enumerate(mel): put(I.vibes(F(n), 0.35, r, 1.0, trem_depth=0.15), t0 + (0.5 + j) * beat, 0.45, 0.25, 0.35)
        elif mood == "calm":
            put(I.pad([F(n) for n in tri], bar * 0.98, 0.45, r, att=0.5, rel=0.8, warm=700), t0, 0.7, 0, 0.4)
            put(I.pluck(F(bass), 0.6, r, 1.2, 0.3), t0, 0.7, 0, 0.1)
            for j, k in enumerate((0.5, 1.5, 2.5)):
                put(I.glock(F(tri[(j + b) % 3] + 24), 0.25, r, 1.2), t0 + k * beat, 0.35, 0.3 - 0.3 * j, 0.45)
        elif mood == "mysterious":
            put(I.pad([F(n) for n in tri], bar * 0.98, 0.5, r, att=0.8, rel=1.0, warm=600, detune=9), t0, 0.75, 0, 0.5)
            for k in range(4): put(I.pluck(F(bass), 0.5, r, 0.8, 0.2), t0 + k * beat, 0.45 if k else 0.7, 0, 0.1)
            arp = [tri[0] + 24, tri[1] + 24, tri[2] + 24, tri[1] + 24]
            for k in range(8):
                if (k + b) % 3 != 2: put(I.musicbox(F(arp[k % 4]), 0.3, r, 1.4), t0 + k * beat / 2, 0.35, -0.4 + 0.1 * k, 0.55)
        else:  # epic
            put(I.pad([F(n) for n in tri], bar * 0.98, 0.45, r, att=0.4, rel=0.8, warm=1100), t0, 0.6, 0, 0.4)
            for k in range(16): put(I.pluck(F(bass + (12 if k % 4 == 2 else 0)), 0.55, r, 0.3, 0.45), t0 + k * beat / 4, 0.5, 0, 0.1)
            put(I.timpani(F(bass + 12), 0.6 if b % 2 == 0 else 0.4, r, 1.6), t0, 0.6, 0, 0.3)
            if b == 7: put(I.cymbal(0.35, r, 2.0), t0 + 2 * beat, 0.4, 0.2, 0.4)
    ir = make_ir(1.6 if mood != "quirky" else 1.1, a.seed, hf=1.6)
    # circular reverb: convolve three copies and keep the middle one, so the tail wraps around the loop seam
    wet = convolve_st(np.concatenate([send] * 3, axis=1), ir)[:, L:2 * L]
    x = dry + 0.55 * wet
    x = peq(x, 2500, -4.0, 0.8)          # leave room for the voice
    x = lp(x, 8500, 2)
    return x

def music():
    r = rng(a.seed)
    if a.track:
        tmp = os.path.join(a.out, "_track.wav")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", a.track, "-ar", str(SR), "-ac", "2", tmp], check=True)
        x, _ = read_wav(tmp)
        if x.shape[1] < N:  # loop it with a 0.4 s crossfade
            xf = ns(0.4); out = x.copy()
            while out.shape[1] < N + xf:
                w = np.linspace(0, 1, xf)
                seam = out[:, -xf:] * (1 - w) + x[:, :xf] * w
                out = np.concatenate([out[:, :-xf], seam, x[:, xf:]], axis=1)
            x = out
        x = x[:, :N].copy()
        x[:, -ns(0.3):] *= np.linspace(1, 0.6, ns(0.3))  # soften the jump back to the start a little
        return x
    m = MOODS[a.mood]
    bar = 4 * 60.0 / m["bpm"]
    # tempo nudged (< 8 %) so the video is a whole number of bars, preferring 8-, then 4-, then 2-bar multiples,
    # so the replay lands on the loop's first bar
    ok = [b for b in range(2, 400) if abs(b * bar / a.dur - 1) <= 0.08]
    bars = next((b for mult in (8, 4, 2, 1) for b in sorted(ok, key=lambda b: abs(b * bar - a.dur)) if b % mult == 0), None)
    bpm = bars * 4 * 60.0 / a.dur if bars else m["bpm"]   # very short clips keep the mood's own tempo
    loop = render_loop(a.mood, bpm, r)
    reps = int(np.ceil(N / loop.shape[1])) + 1
    x = np.tile(loop, (1, reps))[:, :N]
    beat = 60.0 / bpm
    for t in a.dip:  # one-beat dip on the twist
        g = np.ones(N); i0, i1 = ns(t - 0.05), ns(t + beat)
        k = ns(0.05)
        g[i0:i1] = 0.5
        g[max(0, i0 - k):i0] = np.linspace(1, 0.5, len(g[max(0, i0 - k):i0]))
        g[i1:i1 + ns(0.25)] = np.linspace(0.5, 1, len(g[i1:i1 + ns(0.25)]))
        x = x * g[None, :]
    print(f"music: {a.mood}, {bpm:.1f} bpm, {a.dur / (4 * beat):.2f} bars (loop of 8)")
    return x

# ------------------------------------------------------------------ sfx
def norm(x, peak=0.5):
    x = np.asarray(x, dtype=float); m = np.abs(x).max()
    return x * (peak / m) if m > 0 else x
def thunk(r):
    t = tt(0.3); f = 70 + 120 * np.exp(-t / 0.02)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.08) + 0.3 * lp(r.standard_normal(len(t)), 900) * np.exp(-t / 0.02)
def ting(r, f0=1760):
    return I.glock(f0, 0.8, r, 1.6)
def sting(r):
    t = tt(1.6)
    low = np.sin(2 * np.pi * 46 * t) * np.exp(-t / 0.5) + 0.4 * lp(r.standard_normal(len(t)), 300) * np.exp(-t / 0.15)
    return low + 0.5 * I.timpani(55, 0.9, r, 1.6)[: len(t)]
def rumble(dur, r):
    t = tt(dur); env = np.minimum(1, t / 0.3) * np.minimum(1, (dur - t) / 0.5)
    return lp(colored(len(t), r, -2.0), 160, 2) * env
def crash(r):
    x = S.wood_crack(r); y = S.rattle(1.2, r, 40, heavy=True); z = rumble(1.5, r)
    n = max(len(x), len(y), len(z)); o = np.zeros(n)
    o[: len(x)] += norm(x); o[: len(y)] += 0.6 * norm(y); o[: len(z)] += 0.8 * norm(z)
    return o
def pop(r):
    t = tt(0.12); f = 600 + 900 * np.exp(-t / 0.01)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.03)
def tick(r):
    return bp(r.standard_normal(ns(0.03)), 2500, 5000) * np.exp(-tt(0.03) / 0.006)
def gasp(r):
    t = tt(0.5); return bp(colored(len(t), r, -0.5), 600, 3500) * np.sin(np.pi * np.minimum(1, t / 0.5)) ** 2
def steps(dur, r, rate=2.2):
    o = np.zeros(ns(dur) + ns(0.4))
    for k in range(int(dur * rate)):
        s = S.stroll_step(r); i = ns(k / rate); o[i:i + len(s)] += norm(s, 0.5)[: len(o) - i]
    return o

def make(kind, c, r):
    d = c.get("dur", 0.6)
    K = {
        "whoosh": lambda: S.whoosh(d, r), "swoosh": lambda: S.whoosh(max(0.25, d * 0.6), r, f_lo=900, f_hi=4000),
        "thunk": lambda: thunk(r), "stamp": lambda: thunk(r) + 0.4 * norm(S.boot(r)), "ting": lambda: ting(r, c.get("f", 1760)),
        "sting": lambda: sting(r), "rumble": lambda: rumble(d, r), "crash": lambda: crash(r), "collapse": lambda: crash(r),
        "creak": lambda: S.creak(d, r), "crack": lambda: S.wood_crack(r), "snap": lambda: S.bolt_snap(r), "splash": lambda: S.splash_big(r),
        "bubbles": lambda: S.bubbles(d, r, 18), "pop": lambda: pop(r), "clink": lambda: S.clink(r), "rattle": lambda: S.rattle(d, r),
        "step": lambda: S.stroll_step(r), "steps": lambda: steps(d, r), "hammer": lambda: S.hammer_hit(r), "thump": lambda: S.push_thump(r),
        "oof": lambda: S.oof(r), "whoa": lambda: S.whoa(r), "crowd": lambda: S.babble(d, r, 140, 1.0), "laugh": lambda: S.babble(d, r, 180, 1.2, rate=6.0),
        "cheer": lambda: S.hurrah(r, 150, 1.0), "applause": lambda: S.applause(d, r), "birds": lambda: S.bird_chirps(d, r, 0.8),
        "crickets": lambda: S.crickets(d, r), "wind": lambda: S.breeze(d, r), "water": lambda: S.water_bed(d, r), "flutter": lambda: S.flag_flutter(d, r),
        "tick": lambda: tick(r), "bell": lambda: I.glock(c.get("f", 880), 0.8, r, 2.5) + 0.6 * I.vibes(c.get("f", 880) / 2, 0.6, r, 2.5)[: ns(2.5)],
        "gasp": lambda: gasp(r),
    }
    if kind not in K: raise SystemExit(f"unknown sfx kind '{kind}'. Known: {', '.join(sorted(K))}")
    return K[kind]()

DISABLED = {"crowd", "laugh", "cheer", "applause", "oof", "whoa", "gasp"}

def sfx():
    out = np.zeros((2, N))
    if not a.cues or not os.path.exists(a.cues): return out
    cues = json.load(open(a.cues))
    r = rng(a.seed + 1)
    skipped = [c["kind"] for c in cues if c["kind"] in DISABLED]
    if skipped: print(f"sfx: skipped {len(skipped)} disabled cue(s) ({', '.join(sorted(set(skipped)))}): synthesized voices/crowds are off")
    cues = [c for c in cues if c["kind"] not in DISABLED]
    for c in cues:
        x = np.asarray(make(c["kind"], c, r), dtype=float)
        x = norm(x, 0.5) * c.get("gain", 1.0)
        x = st(pan(x, c.get("pan", 0.0))) if x.ndim == 1 else x
        i = ns(c["t"])
        if i >= N: continue
        n = min(x.shape[1], N - i)
        out[:, i:i + n] += x[:, :n]
    # nothing in the last 0.3 s: the loop restart must not carry a hit
    tail = ns(0.3); out[:, -tail:] *= np.linspace(1, 0, tail)[None, :] ** 2
    print(f"sfx: {len(cues)} cues")
    return out

m = music(); s = sfx()
write_wav(os.path.join(a.out, "music.wav"), m / max(1e-9, np.abs(m).max()) * 0.8)
write_wav(os.path.join(a.out, "sfx.wav"), s / max(1e-9, np.abs(s).max()) * 0.8 if np.abs(s).max() > 0 else s)
print("wrote", os.path.join(a.out, "music.wav"), os.path.join(a.out, "sfx.wav"))
