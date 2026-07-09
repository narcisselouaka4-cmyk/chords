# Architecture du Moteur Harmonique

> Dernière mise à jour : 2026-07-09 — Baseline officielle.

## Pipeline HMM enrichi (10 qualités, 109 états)

Le moteur analyse un fichier audio et produit une séquence d'accords via un
modèle de Markov caché (HMM) avec post-traitement.

### Templates spectraux (`CHORD_TEMPLATES_WEIGHTED`)

10 qualités d'accords pondérées par profil harmonique (PCP) :

| Qualité | Famille | Rôle |
|---|---|---|
| `""` (triade) | Majeure | Fondamentale |
| `"maj7"` | Majeure | Couleur majeure |
| `"7"` | Dominante | Tension dominante |
| `"m"` | Mineure | Fondamentale mineure |
| `"m7"` | Mineure | Couleur mineure |
| `"dim"` | Diminuée | Passage/tension |
| `"aug"` | Augmentée | Tension altérée |
| `"m7b5"` | Diminuée | Semi-diminué |
| `"sus2"` | Suspendue | Substitution |
| `"sus4"` | Suspendue | Substitution |

Exclusions : 11 paires (fondamentale + qualité) sans pertinence harmonique
(Cmaj7#5, Fbm, etc.) → 109 états.

### Observation scores

Seuils d'activation par accord (root-only + qualité). Bonus diatonique +0.05
pour les accords de la tonalité détectée. Les 6 meilleurs candidats sont
conservés par segment temporel.

### Matrice de transition

Système additif en domaine log, cumulant jusqu'à 4 pénalités/bonus :

| Règle | Delta log | Condition |
|---|---|---|
| Rester sur le même état | 0.0 | Par défaut |
| Diatonique (même tonalité) | +0.10 | Les deux accords sont dans la tonalité |
| Chromatique | −0.03 | Une case chromatique |
| Saut de quinte juste | −0.01 | Intervalle de 7 demi-tons |
| Bonus maj7↔maj7 | −0.04 | Même fondamentale, maj7 tous deux |
| Pénalité suffixe | −0.04 | Changement de qualité |
| `same_root_similar` | −0.02 | Même fondamentale, qualité voisine (`_is_similar_quality()`) |

Une transition ne peut descendre en dessous de −0.34. Aucune transition
n'est strictement interdite (pas de zéro absolu).

### Familles harmoniques (`QUALITY_FAMILIES`)

| Famille | Qualités |
|---|---|
| 0 — Majeure | `""`, `"maj7"`, `"6"`, `"add9"` |
| 1 — Dominante | `"7"`, `"9"`, `"13"` |
| 2 — Mineure | `"m"`, `"m7"`, `"m9"` |
| 3 — Diminuée | `"dim"`, `"m7b5"` |
| 4 — Augmentée | `"aug"` |

Liens croisés supplémentaires dans `_is_similar_quality()` : `''↔7`,
`'7'↔maj7`, `'7'↔sus4`, `'7'↔sus2`.

### Post-traitement (régularisation)

`_merge_similar_segments()` — fusionne les segments consécutifs de même
fondamentale et qualité voisine. Appelé après `_segment_path()`.

Objectif : éliminer les micro-oscillations G↔G7 tout en préservant les
changements harmoniques réels (Gm↔G).

---

## Baseline Officielle — 2026-07-09

Cette version est la référence pour toutes les futures évolutions du moteur.
Aucune modification des templates, de la matrice de transition, de la
régularisation ou des métriques de diagnostic n'est autorisée sans
ouverture explicite d'une nouvelle phase d'expérimentation.

### Fichiers concernés

| Fichier | Rôle |
|---|---|
| `electron/audio-processor.py` (53377 o) | Moteur HMM enrichi + régularisation |
| `scripts/test-analysis-diagnostic.js` | Diagnostic multi-pipeline + benchmark |
| `tests/references/amazing_grace_gospel_piano.json` | Référence séquence (63 accords) |
| `tests/references/track_002_pere_nous_tadorons.json` | Référence timeline (15 accords, 60s) |
| `/tmp/pre_regul.json` | Pré-rapport moteur sans régul. (231 segments) |

### Benchmark — Amazing Grace Gospel Piano (72 BPM, 4/4, 63 accords)

```
Pipeline                   Score    Fond.    Segm.  Chg/m  Seg/min
RAW enrichi (avant régul.)   21.2%   22.9%   231  5.45  112.5
RAW + régularisation         27.7%   30.5%   175  4.72   85.2
GRID_HALF + régul.           47.9%   52.1%    60  1.60   29.2

Qualités détectées (RAW + régul.) :
  maj7:6  m7:16  dim:2  m7b5:3  dom7:10  autres:93
  Changements structurels totaux : 174
```

### Métriques de diagnostic

| Métrique | Définition |
|---|---|
| `Score` | `scoreAccompagnement` — alignement Needleman-Wunsch sur `structural_chord` |
| `Fond.` | `scoreFundamental` — même fondamentale (root PC) |
| `Segm.` | `segmentsCount` — nombre de segments dans la sortie |
| `Chg/m` | `chordsPerMeasure` — changements de clé harmonique (root + famille) par mesure 4/4 |
| `Seg/min` | `segmentsCount / (durée / 60)` |

### Commande de reproductibilité

```bash
# 1. Régénérer le pré-rapport (si /tmp/pre_regul.json n'existe plus)
cp electron/audio-processor.py electron/audio-processor.py.bak && \
cp electron/audio-processor.py.current electron/audio-processor.py && \
timeout 300 node scripts/test-analysis-diagnostic.js \
  tests/references/amazing_grace_gospel_piano.json \
  --save-pre=/tmp/pre_regul.json && \
cp electron/audio-processor.py.bak electron/audio-processor.py && \
rm electron/audio-processor.py.bak

# 2. Lancer le benchmark final
node scripts/test-analysis-diagnostic.js \
  tests/references/amazing_grace_gospel_piano.json \
  --benchmark-pre=/tmp/pre_regul.json
```

### Règle pour les futures évolutions

Toute modification du moteur harmonique doit être comparée à cette baseline
via la commande ci-dessus avant validation. Une amélioration est validée si
elle améliore au moins un indicateur sans régresser les autres de plus de
2 points.

---

## Annexes

### Track_002 — Père nous tadorons (60s, 15 accords)

Benchmark complémentaire pour valider la robustesse sur un second morceau
(voir les résultats historiques dans `CHANGES.md`).
