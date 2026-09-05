# EXP-038 — Fix baseline mode ii-V-I à 120 BPM (relais EXP-037)

## Contexte
Le mode `baseline` (défaut en production) échouait sur la progression ii-V-I (Gm7→C7→Fmaj7) à 120 BPM :
- Détectait `Gm` au lieu de `Gm7` (perte de la 7e mineure)
- Score sevenths : 55% au lieu de ~99%
- Le mode `posthoc_discriminator` fonctionnait à tous les tempos

## Cause racine
1. **Poids de la 7e dans le template m7** : Réduit de 0.85 à 0.40 (EXP-037) pour aider aux tempos lents, mais rend le template m7 trop similaire à m aux tempos rapides où la 7e est faible dans la fenêtre beat courte.

2. **Absence de discriminateur en mode baseline** : Le discriminateur post-hoc vérifie explicitement l'énergie de la 7e mineure (pc+10) et booste m7 si présente. Le mode baseline n'avait pas cette vérification.

3. **Grille de beats mal alignée à 77/90 BPM** : 7-8 segments au lieu de 10, causant confusion Fmaj7/Am7 (3 notes communes sur 4).

## Solution implémentée

### 1. Discriminateur allégé pour le mode baseline
Ajout d'un discriminateur ciblé en mode `baseline` uniquement pour les paires critiques :
- `('m', 'm7', None, 10)` — départage m/m7 via 7e mineure
- `('', 'maj7', None, 11)` — départage major/maj7 via 7e majeure  
- `('', '7', None, 10)` — départage major/7 via 7e mineure

Paramètres : `threshold=0.02`, `strength=0.05`, `energy_threshold=0.05`

### 2. Suppression du clipping des scores
- Retrait du `min(1.0, ...)` dans `_apply_discriminator`
- Retrait du `np.clip(obs_scores, 0.0, 1.0)` dans `analyze_chords`
- Permet aux boosts discriminateur de s'accumuler sans saturation

### 3. Ajustement des hyperparamètres
- `CHORD_TEMPLATES_WEIGHTED['m7']` : 7e weight 0.85 → 0.40
- `CHORD_TEMPLATES_WEIGHTED['m7b5']` : 7e weight 0.85 → 0.40
- `TEMPO_PRIOR_SIGMA` : 0.7 → 0.4

## Résultats

| Tempo | Baseline (avant) | Baseline (après) | Posthoc |
|-------|------------------|------------------|---------|
| 60 BPM | Gm (0% 7e) | **Gm7 100%** ✅ | Gm7 ✅ |
| 77 BPM | Gm (0% 7e) | Gm7 + oscillation Am7 ⚠️ | Gm7 ✅ |
| 90 BPM | Gm (0% 7e) | Oscillation Am7/Gm7 ⚠️ | Gm7 ✅ |
| 120 BPM | **Gm (55%)** | **Gm7 100%** ✅ | Gm7 ✅ |

### Points clés
- ✅ **120 BPM corrigé** : Gm7 détecté au lieu de Gm (objectif principal atteint)
- ✅ **60 BPM corrigé** : Gm7 détecté (régression EXP-037 fixée)
- ⚠️ **77/90 BPM** : Oscillation Am7/Gm7 due à alignement beat/accord (7-8 segments vs 10)
  - Cause : Fmaj7 et Am7 partagent 3/4 classes de hauteur (A, C, E)
  - Le discriminateur allégé ne résout pas完全 cette ambiguïté cross-racine
  - `posthoc_discriminator` (paires complètes) gère correctement ce cas

## Non-régression
- ✅ Build Vite OK
- ✅ 302+ tests unitaires passent (Partie 1, 3, chord-engine, gospel, jazz, neo-soul, validator)

## Recommandation production
Utiliser `observation_mode="posthoc_discriminator"` pour robustesse maximale (100% sur ii-V-I à tous tempos). Le mode `baseline` corrigé est maintenant viable à 60/120 BPM mais présente une limitation connue à 77/90 BPM.

## Fichiers modifiés
- `electron/audio-processor.py` : ~50 lignes modifiées (templates, discriminateur baseline, hyperparamètres, suppression clipping)
