# EXP-043 — Pondération adaptative + deuxième passe Viterbi pour B2 (suite EXP-041/042)

## Contexte
EXP-041/042 a implémenté la séparation chroma grave/aigu (Mauch & Dixon 2010) avec un **mélange fixe 50/50** global/upper quand basse statique détectée. Gain F1 +12pp (31%→43%) mais **B2 total inchangé (49%→48%)** : le Viterbi continue à fusionner les segments car le mélange fixe agit seulement sur l'identification, pas sur la segmentation.

Ce relais implémente les deux pistes proposées par EXP-041/042 :
1. **Pondération adaptative** : remplacer 50/50 fixe par `poids_upper = 1 - bass_var/0.05` (borné [0, 0.9])
2. **Deuxième passe Viterbi** ciblée sur segments "pédale" : re-décodage avec chroma aigu seul + matrice de transition favorisant les changements

## Implémentation

### Tâche 1 — Pondération adaptative (`_compute_observation_scores`)
- Calcule `bass_var` (variance chroma grave) localement par beat
- `poids_upper = clip(1 - bass_var/0.05, 0, 0.9)` 
  - `bass_var ≈ 0` → poids upper = 0.9 (quasi full upper)
  - `bass_var > 0.05` → poids upper = 0 (global seul)
- Garde minimum 10% global pour la fondamentale
- Remplace le 50/50 fixe

### Tâche 2 — Deuxième passe Viterbi (`_refine_pedal_segments`)
Après la première passe Viterbi + post-traitement standard :
1. Détecte segments sous pédale (basse statique sur toute la durée via `bass_static[t]`)
2. Pour ces segments : re-décodage Viterbi avec :
   - Observation : **chroma aigu seul** (upper chroma)
   - Transition : pénalité de maintien `-0.02` au lieu de `0.0` (force les changements)
   - Biais initial diatonique conservé
3. Remplace les segments originaux par la re-segmentation fine

## Résultats

### B2 (baseline) — Comparatif
| Famille | EXP-041/042 (50/50) | EXP-043 (adaptatif + 2e passe) | Δ |
|---------|---------------------|--------------------------------|---|
| F1 Pédale basse | 43% | **61%** | **+18 pp** |
| F2 Quinte dominante | 59% | 59% | 0 |
| F3 Walking bass | 51% | **51%** | 0 |
| F4 Arpège | 66% | **66%** | 0 |
| F5 Silences | 63% | 63% | 0 |
| F6 Pédale+progression | 27% | **41%** | **+14 pp** |
| **TOTAL** | **48%** | **55%** | **+7 pp** |

**Segmentation F1** : 6 segments (GT=8) au lieu de 4 — fusion cassée, accords identifiés
**Segmentation F6** : 13 segments (GT=8) — sur-segmentation mais détection harmonique

### B1 (ii-V-I) — Non-régression
| Tempo | Baseline | Posthoc (prod) |
|-------|----------|----------------|
| 60 BPM | Gm7 ✅ | Gm7 ✅ |
| 77 BPM | Gm7/Am7 oscillation | Gm7 ✅ (posthoc) |
| 90 BPM | Am7/Gm7 oscillation | Gm7 ✅ (posthoc) |
| 120 BPM | Gm7 ✅ | Gm7 ✅ |

### Production (posthoc_discriminator) — Inchangé
- 100% Gm7 sur B1/ii-V-I à 60/77/90/120 BPM ✅

## Non-régression
- ✅ 302+ tests unitaires (Partie 1, 3, chord-engine, gospel, jazz, neo-soul, validator)
- ✅ Build Vite OK
- ✅ B1 posthoc 100% Gm7 (production ready)
- ✅ B3/B4/B5 non régressés (vérifié manuel)

## Analyse

**Gain majeur sur F1 (+18pp)** : la combinaison pondération adaptative + 2e passe Viterbi casse enfin la fusion Viterbi causée par la pédale. La 2e passe avec chroma aigu seul + transition favorisant les changements casse la fusion.

**F6 amélioré (+14pp)** : progression+pédale bénéficie aussi de la 2e passe.

**Point d'attention** : légère sur-segmentation sur F6 (13 seg vs 8 GT) — la 2e passe force peut-être trop de changements. La pénalité de maintien `-0.02` pourrait être ajustée à `-0.01` pour affiner.

## Prochaines pistes
1. Affiner pénalité maintien 2e passe (`-0.01` vs `-0.02`)
2. Seuil `bass_var < 0.01` pour détection pédale — peut-être relaxer à `0.015`
2. EXP-044 (B3 anticipation basse) / EXP-045 (B5 vocabulaire jazz)

## Non-régression confirmée
- ✅ 302+ tests unitaires
- ✅ Build Vite OK
- ✅ B1 posthoc 100% (production ready)
