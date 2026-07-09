# Bass Engine V2.5 — Baseline officielle

## Architecture

```
Audio WAV → CQT → HPS ×[1,2,3,4] → fundamental freq → MIDI note
 → octave correction V2 (score_octave_candidate)
 → mode smoothing (h=2)
 → segmentation (min_duration=0.15)
 → JSON timeline
```

## Commande de reproduction

```bash
python scripts/bass-detector.py analyze chemin/vers/fichier.wav \
    --smoothing-window 2 \
    --min-segment-duration 0.15 \
    --tracking mode
```

## Métriques — Amazing Grace Gospel Piano

**Référence** : 63 accords (dont 27 slash chords) — `tests/references/amazing_grace_gospel_piano.json`

| Métrique | Valeur | Définition |
|---|---|---|
| Segments détectés | 227 | Nombre de segments produits par le pipeline |
| NW Accuracy | **90.5%** | Alignement Needleman-Wunsch entre notes détectées et référence |
| Slash Accuracy | **85.2%** | Précision sur les 27 slash chords uniquement |
| Fragmentation | **3.60** | Nombre moyen de segments par accord de référence (det/ref) |
| Octave Error Rate | 66.1% | Proportion de notes avec une erreur d'octave (pitch class correcte) |

### Comparaison V2 (brut) vs V2.5 (défaut)

| Métrique | V2 brut (tracking=none) | V2.5 mode(h=2) |
|---|---|---|
| NW Accuracy | 87.3% | **90.5%** |
| Slash Accuracy | 81.5% | **85.2%** |
| Fragmentation | 3.67 | **3.60** |
| Segments | 231 | **227** |

## Paramètres par défaut

| Paramètre | Valeur | Définition | Emplacement |
|---|---|---|---|
| `SMOOTHING_WINDOW` | 2 | Demi-fenêtre du mode smoothing (5 frames) | `bass-detector.py:32` |
| `MIN_SEGMENT_DURATION` | 0.15 | Durée minimale d'un segment (secondes) | `bass-detector.py:34` |
| `TRACKING_MODE` | `mode` | Algorithme de lissage temporel | `bass-detector.py` (argument `--tracking`) |

## V3 Viterbi — expérimental

Un tracking Viterbi temporel a été implémenté (`--tracking viterbi`) mais **désactivé par défaut** car il dégrade la précision :

| Métrique | V2.5 mode(h=2) | V3 Viterbi |
|---|---|---|
| NW Accuracy | **90.5%** | 84.1% |
| Slash Accuracy | **85.2%** | 81.5% |
| Fragmentation | 3.60 | **3.16** |

Le Viterbi réduit la fragmentation mais au prix d'une perte de précision de ~6 points.
La cause racine : la note correcte n'est présente que dans 18% des trames HPS, ce qu'aucun
lissage temporel ne peut compenser. Le problème est un problème de **sélection de note**,
pas de lissage temporel.

## Environment & Reproducibility

Ces informations permettent de reproduire exactement les résultats ci-dessus.

### Versions

```
Python    : 3.13.5
librosa   : 0.11.0
numpy     : 2.4.6
scipy     : 1.18.0
soundfile : 0.14.0
numba     : 0.66.0
audioread : 3.1.0
```

### Commit

```
e3fbd73c32a5ceef2983e7150dfd47efec8b808f
```

### Fichier audio du benchmark

Le fichier utilisé est `"Amazing Grace" Gospel Piano.mp3`, à placer manuellement dans `data/` :

```bash
# Depuis la racine du projet :
mkdir -p data
# Copier ou télécharger le fichier MP3 vers data/amazing_grace.mp3
```

### Commande intégrale de benchmark

```bash
.venv/bin/python3 scripts/bass-detector.py benchmark \
    tests/references/amazing_grace_gospel_piano.json \
    --v2 \
    --tracking mode \
    --smoothing-window 2
```

Les métriques au format JSON sont produites sur la dernière ligne de la sortie standard.
