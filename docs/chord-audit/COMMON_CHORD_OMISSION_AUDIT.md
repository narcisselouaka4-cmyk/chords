# N2-A — Common Chord Omission Audit

> Date: 2026-07-16
> Method: Real execution of `detectChord()` against 10 omission voicings.
> Scope: Common jazz voicings where the perfect fifth (and sometimes the 9th or 11th) is omitted.

---

## Executive Summary

**Every single test case produced a wrong result.** The engine systematically misidentifies any voicing where the 5th is omitted. In 6 out of 10 cases, even the fundamental is wrong; in the remaining 4, the root happens to be correct but the quality is unrecognizable.

The root cause is structural: **every 7th, 9th, 11th, and 13th definition requires interval 7 (perfect fifth)**. When the 5th is absent, none of those definitions match. The engine falls back to whatever co-incidental set of intervals happens to be present, frequently choosing a power chord (E5, Eb5) over a different root or a single note.

---

## How the Engine Works

- **Candidate generation**: For every unique pitch class in the played set, the engine iterates `CHORD_DEFINITIONS` in order. A definition matches when `isSubset(requiredPcs, playedPcs)` — every required interval PC must be present in the played set.
- **Extra notes**: Tolerated. They simply prevent the exact-match bonus (+20). The chord is still detected.
- **Missing notes**: Fatal. `isSubset` returns false and the definition is skipped entirely. The engine does not distinguish between "the 5th is optional" and "the 5th is missing".
- **Why another root wins**: After the intended root's definitions all fail (missing the 5th), the engine tries other roots. The match with the highest score wins. A two-note power chord (root + 5th) over a different root often scores higher than the single-note fallback on the correct root.
- **Single candidate**: The engine returns only `bestMatch` (highest score). Competing interpretations are discarded.

---

## Results Table

| # | Case | Notes | PCs | Bass | Detected | Expected | Status | Root |
|---|------|-------|-----|------|----------|----------|--------|------|
| 1 | Cmaj7 no5 | C3 E3 B3 | {0,4,11} | C | E5/C | Cmaj7(no5) | WRONG_ROOT + WRONG_QUALITY | E |
| 2 | C7 no5 | C3 E3 Bb3 | {0,4,10} | C | C (single) | C7(no5) | WRONG_QUALITY | C |
| 3 | Cm7 no5 | C3 Eb3 Bb3 | {0,3,10} | C | Eb5/C | Cm7(no5) | WRONG_ROOT + WRONG_QUALITY | Eb |
| 4 | Cmaj9 no5 | C3 E3 B3 D4 | {0,2,4,11} | C | E5/C | Cmaj9(no5) | WRONG_ROOT + WRONG_QUALITY | E |
| 5 | Cm9 no5 | C3 Eb3 Bb3 D4 | {0,2,3,10} | C | Eb5/C | Cm9(no5) | WRONG_ROOT + WRONG_QUALITY | Eb |
| 6 | C9 no5 | C3 E3 Bb3 D4 | {0,2,4,10} | C | C (single) | C9(no5) | WRONG_QUALITY | C |
| 7 | Cm11 no5 | C3 Eb3 Bb3 D4 F4 | {0,2,3,5,10} | C | Cquartal(add4) | Cm11(no5) | WRONG_QUALITY | C |
| 8 | C13 no5 no11 | C3 E3 Bb3 D4 A4 | {0,2,4,9,10} | C | D7sus2/C | C13(no5,no11) | WRONG_ROOT + WRONG_QUALITY | D |
| 9 | C13 minimal | C3 E3 Bb3 A4 | {0,4,9,10} | C | Am/C | C7(add13) | WRONG_ROOT + WRONG_QUALITY | A |
| 10 | C9sus4 no5 | C3 F3 Bb3 D4 | {0,2,5,10} | C | Bbadd9/C | C9sus4(no5) | WRONG_ROOT + WRONG_QUALITY | Bb |

---

## Detailed Case Analysis

### 1. Cmaj7 no5 — C3 E3 B3 → E5/C

The played PCs {0,4,11} do not contain G (7), so no 7th-definition matches. However, E (4) and B (11) form a perfect fifth. The power chord definition `[0,7]` matches at root E=4: {4,11} is a subset of {0,4,11}. Score: 20. The single-note C gives 10. E5 wins.

**Cause**: The 3rd and 7th together form a perfect fifth with root E, triggering the power chord definition.

### 2. C7 no5 — C3 E3 Bb3 → C (single note)

PCs {0,4,10}. E and Bb form a diminished fifth, not a perfect fifth. No power chord matches. Only single-note matches exist with score 10. First root with score 10 is C=0.

**Cause**: The b7 creates a tritone with the 3rd, breaking the perfect-fifth pattern that triggers power chord detection.

### 3. Cm7 no5 — C3 Eb3 Bb3 → Eb5/C

