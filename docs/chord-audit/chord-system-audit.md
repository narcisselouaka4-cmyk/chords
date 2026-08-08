# Chord System Audit — Piano Jazz Chords

## 1. Architecture Overview

The chord recognition and naming system spans three layers:

| Layer | Directory | Responsibility |
|---|---|---|
| Core Engine | `src/chord-engine/` | Pure algorithmic detection, interval math, definition storage |
| Analyzer | `src/analyzer/` | MIDI session analysis, timeline building, key detection, scoring, patterns |
| UI | `src/ui/` | Live display, chord editor, voicing preview, mini keyboard |

Data flow: `detectChord(activeNotes)` → chord result → UI display + optional override via ChordEditor.

---

## 2. Files and Responsibilities

### `src/chord-engine/chord-defs.js` (116 lines)
- **`CHORD_DEFINITIONS`** (line 5-78): 50 chord definitions (48 unique, includes 1 duplicate m7b5 and 1 rootless mirror with parentSymbol). Each: `{ name, symbol, intervals }`.
- **`ROOTLESS_DEFINITIONS`** (line 83-91): 7 rootless voicing templates, intervals exclude the root.
- **`INTERVAL_NAMES`** (line 94-116): Pedagogical map from semitones to French interval names.

### `src/chord-engine/intervals.js` (116 lines)
- Note name mappings: `NOTE_NAMES`, `FLAT_NAMES`, `LATIN_NAMES`, `LATIN_FLAT_NAMES`.
- `NAME_ALIASES` for Latin normalization (re→ré, ti→si).
- Key functions: `noteNameToPc`, `midiToNoteName`, `noteSetToPcs`, `formatNote`.

### `src/chord-engine/index.js` (356 lines)
- **`detectChord(activeNotes)`** (line 173-356): Main detection function.
- **`classifyVoicing(midiNotes)`** (line 131-171): Voicing type classifier.
- Helper: `findUpperStructure`, `findPolychord`, `findRootlessMatches`.

### `src/chord-engine/naming.js` (58 lines)
- `chordName(rootPc, symbol)`: e.g. `Cmaj7`.
- `slashName(rootPc, symbol, bassPc)`: e.g. `C/E`.
- `formatSymbol(symbol)`: Replaces `#`/`b` with HTML span entities.
- `inversionName(index)`: French text ("position fondamentale", "1ère inversion", etc.)

### `src/chord-engine/chord-display.js` (203 lines)
- `parseChordSymbol(chordStr)`: Parses `"Fm7/D"` → `{ root, quality, bass, isN }`.
- `resolveCanonicalChordDefinition(quality)`: Finds the canonical (non-rootless) definition.
- `deriveChordDisplay(effectiveChord)`: Computes chord tones, bass, all PCs/names.
- `getEffectiveChord(segment)`: Returns `manualOverride ?? detected`.
- `normalizeOverride`: Returns null if override matches detection exactly.
- `formatEffectiveChord(root, quality, bass)`: Builds display string.

### `src/chord-engine/voicing.js` (29 lines)
- `VOICING_LABELS`: `{ single, shell, cluster, close, open, spread }`.
- `ALIASES` (line 18-25): 6 aliases: `6`↔`m7 (3rd inversion)`, `m7`↔`6 (relative major)`, `maj7#5`↔`maj7alt`, `7sus4`↔`sus4 7`, `9sus4`↔`sus4 9`, `13sus4`↔`sus4 13`.

### `src/analyzer/harmonic-utils.js` (41 lines)
- `isMinorSymbol`, `isDominantSymbol`, `isMajorSymbol` (line 9-21): Symbol classification.
- `degreeOf`, `degreeName`: Scale degree computation.
- `formatChordBrief`: Short chord string format.

### `src/analyzer/bass-harmonic-relation.js` (269 lines)
- `computeRelationToChord(bassMidi, chordName)` (line 69):
  Determines if bass is root, chord tone, slash bass, or passing tone.
- `CHORD_QUALITY_PATTERNS` (line 10-19): Alternative suffix patterns for quality detection.
- `QUALITY_INTERVALS` (line 21-32): Reduced interval set (maj, min, maj7, min7, dom7, dim, aug, sus2, sus4).
- `enrichChordWithBass(chord, dominantBass)`: Adds slash/inversion interpretation.

---

## 3. Detection Algorithm

### 3.1 Standard Detection (`detectChord`, `index.js:189-227`)

