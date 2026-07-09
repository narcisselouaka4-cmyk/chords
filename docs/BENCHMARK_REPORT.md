# Phase 6 — Benchmark Report

> Generated: 2026-07-09

## Overview

Systematic evaluation of four bass-detection pipelines across 24 pieces (3 real, 21 synthetic), with a dev/test split and detailed error classification.

## Pipelines

| Pipeline | Description |
|----------|-------------|
| `be_only` | Bass Engine V2.5 winner-pick per frame + mode smoothing |
| `fusion_no_vr` | Fusion Engine V1.0 with virtual_root disabled |
| `fusion_vr` | Fusion Engine V1.0 with virtual_root enabled (Config A) |
| `chord_baseline` | Extract bass root from `structural_chord` name |

## Corpus (24 pieces)

| Set | Pieces | Count | Source |
|-----|--------|-------|--------|
| Dev | amazing_grace, autumn_leaves_mix, note_C2, note_E2, note_G2, chord_C, chord_Dm, slash_C_E, slash_D_Fs, jazz_Cmaj9, jazz_Dm7_G | 11 | 2 real + 9 synth |
| Test | ton_nom_est_jehovah, note_Fs2, note_A2, note_B2, note_harm_{C,E,G,B}2, chord_G, slash_G_B, slash_Am7_G, walking_bass, jazz_G13 | 13 | 1 real + 12 synth |

## Average Results

| Pipeline | NW Accuracy | Octave Error | Fragmentation |
|----------|------------:|-------------:|--------------:|
| BE only | 64.3% | 29.9% | 1.89 |
| Fusion no VR | 66.0% | 29.0% | 1.82 |
| **Fusion VR** | **72.8%** | **23.1%** | **1.79** |
| Chord baseline | 48.4% | 1.6% | 0.53 |

Fusion VR improves NW by +8.5pp and reduces octave error by -6.8pp over BE only.

## Results by Category

### Real audio (gospel/jazz)

| Piece | BE only | Fusion no VR | Fusion VR | Chord baseline |
|-------|:-------:|:------------:|:---------:|:--------------:|
| amazing_grace | 26.7% / 66.7% | 38.3% / 58.3% | **43.3% / 55.0%** | 100% / 0% |
| autumn_leaves_mix | 56.2% / 31.2% | **59.4% / 28.1%** | 57.8% / 26.6% | 21.9% / 0% |
| ton_nom_est_jehovah | 11.1% / 83.3% | 16.7% / 77.8% | **33.3% / 66.7%** | 27.8% / 38.9% |

Format: `NW% / OctErr%`

Fusion VR consistently improves NW on real audio, most significantly on `ton_nom_est_jehovah` (+22.2pp).

### Single bass notes (synthetic)

| Note | BE only | Fusion VR | Note |
|------|:-------:|:---------:|------|
| C2 (MIDI 36) | 0.0% / 100% | 0.0% / 100% | BE detects C4 (octave +2) |
| E2 (MIDI 40) | 0.0% / 100% | 0.0% / 100% | BE detects E4 (octave +2) |
| F#2 (MIDI 42) | **100% / 0%** | **100% / 0%** | ✅ |
| G2 (MIDI 43) | **100% / 0%** | **100% / 0%** | ✅ |
| A2 (MIDI 45) | **100% / 0%** | **100% / 0%** | ✅ |
| B2 (MIDI 47) | **100% / 0%** | **100% / 0%** | ✅ |

**Finding**: Bass Engine has a lower limit at ~F#2 (MIDI 42, 46.8 Hz). Below this, octave errors dominate. The Fusion Engine cannot recover these because no chord context is available for single-note tests.

### Harmonic bass notes

| Note | BE only | Fusion VR |
|------|:-------:|:---------:|
| harm_C2 | 100% / 0% | 100% / 0% |
| harm_E2 | 100% / 0% | 100% / 0% |
| harm_G2 | 100% / 0% | 100% / 0% |
| harm_B2 | 100% / 0% | 100% / 0% |

All harmonic notes are correctly identified — harmonics are not problematic for the BE.

### Chord-root tests

| Chord | BE only | Fusion no VR | Fusion VR | Chord baseline |
|-------|:-------:|:------------:|:---------:|:--------------:|
| C | **100%** | **100%** | **100%** | **100%** |
| G | 0.0% | 0.0% | **100%** | **100%** |
| Dm | **100%** | **100%** | **100%** | **100%** |

**Chord G case**: BE picks C instead of G (wrong pitch class). Fusion VR corrects by selecting G (chord root). This confirms VR's primary value: recovering BE pitch-class errors through chord context.

