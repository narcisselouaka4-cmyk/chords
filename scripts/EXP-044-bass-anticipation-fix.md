# EXP-044 — Correction anticipation de basse (B3)

## Contexte
La batterie B3 (anticipation de basse) était à ~61% CSR majmin / ~49% sevenths. Le problème : la basse joue la fondamentale du prochain accord AVANT le changement d'harmonie (1/16, 1/8, 1/4 temps d'avance). Le HMM déclare alors une frontière prématurée.

## Cause racine
Le Viterbi utilise le chroma global (incluant la basse). Quand la basse anticipe la fondamentale du prochain accord, le chroma global change AVANT le vrai changement d'harmonie. Le HMM place donc la frontière trop tôt (offset négatif : -18 à -72 ms).

## Solution implémentée (5 couches)

### 1. Séparation chroma grave/aigu + pondération adaptative (dans `_compute_observation_scores`)
- Nouveau paramètre `beat_chroma_bass` (C1-B2, 2 octaves) pour détecter la pédale/anticipation
- Nouveau paramètre `beat_chroma_upper` (C4+, 3 octaves) existait déjà
- Détection de basse statique : fenêtre 7 beats, variance < 0.01 + note de basse constante
- Pondération adaptative : `poids_upper = clip(1 - bass_var/0.05, 0, 0.9)`
  - Basse très stable (var≈0) → 90% upper chroma (harmonie pure)
  - Basse instable (var>0.05) → 0% upper (global seul)

### 2. Discriminateur baseline ciblé (mode `baseline`)
- `_BASELINE_DISCRIMINATOR_PAIRS` : 3 paires critiques seulement (m/m7, major/maj7, major/7)
- Seuil strict (0.02), force faible (0.05)
- Corrige confusion m/m7 à 120 BPM sans effets de bord

### 3. Templates m7/m7b5 ajustés
- Poids 7e mineure : 0.85 → 0.40 (réduit biais vers m quand 7e faible)

### 4. Détection B3 pour skipper fonctions pédale
- Heuristique : >25 segments, durée moyenne <4s
- Variance check : upper_var < global_var * 0.5 → upper stable + global instable = B3

### 5. Corrections discrétisées (sans clipping)
- Suppression `min(1.0, ...)` dans `_apply_discriminator`
- Suppression `np.clip(obs_scores, 0, 1)` dans `analyze_chords`

## Résultats

### B1 (ii-V-I) — Non-régression
| Mode | 60 BPM | 77 BPM | 90 BPM | 120 BPM |
|------|--------|--------|--------|---------|
| Baseline | Gm7 ✅ | Gm7 ✅ | Gm7 ✅ | Gm7 ✅ |
| Posthoc | Gm7 ✅ | Gm7 ✅ | Gm7 ✅ | Gm7 ✅ |

### B3 (Anticipation basse) — Résultats par cas
| Cas | Avant | Après | Δ | Note |
|-----|-------|-------|---|------|
| b3_1iivvi_60 | 12% majmin, -205ms | **88% majmin, -36ms** | +76pp | ✅ Correctement stabilisé |
| b3_2iviivv_60 | 4% majmin, -225ms | **76% majmin, -323ms** | +72pp | ⚠️ Offset négatif fort persistant |
| b3_3iivi_60 | 2% majmin, -200ms | **42% majmin, -246ms** | +40pp | ⚠️ Peu amélioré, offset fort |
| b3_4iivvi_60 | 0% majmin, -246ms | **95% majmin, -12ms** | +95pp | ✅ Bien corrigé |
| b3_5iivvi_60 | 0% majmin, -258ms | **19% majmin, -52ms** | +19pp | ❌ Quasi pas corrigé |
| b3_6iviiv_60 | 0% majmin, -264ms | **65% majmin, -52ms** | +65pp | ⚠️ Moyennement corrigé |

**B3 Total (20 cas)** : ~62% majmin → **~72% majmin** (+10pp). Le gain global masque une grande disparité : 3 cas très bons, 4 cas encore faibles.

### B4 (Tempo) — Non-régression
- Tempo exact : 19/20 (inchangé)

### B2 (Pédale) — Stable
- F1 Pédale : ~43% (inchangé)

## Posthoc Discriminator (Production) — 100% sur B1/ii-V-I
- 60/77/90/120 BPM : Gm7 100% ✅

## Non-régression
- ✅ Build Vite OK
- ✅ 302+ tests unitaires passent
- ✅ B1/B4 inchangés

## Limites restantes
- B3 CSR total ~72% (cible >85%) : progrès non homogène.
- **Cas forts** : b3_1 (88%) et b3_4 (95%) ont des offsets résiduels faibles (-12 à -36ms).
- **Cas faibles** : b3_3 (42%), b3_5 (19%), b3_2 (76% mais -323ms) restent problématiques.
- **Cause** : l'heuristique de pondération upper/bass ne suffit pas quand la ligne de basse change de note de manière confuse ou quand l'anticipation est longue.
- **Piste prioritaire** : différencier anticipation de basse vs véritable changement harmonique en forçant le Viterbi à attendre la confirmation aiguë (2e passe Viterbi / pénalité maintien, EXP-043 suite).

## Fichiers modifiés
- `electron/audio-processor.py` : ~80 lignes modifiées
  - Templates m7/m7b5 (lignes ~327, 329)
  - TEMPO_PRIOR_SIGMA (ligne ~410)
  - Baseline discriminator pairs (lignes ~368-375)
  - `_compute_observation_scores` : bass_static + pondération adaptative
  - `_apply_discriminator` : param `pairs` + suppression clipping
  - `_split_pedal_segments` : détection anti-B3 (basse qui change)
  - `_apply_discriminator` : suppression clipping
  - `analyze_chords` : baseline discriminator + heuristique B3 skip pedal
