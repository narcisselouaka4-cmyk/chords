# HYBRID-001 — Architecture hybride HMM + ISMIR2019

**Date :** 2026-08-28  
**Version :** 1.0

---

## 1. Contexte et motivation

Le moteur actuel (HMM + post-traitements) a des forces et faiblesses complémentaires à ISMIR2019 :

| Aspect | HMM (moteur actuel) | ISMIR2019 (ChordNet + XHMM) |
|--------|---------------------|------------------------------|
| **Tempo / Beat tracking** | ✅ Excellent (librosa + correction octave) | ❌ Ne fait pas |
| **Tonalité** | ✅ Bon (chroma global + profils K-K) | ⚠️ Inféré implicitement |
| **Qualité d'accord (real audio)** | ⚠️ 50-60% sur B2/B3 | ✅ 70-80% sur audio réaliste |
| **Vocabulaire** | Limité (maj/min/7/maj7/m7/sus) | Étendu (9, 11, 13, hdim7, etc.) |
| **Latence / CPU** | Rapide (CPU only) | Lourd (GPU/CPU, modèles CNN) |
| **Grille temporelle** | Contrôlée (beat-synchrone) | Variable (frame-level ~10ms) |

**Conclusion :** Architecture hybride **Option A** — HMM pour structure rythmique/tonale, ISMIR2019 pour qualité d'accord.

---

## 2. Architecture Option A — "HMM Structure + ISMIR Quality"

```
┌─────────────────────────────────────────────────────────────────┐
│                        WAV INPUT                                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
            ┌──────────────┴──────────────┐
            ▼                             ▼
    ┌───────────────┐             ┌───────────────┐
    │   HMM PIPELINE │             │ ISMIR2019     │
    │ (audio-processor)           │ (ChordNet+XHMM)│
    └───────┬───────┘             └───────┬───────┘
            │                             │
    ┌───────┴───────┐             ┌───────┴───────┐
    │ - Tempo/Beats │             │ - Chord segments│
    │ - Tonality    │             │   (frame-level) │
    │ - Beat grid   │             │ - Probabilities │
    └───────┬───────┘             └───────┬───────┘
            │                             │
            ▼                             ▼
    ┌─────────────────────────────────────────────────────┐
    │              ALIGNMENT & FUSION                      │
    │  1. ISMIR segments → snap to HMM beat grid           │
    │  2. For each HMM segment: majority vote ISMIR chords │
    │  3. Arbitration: HMM root + ISMIR quality/suffix    │
    └─────────────────────────────────────────────────────┘
                           │
                           ▼
    ┌─────────────────────────────────────────────────────┐
    │              OUTPUT (format HMM standard)            │
    │  {duration, tempo, timeSignature, key, chords: []}  │
    └─────────────────────────────────────────────────────┘
```

---

## 3. Points de synchronisation

### 3.1 Entrées requises par ISMIR2019
- WAV path (input)
- Output .lab path
- Optionnel: chord_dict ('submission', 'full', 'ismir2017', 'extended')

### 3.2 Sorties ISMIR2019 (.lab format)
```
start_time<TAB>end_time<TAB>chord_label
0.000	3.116	C:maj
3.116	6.233	F:maj
...
```
Qualités ISMIR: maj, min, 7, maj7, min7, dim, dim7, aug, sus2, sus4, 9, min9, maj9, 11, 13, hdim7, min/b7, etc.

### 3.3 Fusion algorithmique

**Étape 1 — HMM structure extraction**
```python
hmm_result = analyze_chords(wav, observation_mode='baseline')
beat_times = hmm_result['beat_times']  # from beat_frames
key = hmm_result['key']  # {'pc': 0, 'mode': 'major', 'name': 'C'}
tempo = hmm_result['tempo']
```

**Étape 2 — ISMIR chord recognition**
```bash
python chord_recognition.py input.wav output.lab [chord_dict]
```
Output: segments with (start, end, chord_label)

