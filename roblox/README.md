# roblox/ — Roblox-style shorts on the kit

Real Roblox R15 bodies (exported from Roblox Studio with Rig Builder → Export as glTF) dressed by code, rounded Roblox
heads with simple classic faces (black dot eyes, line mouths, white open grins), hair and accessories, a Roblox parts
world (plastic, wood, brick, grass, neon, glass), and word-by-word burned-in captions. Everything else (timing, audio,
mix, render, QA) is the normal kit.

```bash
bash ~/cartoon-shorts-kit/roblox/setup_rbx.sh ~/shorts/<slug>   # kit project + engine/src/rbx + caption tools + fonts + example
cd ~/shorts/<slug>
node tools/build.mjs
SCALE=0.5 OPTS="ink=0" node tools/render.mjs stills/a "5,40,..."   # ALWAYS ink=0: Roblox has no outlines
OPTS="ink=0" node tools/render.mjs frames "0-<N-1>"
bash tools/finish_rbx.sh "Title" voice.wav                         # captions + master + encode + QA
```

## Story API additions (`import ... from "@kit/rbx/rbx"`)

`build()` must be `async` and start with `await rbxLoad(); rbxInit(w as any);`.

**Characters** — `const c = rbxChar(w.root, outfit)` once in build; every frame `c.set({...})`:

| field | meaning |
|---|---|
| `at: [x,y,z]` | feet position (studs; a character is ~5.3 tall) |
| `face` | yaw degrees, 0 = facing +Z (toward a camera on +Z), 90 = facing +X |
| `pose` | a name from `POSES`, or a joint map from `poseAt` / `walkPose` / `mixPose` |
| `expr` | smile, grin, happy, neutral, shock, scared, sad, cry, angry, determined, smug, sleep |
| `blink` | `blinkAt(f, seed)` · `talk`: `talkAt(f, spans, seed)` (mouth flaps on the character's own quoted lines) |
| `look` / `nod` | head yaw / pitch degrees · `tilt` / `lean`: whole-body lean degrees · `scale` · `visible` |
| `f` | pass the frame number to get a tiny breathing motion in holds |

`POSES`: stand, relax, wave (hand up), point, cheer, shock, scared, think, armsCrossed, reach, sit (drops onto a seat
~1 stud lower). `walkPose(walk(f,a,b,dist).phase, amp)` = walk (amp 1) or run (amp 1.6); combine with `walk()` for the
distance. `poseAt(f, [{f, pose, dur}])` = pose timeline: each change snaps in over `dur` frames (default 6), then holds.
`c.joint("RightUpperArm")` gives a joint for custom rotation; `c.headTop()` the head's top y.

**Outfits** (`Outfit`): body masc|fem, skin, top, topStyle tshirt|long|tank|dress, sleeve, pad, vneck, strap, bottom,
bottomStyle pants|shorts|skirt, belt, wrist, socks, shoes, sole, hair spiky|short|long|ponytail|bun|cap|bald, hairColor,
hairTip, cap, acc [goggles, glasses, bow, headband, moustache, beard], accColor, lashes (female faces), scale (kids ~0.8).
`HERO` = the channel's protagonist (always the same). `CAST` = recurring family/cast (mom, dad, friend, sister, grandpa,
grandma, teacher, bully). `randomOutfit(seed, {body, kid})` = deterministic extras.

**World**: `baseplate(R, size, color, kind)`, `part(R, [w,h,d], at, color, {kind, rotY, tile})` (at = bottom centre),
`wedge`, `cylPart`, `ballPart`, `rbxHouse(R, {at, w, h, d, rotY, wall, roof, trim, door})` (front faces +z),
`rbxTree(R, at, "round"|"pine", scale, leaf)`, `rbxSign(R, "NO RUNNING\nEMERGENCIES ONLY", at, {w, h, rotY, bg, fg})`.
Material kinds: plastic, smooth, studs, wood, planks, brick, concrete, tile, grass, sand, fabric, metal, neon, glass.
The kit's `clouds`, ambient fx (`motes`, `rain`, `smoke`, `birds`...) and `camFromKeys` work as usual.

**Captions**: `tools/captions.py` writes `work/captions.ass` from `work/timing.json` (one word at a time, centred at
~60 % height, Poppins Bold white with black outline; BOOM/SPLAT/… and CAPS words bigger). `finish_rbx.sh` burns it in
(`CAPTIONS=0` to skip, `CLEAN=1` for an extra version without captions). Needs ffmpeg with libass.

Notes: `tools/lint.mjs` only knows the 2D cards, so it does not check rbx characters; check the stills instead.
The R15 rigs in `src/rig_masc.ts` / `src/rig_fem.ts` were exported from Roblox Studio by the channel owner. To use
other bodies, export a rig the same way and regenerate those files (the glTF JSON as `export const RIG_MASC: any = …`).
Fonts: Poppins (SIL Open Font License 1.1, https://fonts.google.com/specimen/Poppins).
