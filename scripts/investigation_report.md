# Investigation Report: Tempo Octave Ambiguity & ii-V-I Sevenths Issue

## Executive Summary

Two distinct but critical issues identified in the harmonic analysis pipeline:

1. **Tempo Octave Ambiguity** (Task 1): Systematic half/double tempo errors on fast tempos (140→70), syncopated bass (60→120), and rubato (140→70)
2. **ii-V-I Sevenths Detection Failure** (Task 2): Gmin7 consistently detected as Gm (0% sevenths score on ii-V-I progression)

---

## Task 1: Tempo Octave Ambiguity - Root Cause Analysis

### The Algorithm
`_resolve_tempo()` in `audio-processor.py:794` uses:
- **Candidates**: tempo_raw × {0.25, 0.5, 1.0, 2.0, 4.0}
- **Score** = periodicity × prior
- **Periodicity**: onset energy on candidate grid / overall onset energy
- **Prior**: log-normal centered at `TEMPO_PERCEPTUAL_CENTER = 110.0` with `TEMPO_PRIOR_SIGMA = 0.7`

### Failure Cases Traced

| Case | True Tempo | Raw (librosa) | Candidates Tested | Winner | Why |
|------|------------|---------------|-------------------|--------|-----|
| Stable 140 | 140 | 34.9 (¼) | 8.7, 17.5, **34.9**, 69.8, 139.7 | **69.8** | 69.8: periodicity=6.10 + prior=0.645 → score=3.93. 139.7: periodicity=3.34 + prior=0.886 → score=2.96. Prior not strong enough to overcome periodicity gap. |
| Syncopated 60 | 60 | 117.5 (2×) | 29.4, 58.7, **117.5**, 234.9, 469.8 | **117.5** | Raw librosa already doubled due to syncopated bass on off-beats. Prior at 110 BPM (0.991) overwhelmingly favors 117.5. Subdivision check fails because syncopation creates energy at off-beats. |
| Rubato 140 | 140 | 34.5 (¼) | 8.6, 17.2, **34.5**, 68.9, 137.8 | **68.9** | Same as stable 140 - librosa locks to measure level (¼ tempo). Prior favors 68.9 over 137.8. |

### Working Cases (for contrast)

| Case | True Tempo | Raw | Winner | Why it works |
|------|------------|-----|--------|--------------|
| Stable 90 | 90 | 22.5 (¼) | **89.9** | Prior at 89.9 (0.917) strong enough to overcome periodicity gap |
| Syncopated 120 | 120 | 117.5 (~1×) | **117.5** | Raw already correct; prior at 117.5 (0.991) confirms |

### Root Causes Identified

1. **Prior too wide** (`TEMPO_PRIOR_SIGMA = 0.7`): Prior at 140 BPM is 0.886, at 70 BPM is 0.645 - not discriminative enough
2. **Prior center at 110 BPM**: Biases toward 110 BPM, hurts fast tempos (140) and slow with syncopation
3. **Subdivision check fails on syncopation**: Syncopated bass creates energy at off-beats, making double-tempo grid appear valid
3. **Librosa measure-level locking**: On piano without drums, librosa often locks to measure (¼ tempo) or half-note (½ tempo) level

### Proposed Fixes

**Option A - Tighten prior**: Reduce `TEMPO_PRIOR_SIGMA` from 0.7 to 0.4-0.5 to make prior more discriminative
**Option B - Adaptive prior**: Use genre/tempo-range aware prior (not feasible without classification)
**Option C - Better subdivision check**: Check harmonic consistency of off-beats, not just onset energy
**Option D - Multi-scale onset**: Use onset detection at multiple hop lengths to distinguish true pulse from syncopation

---

## Task 2: ii-V-I Sevenths Detection Failure - Root Cause Analysis

### The Problem
- **Ground truth**: Gmin7 → C7 → Fmaj7 (ii-V-I in F major)
- **Detected**: Gm → C7 → F/Fmaj7
- **Result**: 0% sevenths score on ii-V-I progression across all 4 tempos

### Chroma Evidence

At Gmin7 region (60 BPM case), top pitch classes:
```
[7, 10, 2, 5, 9, 0] = G, Bb, D, F, A, C
```
- PC=7 (G): 0.663 ✓ root
- PC=10 (Bb): 0.579 ✓ minor 3rd
- PC=2 (D): 0.302 ✓ 5th
- PC=5 (F): 0.255 ✓ minor 7th **PRESENT**
- PC=9 (A): 0.145 ✓ 9th (unexpected but present in min7 voicing)
- PC=0 (C): 0.100