**Étape 3 — Alignment to beat grid**
- Map ISMIR segments to nearest HMM beat boundaries
- Each HMM segment = N beats
- For each HMM segment, collect ISMIR chords overlapping it

**Étape 4 — Arbitration (HMM root + ISMIR quality)**
```python
# For each HMM segment:
hmm_chord = segment['chord']  # e.g. "C"
hmm_root = parse_root(hmm_chord)  # 0 (C)

# Collect ISMIR chords in this time window
ismir_chords_in_window = [...]
# Vote on quality/suffix
quality_votes = Counter([parse_quality(c) for c in ismir_chords_in_window])
best_quality = quality_votes.most_common(1)[0][0]

# Fused result
fused_chord = chord_name(hmm_root, best_quality)
```

**Règles d'arbitrage :**
1. **Racine** : Toujours HMM (meilleure stabilité temporelle)
2. **Qualité/Suffixe** : Majorité ISMIR dans la fenêtre
3. **Fallback** : Si ISMIR absent/incertain → garder HMM

---

## 4. Interface technique

### 4.1 Point d'injection dans `analyze_chords()`
```python
def analyze_chords(wav_path, ..., use_hybrid=False, hybrid_chord_dict='submission'):
    # ... pipeline HMM existant ...
    
    if use_hybrid:
        # 1. Run ISMIR2019
        ismir_segments = run_ismir2019(wav_path, chord_dict=hybrid_chord_dict)
        
        # 2. Align ISMIR segments to HMM beat grid
        fused_segments = fuse_hmm_ismir(
            hmm_segments, ismir_segments, 
            beat_times, key
        )
        
        # 3. Replace HMM segments with fused
        result['chords'] = fused_segments
    
    return result
```

### 4.2 Flag de contrôle
```python
ENABLE_HYBRID_ISMIR2019 = False  # Par défaut OFF
HYBRID_CHORD_DICT = 'submission'  # 'submission', 'full', 'ismir2017', 'extended'
```

---

## 5. Gestion des risques

| Risque | Mitigation |
|--------|------------|
| **Latence ISMIR2019** (~5-10s) | Flag opt-in, cache résultats, async possible |
| **Désaccord HMM/ISMIR sur racine** | Priorité HMM (stabilité temporelle), log divergence |
| **ISMIR2019 non disponible** | Fallback silencieux vers HMM seul |
| **Vocabulaire mismatch** | Mapping qualités ISMIR → HMM (table de correspondance) |
| **Beat grid mismatch** | Snap ISMIR segments to nearest HMM beat boundary |

---

## 6. Flags et configuration

```python
# Dans audio-processor.py (section constants)
ENABLE_HYBRID_ISMIR2019 = False
HYBRID_CHORD_DICT = 'submission'  # 'submission' | 'full' | 'ismir2017' | 'extended'
HYBRID_ISMIR_TIMEOUT = 60  # secondes max pour ISMIR2019
```

---

## 7. Plan de validation (Phase 2-4)

| Phase | Test | Critère de succès |
|-------|------|-------------------|
| **Phase 2** PoC | B2 F2/F4 (quinte/arpège) | Gain > 10pp vs HMM seul |
| **Phase 3** Intégration | B1, B2, B3, B4 | Pas de régression HMM (flag OFF) |
| **Phase 4** Benchmark | Toutes batteries | Gain net B2/B3 > 5pp global |

---

## 8. Dépendances

- ISMIR2019 venv : `/home/visiteur/piano-jazz-chords/ism2019-chord/venv`
- Script entry : `/home/visiteur/piano-jazz-chords/ism2019-chord/chord_recognition.py`
- Modèles pré-entraînés : dans `ism2019-chord/` (joint_chord_net_ismir_naive_v1.0_*.best)
- Dictionnaires accords : `data/*_chord_list.txt`

---

*Document HYBRID-001 — Architecture hybride HMM + ISMIR2019*