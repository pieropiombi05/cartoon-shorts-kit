# Ricks Clips: how the first 3 seconds are built (20 top shorts)

Measured Nov 2026 on the same 20 shorts as `ricks-20.md`: auto-caption word timings, the audio of every video
(level, voice band, bass, highs, peaks, levels in the pauses between words) and frames 0-150 of each video one by one.

## Words

- **The voice starts at 0.12 s** (median; 0.08-0.18 in all 20). Nothing comes before it: no music intro, no silence.
- **The hook is one sentence of 10-17 words, said in about 3-3.5 s**: 4.0 words/s in the first 3 s, versus
  3.7 words/s for the rest of the video. A TTS voice at 2.7-2.8 words/s is about 30 % slower than the channel.
- **No pause after the hook.** 9 of 20 have no pause at all in the first 5 s; sentence 2 starts at 3-4 s.
- Sentence 2 is either the mockery ("The whole court burst out laughing.", "The whole betting room is laughing at him")
  or "You see," straight into the stakes.
- Shapes of sentence 1 (20 videos):
  - **"He/They [did a strange act] + concrete detail"** (9): "He put a bronze ball in a dragon's mouth and told the
    emperor if this ever falls out, run." / "They buried a man alive with a bell tied to his finger." / "He bet his life
    savings on the slowest horse in the race." / "They painted the jail cell pink, and not just any pink."
  - **Paradox stated as fact** (5): "It's impossible to get fired in Japan, but companies found something way worse." /
    "Gambling is illegal in Japan. Yet, there's a gambling hall on almost every street."
  - **"If you..." second person** (4): "If you fall asleep holding two steel balls, you might wake up a genius."
  - **Pointing at the picture** (1): "Look at these two scratch cards. One's a winner, and one's garbage."
- Almost every hook has one concrete, visual detail (39 feet, a bronze ball, a pint of red, one inch, two million
  dollars) and the title names the same object.

## Picture

- **Frame 0 is the strange act already happening**, with the hero big in frame (40-70 % of the height) and the key object
  visible: he is sawing the rail with a train coming, pouring oil off the deck, painting the wall pink, swinging a hammer
  at the coaster loop, burying the man, writing the fake number. Never an establishing wide, never a character just
  standing or sitting.
- **The shocking image is on screen by frame 15-30 (0.5-1 s)**: close-up of the dragon's ball, the man alive in the coffin,
  the FIRE button, the cannon firing, the bullet flying.
- **In-scene motion in the first 3 s is about twice the rest of the video**: ~8-9 % of the pixels change per frame while
  the camera is quiet (body 4.9 %). The act itself animates from frame 0 (saw strokes, oil pouring, roller painting,
  hammer swing, pen writing) and the hero changes expression on the first stressed word.
- **Camera**: one decisive move in the first 3 s, not many. Median one framing change in 3 s (0-3), usually 0.7-2.5 s
  in; 9 of 20 have no cut at all in the first 3 s, just one continuous move. Typical: extreme close-up of the act ->
  pull back to reveal who and where (pen on a check -> smug man at his desk; face under a spotlight -> him on the
  weird floor), or medium on the hero -> push in to the object. The hook's camera is a bit faster than the body's
  (about 2x the mean speed) but still one readable move.
- No white flashes. One bright light burst (teleport pod) is part of the story, not a transition.

## Sound

- **There is no loudness trick.** The first 3 s are only +0.6 dB over the rest (median; 13 of 19 louder), the voice
  band +0.4 dB, bass +0.5 dB, highs +0.7 dB. The music is not louder in the hook. Do not raise anything.
- The first second has a peak ~0.8 dB above the typical peaks of the body (14 of 19): a small accent (a hit, a whoosh,
  the sound of the act itself: the saw, the pour, the splash) right at the start, at normal SFX level.
- What makes the hook sound strong is the delivery: voice from frame 3-4, fast, no pause.

## Ours (the Earth short) for comparison

- Frames 0-90: a character sitting at a café table, nothing happening: in-scene motion 0.6 % (reference hook ~8-9 %).
- Hook level 0.5 dB *lower* than the body; a peak over 0 dBFS in the first second (a clipped hit).
- The TTS voice of the Poisson script: 2.8 words/s with ~25 pauses of 0.3-0.55 s.

## Kit

- `tools/tighten.py voice.mp3 voice_tight.wav [--tempo 1.1]`: cuts leading silence to 0.05 s, shortens pauses (0.12 s
  in the first 5 s, 0.28 s after), optional pitch-safe speed-up. On the Poisson voice: 2.8 -> 3.1 words/s, 10 % shorter.
