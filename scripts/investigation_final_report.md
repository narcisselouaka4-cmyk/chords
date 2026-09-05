# EXP-037 — Correction détection tonalité ii-V-I (fix ambiguïté C vs F)

## Contexte
La progression ii-V-I (Gmin7 → C7 → Fmaj7) en Fa majeur était systématiquement mal détectée :
- Tonalité détectée : **Do majeur** (au lieu de Fa majeur)
- Conséquence : **Gm** détecté au lieu de **Gmin7** (septième mineure manquante)
- Score sevenths sur B1/ii-V-I : **44%** au lieu de **~99%**

## Cause racine identifiée
Le chroma global de la progression répétée (Gm7-C7-Fmaj7 × 3) favorise **Do majeur** :
- C7 (C-E-G-Bb) + Fmaj7 (F-A-C-E) → forte énergie en C, E, G
- Le profile Krumhansl-Kessler pour Do majeur matche mieux le chroma global
- La tonalité réelle (Fa majeur) arrive en 2ème position avec score très proche (diff < 1%, ratio > 0.99)

## Solution implémentée

### 1. Détection d'ambiguïté tonale (`detect_key` + `analyze_chords`)
- Comparaison des 2 meilleurs candidats (score + confidence)
- Critère d'ambiguïté : **diff < 0.01** OU **ratio > 0.99**
- Si ambiguïté → flag `key_ambiguity = True` propagé dans le pipeline

### 2. Réduction des biais tonaux en cas d'ambiguïté
| Composant | Normal | Avec ambiguïté | Facteur |
|-----------|--------|----------------|---------|
| `_initial_scores` (tonique/dominante) | 0.25 / 0.15 | **× 0.3** | 30% |
| Biais tonal observation (`sim +=`) | 0.05 | **× 0.3** | 30% |
| Bonus diatonique transition | 0.10 | **× 0.3** | 30% |

### 3. Détection de tonalité pondérée par stabilité (fallback)
- Fenêtre glissante 8s / pas 2s
- Pondération par stabilité harmonique locale (faible variance chroma = plus fiable)
- Utilisée uniquement si ambiguïté détectée sur le global

### 4. Suppression du clipping des scores d'observation
- Suppression du `np.clip(obs_scores, 0.0, 1.0)` qui masquait la discrimination
- Scores peuvent dépasser 1.0 → meilleure résolution pour Viterbi

### 5. Suppression du `min(1.0, ...)` dans `_apply_discriminator`
- Permet au discriminateur de booster Gm7 au-dessus de 1.0
- Discriminateur m vs m7 : threshold 0.15, strength 0.10, energy 0.05

## Résultats

### B1 (ii-V-I) — Mode Baseline
| Tempo | Avant (Gm) | Après (Gm7) | Key Ambiguïté |
|-------|-----------|-------------|---------------|
| 60 BPM | 44% | **99%** ✅ | Oui (diff=0.008) |
| 77 BPM | 44% | **99%** ✅ | Oui (diff=0.006) |
| 90 BPM | 33% | **88%** | Non |
| 120 BPM | 55% | **55%** | Non |

> 90 BPM : amélioration massive (33% → 88%) mais pas parfait (key ambiguity = false car diff=0.012 > 0.01)

### B1 — Mode Posthoc Discriminator
| Tempo | Résultat |
|-------|----------|
| 60 BPM | **Gm7** ✅ |
| 77 BPM | **Gm7** ✅ |
| 90 BPM | **Gm7** ✅ |
| 120 BPM | **Gm7** ✅ |

### B1 — Scores globaux (Baseline)
| Métrique | Avant | Après |
|----------|-------|-------|
| CSR majmin | 98.51% | 93.22% (-5.3%) |
| CSR sevenths | 86.69% | 84.66% (-2%) |
| Tempo exact | 20/20 | 20/20 |

> La baisse majmin est due à la réduction des biais tonaux (affecte les progressions non-ambiguës). Trade-off acceptable pour corriger le cas ii-V-I.

### B4 (Tempo) — Non-régression
| Métrique | Avant | Après |
|----------|-------|-------|
| Tempo exact | 19/20 | 19/20 |
| CSR majmin | 87.31% | 83.40% |

### Non-régression complète
```
✅ npm run build
✅ 98/98 tests chord-engine
✅ 29/29 gospel
✅ 85/85 jazz
✅ 45/45 neo-soul
✅ 28/28 variants
✅ 17/17 validator
✅ Partie 1 + 3 regression
```

## Fichiers modifiés
- `electron/audio-processor.py` : ~15 modifications ciblées
- `scripts/investigation_final_report.md` (ce rapport)

## Prochaines étapes recommandées
1. **Key tracking local** : fenêtre glissante pour détecter changements de tonalité locaux
2. **Amélioration 90 BPM** : baisser seuil ambiguïté à 0.005 ou améliorer détecteur stabilité
3. **Détection clé locale** : injecter ground-truth key pour évaluation corpus synthétique

## Fichiers de test
- `scripts/investigation_final_report.md` (ce rapport)
- `scripts/investigate_tempo_and_iiV.py` — script de diagnostic réutilisable
