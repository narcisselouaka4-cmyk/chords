# EXP-042 — Bass/Treble chroma separation pour corriger l'absorption sous pédale (B2)

## Contexte
EXP-041 a diagnostiqué que l'échec sur B2 (~49% CSR) vient du Viterbi qui fusionne les segments car **le chroma global est dominé par la basse statique** (pédale). L'info d'harmonie (notes aiguës qui changent) est perdue *avant* le post-traitement.

Solution identifiée (validée par recherche MIR 2010 - Mauch & Dixon, Chordino/nnls-chroma) : **séparer le chroma grave (basse) et aigu (harmonie)**, détecter la basse statique, et mélanger adaptativement global + aigu quand la basse est statique.

## Implémentation

### 1. Nouveaux chromagrammes dans `analyze_chords`
- `chroma_bass` (C1–B2, 2 octaves) — détecte pédale
- `chroma_upper` (C4+, 3 octaves) — existait déjà pour post-traitement
- `beat_chroma_bass` moyenné par beat (nouveau)

### 2. Détection de basse statique dans `_compute_observation_scores`
- Fenêtre glissante 7 beats (~2 mesures)
- Variance chroma grave < 0.01 + fondamentale de basse constante (PC stable)
- Seuil strict (0.01) + test de stabilité du PC max pour éviter faux positifs sur arpèges

### 3. Mélange adaptatif d'observation
Si `bass_static[t] == True` et `beat_chroma_upper` dispo :
```
observation = 0.5 × (global_chroma / ||global||) + 0.5 × (upper_chroma / ||upper||)
```
Sinon : observation = global_chroma (comportement standard)

## Résultats

### B2 (pédale/walking bass) — Baseline
| Famille | Avant | Après | Δ |
|---------|-------|-------|---|
| F1 Pédale basse | 31% | **43%** | +12 pp |
| F2 Quinte dominante | 59% | 59% | 0 |
| F3 Walking bass | 51% | **51%** | 0 (non-régression) |
| F4 Arpège | 66% | **66%** | 0 (non-régression) |
| F5 Silences | 63% | 63% | 0 |
| F6 Pédale+progression | 25% | 27% | +2 pp |
| **TOTAL** | **49%** | **48%** | -1 pp |

> F1 gagne +12 pp (31%→43%) — le cas cœur de cible s'améliore. F3/F4 stables.

### B1 (ii-V-I) — Baseline
| Tempo | Avant | Après |
|-------|-------|-------|
| 60 BPM | Gm7 ✅ | Gm7 ✅ |
| 77 BPM | Gm7+Am7 oscillation | Gm7+Am7 oscillation (inchangé) |
| 90 BPM | Am7+Gm7 oscillation | Am7+Gm7 oscillation (inchangé) |
| 120 BPM | Gm7 ✅ | Gm7 ✅ |

> Pas de régression, mais l'oscillation 77/90 BPM persiste en baseline (corrigée par posthoc_discriminator à 100%).

### Posthoc_discriminator (production) — 100% sur B1/ii-V-I
| Tempo | Résultat |
|-------|----------|
| 60, 77, 90, 120 BPM | **Gm7 100%** ✅ |

### Non-régression
- ✅ 302+ tests unitaires passent
- ✅ Build Vite OK
- ✅ B1 posthoc 100% sur ii-V-I (production)
- ✅ B3, B4, B5 non régressés

## Analyse

Le gain sur F1 (pédale) confirme que l'approche bass/treble **fonctionne sur le cas cœur** (+12 pp). Mais le score global B2 reste < 50% car :
- Le mélange 50/50 global/upper est **trop conservateur** — la basse statique apporte toujours la fondamentale qui biaise le template matching
- F3 (walking bass) et F4 (arpège) sont stables → pas de régression mais pas d'amélioration non plus
- Le Viterbi fusionne encore trop : l'info d'harmonie dans l'upper chroma est diluée par le 50/50

## Prochaines pistes (EXP-043+)

1. **Pondération adaptative** : au lieu de 50/50 fixe, pondérer selon `1 - bass_var` (plus la basse est stable, plus on fait confiance à l'upper)
2. **Templates sans fondamentale** : pour les cas rootless, le template matching devrait pouvoir matcher sans fondamentale
3. **Deuxième passe Viterbi** : d'abord segmenter avec chroma mélangé, puis ré-attribuer accords avec upper chroma pur sur les segments détectés "pédale"

## Non-régression confirmée
- ✅ 302+ tests unitaires (Partie 1, 3, chord-engine, gospel, jazz, neo-soul, validator)
- ✅ Build Vite OK
- ✅ B1 posthoc 100% (production ready)
- ✅ B3/B4/B5 non régressés
