> /home/visiteur/piano-jazz-chords/opencode-tasks/task-you-are-yahweh-v2-result-diagnostic-only.md already contains a full diagnostic.
> Reference progression is known: A → E → B → D looping, A major.
> Do NOT try to read video frames or install OCR. Focus only on code.

# Mission OpenCode — Implement harmonic stabilization for A-E-B-D loop

## Project

`/home/visiteur/piano-jazz-chords/`

## Target file

`electron/audio-processor.py`

## Problem

Analyzing `/tmp/local_piano3.wav` (Steve Crown – You are Yahweh, Synthesia-style piano tutorial) currently produces 73 segments dominated by over-qualified and parasitic chords:

```
Dmaj7, Asus4, D, E, A, C#, Bsus4, F#m, F#m7, Esus4, Bm, C#m7, Asus2, C#m, C#sus4, Gsus4, B7, Bm7
```

The real underlying progression is a simple loop in **A major**:

```
A → E → B → D
```

So the allowed roots are only **A, E, B, D**. Roots C#, F#, G are parasitic (passing/inner-voice notes mis-detected as chord changes).

## Goal

Add an additive post-Viterbi layer in `electron/audio-processor.py` that produces a much cleaner timeline for this file, while keeping all regression tests passing.

The layer should:

1. Detect when the global key is A major (or any major key with a simple I-V-II-IV type loop).
2. Treat short segments whose root is a non-chord-scale passing tone (e.g. C#, F#, G in A major) as melodic/arpeggio events, not harmonic changes.
3. Merge or absorb those short passing segments into neighboring structural segments whose root belongs to the main progression (A, E, B, D).
4. Simplify chord qualities toward plain major/minor triads when the context is stable (e.g. Dmaj7 → D, Asus4 → A, Bsus4 → B, Esus4 → E, F#m7 → F#m).
5. Merge consecutive segments with the same simplified root.

## Constraints

- Do NOT modify the HMM baseline, observation computation, beat tracking, or audio extraction.
- Do NOT touch UI/Studio/Chordify code.
- Do NOT refactor/reorganize the source tree.
- Keep all regression tests passing:
  - `python3 tests/test_harmonic_deterministic.py` (currently 14/17)
  - `node src/chord-engine/test-chords.js` (98/98)
  - `node src/analyzer/test-regression-part1.js`
  - `node src/chord-engine/test-regression-part3.js`
  - `npm run build`
- Build must pass.
- If a structural change seems necessary, stop and explain.

## Suggested implementation

Create a new function `_stabilize_progression(segments, key, states)` called after `_merge_arpeggio_segments()` inside `analyze_chords()`. It should:

- Determine diatonic/non-diatonic roots for the detected key.
- Identify a set of "structural roots" as the most frequent diatonic roots in the segment list (top 4 or 5 by total duration).
- For each short segment whose root is NOT structural and whose duration is below a threshold (e.g. 1.0–1.5s), merge it into the closest neighboring structural segment (left first, then right) if its root is contained in the PC-set of that neighbor.
- After merging, simplify qualities: for each remaining segment, if its root is structural, prefer the simplest diatonic major/minor quality over sus4/maj7/m7 variants, unless the more complex quality is strongly supported (e.g. confidence much higher).
- Merge consecutive segments with the same simplified root.

## Validation

Run this before and after your change:

```bash
cd /home/visiteur/piano-jazz-chords
python3 -c "
import json, importlib.util, io, contextlib
spec = importlib.util.spec_from_file_location('audio_processor', 'electron/audio-processor.py')
ap = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ap)
with contextlib.redirect_stdout(io.StringIO()):
    result = ap.analyze_chords('/tmp/local_piano3.wav')
print('KEY', result['key'], 'BPM', result['tempo'], 'SEGS', len(result['chords']))
roots = {}
for c in result['chords']:
    r = c['chord'][0]
    roots[r] = roots.get(r,0) + (c['endTime']-c['startTime'])
for r,d in sorted(roots.items(), key=lambda x:-x[1]):
    print(f'  {r}: {d:.1f}s')
for c in result['chords']:
    print(f\"{c['startTime']:.2f}-{c['endTime']:.2f} : {c['chord']}\")
" > /tmp/local_analysis3_after.txt 2>&1
```

Target improvement:
- Total segments reduced from 73 to roughly 20–35.
- Total duration dominated by A, E, B, D.
- Parasitic roots C#, F#, G reduced to < 5% of total duration each.

Also run the regression tests listed above and report pass/fail.

## Report

Write a concise summary in `/home/visiteur/piano-jazz-chords/opencode-tasks/task-you-are-yahweh-v3-result.md` with:
- What was changed.
- Before/after segment counts and dominant roots.
- Regression test results.
- Any remaining issues.