**The 7th (F/PC=5) IS present in the chroma at 0.255** - but HMM still picks Gm over Gmin7.

### Template Comparison

**Gm template** (normalized): PCs 7(G)=0.703, 10(Bb)=0.597, 2(D)=0.387
**Gm7 template** (normalized): PCs 7(G)=0.591, 10(Bb)=0.502, 2(D)=0.384, 5(F)=0.502

The m7 template has the 7th (PC=5) at weight 0.502, equal to the 3rd weight.

### Discriminator Pair Bug - **SMOKING GUN**

In `audio-processor.py:355`:
```python
DISCRIMINATOR_PAIRS = [
    ('m', 'm7', None, 10),   # "7e mineure → départager m/m7"
]
```

**This checks absolute PC=10 (Bb)**, which is the **minor 3rd**, NOT the minor 7th!

For Gmin7:
- Root G = PC 7
- Minor 3rd = (7+3)%12 = 10 (Bb) ← **This is what the discriminator checks**
- Minor 7th = (7+10)%12 = 5 (F) ← **This is what should be checked**

The discriminator system uses **absolute pitch class indices** instead of **relative intervals from chord root**. This is a fundamental design flaw.

### Correct Discriminators Should Be

| Pair | Current (absolute PC) | Correct (relative interval) | For G root |
|------|----------------------|----------------------------|------------|
| m vs m7 | PC=10 | interval 10 (minor 7th) | PC=5 (F) |
| '' vs maj7 | PC=11 | interval 11 (major 7th) | PC=6 (F#) |
| '' vs 7 | PC=10 | interval 10 (minor 7th) | PC=5 (F) |
| maj7 vs 7 | 11 vs 10 | 11 vs 10 | F# vs F |
| m7b5 vs dim | PC=10 | interval 10 (minor 7th) | PC=5 (F) |

The discriminator system was designed with absolute pitch classes assuming C major, but fails for all other keys.

### Additional Contributing Factor

The `THIRD_EVIDENCE_WEIGHT = 0.12` bonus for minor third (PC=10) strengthens Gm over Gm7, since both have the minor third but only Gm7 has the 7th. The discriminator should counteract this but checks the wrong PC.

---

## Recommended Fixes

### Priority 1: Fix Discriminator Pairs (Task 2)

Change `DISCRIMINATOR_PAIRS` in `audio-processor.py:354-362` to use **relative intervals** and apply per-chord-root in the observation model.

```python
# New format: (quality1, quality2, interval1, interval2) where intervals are RELATIVE to root
DISCRIMINATOR_PAIRS_RELATIVE = [
    ('m', 'm7', None, 10),      # minor 7th (10 semitones from root)
    ('', 'maj7', None, 11),     # major 7th (11 semitones)
    ('', '7', None, 10),        # minor 7th (10 semitones) for dominant 7
    ('maj7', '7', 11, 10),      # major 7th vs minor 7th
    ('sus2', 'sus4', 2, 5),     # 2nd vs 4th (already relative)
    ('m7b5', 'dim', None, 10),  # minor 7th
]
```

The observation model must resolve these relative to each chord root when computing scores.

### Priority 2: Tempo Prior Fix (Task 1)

**Immediate**: Tighten prior sigma
```python
TEMPO_PRIOR_SIGMA = 0.4  # was 0.7
```

**Better**: Replace log-normal prior with tempo-range adaptive prior:
- Fast (>120): center 140, narrow
- Medium (80-120): center 110, medium  
- Slow (<80): center 70, wide

**Best**: Add explicit subdivision support check that distinguishes true pulse from syncopation by checking harmonic consistency at off-beat positions.

---

## Files to Modify

1. `electron/audio-processor.py`:
   - Line 354-362: Fix `DISCRIMINATOR_PAIRS` to use relative intervals + update observation model
   - Line 409: Change `TEMPO_PRIOR_SIGMA = 0.7` → `0.4`
   - Line 738-756: Improve `_subdivision_support` for syncopation

2. Add tests to verify:
   - ii-V-I progression gets >80% sevenths score
   - 140 BPM stable tempo detected correctly
   - Syncopated 60 BPM detected as 60 not 120
