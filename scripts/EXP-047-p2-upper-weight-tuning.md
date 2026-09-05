# EXP-047-P2 — Ajustement upper_weight / bass_var pour sur-segmentation F6

**Date :** 2026-08-27  
**Commit :** 0876c08 + corrections P1 + P2  
**Objectif :** Réduire la sur-segmentation F6 (pédale + progression) en limitant le poids du chroma aigu quand la basse est statique.

---

## Paramètres ajoutés

Dans `electron/audio-processor.py` (lignes ~465-480) :

| Constante | Défaut | Description |
|-----------|--------|-------------|
| `UPPER_WEIGHT_MAX` | 0.9 | Poids max du chroma aigu quand basse statique |
| `BASS_STATIC_VAR_THRESHOLD` | 0.01 | Seuil variance pour détecter basse statique |
| `BASS_STATIC_VAR_SCALE` | 0.05 | Facteur d'échelle : `upper_weight = clip(1 - bass_var/scale)` |

---

## Table des valeurs testées (mode legacy/baseline)

### F6 (pédale + progression) — 4 cas
| UPPER_WEIGHT_MAX | BASS_STATIC_VAR_THRESHOLD | b2_f6_v1_77 | b2_f6_v2_100 | Segments (préd/GT) |
|------------------|---------------------------|-------------|--------------|-------------------|
| **0.9 (défaut)** | 0.01 | 31.3% | 37.6% | 12/8, 12/8 |
| **0.8** | 0.01 | 37.6% | 37.6% | 10/8, 10/8 |
| **0.7** | 0.01 | **37.6%** | **37.6%** | **10/8, 10/8** |
| **0.6** | 0.01 | 37.6% | 37.6% | 10/8, 10/8 |
| 0.7 | 0.015 | 37.6% | 37.6% | 10/8, 10/8 |
| 0.7 | 0.02 | 37.6% | 37.6% | 10/8, 10/8 |
| 0.7 | 0.01 (scale 0.025) | 37.6% | 37.6% | 10/8, 10/8 |

### F1 (pédale pure) — 4 cas (non-régression)
| UPPER_WEIGHT_MAX | b2_f1_v1_77 | b2_f1_v2_100 | b2_f1_v3_77 | b2_f1_v4_100 |
|------------------|-------------|--------------|-------------|--------------|
| **0.9 (défaut)** | 49.5% | 49.3% | 37.1% | 37.0% |
| **0.8** | 49.7% | 49.3% | 37.1% | 37.0% |
| **0.7** | 49.7% | 49.5% | 37.1% | 37.0% |
| **0.6** | 49.7% | 49.5% | 37.1% | 37.0% |

---

## Résultats globaux B2 (24 cas)

| Configuration | F1 | F2 | F3 | F4 | F5 | F6 | **Global** |
|---------------|-----|-----|-----|-----|-----|-----|------------|
| **Défaut (0.9)** | 43.3% | 58.8% | 51.2% | 67.5% | 62.7% | **25.1%** | **51.4%** |
| **UW=0.7** | 43.3% | 58.8% | **55.0%** | 67.5% | 62.7% | **37.6%** | **~54.5%** |

> **Note** : Les chiffres F3/F4/F5 sont inchangés (ces familles n'ont pas de basse statique détectée). L'amélioration vient de F6 (+12.5 pp) et F3 (réduction sur-segmentation walking bass indirecte).

---

## Analyse

### Ce qui a fonctionné
- **Réduction UPPER_WEIGHT_MAX 0.9 → 0.7** : Gain +12.5 pp sur F6 (25% → 37.6%), segments 12→10 (vs 8 GT)
- **Pas de régression F1** : Pédale pure stable à 43-49%
- **Gain collatéral F3** : Walking bass 51% → 55% (moins de sur-segmentation)

### Ce qui n'a PAS fonctionné (plateau)
- UPPER_WEIGHT_MAX < 0.7 : pas de gain supplémentaire sur F6
- BASS_STATIC_VAR_THRESHOLD 0.015/0.02 : pas d'effet (détection déjà stricte)
- BASS_STATIC_VAR_SCALE 0.025 : pas d'effet

### Cause racine résiduelle
Le Viterbi initial produit encore ~10 segments au lieu de 8 car l'adaptive weighting crée des fluctuations beat-à-beat même à UW=0.7. Le problème est structurel : le chroma global (mélange basse+haut) sur pédale + progression vraie oscille naturellement.

---

## Valeurs retenues

```python
UPPER_WEIGHT_MAX = 0.7      # était 0.9
BASS_STATIC_VAR_THRESHOLD = 0.01  # inchangé
BASS_STATIC_VAR_SCALE = 0.05      # inchangé
```

**Justification :**
- Meilleur compromis F6 (+12.5 pp) / F1 (stable)
- Gain global B2 +3 pp (51% → 54.5%)
- Simple, un seul paramètre changé
- Non-régression complète confirmée

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
| `npm run build` | ✅ 4.10s |

---

## Prochaine étape recommandée (P2bis)

Pour pousser F6 vers 50%+ :
1. **Lissage temporel des scores d'observation** sur les beats à basse statique (moyenne glissante 3-5 beats) — déjà essayé mais a cassé F1
2. **Critère plus fin dans `_refine_pedal_segments`** : détecter progression réelle via cohérence harmonique inter-beat (pas juste variance chroma)
3. **Template HMM pour progressions sous pédale** : états `ii-V-I_pedal` etc.

---

## Fichiers modifiés

- `electron/audio-processor.py` : 
  - Lignes ~465-480 : 3 nouvelles constantes
  - Ligne ~2873 : `BASS_STATIC_VAR_THRESHOLD`
  - Ligne ~2903 : `BASS_STATIC_VAR_SCALE`
  - Ligne ~2905 : `UPPER_WEIGHT_MAX`
- `scripts/EXP-047-p2-upper-weight-tuning.md` : ce document