```
for each unique pitch class as candidate root:
  for each CHORD_DEFINITION (in order, most specific first):
    build required PC set from definition intervals
    if required is subset of played PC set:
      score = intervals.length * 10
        + (exact match ? 20)
        + (exact match && root = bass ? 15)
        + (root = bass ? 5)
        + (root = smallest PC ? 3)
        + (upper structure in 7th/9th chords ? 4)
      keep highest score
```

**Key property**: The search loops over *every unique PC as root* and *every definition*. This means the system detects chords in any inversion and also considers non-bass notes as potential roots.

**Ordering issue**: `CHORD_DEFINITIONS` is ordered by specificity (13ths first, triads last). However, since scoring uses `intervals.length * 10`, bigger definitions naturally score higher regardless of order.

### 3.2 Root Detection

The root is the `rootPc` of the highest-scoring match. There is no standalone "root detection" — the root emerges from which definition + which candidate root produces the best score.

### 3.3 Bass Handling

The bass is always the lowest MIDI note (`sortedNotes[0] % 12`). After detection:
- `isSlash = bassPc !== rootPc` (line 219)
- If the bass is a chord tone, the chord is shown with inversion
- If the bass is NOT a chord tone, the chord is displayed as a slash chord

### 3.4 Slash Chord Detection

Slash chords are detected when the bass note (lowest MIDI) differs from the detected root. There is NO explicit slash chord definition — any chord can have a slash bass.

Additionally, `bass-harmonic-relation.js` enriches analysis with slash interpretation when a stable bass note overlaps a chord segment.

### 3.5 Inversions

Detected via `findInversionIndex` (`index.js:81-86`):
```
bassPc = sortedNotes[0] % 12
inversionIndex = intervals.findIndex(i => (root + i) % 12 === bassPc)
```
If the bass is not a chord tone, `inversionIndex = 0`.

### 3.6 Incomplete Chords and Extra Tones

The system uses subset matching: `isSubset(required, pcSet)` checks that **every required pitch class is present** in the played set (line 192, `index.js`). This means:

