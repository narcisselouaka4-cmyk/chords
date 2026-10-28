# Benchmark Corpus — Bass Engine V2.5

Date : 2026-07-09T16:39:33
Commit : `e3fbd73c32a5ceef2983e7150dfd47efec8b808f`
Params : `--smoothing-window 2` `--min-segment-duration 0.15` `--tracking mode`

## Résultats par morceau

| ID | Style | Durée (s) | Segments | NW Acc. | Slash Acc. | Fragm. | RTF |
|----|-------|-----------|----------|---------|------------|--------|-----|
| amazing_grace | slow gospel | 123.2 | 227 | 90.5% | 85.2% | 3.60 | 0.104 |
| walking_bass | jazz walking bass (synthétique) | 4.0 | 16 | - | - | - | 0.048 |
| slash_Am7_G | slash chord (synthétique) | 2.0 | 1 | - | - | - | 0.088 |
| chord_C | accord simple (synthétique) | 2.0 | 1 | - | - | - | 0.069 |
| note_E2 | note de basse tenue (synthétique) | 2.0 | 1 | - | - | - | 0.082 |
| autumn_leaves_bass_only | jazz walking bass (synthétique, basse seule) | 34.3 | 62 | 95.3% | 0.0% | 0.97 | 0.022 |
| autumn_leaves_mix | jazz walking bass (synthétique, piano+basse) | 34.5 | 74 | 87.5% | 0.0% | 1.16 | 0.026 |
| ton_nom_est_jehovah | gospel_reel_basse_implicite | 60.0 | 116 | 94.4% | 0.0% | 6.44 | 0.038 |

## Synthèse

| Métrique | Moyenne | Écart-type | Min | Max |
|----------|---------|------------|-----|-----|
| bass_accuracy | 91.93% | 3.61% | 87.5% | 95.3% |
| slash_accuracy | 21.3% | 42.6% | 0.0% | 85.2% |
| fragmentation | 3.04 | 2.56 | 0.97 | 6.44 |

## Performance

- Temps total de traitement : 17.4s
- Durée audio totale : 262.0s
- RTF moyen : 0.0596
- Temps moyen par morceau : 2.180s
