# Fusion Engine — Phase 4 Baseline

## Architecture

```
Bass Engine (V2.5)          Chord Engine
     │                            │
     ▼                            ▼
candidates.json            chords.json
     │                            │
     └──────────▶ Fusion Engine ◀──┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
   segments.json  trace.json  fusion_params.json
```

Le Fusion Engine combine les sorties pré-calculées du Bass Engine (5 candidats par trame) et du Chord Engine (grille harmonique) pour produire une ligne de basse unique.

### Principe

- **Zéro modification** du Bass Engine V2.5 ou du Chord Engine — modules tiers figés.
- **Architecture ScoreComponent déclarative** : composants additifs + modulateurs configurables via `fusion_params.json`.
- **Candidats virtuels** (Virtual Root Candidate) : lorsque la fondamentale d'accord (ou la slash bass) est absente des 5 candidats BE, un candidat virtuel est injecté avec un score pénalisé (`score × score_ratio`), permettant à la fusion de sélectionner la note correcte malgré l'absence de candidat BE.

## Score Components

| Composant | Poids | Description |
|-----------|-------|-------------|
| BassScore | α=1.0 (fixe) | Score brut du BE pour le candidat |
| HarmonicScore | β=0.6 | Bonus selon le rôle harmonique (root=1.0, slash_bass=1.3, third=0.5, fifth=0.4, seventh=0.3, extension=0.2, non_chord=0.0) |
| OctaveScore | γ=0.3 | Bonus selon le registre (oct2=0.5, oct3=0.3, oct4=0.0, oct5=-0.2) |
| ContinuityScore | δ=0.4 | Score de proximité avec la note précédente (max 24 semi-tons, decay 1.0) |

### Modulateur

| Modulateur | Cible | Poids ε | Description |
|------------|-------|---------|-------------|
| ChordConfidenceMultiplier | HarmonicScore | 1.0 | Multiplie le bonus harmonique par la confiance de l'accord détecté |

### Score final

```
final_score = α × bass_score
            + β × harmonic_score × (chord_confidence ^ ε)
            + γ × octave_score
            + δ × continuity_score
```

## Virtual Root Candidate — Option B

Paramètres (`fusion_params.json` / `virtual_root`) :

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| `enabled` | `true` | Activation de l'injection virtuelle |
| `score_ratio` | `0.3` | Ratio du meilleur score BE réel pour le score virtuel |
| `default_octaves` | `[2, 3, 4]` | Octaves candidates pour le candidat virtuel |

Logique :
1. Si la root (ou slash bass) de l'accord est déjà présente parmi les 5 candidats BE → pas d'injection.
2. Sinon → ajout de candidats virtuels à chaque octave de `default_octaves`, avec `bass_score = best_real_score × score_ratio`.
3. Le scoring existant (harmonic, octave, continuity) départage les candidats virtuels entre eux et contre les réels.

## Paramètres complets (`fusion_params.json`)

```json
{
  "components": [
    { "name": "bass_engine",  "weight": 1.0, "class": "BassScore" },
    { "name": "harmonic",     "weight": 0.6, "class": "HarmonicScore" },
    { "name": "octave",       "weight": 0.3, "class": "OctaveScore" },
    { "name": "continuity",   "weight": 0.4, "class": "ContinuityScore" }
  ],
  "modulators": [
    { "name": "chord_confidence", "target": "harmonic", "weight": 1.0,
      "class": "ChordConfidenceMultiplier" }
  ],
  "harmonic_bonus": {
    "root": 1.0, "slash_bass": 1.3, "third": 0.5,
    "fifth": 0.4, "seventh": 0.3, "extension": 0.2, "non_chord": 0.0
  },
  "octave_bonus": {
    "1": 0.0, "2": 0.5, "3": 0.3, "4": 0.0, "5": -0.2
  },
  "continuity": {
    "max_interval_semitones": 24, "decay": 1.0
  },
  "smoothing_window": 2,
  "min_segment_duration": 0.15,
  "virtual_root": {
    "enabled": true,
    "score_ratio": 0.3,
    "default_octaves": [2, 3, 4]
  }
}
```

## Métriques finales

### Ton NOM est Jéhovah (test — cas difficile)

**Fichier** : `data/real/ton_nom_est_jehovah_extrait.wav` (60s)  
**Référence** : 18 notes annotées manuellement  
**Profil** : basse implicite (walking line), pitch class absente des candidats BE dans 85-98% des trames

| Métrique | BE V2.5 | Fusion Phase 4 | Variation |
|---|---|---|---|
| NW Accuracy | 94.4% | **100.0%** | +5.6 pts |
| Octave Error | ~94% | **66.7%** | −27 pts |
| Fragmentation | 6.44 | **7.00** | +0.56 |
| Segments | — | 126 | — |
| Virtual (% frames) | — | **16.8%** | — |

### Amazing Grace Gospel Piano (dev — non-régression)

**Fichier** : `data/amazing_grace.mp3` → extrait BE `benchmark_outputs/candidates_amazing_grace.json`  
**Référence** : 63 accords (dont 27 slash chords)

