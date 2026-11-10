# Ricks Clips: 20 top shorts measured frame by frame

20 of the best-performing shorts of @RicksClips3000 (Nov 2026), every frame at 30 fps (32,635 frames), plus visual
contact sheets of consecutive frames. Raw numbers: `data/ricks-20.csv`. Same method as `tools/framestats.py`, so a
render can be compared directly: `python3 tools/framestats.py out/<slug>.mp4` prints a `vsReference` block.

## The numbers (medians of 19 videos; one 11 s clip excluded)

| | Reference | Our Earth short | Kit test |
|---|---|---|---|
| In-scene motion while the camera is quiet (pixels changing per frame) | **4.9 %** (p25-p75 4.2-6.3) | 1.9 % | 0.3 % |
| Quiet frames that are totally still | **4 %** | 34 % | 82 % |
| Detail / texture (mean gradient) | **34.9** (28.9-37.8) | 25.6 | 27.5 |
| Flat, empty 8x8 blocks | **14 %** | 19 % | 23 % |
| Shadow depth p5 luma (lower = deeper) | **0.148** | 0.209 | 0.251 |
| Saturation | 0.42 | 0.43 | 0.26 |
| Camera moving (>2 px/f) | 62 % of frames | similar | |
| Median peak of a camera move | **20 px/f** | 31.7 | |
| White flashes | **0 in all 20** | several | |

The camera amount was already close. What was missing is everything that is NOT the camera: life inside the shot,
fullness of the set, deeper light. And our camera peaks were too violent.

## What the frames show

**1. Something is always moving inside the shot.** In every quiet-camera stretch inspected, the scene itself moves:
- characters talk with mouth shapes that change every 2-4 frames, change expression mid-line, shift weight;
- effects grow over 15-25 frames on the narrated word (storm: the wave curls, smoke puffs bloom and fire grows on
  "drops straight onto"); rain, god rays, sparks, steam keep running underneath;
- story events happen in frame (a door opens and a character walks in on "one Monday").

**2. Frames are full.** Sets are dressed edge to edge: clocks, calendars, posters, shelves, boxes, desks in the
foreground, crowds of extras in wide shots (a throne room with dozens of people). Foreground objects (columns, bars,
statues, rails, desks) frame shots and give depth. Empty sky or plain wall rarely takes more than a third of a frame.
Ours: half-empty skies, plain painted facades, empty streets, one character alone.

**3. Shot sizes vary every 2-3 s around the same set**: extreme close-up of the key object (jar, dragon head, fire
alarm), big two-shot with characters filling 50-70 % of the height, wide establishing shot with crowd, top-down hero
shot. Characters are big in frame most of the time.

**4. Light tells the story.** Hard sun patches from windows on walls and floors, strong side light on saturated
surfaces, god rays, lamp pools; deep shadows (p5 0.15). Time of day changes with the story (day office -> blue night;
sunset backlight for the journey; moonlit night for the secret). One dominant hue per scene with a warm accent
(blue storm + orange fire). Ours: flat even light, no light shapes, same time of day throughout.

**5. Transitions.**
- Most shot changes are continuous camera moves (orbits, pans) inside one set.
- Time jumps ("Then, one Monday", "Meanwhile") use a **6-10 frame cross-dissolve**, both shots moving.
- Big reveals use a **foreground wipe**: something passes close to the lens (a train) and the new view is behind it.
- Fast whips exist (median 5 per video) but no white flashes at all.

## What the kit now has for this

- `charCard({... talk: talkAt(f, spans, seed)})`: mouth flaps for a character's own line.
- `@kit/ambient`: `motes`, `rain`, `leaves`, `birds`, `smoke`, `shafts`, `lightPool`: cached particle cards, pure in f.
- `FrameState.dissolve = { from, t }`: cross-dissolve between the outgoing and incoming state at the same frame.
- `tools/framestats.py` with a `vsReference` verdict.
