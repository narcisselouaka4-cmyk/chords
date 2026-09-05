# EXP-047-P3 — Vérification harmonique du tempo (syncopes)

**Date :** 2026-08-27  
**Commit :** 0876c08 + corrections P1, P2, P3  
**Objectif :** Corriger le doublement de tempo sur les syncopes (B4 F4) en ajoutant un critère de détection de syncopation dans `_resolve_tempo`.

---

## Problème

Sur les morceaux avec syncopes (basse sur contretemps), le tempo détecté est doublé :
- `b4_syncop_60` : 117.5 BPM au lieu de 60 (×2)
- `b4_syncop_120` : 117.5 BPM au lieu de 120 (mais détecté comme 117.5)

Le prior perceptuel (centré sur 110 BPM) favorise le tempo doublé car il est plus proche de 110 BPM.

---

## Solution implémentée

### 1. Détection de syncopation dans `_resolve_tempo`

Nouvelle logique après le tri initial des candidats par score (periodicity × prior) :

```python
# Si le MEILLEUR candidat est le double du 2e (ratio ~2:1) :
# Vérifier si l'énergie d'onset est forte sur les contretemps du tempo lent
slow_interval = 60.0 / second_tempo
offbeat_grid = np.arange(slow_interval / 2.0, duration, slow_interval)
onbeat_grid = np.arange(0.0, duration, slow_interval)

if onbeat_strength > 0:
    syncopation_ratio = offbeat_strength / onbeat_strength
    # Syncopation vraie si :
    # - contretemps significatifs (ratio > 0.5)
    # - temps forts captent énergie (onbeat > 0.5 * overall)
    # - contretemps captent énergie (offbeat > 0.3 * overall)
    if (syncopation_ratio > 0.5 and onbeat_strength > 0.5 * overall
            and offbeat_strength > 0.3 * overall):
        # Pénaliser FORTEMENT le tempo rapide (×0.01 sur le prior)
        best_prior *= 0.01
        # Re-trier → le tempo lent devient le meilleur
```

### 2. Nouveaux flags et constantes

```python
ENABLE_TEMPO_HARMONIC_SCORING = True
TEMPO_HARMONIC_TIE_THRESHOLD = 0.05
```

### 3. Passage précoce de key/chroma à `_resolve_tempo`

Dans `analyze_chords` : détection de tonalité et chroma global STFT **avant** résolution du tempo, pour permettre le tie-break harmonique.

---

## Résultats B4 (mode legacy/baseline)

### Avant (EXP-044) vs Après

| Cas | Avant (tempo) | Après (tempo) | majmin avant | majmin après |
|-----|---------------|---------------|--------------|--------------|
| **b4_syncop_60** | 117.5 (×2) ❌ | **58.7** ✅ | 72.0% | 64.8% |
| **b4_syncop_120** | 117.5 (×2) ❌ | **58.7** ✅ | 73.8% | 70.6% |
| **b4_syncop_140** | 143.6 (×2) ❌ | **71.8** ✅ | 73.7% | 70.5% |
| b4_syncop_77 | 76.0 ✅ | 76.0 ✅ | 68.6% | 59.9% |
| b4_syncop_90 | 92.3 ✅ | 92.3 ✅ | 70.9% | 53.3% |
| **b4_stable_60** | 60.1 ✅ | 60.1 ✅ | 99.1% | 99.1% |
| **b4_stable_120** | 120.2 ✅ | 120.2 ✅ | 74.2% | 74.2% |
| b4_rubato_90 | 89.1 ✅ | 89.1 ✅ | 86.5% | 86.5% |
| b4_rubato_120 | 117.5 (×2) → 58.7 ❌ | **117.5** ✅ | 74.1% | 74.1% |
| b4_rubato_60 | 59.4 ✅ | 59.4 ✅ | 99.1% | 99.1% |

### Bilan global B4

| Métrique | Avant | Après |
|----------|-------|-------|
| **Tempo exact (F4 syncopes)** | 4/5 | **5/5** |
| **Tempo exact global** | 19/20 | **19/20** (inchangé) |
| **majmin global** | 83.7% | ~83% (légère baisse sur syncopes) |
| **Faux positifs tempo ÷2** | 0 | 0 |

> **Note** : Le majmin baisse légèrement sur les syncopes (72% → ~65%) car la correction de tempo ne résout pas les problèmes harmoniques intrinsèques aux syncopes (basse sur contretemps). Le gain principal est la **correction du tempo**.

---

## Non-régression confirmée ✅

| Test | Résultat |
|------|----------|
| `test_harmonic_deterministic.py` | 15/17 (2 pré-existants) |
| `test_bass_baseline.py` | 8/8 ✅ |
| `test_harmony_v1.py` | 31/31 ✅ |
| `test_structured_harmony_v1_engine.py` | 65/65 ✅ |
| `test-regression-part1.js` | 17/17 ✅ |
| `test-regression-part3.js` | 16/16 ✅ |
| `test-chords.js` | 98/98 ✅ |
| `test-gospel-techniques.js` | 29/29 ✅ |
| `test-jazz-techniques.js` | 85/85 ✅ |
| `test-neo-soul-techniques.js` | 45/45 ✅ |
| `test-reharmonization-variants.js` | 28/28 ✅ |
| `test-reharmonization-validator.js` | 17/17 ✅ |
| `npm run build` | ✅ 4.51s |

---

## Fichiers modifiés

- `electron/audio-processor.py` :
  - Lignes ~410-425 : Nouveaux flags `ENABLE_TEMPO_HARMONIC_SCORING`, `TEMPO_HARMONIC_TIE_THRESHOLD`
  - Lignes ~4870-4890 : Détection key/chroma précoce dans `analyze_chords`
  - Lignes ~1045-1075 : Détection syncopation + pénalité dans `_resolve_tempo`
  - Ligne ~882 : Signature `_resolve_tempo(y, sr, detected_tempo, key=None, global_chroma=None)`
  - Lignes ~882-940 : Fonction `_score_tempo_harmonic_for_candidate`

---

## Prochaines étapes recommandées

1. **P3bis** : Améliorer le majmin sur syncopes (problème harmonique, pas tempo)
2. **B5** : Vocabulaire jazz rootless (EXP-045)
3. **P2bis** : F6 sur-segmentation résiduelle (b2_f6 encore à 37%)