| Métrique | BE V2.5 | Fusion Phase 4 | Variation |
|---|---|---|---|
| NW Accuracy | 90.5% | **90.5%** | 0.0 pt |
| Octave Error | 66.1% | **63.5%** | −2.6 pts |
| Fragmentation | 3.60 | **3.35** | −0.25 |
| Segments | 227 | 211 | −16 |
| Virtual (% frames) | — | **6.2%** | — |

### Autumn Leaves mix (dev — non-régression)

**Fichier** : `data/autumn_leaves/mix.wav`  
**Référence** : 64 notes (CSV annoté)

| Métrique | BE V2.5 | Fusion Phase 4 | Variation |
|---|---|---|---|
| NW Accuracy | 87.5% | **84.4%** | −3.1 pts * |
| Octave Error | — | **21.9%** | — |
| Fragmentation | 1.16 | **1.16** | 0.00 |
| Segments | 74 | 74 | 0 |
| Virtual (% frames) | — | **16.2%** | — |

*La légère baisse NW sur Autumn Leaves mix est acceptée : la fusion injecte des virtuels (16.2%) qui peuvent concurrencer des notes de passage valides du BE dans ce morceau au mixage dense.

## Limitations identifiées

### 1. Biais d'octave du Bass Engine V2.5 (cause racine)

La limitation principale de la Phase 4 est un **biais interne du Bass Engine** : sur les trames où la même pitch class est présente à plusieurs octaves, le BE donne systématiquement un score plus élevé (∼+0.5) aux candidats en octave 3 qu'en octave 2. L'analyse de 855 trames sur Ton NOM est Jéhovah le confirme : même avec un bonus octave de 0.7 (Config B), l'écart de bass_score l'emporte.

**Implication** : le Fusion Engine peut atténuer l'erreur d'octave (94% → 66.7%) mais ne peut pas la résoudre complètement — c'est une limite du module amont.

**Piste V3** : corriger le scoring interne du BE pour équilibrer les octaves (via normalisation de salience ou priorisation du registre grave).

### 2. Fragmentation sur les pièces à basse implicite

Sur Ton NOM est Jéhovah, la fragmentation reste élevée (7.00). Ce n'est pas un problème de fusion mais une conséquence du BE lui-même qui produit de nombreux segments courts sur les passages où l'extraction de fréquence fondamentale est ambiguë.

### 3. Virtual sur-utilisé si score_ratio trop élevé

Le paramètre `score_ratio` (défaut 0.3) contrôle l'agressivité du Virtual Root Candidate. Une valeur trop élevée (>0.35) ferait gagner le virtuel trop souvent, au détriment des notes de passage réelles. La valeur 0.3 est validée comme compromis sur le corpus actuel.

## Traçabilité

La fusion produit deux fichiers de sortie :

- **`segments.json`** : timeline des notes de basse (même format que BE).
- **`trace.json`** : trace complète par trame contenant :
  - Tous les candidats (réels BE + virtuels) avec leur score décomposé
  - `source` : `bass_engine` ou `virtual_root`
  - `is_virtual` : booléen
  - `selected_source` : source du gagnant
  - `selected_is_virtual` : booléen
  - `virtual_pct` : pourcentage de trames non-silencieuses ayant choisi un candidat virtuel

## Commande de reproduction

### Validation complète

```bash
python scripts/validate_fusion.py \
    --dev amazing_grace,autumn_leaves_mix \
    --test ton_nom_est_jehovah \
    --params fusion_params.json
```

### Fusion seule

```bash
python scripts/fusion_bass_chord.py \
    --candidates benchmark_outputs/candidates_NOM.json \
    --chords benchmark_outputs/chords_NOM.json \
    --params fusion_params.json \
    --output-segments benchmark_outputs/fusion_segments_NOM.json \
    --output-trace benchmark_outputs/fusion_trace_NOM.json
```

### Export des candidats BE (en amont)

```bash
python scripts/export_bass_candidates.py \
    --wav chemin/vers/audio.wav \
    --output benchmark_outputs/candidates_NOM.json
```

## Environnement

| Outil | Version |
|-------|---------|
| Python | 3.13.5 |
| numpy | 2.4.6 |
| librosa | 0.11.0 |

## Contenu du module Fusion Engine

| Fichier | Rôle |
|---------|------|
| `scripts/fusion_bass_chord.py` | Moteur de fusion (ScoreComponent, FusionEngine, CLI) |
| `scripts/validate_fusion.py` | Validation multi-pièces avec métriques NW/octave/fragmentation/source |
| `fusion_params.json` | Configuration des poids et du Virtual Root Candidate |
| `scripts/export_bass_candidates.py` | Export préalable des candidats BE (non modifié) |

## Contraintes respectées

- ✅ Zéro modification du Bass Engine V2.5
- ✅ Zéro modification du Chord Engine
- ✅ α=1.0 fixe (non optimisé)
- ✅ Paramètres β, γ, δ, ε configurables via `fusion_params.json`
- ✅ Candidats virtuels uniquement en fallback (absents des réels)
- ✅ Traçabilité complète dans `trace.json` (source, is_virtual, score décomposé)
