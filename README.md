# cartoon-shorts-kit

The code kit for the **cartoon-audio-short** skills: flat 2D bean-head cartoon characters in a painted, ink-outlined
3D world, rendered frame by frame with headless Chromium, plus synthesized music/SFX, a level-locked mix and QA.
Vertical 1080x1920, 30 fps, exactly as long as the voiceover.

Character drawing, ink, lens blur, grade, two-tone shading and the painted textures come from
[mromidev/claude-animated-shorts](https://github.com/mromidev/claude-animated-shorts) `templates/bridge` and
`templates/audio` (MIT, see `engine/src/lib/LICENSE-upstream`). The runtime (no Remotion), world helpers, story API,
render/timing/audio/mix/finish tools are this kit's own.

## Quick start

```bash
git clone https://github.com/pieropiombi05/cartoon-shorts-kit ~/cartoon-shorts-kit
bash ~/cartoon-shorts-kit/tools/setup.sh ~/shorts/my-video      # engine + tools + example story.ts + npm deps
cd ~/shorts/my-video
cp /path/to/voice.mp3 voice.mp3 && cp /path/to/script.txt script.txt
python3 tools/timing.py voice.mp3 script.txt --out work           # work/timing.json (TOTAL frames, phrase frames)
# write story.ts (world, cast, camera) -> see "Story API"
node tools/build.mjs                                              # bundle -> web/bundle.js
SCALE=0.5 node tools/render.mjs stills/a "5,60,120"               # half-size test stills
python3 tools/sheet.py stills/a stills/sheet_a.jpg                # contact sheet to look at
# write work/cues.json, then
python3 tools/audio.py --dur <voice s> --mood quirky --cues work/cues.json --dip <twist s> --out work
python3 tools/mix.py voice.mp3 work/music.wav work/sfx.wav --out work
node tools/render.mjs frames "0-<N-1>"                            # all frames (RESUME=1 to continue)
bash tools/finish.sh "Title" voice.mp3                            # out/<slug>.mp4 + out/<slug>_nomusic.mp4 + QA
```

Requirements: Node 22+, Python 3 with numpy, scipy, Pillow; ffmpeg; Playwright with Chromium
(`npm i -g playwright && npx playwright install chromium`). setup.sh installs three@0.169, postprocessing@6.36 and
esbuild into the project.

Speed (2-core cloud box, SwiftShader CPU WebGL): about 3.5-6 s per full-size frame (lens blur only costs on shots
with `cInf > 0`). A 60 s short (1800 frames) is roughly 2-3 h. Half-size stills are ~3x faster.

## Project layout (made by setup.sh)

```
story.ts          the video: world, cast, camera, lens, effects (you write this)
work/timing.json  from timing.py: {dur, fps, frames, phrases:[{i,text,t0,t1,f0,f1,words}]}
work/cues.json    SFX cue list for audio.py
engine/           the renderer (copied from the kit; extend lib/toon.ts for new outfits/props)
tools/            build, render, timing, sheet, audio, mix, master, finish, qa
web/              index.html + bundle.js
frames/ stills/ out/
```

## Story API (`story.ts`)

```ts
import T from "./work/timing.json";
import type { Engine, FrameState } from "@kit/engine";
import { box, cyl, cone, sphere, ground, house, tree, hills, mountains, clouds, sign, pivot, mat } from "@kit/build";
import { camFromKeys, CamKey, idle, blinkAt, walk, prog, smooth, smoother, easeOut, back, spring, FPS } from "@kit/motion";
import { charCard, CardPlace, FxPlace } from "@kit/cards";
import { Outfit, fxPuff, fxStars, fxBurst, fxSplash, fxCreak, fxRing, fxNote } from "@kit/lib/toon";
import { grassHD, cobbleHD, stoneHD, planksHD, roofHD, facadeHD, brick } from "@kit/lib/paint";
import { sand, dirt, plaster, boards, marble, blocks, cloth, signTex } from "@kit/paint2";

export const TOTAL = T.frames;
export function build(w: Engine) { /* add meshes under w.root once; keep handles in w.refs */ }
export function frame(f: number, w: Engine): FrameState {
  return {
    cam: camFromKeys(KEYS, f, kicks),            // {pos, look, fov, roll}
    light: "day" | "golden" | "night",
    sunRef: { pos, look },                        // freeze the sun against this camera (usually the shot's first key)
    dof: { cInf: 0..16, focus: [x, y, z] },       // px of blur at infinity (0 = sharp, skips the pass)
    cards: [charCard({...}), ...],                // characters (and any standing flat drawing)
    fx: [{ key, cw, ch, draw, at, w, h, soft?, flat? }],
    flash: 0..1,                                  // white flash (time jumps, impacts)
  };
}
```

Everything in `frame()` must be a pure function of `f` (frames are rendered out of order and resumed).

**World** (`@kit/build`): `box(parent, [w,h,d], at, matOrTex, {rotY, tile})` stands on `at` (bottom centre); `tile` =
metres per texture repeat (constant texel density). `house({at,w,h,d,wall,shutter,roof,door,timber,brick,flat})` paints
a facade on +z. `tree(at, "round"|"cypress"|"pine"|"palm")`, `hills`, `mountains`, `clouds` (NOINK billboards),
`sign(tex, at, w, h, rotY)`, `pivot(at)` for doors/collapses (rotate the group from `frame()`). `mat(hex|texture)` is the
two-tone toon material. Painted textures: `lib/paint` (grass, cobbles, stone, planks, roofs, bricks, facades, water,
clouds) and `paint2` (sand, dirt, plaster, boards, marble, blocks, cloth, readable signs).

**Cast** (`@kit/cards`, `lib/toon`): `charCard({outfit, at, seed, expr, mode, phase, look, blink, tilt, headTilt, wave,
facing, prop, scale, mirror, roll, noBlob, extra})`.
Outfit: `{jacket, pants, boots, hat: "shako"|"shako_tall"|"cap"|"hair"|"tophat"|"bonnet"|null, cap, hair, dress, belt,
buttons, sash, sword, rifle, moustache, skin, build: "adult"|"stout"|"kid"}`.
Expressions: neutral, stern, grin, laugh, whistle, nervous, shock, relief, relief_open, dazed, pained, smile,
smile_closed, lick. Modes: stand, stroll, march, sit, fall. `wave` (0..1) raises the right arm; `prop`: "icecream",
"shako", ["hammer", 0..1]. New hats/props/outfits: extend `engine/src/lib/toon.ts` in the project (same Pen style).
Cards face the camera (yaw only), carry their own plum ink, get a contact blob unless `noBlob`.

**Motion** (`@kit/motion`): `camFromKeys(keys, f, kicks)` — each key `{f, pos, look, fov, roll, dur, cut, ease, via,
creep}` is the frame the camera ARRIVES; the move into it takes `dur` frames (default 30, smootherstep); holds creep
slowly toward `look`; `cut: true` = hard cut; `via` = curved path; kicks = 7-frame flip shakes on impacts.
`idle(f, seed)` → `{tilt, headTilt}`, `blinkAt(f, seed)`, `walk(f, a, b, dist)` → `{d, phase}`, easing helpers.

**Effects** (`lib/toon`): fxPuff (300x300), fxStars (420x210), fxBurst, fxSplash, fxCreak (300x300), fxRing, fxNote,
fxBlob — or any Pen drawing of your own.

## Tools

| tool | what it does |
|---|---|
| `tools/setup.sh <dir>` | new project from the kit |
| `tools/build.mjs` | bundle engine + story.ts → web/bundle.js |
| `tools/render.mjs <out> "<a-b,f,...>"` | render frames; env SCALE, Q, RESUME=1, OPTS="msaa=2&lens=0" |
| `tools/timing.py voice script --out work` | phrase/word timings (whisper if installed, else pause-snapping DP) |
| `tools/sheet.py <dir> <out.jpg>` | contact sheet of stills |
| `tools/audio.py --dur --mood --cues --dip --track` | music bed (one 8-bar loop, loop-aligned) + SFX stems |
| `tools/mix.py voice music sfx` | music at 50 % of the voice (−6 dB gated RMS), SFX 50 % with capped peaks; also a no-music mix |
| `tools/master.py` | one linear gain to −14 LUFS + −1 dBFS limiter |
| `tools/finish.sh "Title" voice.mp3` | (LOOP_XFADE=N) master, encode H.264 CRF 17 + AAC, no-music version, QA |
| `tools/qa.py video sheet` | frozen spans, black frames, loudness, loop seam, sheet |

Music moods: quirky, calm, mysterious, epic. SFX kinds: whoosh, swoosh, thunk, stamp, ting, sting, rumble, crash,
collapse, creak, crack, snap, splash, bubbles, pop, clink, rattle, step, steps, hammer, thump, oof, whoa, crowd, laugh,
cheer, applause, birds, crickets, wind, water, flutter, tick, bell, gasp.

## Gotchas
- `story.ts` changes need `node tools/build.mjs` before rendering.
- Diegetic text: use `signTex()` on the +z face of a `sign()`/box; check it isn't mirrored from the camera side.
- Narrow vertical frame: horizontal half-width = d·tan(hfov/2), hfov = 2·atan(tan(vfov/2)·0.5625); at 4 m, fov 40
  that is ±0.8 m — stage characters in depth, not side by side.
- Extrude groups: 0 = caps, 1 = sides+top (house roofs).
- Shadows are fitted around `cam.look`; very wide shots soften them.
- If a page error happens, render.mjs stops and prints it; `buildError` means `build()` threw.
