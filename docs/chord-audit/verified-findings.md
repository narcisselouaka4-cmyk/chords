# Chord System Audit — Verified Findings

> Date: 2026-07-16
> Method: All 34 test cases verified by executing `detectChord()` from `src/chord-engine/index.js` against real MIDI note arrays.
> Source code read and compared: `chord-defs.js`, `index.js`, `test-chords.js`, `test-regression-part3.js`, `naming.js`, `intervals.js`.

---

## 1. Errors in the First Audit Bundle (corrected)

| Error | File | Correction |
|---|---|---|
| `totalDefinitions: 38` was wrong | `chord-vocabulary.json` | `totalChordDefinitions: 50` (entries in CHORD_DEFINITIONS), `uniqueMusicalQualities: 47` |
| C9 test had wrong MIDI (missing D) | `chord-test-cases.json` | Added `62` (D4) to make 5-note C9 |
| C13 test had wrong MIDI (extra C4=60) | `chord-test-cases.json` | Removed spurious `60`, now correct 7-note C13 |
| Subset matching explanation wrong | `chord-system-audit.md` §3.6 | Fixed: missing tones cause FAILURE, not success |
| Several `currentDetectedName` were placeholders | `chord-test-cases.json` | Replaced with actual engine output |
| Metadata claimed 40 cases | `chord-test-cases.json` | Corrected to 34 (18 existing + 16 new) |
| m13 note was misleading | `chord-vocabulary.json` | Clarified: interval 10 = b7 is correct |

---

## 2. Key Engine Behaviors Discovered

### 2.1 Exact-Match Dominance

The engine's scoring awards **+20 for exact match**. This causes `add11`/`add9` chords to dominate over simpler sus/slash interpretations:

| Case | Played PCs | Engine Result | Why |
|---|---|---|---|
| C D G B | {0,2,7,11} | **Gadd11/C** (root=G) | Gadd11 is exact match (score 60). Csus2 is partial (score 38). |
| D E A C# | {1,2,4,9} | **Aadd11/D** (root=A) | Aadd11 is exact match (score 60). Dsus2 is partial (score 38). |

The engine prefers a longer-definition exact match with a different root over a shorter partial match with the correct root.

### 2.2 Missing Quality Gaps

| Case | PCs | Engine | Musical Expectation | Gap |
|---|---|---|---|---|
| C D G B | {0,2,7,11} | Gadd11/C | Cmaj7sus2 | **No maj7sus2 definition** |
| C F G B | {0,5,7,11} | Csus4 | Cmaj7sus4 | **No maj7sus4 definition** |
| C F G A Bb | {0,5,7,9,10} | C7sus4 | C13sus4(no9th) | C13sus4 requires D (PC 2) |

### 2.3 Root Selection Pattern

When an `add11` or `add9` chord matches exactly, the root becomes the add-chord root, producing a slash chord. For example:
- Gadd11/C means root = G, bass = C → isSlash = true
- Aadd11/D means root = A, bass = D → isSlash = true

The engine's pseudo-algorithmic root selection (highest score) favors the longer definition's root.

### 2.4 Rootless Detection Limitations

- Rootless detection requires `uniquePcs.length > 3` (guard against 3-note triads)
- Test case E-G-B-D (Cmaj9 rootless) is **commented out** because rootless was too aggressive
- The m7b5 rootless mirror entry at line 77 (`intervals: [3,6,10]`) has `parentSymbol` and is ignored by `resolveCanonicalChordDefinition`, but IS checked by `detectChord` (no parentSymbol filtering in the detection loop). It scores 30 vs the real m7b5's 40, so it doesn't interfere.

---

## 3. Musically Legitimate Ambiguities

These are NOT engine bugs — they are genuine musical ambiguities where multiple names are valid:

| Case | Detection | Alternative Reading | Assessment |
|---|---|---|---|
| C E G B | Cmaj7 | Upper structure Em triad over C (notes E G B) | Cmaj7 is correct. NOT Em7 (Em7 requires D). C E G B is a single Cmaj7 chord, not an upper-structure polychord — the upper three notes happen to form an Em triad but the engine does not detect it as upper structure because it's an exact match for Cmaj7. |
| C F G Bb | C7sus4 | F major with added Bb? | C7sus4 is correct. The engine matches C7sus4 exactly. |
| E G B D (Cmaj9 rootless) | **disabled test** | Em7? Cmaj9 rootless? | Requires musical judgment. Tests disabled because engine could not reliably distinguish rootless from simple triads. |

Note on incorrectly described cases from the first bundle:
- **A3 C4 E4 D4** (PCs {0,2,4,9}, bass A) is NOT C6 (needs G/PC 7), NOT Am7 (needs G/PC 7). It matches Asus4 (score 35) instead. The "Aadd11/D" and "C6 = Am7" descriptions in the first audit bundle were musically wrong.
- **C E G B** is NOT related to Em7 in any inversion. Em7 requires D (PC 2). Cmaj7 can have an Em upper-structure annotation (the engine's `findUpperStructure` would find Em triad in the upper notes), but it's not Em7 and not an inversion of Em7.

---

## 4. Verified Test Results Summary

| Category | Count |
|---|---|
| Existing tests (from test-chords.js) | 18 |
| All existing tests PASS | 18/18 |
| New explicit cases verified | 16 |
| Clear PASS | 9/16 |
| REQUIRES_MUSICAL_REVIEW | 7/16 |
| **Total cases verified** | **34** |

### Cases Requiring Musical Review

1. **C D G B** → Gadd11/C — should this be Cmaj7sus2?
2. **C F G B** → Csus4 — should this be Cmaj7sus4?
3. **C F G A Bb** → C7sus4 — should this be C13sus4(no9)?
4. **D E A C#** → Aadd11/D — should this be Dmaj9(no3)?
5. **E-G-B-D** (rootless test) — disabled test, requires new scoring
6. **E3 B3 D4 F4 G4 B4** → Em7b9 (upper: G) — correct but upper structure annotation may be surprising
7. **A3 C4 E4 D4** (C6 = Am7 ambiguity) — labeled C6 by naming, Am7 by equivalence

---

## 5. Patch Decision Recommendation

Based on the verified findings, the recommended approach is:

### Option A: Add only maj7sus2 and maj7sus4 (MINIMAL)
- Adds 2 definitions to CHORD_DEFINITIONS
- Fixes cases 1 and 2 above
- Does NOT fix case 3 (C13sus4 missing 9th)
- Does NOT fix case 4 (no3/omit mechanism)
- **Risk**: Very low — no existing tests would break
- **Effort**: ~15 minutes

### Option D: Combine multiple options (RECOMMENDED)
- A: Add maj7sus2 and maj7sus4
- B: Add structured add/omit representation (allows `Dmaj9(no3)` instead of `Aadd11/D`)
- C: Modify candidate ranking to prefer roots matching the bass note when scores are close
- **Risk**: Medium — add/omit affects parser, rank changes affect existing detection
- **Rationale**: Cases 1, 3, and 4 are all caused by the same root cause: no way to express "chord quality X with note Y omitted"

### Not Recommended
- **Option B alone** (add/omit only without sus definitions): incomplete fix
- **Option C alone** (re-rank without new definitions): would change all detection, high regression risk