PCs {0,3,10}. Eb (3) and Bb (10) form a perfect fifth. Power chord at root Eb=3 matches. Score: 20 > 10 for single-note C.

**Same cause as #1**: b3 and b7 form a perfect fifth.

### 4. Cmaj9 no5 — C3 E3 B3 D4 → E5/C

PCs {0,2,4,11}. The added D (2) does not create a match for any definition requiring interval 7. E5 still wins with score 20.

**Same cause as #1**: extension does not help without the 5th.

### 5. Cm9 no5 — C3 Eb3 Bb3 D4 → Eb5/C

PCs {0,2,3,10}. Eb5 wins with score 20.

**Same cause as #3**: extension does not help.

### 6. C9 no5 — C3 E3 Bb3 D4 → C (single note)

PCs {0,2,4,10}. Same as case #2 but with added 9th. No definition with [0,2,4,10] exists. Single-note C wins.

**Cause**: No power chord is formed (tritone 3-b7). Single note fallback.

### 7. Cm11 no5 — C3 Eb3 Bb3 D4 F4 → Cquartal(add4)

PCs {0,2,3,5,10}. The engine matches `Cquartal(add4)` {0,5,10,15→3} because {0,3,5,10} ⊆ {0,2,3,5,10} with root C=0. Score: 58 (exact match bonus inapplicable since D=2 is extra, but root=bass bonus and alphabetical bonus apply).

The upper structure A# major triad is also detected from {2,3,5,10} → A#{10}: {10,2,5} ⊆ {2,3,5,10}.

**Cause**: The PCs happen to form a quartal voicing, which is a plausible interpretation for a human but musically inferior to the intended Cm11(no5).

### 8. C13 no5 no11 — C3 E3 Bb3 D4 A4 → D7sus2/C

PCs {0,2,4,9,10}. D7sus2 at root D=2: {2,4,9,0} = {0,2,4,9} ⊆ {0,2,4,9,10}. Score: 40. Upper structure A minor found: A=9 → {9,0,4} ⊆ {0,4,9,10}. No higher scoring definition with root C exists because all require G (7).

**Cause**: The missing 5th and 11th leave {C,D,E,A,Bb} which happens to match D7sus2. The correct C13 requires G.

### 9. C13 minimal — C3 E3 Bb3 A4 → Am/C

PCs {0,4,9,10}. Am at root A=9: {9,0,4} ⊆ {0,4,9,10}. Score: 30 > 10 (single-note C on root 0).

**Cause**: No definition with root C matches. The 3rd (E) and 13th (A) form the interval set of an A minor triad when combined with C.

### 10. C9sus4 no5 — C3 F3 Bb3 D4 → Bbadd9/C

PCs {0,2,5,10}. Bbadd9 {10,2,5,0}: exact match. Score: 60 (4×10 + 20 exact bonus). No C-root definition matches C9sus4 (needs G=7 and would give {0,5,7,10,14}). Bbadd9/C fully captures the notes but gets the root wrong.

**Cause**: The correct C9sus4(no5) does not exist as a definition. The played set is an exact match for Bbadd9.

---

## Root Cause Summary

The single root cause is:

> **Every extended chord definition (maj7, 7, m7, m9, 9, maj9, 11, 13, sus4 variants) requires interval 7 (perfect fifth).**

When a jazz voicing omits the 5th, the engine sees a set of PCs that:
1. Fails `isSubset` for the intended chord → definition skipped
2. May match a coincidental definition with a different root → **WRONG_ROOT** (cases 1,3,4,5,8,9,10)
3. May fail all multi-interval definitions → **single-note fallback** (cases 2,6) or **unrelated quality** (case 7)

---

## Impact on the Future Voicing Generator

The future voicing generator (Phase 2A Simple, Phase 1 Close) already produces voicings that **may omit the 5th** (e.g., Simple style omits the 5th by design for maj7, m7, 7). When the generator's output is fed back into `detectChord()`:

- **Simple voicings**: Will NOT be recognized as their intended chord. E.g., a Cmaj7 Simple voicing (C E B) returns `E5/C` not `Cmaj7`.
- **Close voicings**: The 5th is present, so close voicings ARE recognized correctly.
- **The generator itself does not rely on `detectChord()`**: It produces MIDI notes directly from chord symbols. The misrecognition only matters for:
  - **Live detection**: User plays a shell voicing → wrong chord shown
  - **Analysis/feedback**: Engine cannot confirm that a user's no-5 voicing is correct

---

## Recommendation

### B — Patch minimal : quinte facultative

**Chosen because:**

- The only commonly omitted interval in jazz/gospel/neo-soul voicings is the perfect fifth.
- Adding `no5` variants is a contained change that follows the existing pattern (like `sus2`/`sus4` variants).
- 7 out of 10 cases would be fixed by making the 5th optional on 7th-chord-family definitions.
- The remaining 3 cases (C13 no5 no11, C13 minimal, C9sus4 no5) would also benefit but would additionally need `no11` handling — these are less common voicings and could be addressed separately.

