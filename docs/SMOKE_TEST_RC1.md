# Smoke Tests — v1.0.0-rc1

## Informations générales

- **Date** : 2026-07-10
- **Commit testé** : `8a1a9e2`
- **Tag** : `v1.0.0-rc1`
- **Pipeline testée** : Bass Engine V2.5 + Fusion Engine V1.0 (Config A)

## Fichiers audio testés

| Fichier | Format | BE | Fusion |
|---|---|---|---|
| `data/amazing_grace.wav` | WAV | ✅ 5308 frames | ✅ 211 segments |
| `data/real/ton_nom_est_jehovah_extrait.wav` | WAV | ✅ 2584 frames | ✅ 126 segments |
| `data/real/gospel_reel_extrait.wav` | WAV | ✅ 1293 frames | ⏭️ pas de chords |
| `data/real/jazzaria_full.mp3` | MP3 | ✅ 6817 frames | ⏭️ pas de chords |
| `data/real/jazzaria_waltz_extrait.wav` | WAV | ✅ 1293 frames | ⏭️ pas de chords |

Légende :
- **BE** : `scripts/export_bass_candidates.py` terminé sans erreur.
- **Fusion** : `scripts/fusion_bass_chord.py` terminé sans erreur ; `⏭️` indique l'absence d'un fichier `chords_<nom>.json` pré-calculé.

## Comportements observés

Aucun crash, aucune exception. Les temps de traitement restent raisonnables :
- extrait ~3 s : ~6 s
- morceau ~2 min : ~10–13 s

Les 3 fichiers sans fusion le sont uniquement parce qu'ils ne font pas partie du corpus Phase 6. Leur BE produit des candidates exploitables.

## Conclusion

Tous les fichiers audio du corpus réel passent le smoke test. Le tag `v1.0.0-rc1` est validé pour promotion vers `v1.0.0`.