- **Missing tones cause the match to FAIL.** If a chord definition requires interval 7 (perfect 5th) and the played notes don't contain PC 7, the match is rejected. For example, C-E-B (PCs {0,4,11}) does NOT match Cmaj7 (requires {0,4,7,11}) because PC 7 (G) is absent.
- **Extra tones are tolerated.** If the played set contains more pitch classes than the definition requires, the match still succeeds (e.g., C-E-G-B-D matches Cmaj9 if Cmaj9 only requires {0,4,7,11,14} but the played set is {0,2,4,7,11} = D is the 9th, which is already in Cmaj9's definition.
- The `confidence` field (line 210) reflects whether the match is exact: `setEquals(required, pcSet) ? 1.0 : required.size / pcSet.size`.
- The `missing` field is always set to `[]` (line 220) — the system does NOT track which intervals are absent.

**Key consequence**: You cannot detect a Cmaj7 from notes C-E-B (missing G). The system will try other roots/definitions. C-E-B might match E minor (E-G-B? No G absent) or fail entirely and fall back to rootless detection.

### 3.7 Suspended Chords (sus2, sus4)

Sus chords are defined as triads:
- `sus4`: `[0, 5, 7]` (root, 4th, 5th)
- `sus2`: `[0, 2, 7]` (root, 2nd, 5th)

Extended sus chords:
- `7sus4`: `[0, 5, 7, 10]`
- `7sus2`: `[0, 2, 7, 10]`
- `9sus4`: `[0, 5, 7, 10, 14]`
- `13sus4`: `[0, 5, 7, 10, 14, 17, 21]`

**Missing**: There is NO `maj7sus2`, `maj7sus4`, `m9sus4`, `m13sus4`, or any sus chord with a major 7th. Extended sus chords only exist for dominant quality.

### 3.8 Omission Markers (no3, no5)

The system has **no concept** of omission markers. There are no `no3` or `no5` quality definitions. A chord like `C(no3)` or `C(no5)` cannot be represented or detected.

### 3.9 Scoring

```
score = intervalCount * 10        // base: bigger definitions score higher
  + exactMatch * 20               // played PCs exactly match definition
  + exactRooted * 15              // exact match AND root in bass
  + rootIsBass * 5                // root in bass (non-exact)
  + alphabeticalRoot * 3         // root is lowest PC (slight tiebreaker)
  + upperStructure * 4            // upper triad found in 7th/9th/11th/13th chords
```

### 3.10 Fallback and Downgrade Rules

1. **Triad → rootless upgrade** (line 233-257): If best match is a 3-interval triad in root position AND `uniquePcs.length > 3`, check rootless definitions for a richer interpretation. Guard: 3-note triads are NEVER upgraded (C-E-G stays C major).

2. **Upper structure enrichment** (line 262-269): If the matched chord contains 7th/9th/11th/13th intervals, look for a complete triad in the upper notes. If found, annotate the result.

3. **Polychord detection** (line 271-296): If the best match is NOT exact+rooted, look for two non-overlapping triads. If found, return `lower/upper` polychord.

4. **Rootless fallback** (line 314-334): If NO standard definition matches, try rootless definitions. Takes the one with the most intervals.

5. **Unknown chord** (line 336-352): If nothing matches, return `{ symbol: '?', fullName: 'Accord non identifié', confidence: 0 }`.

---

## 4. Naming and Formatting

- `chordName(rootPc, symbol)`: `formatNote(rootPc) + formatSymbol(symbol)` → `"Cmaj7"`
- `slashName(rootPc, symbol, bassPc)`: `chordName + "/" + formatNote(bassPc)` → `"C/E"`
- `formatSymbol`: HTML entity replacement for #/b → `<span class="sharp">♯</span>` / `<span class="flat">♭</span>`
- `inversionName`: French text (0=position fondamentale, 1=1ère inversion, etc.)
- Rootless chords display as `"Cmaj9 (rootless)"` (fullName includes parenthetical)

---

## 5. Known Limitations

### 5.1 Missing Chord Qualities
- No `maj7sus2`, `maj7sus4` (suspended chords with major 7th)
- No `m9sus4`, `m13sus4` (suspended chords with minor quality)
- No `7alt` (altered dominant — though `7b9`, `7#9`, `7b5`, `7#5`, `7b9b13`, `7#9b13`, `7b9#9` cover individual alterations)
- No `7#9#11`, `7b9#11`, `7b9b5` etc. (combinations not covered)
- No diminished major 7th (`dimMaj7`)
- No augmented major 9th (`aug9`), augmented minor 7th (`aug7`)
- No `mMaj9`, `mMaj11`, `mMaj13` (minor major extensions)
- No `sus24` (combined sus2 and sus4)
- No `7sus4b9`, `7sus4#9` (altered sus chords)
- No `N.C.` (no chord) — `N` is supported as a special chord symbol
- No `o` (circle) as alias for `dim`
- No `ø` (half-diminished) as alias for `m7b5`

### 5.2 Interval Ambiguity in `m13`
The `m13` definition uses interval `10` for the 7th (minor 7th = b7), which is correct. But the interval for the minor 3rd is `3` (correct). The symbol `m13` conventionally implies a minor 7th (b7), which interval 10 correctly represents. **No ambiguity here.**

### 5.3 Natural 11 in Major Chords
`maj11` uses interval `17` (perfect 11th). In practice, the natural 11 clashes with the major 3rd (interval 4). Jazz musicians typically omit the 3rd or use #11. The system has no mechanism to flag this voicing concern.

### 5.4 Omission Support
The system cannot represent chords with explicitly omitted tones (e.g., `Cmaj7(no3)`, `C7(no5)`). There are no definitions or detection paths for this.

### 5.5 Slash Chord Ambiguity
When `bassPc !== rootPc`, the chord is labeled as a slash chord. However, the system sometimes detects different root candidates. For example, C-E-G-B could be detected as Cmaj7 (root C) or Em7 (root E, if scoring favors it). The system selects the highest-scoring candidate.

### 5.6 Upper Structure Detection
Upper structure detection only considers triads formed by notes *other than the root* (`findUpperStructure`, line 16-31). It checks only 4 triad types: Major, Minor, Augmented, Diminished. It does NOT check for sus4/sus2 upper structures.

### 5.7 Polychord Detection
Polychord detection looks for ANY pair of non-overlapping triads, not just commonly used polychords (e.g., D/C is detected as C/D polychord but Cm7/F is not because it requires overlapping triads).

### 5.8 Rootless Detection Boundary
Rootless detection is only triggered:
1. When the standard match is a 3-interval triad in root position AND `uniquePcs.length > 3` (post-processing, line 234)
2. When NO standard match exists (fallback, line 314)

This means rootless voicings that coincidentally also match a larger standard definition (e.g., E-G-Bb-D matching Edim or C9 rootless) may be detected as the standard chord instead.

### 5.9 Candidate Generation
The system does NOT generate a ranked list of all possible candidates. It only returns the single best match. The `otherCandidates` concept exists in the audit bundle but is not implemented in production code.

### 5.10 Symbol Parsing
`parseChordSymbol` (`chord-display.js:35`) uses a simple regex `^([A-G][#b]?)(.*)` to extract root and quality. This correctly handles standard symbols but may fail on edge cases:
- Chords with `bb` (double flat) — not supported by the regex
- Chords with `##` (double sharp) — not supported
- Chords with `locrian` or `lydian` text suffixes — treated as quality string
- `N` is the only special symbol recognized

### 5.11 Pitch Class vs MIDI Notes
`detectChord` works with pitch classes (MIDI note % 12), ignoring octave displacement. This means:
- C4-E4-G4 and C3-E3-G3 produce the same detection result
- Chord tone doubling does not affect detection
- Voicing type classification (`classifyVoicing`) uses MIDI notes directly, so it IS sensitive to octave placement

### 5.12 Alias System Warnings
The `ALIASES` map in `voicing.js` is purely for display and pedagogy. It is NOT used in detection. The aliases are informational only.

---

## 6. Chord Database: Frequency of Tested Qualities

Based on the test file `src/chord-engine/test-chords.js` (18 active tests):

| Tested | Not Tested |
|--------|------------|
| C9 | C6, C6/9, Cadd9, Cmadd9, Cadd11, C6add11 |
| C13 | Cmaj13, Cm13, C7b13 |
| Cm7b5 | Cdim7, C7b5, C7#5 |
| C7#9b13 | C7b9, C7#9, C7b9#9, C7b9b13 |
| C13#11 | C7#11 |
| C/E | C/G, C/B, C/D, etc. |
| Cmaj9 | Cmaj7, C7, Cm7 |
| Dm9 | Cm9, Cm7b9 |
| G7sus4 | C7sus2, Csus4, Csus2 |
| F#m7b5 | — |
| C (major) | Cm (minor) |
| F (major) | — |
| C quartal | — |
| C quartal add4 | — |
| D/C polychord | — |
| C9sus4 | C7sus4 (as standalone test) |
| C13sus4 | — |
| Em7b9 | — |
| — | **aug**, **dim**, **mMaj7**, **maj7#5**, **m6**, **6/9**, **maj11**, **11**, **m11**, **5** (power chord), **7sus2** |

---

## 7. Edge Cases for Audit

The following test cases are deliberately ambiguous and should be manually reviewed:

1. **C E G B** (Cmaj7) — Should detect as Cmaj7.
2. **C D G B** (C D G B) — Should detect as Csus2 (no maj7sus2 definition exists).
3. **C F G B** — Likely Csus4, but B (maj7) is ignored.
4. **C F G Bb** — Should detect as C7sus4.
5. **C D F G Bb** — Should detect as C9sus4 (exact match).
6. **C F G A Bb** — Likely C7sus4 (A/9th is extra, no C13sus4 requires D/9th).
7. **D E A C#** — Ambiguous: Dmaj9 without 3rd? D6 without 3rd? Dsus2 with added C#?

---

## 8. Directory Map

```
src/chord-engine/
├── chord-defs.js         # 50 chord quality definitions (48 unique) + 7 rootless + interval names
├── chord-display.js      # Display derivation, parsing, formatting
├── index.js              # detectChord(), classifyVoicing(), rootless/upper/polychord detection
├── intervals.js          # Note/interval math, pitch class utilities
├── naming.js             # Chord name/slash name formatting, inversion names
├── pedagogy.js           # Voicing suggestions and jazz usage hints
├── voicing.js            # Voicing labels and musical aliases
├── test-chords.js        # 18 detection tests
└── test-regression-part3.js  # 3 regression tests (classifier purity)

src/analyzer/
├── harmonic-utils.js     # Symbol classification, degree names, degree mapping
├── bass-harmonic-relation.js  # Bass-to-chord relation computation, slash interpretation
├── alternatives.js       # Alternative voicing computation
├── chord-timeline.js     # Timeline builder (groups notes into chords over time)
├── key-detector.js       # Krumhansl-Schmuckler key detection
├── scorer.js             # Session scoring (voice leading, transitions, tensions)
├── harmonic-patterns.js  # II-V-I, cadences, turnarounds, substitutions
├── voice-leading.js      # Voice leading analysis between consecutive chords
├── substitutions.js      # Tritone, secondary dominant, chromatic passing chord detection
├── segmenter.js          # Section segmentation
├── chord-comparator.js   # Reference grid vs played comparison
├── reharmonizer.js       # Style-based reharmonization (worship, gospel, jazz, neoSoul)
└── analysis-export.js    # MIDI/JSON/Text export

src/ui/
├── display.js            # Live chord display update
├── chord-editor.js       # Chord editor dialog with root/quality/bass selectors
├── analyzer-tab.js       # Analyzer tab: timeline, playback, chord editing
├── voicing-preview.js    # Close/simple voicing text preview
└── mini-keyboard.js      # SVG mini keyboard renderer
```