**Qualities that should gain a `no5` variant** (if this patch is implemented later):

| Current Definition | no5 Variant | Intervals | Fixes Cases |
|---|---|---|---|
| maj7 | maj7(no5) | [0,4,11] | 1 |
| 7 | 7(no5) | [0,4,10] | 2 |
| m7 | m7(no5) | [0,3,10] | 3 |
| maj9 | maj9(no5) | [0,4,11,14] | 4 |
| m9 | m9(no5) | [0,3,10,14] | 5 |
| 9 | 9(no5) | [0,4,10,14] | 6 |
| m11 | m11(no5) | [0,3,10,14,17] | 7 |
| 13 | 13(no5) | [0,4,10,14,21] | 8 |
| 13 (minimal) | 7(add13) | [0,4,10,21] | 9 |
| 9sus4 | 9sus4(no5) | [0,5,10,14] | 10 |

**Recommendation scope**: Limit the patch to 7th-family chords (maj7, 7, m7) and their 9th/11th/13th extensions. Do NOT add `no5` variants for triads (the 5th is structurally essential for triad identity).

**Risk**: Adding `no5` definitions must be ordered carefully — they must appear AFTER the full definition but BEFORE single-note/power-chord fallbacks. The `no5` variant must have the same symbol with `(no5)` appended, or use a new internal symbol convention. The exact-match bonus would correctly distinguish full voicings from no5 voicings when the 5th IS present.

---

## Git Status

```
$ git status --short --untracked-files=all
```
(Only `docs/chord-audit/COMMON_CHORD_OMISSION_AUDIT.md` is new; pre-existing foreign modifications are unchanged.)

```
$ git diff --name-only
```
No production files modified.

```
$ git diff --check
```
Clean — no whitespace errors.

---

## 6. Implementation Decision — N2-B (applied 2026-07-16)

### Scope

A minimal, targeted patch was implemented in `src/chord-engine/index.js` to recognise **rooted maj7, 7, and m7 shell voicings** (root + 3rd + 7th, no 5th).

### What was done

1. **`index.js`**: Added a shell-matching block after the standard detection loop. When the standard loop produces a weak match (power chord, single note) and the played PCs exactly equal `[0,4,11]`, `[0,4,10]`, or `[0,3,10]` with root in bass, a shell candidate is created with the canonical symbol (`maj7`, `7`, or `m7`) and the metadata field `omittedIntervals: [7]`.
2. **`test-chords.js`**: Added 38 direct tests (3 shell voicings, 3 full chords, 6 negative cases, 26 pre-existing) + 36 programmatic transpositions (12×maj7, 12×7, 12×m7) = 98/98 tests.

### What was NOT done

- No modification to `CHORD_DEFINITIONS` in `chord-defs.js`
- No new canonical quality symbols (`maj7(no5)`, etc.)
- No HMM, audio, rootless, upper structure, or polychord changes
- No handling of extended incomplete chords (9th, 11th, 13th, sus4 without 5th)
- No general `add`/`omit` mechanism
- No commit

### Design rationale

- The shell check runs **after** the standard loop but **before** rootless/polychord processing. A shell candidate with score 68 beats power chords (20) and single notes (10) but loses to full chords (78+).
- `setEquals()` ensures only exact 3-note shells match — extended voicings like `C E B D` (with 9th) are NOT recognised as `Cmaj7` in this phase.
- `omittedIntervals: [7]` is added as optional metadata. It does not affect the canonical symbol and is compatible with all existing consumers that read `symbol` and `rootPc`.
- The 5th remains structurally required in `CHORD_DEFINITIONS`. The shell logic is a detection-layer affordance, not a definition-layer change.

### Boundary conditions verified

| Condition | Example | Expected | Result |
|---|---|---|---|
| Root not in bass | E G B | Em (not Cmaj7) | Pass |
| Only 2 notes | E B | E5 (not Cmaj7) | Pass |
| Only 2 notes, minor | Eb Bb | Eb5 (not Cm7) | Pass |
| Shell + extension | C E B D | E5/C (not Cmaj7) | Pass |
| 7 shell + 13th | C E Bb A | Am/C (not C7) | Pass |
| Sus4 incomplete | C F Bb D | Bbadd9/C (not C9sus4) | Pass |
| Full chord (5th present) | C E G B | Cmaj7 | Pass |

### Qualities explicitly excluded from this phase

The following incomplete voicings remain unrecognised and are explicitly deferred:

- `Cmaj9` without 5th (C E B D)
- `C9` without 5th (C E Bb D)
- `Cm9` without 5th (C Eb Bb D)
- `Cm11` without 5th (C Eb Bb D F)
- `C13` without 5th (C E Bb D A)
- `C9sus4` without 5th (C F Bb D)
- `C7` with 13th without 5th (C E Bb A)

These require the 5th to be optional in extended definitions, which is a larger change deferred to a future phase.
