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
import { camFromKeys, CamKey, idle, blinkAt, talkAt, walk, prog, smooth, smoother, easeOut, back, spring, FPS } from "@kit/motion";
import { motes, rain, splashes, puddle, leaves, birds, smoke, shafts, lightPool } from "@kit/ambient";
import { dressWall, shelf, bottle, glass, mug, books, barrel, crate, sack, stool, chair, table, plant, frame, clock, lamp, fan, candle, bunting, scatter, tickProps, animate } from "@kit/props";
import { extras, crowdSpots, group, snapExtras, groundY, randomOutfit, Extra } from "@kit/crowd";
import { charCard, CardPlace, FxPlace } from "@kit/cards";
import { Outfit, fxPuff, fxStars, fxBurst, fxSplash, fxCreak, fxRing, fxNote } from "@kit/lib/toon";
import { grassHD, cobbleHD, stoneHD, planksHD, roofHD, facadeHD, brick } from "@kit/lib/paint";
import { sand, dirt, plaster, boards, marble, blocks, cloth, signTex } from "@kit/paint2";

export const TOTAL = T.frames;
export function build(w: Engine) { /* add meshes under w.root once; keep handles in w.refs */ }
export function frame(f: number, w: Engine): FrameState {
  return {
    cam: camFromKeys(KEYS, f, kicks),            // {pos, look, fov, roll}
    light: "day" | "golden" | "night" | "interior",   // interior: warm lamp-lit open-front room
    sunRef: { pos, look },                        // freeze the sun against this camera (usually the shot's first key)
    dof: { cInf: 0..16, focus: [x, y, z] },       // px of blur at infinity (0 = sharp, skips the pass)
    cards: [charCard({...}), ...],                // characters (and any standing flat drawing)
    fx: [{ key, cw, ch, draw, at, w, h, soft?, flat? }],
    dissolve: { from: FrameState, t: 0..1 },      // 6-10 f cross-dissolve for time jumps (outgoing state, same f)
    flash: 0..1,                                  // white flash: avoid (the reference channel never uses one)
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
facing, prop, scale, mirror, roll, noBlob, extra, talk})`. `talk: talkAt(f, spans, seed)` flaps the mouth (changes
every 3 frames) while that character says their own line; spans come from the line's phrases in `work/timing.json`.
Outfit: `{jacket, pants, boots, hat: "shako"|"shako_tall"|"cap"|"hair"|"tophat"|"bonnet"|null, cap, hair, dress, belt,
buttons, sash, sword, rifle, moustache, skin, build: "adult"|"stout"|"kid"}`.
Expressions: neutral, stern, grin, laugh, whistle, nervous, shock, relief, relief_open, dazed, pained, smile,
smile_closed, lick. Modes: stand, stroll, march, sit, fall. `wave` (0..1) raises the right arm; `prop`: "icecream",
"shako", ["hammer", 0..1]. New hats/props/outfits: extend `engine/src/lib/toon.ts` in the project (same Pen style).
Cards face the camera (yaw only), carry their own plum ink, get a contact blob unless `noBlob`.

**Motion** (`@kit/motion`): `camFromKeys(keys, f, kicks)` — each key `{f, pos, look, fov, roll, dur, cut, ease, via,
creep}` is the frame the camera ARRIVES; the move into it takes `dur` frames (default 24, smootherstep); holds creep
slowly toward `look` (default 0.042 of the distance per second); `cut: true` = hard cut; `via` = curved path; kicks =
7-frame flip shakes on impacts. `idle(f, seed, amp)` → `{tilt, headTilt}` (tiny on purpose), `blinkAt(f, seed)`,
`walk(f, a, b, dist)` → `{d, phase}`, easing helpers.

**Effects** (`lib/toon`): fxPuff (300x300), fxStars (420x210), fxBurst, fxSplash, fxCreak (300x300), fxRing, fxNote,
fxBlob — or any Pen drawing of your own.

**Never static, never empty** (built after a user short measured 60 % fully still frames and ~50 % flat area):
- `acting(f, T.phrases, seed)` → `{tilt, headTilt, wave, hop}`: the character moves on EVERY phrase (anticipation, then an
  arm gesture, a lean, a hop or a head turn) and nods on words. Add it on top of `idle()` for every character on screen.
- `@kit/props`: `dressWall(R, a, b, "bar"|"home"|"office"|"lab"|"shop"|"palace")` fills a whole wall edge to edge
  (shelves full of bottles/books/jars, frames, clock, plants, an upper row of pictures, bunting); `shelf`, `scatter` for
  floor clutter; single props. Clocks tick, lamps swing, fans spin, plants and bunting sway, candles flicker: call
  `tickProps(f)` first thing in `frame()`.
- `@kit/crowd`: `extras(f, list)` background people who chat (mouths move), sip, laugh, cheer, point, react, work or walk
  back and forth, each on its own clock. 9:16 frames are only about ±1.7 m wide at 8 m: place extras IN DEPTH along the
  camera axis (at the counter, behind the bar, across the back), not off to the sides.
- `camFromKeys` now drifts in holds and stretches any move so its peak stays under ~18 px/f (`whip: true` to allow one).
- **Camera energy** (after "Earth without dust" felt slow): `camFromKeys(KEYS, f, kicks, { phrases: T.phrases, energy: 1 })`.
  Moves peak up to ~28 px/f with a quick start and a clean landing, and the camera steps on every phrase with a quick
  6-frame reframe (push-in, side nudge, pull-out). The reference makes ~29 short moves per 10 s; calm glides alone gave
  us 11. `energy: 0` = the old calm camera, `2` = hyper.
- **No continuous shake.** Never add sine/noise wobble to the camera: `tools/shakecheck.py` flags it, and flags flicker
  (things popping for one frame). Kicks (7 frames) on impacts only.
- **Extras in groups, on the ground**: `group("chat2" | "chat3" | "queue" | "audience" | "workers", at, seed)` gives
  people who interact instead of loners facing the camera; `snapExtras(R, list)` puts their feet on the real ground
  (sand, hills, raised squares made them float).
- **Weather that doesn't glitch**: `rain()` streaks + `splashes()` + `puddle()` (fixed outline, expanding ripple rings).
  `smoke()` is now opaque inked cartoon puffs and `motes()` are capped tiny: the old see-through circles read as bubbles.
- **Snap**: `acting()` gestures land ~85 % of the pose in 4 frames, then hold (`snap()` easing in motion.ts); use it
  for any pose change you animate by hand too.
- **Whip cut**: a key with `cut: true, whipCut: 1 | -1` whips the outgoing shot sideways for 6 frames (accelerating, with
  motion blur), hides the cut in the blur, and the new shot whips in and stops dead in ~4 frames. The reference uses
  about 5 per video for place and time changes; continuous moves and dissolves cover the rest.
- Bar example (example/story.ts) before → after, 5 s at 0.33 scale: fully still quiet frames 79 % → 14 %, flat area
  ~50 % → ~30 %.

**Scene life** (`@kit/ambient`): measured on the reference, ~5 % of the pixels keep changing even when the camera is
still, and only ~4 % of quiet frames are fully still (`docs/reference/ricks-20.md`). Every shot gets ambient life:
`motes(f, box, n)` (sun dust, pollen, embers, snow), `rain(f, box, n)`, `leaves(f, box, n)`, `birds(f, from, to, n,
seed, period)`, `smoke(f, at, n)` (chimneys, steam, engines), `shafts(f, at, n)` (god rays), `lightPool(at, w, h, col,
{flat, skew})` (sun patch from a window, lamp glow). All return FxPlace[] for `fx`, cached, pure in f. Plus extras in
the background, effects that grow on the narrated word, and story events in frame (doors, objects falling, lights on).

**Transitions** (measured): continuous camera moves inside one set for most changes; `dissolve` 6-10 frames for time
jumps ("Then, one Monday", "Meanwhile"), both shots moving; a foreground wipe (something crossing close to the lens) for
big reveals; no white flashes.

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
| `tools/framestats.py video` | every-frame motion/colour/detail stats + `vsReference` verdict vs the measured channel |
| `tools/shakecheck.py video.mp4` | flags camera sway/shake and one-frame flicker (whips and cuts skipped) |
| `tools/emptycheck.py stills/a` | flags stills with big empty areas (reference: flat ~27 %, largest area ~10 %) |
| `tools/tighten.py voice out.wav [--tempo]` | leading silence to 0.05 s, shorter pauses (no pause in the hook), optional pitch-safe speed-up |

Music moods: quirky, calm, mysterious, epic. SFX kinds: whoosh, swoosh, thunk, stamp, ting, sting, rumble, crash,
collapse, creak, crack, snap, splash, bubbles, pop, clink, rattle, step, steps, hammer, thump, oof, whoa, crowd, laugh,
cheer, applause, birds, crickets, wind, water, flutter, tick, bell, gasp.

## Measured reference look (`docs/reference/`)

`docs/reference/` holds the style study from mromidev/claude-animated-shorts: `STYLE_BIBLE.md` (script and picture formula
from 20 reference shorts) and seven measured reports (`motion`, `depth`, `textures`, `characters`, `lighting`,
`outlines`, `grade`). Their numbers are the targets; "ours" in them means the original bridge short. The ones that matter
most when planning a video:

- **Camera** (`motion.md`): the camera is almost never dead still (~10 % of frames) but its moves are small and soft:
  about **6 moves per 10 s**, each a **symmetric ease-in-out glide of ~23 frames** (median peak ~14 px/f at 720 wide,
  keep it under 25), a typical move is a modest reframe (~100 px, ~23 % zoom), not a trip across the set. Between moves
  it keeps a slow **push-in (~0.14 % per frame)**. Hard cuts are rare (0-1 per video); big place changes use a cut or a
  6-8 frame crossfade instead of a long fast fly. Whip pans are rare (~0.5 per minute) and always motion-blurred.
  Impact shakes flip sign every frame, ~5 px at 1080, gone in 6-8 frames. No hand-held float.
- **Characters** (`motion.md`, `characters.md`): animated on ones, no idle *loop* in holds (but see Scene life: the shot
  itself never stops moving); life comes from acting
  beats that land 0-3 frames before their word, with an instant expression swap covered by a blink. Blinks every
  0.5-2.3 s, 4 frames (half, shut, shut, half). Walk steps 9-12 frames, bob 3-7 %, lean 1-7°, planted feet.
- **Depth** (`depth.md`): lens blur on about a third of the screen time (close-ups, mediums, inserts), cInf 10-16 px at
  1080, focus on the eyes; establishing and wide shots sharp.
- **Colour / light** (`lighting.md`, `grade.md`): saturated, day median luma ~.57, no crushed blacks, warm key with
  blue-violet shadows, golden = backlit low sun with violet shadows (never brown); light changes with the story beat.
- **Ink** (`outlines.md`): world lines ~3 px at 1080 width, near-black, on silhouettes, depth jumps and creases only.
- **Hook** (`hooks.md`, measured on 20 Ricks Clips shorts): voice at 0.12 s, a 10-17 word sentence in ~3 s at 4 words/s with no pause after it, frame 0 = the strange act already happening with the hero big, the shocking image by 0.5-1 s, one decisive camera move, no loudness trick.
- **Script** (`STYLE_BIBLE.md`): voice starts on frame 1-4, no intro/outro; hook = paradox stated as fact; "You see,"
  pivot to the mechanism; ironic payoff as the last words.

After rendering, `python3 tools/framestats.py out/<slug>.mp4` measures every frame the same way the reference channel
was measured and prints `vsReference` (in-scene motion, still frames, detail, empty areas, shadow depth, saturation,
camera peaks) with FIX where the video is off.

## Readability traps (check every still)
- A prop or effect closer than ~2 m to the lens becomes a huge cut-off blob at the frame edge; re-check props whenever a
  camera moves.
- A foreground object cut by the frame edge must still be recognisable, or remove it.
- One rope disappearing behind a kid reads as a hanging: swings get two ropes and a wide plank.
- Painted signs lit by a side sun go grey and unreadable: give sign faces enough contrast or an unlit material.
- Railings at chest height cut through characters: put the lens ~2.5 m up so rails cross legs, not torsos.
- Flags and emblems must be period-correct and not read as another country's.
- Back faces of flat cards or signs show as blank blocks; ghost/translucent frames; mirrored or cut-off text.
- Characters too small in the frame, or a shot with no subject ("the camera looks at the street").

## Gotchas
- `story.ts` changes need `node tools/build.mjs` before rendering.
- Diegetic text: use `signTex()` on the +z face of a `sign()`/box; check it isn't mirrored from the camera side.
- Narrow vertical frame: horizontal half-width = d·tan(hfov/2), hfov = 2·atan(tan(vfov/2)·0.5625); at 4 m, fov 40
  that is ±0.8 m — stage characters in depth, not side by side.
- Extrude groups: 0 = caps, 1 = sides+top (house roofs).
- Shadows are fitted around `cam.look`; very wide shots soften them.
- If a page error happens, render.mjs stops and prints it; `buildError` means `build()` threw.