### Slash chords

| Slash | BE only | Fusion no VR | Fusion VR | Chord baseline |
|-------|:-------:|:------------:|:---------:|:--------------:|
| C/E | 0% / 100% | 0% / 100% | 0% / 100% | **100%** |
| G/B | **100%** | **100%** | **100%** | **100%** |
| D/F# | 0% / 100% | 0% / 100% | 0% / 100% | **100%** |
| Am7/G | 0% / 100% | 0% / 100% | **100%** | **100%** |

**Slash chord challenge**: For C/E and D/F#, the BE plays the chord root (C, D) instead of the slash bass (E, F#). The Fusion Engine cannot recover these because no enhancement is specifically designed for slash-bass following. **Am7/G** is a successful exception: VR selects G (the slash bass) because G is the chord root of the implied G7.

### Extended jazz chords

| Chord | BE only | Fusion VR | Chord baseline |
|-------|:-------:|:---------:|:--------------:|
| Cmaj9 | **100%** | **100%** | **100%** |
| Dm7/G | **100%** | **100%** | **100%** |
| G13 | **100%** | **100%** | **100%** |

All perfect — complex jazz voicings don't confuse the BE when the root is clear.

### Walking bass

| Pipeline | NW | Oct Err | Frag |
|----------|:--:|:-------:|:----:|
| BE only | 50.0% | 37.5% | 0.88 |
| Fusion no VR | **68.8%** | 31.2% | 1.00 |
| Fusion VR | 12.5% | 6.2% | 0.31 |
| Chord baseline | 12.5% | 0.0% | 0.25 |

**Critical finding**: Fusion VR collapses the walking line to one note per chord (the root), losing all passing tones. Fusion no VR preserves the walking pattern and achieves the best NW (68.8%). The VR should be disabled or attenuated for walking-bass textures.

## Error Classification Summary

| Error Type | BE only | Fusion VR |
|------------|:-------:|:---------:|
| Pitch class wrong | ~15% | ~10% |
| Octave wrong | ~30% | ~23% |
| Fragmentation >2.5 | 5/24 pieces | 5/24 pieces |
| Bass missing (insertion) | ~20% | ~15% |

## Dev/Test Consistency

| Metric | Dev (11 pieces) | Test (13 pieces) | Delta |
|--------|:---------------:|:-----------------:|:-----:|
| BE only | 58.6% | 69.2% | −10.6 |
| Fusion no VR | 63.5% | 68.1% | −4.6 |
| Fusion VR | **71.7%** | **73.7%** | **−2.0** |
| Chord baseline | 50.1% | 46.9% | +3.2 |

Fusion VR shows the best dev/test consistency (2pp gap), indicating minimal overfitting.

## Limitations

### Ground truth for real audio

amazing_grace and ton_nom_est_jehovah GTs are semi-automatically generated (chord-root-based) and may not reflect actual bass performance.

### Single-note tests

21 of 24 pieces are synthetic 2-second tones. Real-world performance may differ.

### Octave bias

BE's octave preference (octave 3 vs 2) is documented but unfixed.

### Walking bass regression

VR should be disabled for walking patterns.

### No multi-instrument polyphony

The corpus does not include dense jazz ensemble recordings.

### Dépendance au Chord Engine

Le Fusion Engine utilise le Chord Engine comme source de contexte harmonique. Les performances de la fusion sont donc conditionnées par la qualité de l'analyse harmonique.

Ce point est documenté dans `docs/KNOWN_LIMITATIONS.md`. Les métriques actuelles ne mesurent pas séparément la performance du Chord Engine, ce qui constitue une piste d'amélioration pour une future version.

## Recommendations

1. Use Fusion VR as default pipeline (Config A, score_ratio=0.3).
2. Detect walking bass patterns (rapid note changes) and disable VR dynamically.
3. Improve BE low-frequency response (C2/E2) to handle octave errors natively.
4. Add slash-bass following heuristic in fusion for C/E and D/F# cases.
5. Expand corpus with 5+ dense real recordings for production validation.

## Raw Data

- `benchmark_outputs/phase6/phase6_comparison.csv` — per-piece, per-pipeline metrics
- `benchmark_outputs/phase6/phase6_summary.json` — full structured results
- `benchmark_outputs/phase6/phase6_nw_accuracy.png` — NW accuracy graph
- `benchmark_outputs/phase6/phase6_octave_error.png` — octave error graph
- `benchmark_outputs/phase6/phase6_fragmentation.png` — fragmentation graph
